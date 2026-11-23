/**
 * Win32 後端：Windows 上的明日方舟官方 PC 客戶端（鷹角 / GRYPHLINK 啟動器下載的臺服客戶端等）。
 * P0 只做查詢：找視窗、最小化/可見/客戶區尺寸、管理員權限、PrintWindow 截圖。
 * 不點擊、不移動滑鼠、不注入程序。透過 PowerShell + 內嵌 C#（user32/gdi32）呼叫 Win32 API；
 * 參數一律以環境變數傳入，不拼進腳本字串。
 */
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from "../shared/exec.js";
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
}`;
/** PowerShell 5.1 預設用 OEM 碼頁（繁中 950 / 英文 437）寫 stdout，必須強制設為 UTF-8 否則中文標題會亂碼或撐破 JSON。 */
const PS_UTF8_PRELUDE = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
`;
/** 列出標題完全相符的頂層視窗；輸出 UTF-8 JSON。 */
export const PS_SCAN = `${PS_UTF8_PRELUDE}
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
  try { $p = Get-Process -Id $procId -ErrorAction Stop; $pname = $p.ProcessName; $exe = $p.Path } catch {}
  $r = New-Object ArkW32+RECT; [void][ArkW32]::GetClientRect($h, [ref]$r)
  $out += [pscustomobject]@{ hwnd = [string]$h.ToInt64(); title = $t; pid = [int]$procId; process = $pname; exe = $exe;
    visible = [ArkW32]::IsWindowVisible($h); minimized = [ArkW32]::IsIconic($h); client_w = $r.R - $r.L; client_h = $r.B - $r.T }
}
[pscustomobject]@{ is_admin = $isAdmin; windows = @($out) } | ConvertTo-Json -Depth 4 -Compress
`;
/** 以 PrintWindow(PW_CLIENTONLY | PW_RENDERFULLCONTENT) 截取客戶區到 PNG。 */
export const PS_CAPTURE = `${PS_UTF8_PRELUDE}
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
`;
export const defaultPsRunner = (script, env, signal) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeoutMs: 30_000, signal, env: { ...process.env, ...env } });
/**
 * 純程式碼：從掃描結果選出唯一目標視窗。
 * 實機上官方 PC 版常伴隨一個隱藏的 640×480 同名佔位視窗（同一個 process）；
 * 且非管理員權限下對 ACE 提權進程呼叫 Get-Process 會拿不到 process（為 null）。
 * 因此：
 * 1. 若有設 processName，只在至少有一個視窗讀得到 process 時才過濾；若全部 process 都是 null（因未提權被拒），不誤殺全部候選。
 * 2. 多個同名視窗時，優先篩選 `visible && (minimized || (client_w >= 960 && client_h >= 540))` 以排除 640×480 隱藏佔位窗；篩完剛好 1 個就選中，仍 >1 才報錯不猜。
 */
