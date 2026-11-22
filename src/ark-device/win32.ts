/**
 * Win32 後端：Windows 上的明日方舟官方 PC 客戶端（鷹角 / GRYPHLINK 啟動器下載的臺服客戶端等）。
 * P0 只做查詢：找視窗、最小化/可見/客戶區尺寸、管理員權限、PrintWindow 截圖。
 * 不點擊、不移動滑鼠、不注入程序。透過 PowerShell + 內嵌 C#（user32/gdi32）呼叫 Win32 API；
 * 參數一律以環境變數傳入，不拼進腳本字串。
 */
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, type ExecResult } from '../shared/exec.ts'
import type { BackendProbe, Capture, DeviceBackend } from './backends.ts'

export interface Win32Config {
  /** 視窗標題完全相符才算（MAA GUI 預設找「明日方舟」）；可多個候選。 */
  windowTitles: string[]
  /** 選填：用執行檔名稱再過濾一次（例如 Arknights.exe），避免同名視窗。 */
  processName: string
}

export interface Win32Window {
  hwnd: string
  title: string
  pid: number
  process: string | null
  exe: string | null
  visible: boolean
  minimized: boolean
  client_w: number
  client_h: number
}

export interface Win32Scan { is_admin: boolean; windows: Win32Window[] }

const CSHARP = `
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class ArkW32 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  public static List<IntPtr> TopLevel() {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { if (GetWindow(h, 4) == IntPtr.Zero) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowTextW(h, sb, 512); return sb.ToString(); }
}`

/** 列出標題完全相符的頂層視窗；輸出 JSON。 */
export const PS_SCAN = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CSHARP}
'@ -ReferencedAssemblies System.Drawing
$titles = ConvertFrom-Json $env:ARK_W32_TITLES
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$out = @()
foreach ($h in [ArkW32]::TopLevel()) {
  $t = [ArkW32]::Title($h)
  if ($titles -notcontains $t) { continue }
  $procId = [uint32]0; [void][ArkW32]::GetWindowThreadProcessId($h, [ref]$procId)
  $pname = $null; $exe = $null
  try { $p = Get-Process -Id $procId; $pname = $p.ProcessName; $exe = $p.Path } catch {}
  $r = New-Object ArkW32+RECT; [void][ArkW32]::GetClientRect($h, [ref]$r)
  $out += [pscustomobject]@{ hwnd = [string]$h.ToInt64(); title = $t; pid = [int]$procId; process = $pname; exe = $exe;
    visible = [ArkW32]::IsWindowVisible($h); minimized = [ArkW32]::IsIconic($h); client_w = $r.R - $r.L; client_h = $r.B - $r.T }
}
[pscustomobject]@{ is_admin = $isAdmin; windows = @($out) } | ConvertTo-Json -Depth 4 -Compress
`

/** 以 PrintWindow(PW_CLIENTONLY | PW_RENDERFULLCONTENT) 截取客戶區到 PNG。 */
export const PS_CAPTURE = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CSHARP}
'@ -ReferencedAssemblies System.Drawing
Add-Type -AssemblyName System.Drawing
$h = [IntPtr]::new([int64]$env:ARK_W32_HWND)
$r = New-Object ArkW32+RECT; [void][ArkW32]::GetClientRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
if ($w -le 0 -or $hh -le 0) { throw "client area is empty ($w x $hh)" }
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [ArkW32]::PrintWindow($h, $hdc, 3)
$g.ReleaseHdc($hdc); $g.Dispose()
if (-not $ok) { $bmp.Dispose(); throw 'PrintWindow returned false' }
$bmp.Save($env:ARK_W32_OUT, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
'ok'
`

export type PsRunner = (script: string, env: Record<string, string>, signal: AbortSignal) => Promise<ExecResult>

export const defaultPsRunner: PsRunner = (script, env, signal) =>
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeoutMs: 30_000, signal, env: { ...process.env, ...env } })

/** 純程式碼：從掃描結果選出唯一目標視窗；有歧義就失敗，不猜。 */
export function selectWindow(scan: Win32Scan, cfg: Win32Config): { window: Win32Window | null; error: string | null } {
  let c = scan.windows
  if (cfg.processName) {
    const want = cfg.processName.toLowerCase().replace(/\.exe$/, '')
    c = c.filter(w => (w.process ?? '').toLowerCase() === want)
  }
  if (c.length === 0) return { window: null, error: `找不到標題為 ${cfg.windowTitles.map(t => `「${t}」`).join(' / ')} 的遊戲視窗（遊戲需先手動啟動）` }
  if (c.length > 1) return { window: null, error: `找到 ${c.length} 個同名視窗，請在設定 win32.processName 指定執行檔` }
  return { window: c[0]!, error: null }
}

export class Win32Backend implements DeviceBackend {
  readonly kind = 'win32' as const
  private cfg: Win32Config
  private ps: PsRunner
  private platform: NodeJS.Platform
  constructor(cfg: Win32Config, ps: PsRunner = defaultPsRunner, platform: NodeJS.Platform = process.platform) {
    this.cfg = cfg; this.ps = ps; this.platform = platform
  }

  async scan(signal: AbortSignal): Promise<{ scan: Win32Scan | null; error: string | null }> {
    if (this.platform !== 'win32') return { scan: null, error: `Win32 後端只支援 Windows（目前 ${this.platform}）` }
    const r = await this.ps(PS_SCAN, { ARK_W32_TITLES: JSON.stringify(this.cfg.windowTitles) }, signal)
    if (!r.ok) return { scan: null, error: `PowerShell 掃描視窗失敗：${r.error ?? r.stderr.slice(0, 300)}` }
    try {
      const raw = JSON.parse(r.stdout.toString('utf8').trim()) as { is_admin: boolean; windows: Win32Window[] | Win32Window | null }
      const windows = raw.windows == null ? [] : Array.isArray(raw.windows) ? raw.windows : [raw.windows]
      return { scan: { is_admin: !!raw.is_admin, windows }, error: null }
    } catch { return { scan: null, error: 'PowerShell 輸出不是 JSON' } }
  }

  async probe(signal: AbortSignal): Promise<BackendProbe> {
    const { scan, error } = await this.scan(signal)
    if (!scan) return { backend: 'win32', tested: true, connected: false, address: null, detail: {}, error }
    const { window, error: selErr } = selectWindow(scan, this.cfg)
    const ratio = window && window.client_h > 0 ? window.client_w / window.client_h : null
    const detail: Record<string, unknown> = {
      is_admin: scan.is_admin,
      candidates: scan.windows.map(w => ({ hwnd: w.hwnd, title: w.title, process: w.process, minimized: w.minimized })),
      window: window ?? null,
      client_size: window ? `${window.client_w}x${window.client_h}` : null,
      aspect_16_9: ratio === null ? null : Math.abs(ratio - 16 / 9) < 0.005,
      // MAA GUI 的 PC 端連線需要系統管理員權限（AttachWindowNeedAdmin）；P0 只回報，不提權。
      admin_note: scan.is_admin ? null : 'MAA 連接 PC 端需以系統管理員身分執行',
    }
    if (!window) return { backend: 'win32', tested: true, connected: false, address: null, detail, error: selErr }
    let err: string | null = null
    if (window.minimized) err = '遊戲視窗已最小化（最小化時不渲染畫面，無法識別）'
    else if (!window.visible) err = '遊戲視窗不可見'
    return { backend: 'win32', tested: true, connected: err === null, address: `hwnd:${window.hwnd}`, detail, error: err }
  }

  async screenshot(signal: AbortSignal): Promise<Capture> {
    const method = 'PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT)'
    const { scan, error } = await this.scan(signal)
    if (!scan) return { png: null, error, method }
    const { window, error: selErr } = selectWindow(scan, this.cfg)
    if (!window) return { png: null, error: selErr, method }
    if (window.minimized) return { png: null, error: '遊戲視窗已最小化', method }
    const tmp = join(tmpdir(), `ark-w32-${process.pid}-${Date.now()}.png`)
    const r = await this.ps(PS_CAPTURE, { ARK_W32_HWND: window.hwnd, ARK_W32_OUT: tmp }, signal)
    try {
      if (!r.ok) return { png: null, error: `PrintWindow 截圖失敗：${r.error ?? r.stderr.slice(0, 300)}`, method }
      return { png: readFileSync(tmp), error: null, method }
    } catch (e) { return { png: null, error: (e as Error).message, method } }
    finally { rmSync(tmp, { force: true }) }
  }
}