export function selectWindow(scan, cfg) {
    let c = scan.windows;
    if (c.length === 0) {
        return { window: null, error: `找不到標題為 ${cfg.windowTitles.map(t => `「${t}」`).join(' / ')} 的遊戲視窗（遊戲需先手動啟動）` };
    }
    if (cfg.processName) {
        const want = cfg.processName.toLowerCase().replace(/\.exe$/, '');
        const readable = c.some(w => w.process !== null && w.process !== '');
        if (readable) {
            c = c.filter(w => (w.process ?? '').toLowerCase() === want);
            if (c.length === 0) {
                return { window: null, error: `找到同名視窗但執行檔不是 ${cfg.processName}` };
            }
        }
    }
    if (c.length > 1) {
        // 排除隱藏視窗與 640x480 佔位小窗（保留已最小化的主視窗以便回報「視窗已最小化」）
        const mainCandidates = c.filter(w => w.visible && (w.minimized || (w.client_w >= 960 && w.client_h >= 540)));
        if (mainCandidates.length === 1) {
            return { window: mainCandidates[0], error: null };
        }
        const targetList = mainCandidates.length > 1 ? mainCandidates : c;
        const adminHint = !scan.is_admin && scan.windows.every(w => !w.process)
            ? '（目前非系統管理員權限，無法讀取提權進程名稱；請以系統管理員身分啟動 dsh / PowerShell）'
            : '（若為不同程式，可在 win32.processName 指定執行檔）';
        return { window: null, error: `找到 ${targetList.length} 個候選同名視窗，無法唯一識別${adminHint}` };
    }
    return { window: c[0], error: null };
}
export class Win32Backend {
    kind = 'win32';
    cfg;
    ps;
    platform;
    constructor(cfg, ps = defaultPsRunner, platform = process.platform) {
        this.cfg = cfg;
        this.ps = ps;
        this.platform = platform;
    }
    async scan(signal) {
        if (this.platform !== 'win32')
            return { scan: null, error: `Win32 後端只支援 Windows（目前 ${this.platform}）` };
        const r = await this.ps(PS_SCAN, { ARK_W32_TITLES: JSON.stringify(this.cfg.windowTitles) }, signal);
        if (!r.ok)
            return { scan: null, error: `PowerShell 掃描視窗失敗：${r.error ?? r.stderr.slice(0, 300)}` };
        try {
            const raw = JSON.parse(r.stdout.toString('utf8').replace(/^\uFEFF/, '').trim());
            const windows = raw.windows == null ? [] : Array.isArray(raw.windows) ? raw.windows : [raw.windows];
            return { scan: { is_admin: !!raw.is_admin, windows }, error: null };
        }
        catch {
            return { scan: null, error: 'PowerShell 輸出不是 JSON' };
        }
    }
    async probe(signal) {
        const { scan, error } = await this.scan(signal);
        if (!scan)
            return { backend: 'win32', tested: true, connected: false, address: null, detail: {}, error };
        const { window, error: selErr } = selectWindow(scan, this.cfg);
        const ratio = window && window.client_h > 0 ? window.client_w / window.client_h : null;
        const detail = {
            is_admin: scan.is_admin,
            candidates: scan.windows.map(w => ({ hwnd: w.hwnd, title: w.title, process: w.process, visible: w.visible, minimized: w.minimized, size: `${w.client_w}x${w.client_h}` })),
            window: window ?? null,
            client_size: window ? `${window.client_w}x${window.client_h}` : null,
            aspect_16_9: ratio === null ? null : Math.abs(ratio - 16 / 9) < 0.005,
            // MAA 與官方 PC 客戶端（ACE 提權）在非管理員下 PrintWindow / 進程讀取可能被拒；明確標出提示。
            admin_note: scan.is_admin ? null : '目前非系統管理員權限：對 ACE 提權的官方 PC 客戶端截圖或連接可能被系統拒絕，請以系統管理員身分啟動 dsh / PowerShell',
        };
        if (!window)
            return { backend: 'win32', tested: true, connected: false, address: null, detail, error: selErr };
        let err = null;
        if (window.minimized)
            err = '遊戲視窗已最小化（最小化時不渲染畫面，無法識別）';
        else if (!window.visible)
            err = '遊戲視窗不可見';
        return { backend: 'win32', tested: true, connected: err === null, address: `hwnd:${window.hwnd}`, detail, error: err };
    }
    async screenshot(signal) {
        const method = 'PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT)';
        const { scan, error } = await this.scan(signal);
        if (!scan)
            return { png: null, error, method };
        const { window, error: selErr } = selectWindow(scan, this.cfg);
        if (!window)
            return { png: null, error: selErr, method };
        if (window.minimized)
            return { png: null, error: '遊戲視窗已最小化', method };
        const tmp = join(tmpdir(), `ark-w32-${process.pid}-${Date.now()}.png`);
        const r = await this.ps(PS_CAPTURE, { ARK_W32_HWND: window.hwnd, ARK_W32_OUT: tmp }, signal);
        try {
            if (!r.ok) {
                const rawErr = (r.error ?? r.stderr.slice(0, 300)).trim();
                const adminHint = !scan.is_admin
                    ? '（偵測到目前不是系統管理員權限：官方 PC 客戶端受 ACE 提權保護，未提權時 PrintWindow 會回傳 false；請以「系統管理員身分」重新啟動 dsh 或終端機）'
                    : '';
                return { png: null, error: `PrintWindow 截圖失敗：${rawErr}${adminHint}`, method };
            }
            return { png: readFileSync(tmp), error: null, method };
        }
        catch (e) {
            return { png: null, error: e.message, method };
        }
        finally {
            rmSync(tmp, { force: true });
        }
    }
}
