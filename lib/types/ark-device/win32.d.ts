import { type ExecResult } from '../shared/exec.ts';
import type { BackendProbe, Capture, DeviceBackend } from './backends.ts';
export interface Win32Config {
    /** 視窗標題完全相符才算（MAA GUI 預設找「明日方舟」）；可多個候選。 */
    windowTitles: string[];
    /** 選填：用執行檔名稱再過濾一次（例如 Arknights.exe），避免不同程式同名視窗。 */
    processName: string;
}
export interface Win32Window {
    hwnd: string;
    title: string;
    pid: number;
    process: string | null;
    exe: string | null;
    visible: boolean;
    minimized: boolean;
    client_w: number;
    client_h: number;
}
export interface Win32Scan {
    is_admin: boolean;
    windows: Win32Window[];
}
/** 列出標題完全相符的頂層視窗；輸出 UTF-8 JSON。 */
export declare const PS_SCAN = "\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n$ErrorActionPreference = 'Stop'\n\nAdd-Type -TypeDefinition @'\n\nusing System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;\npublic static class ArkW32 {\n  public delegate bool EnumProc(IntPtr h, IntPtr l);\n  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);\n  [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);\n  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);\n  [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr h);\n  [DllImport(\"user32.dll\")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);\n  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);\n  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }\n  [DllImport(\"user32.dll\")] public static extern bool GetClientRect(IntPtr h, out RECT r);\n  [DllImport(\"user32.dll\")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);\n  public static List<IntPtr> TopLevel() {\n    var list = new List<IntPtr>();\n    EnumWindows((h, l) => { if (GetWindow(h, 4) == IntPtr.Zero) list.Add(h); return true; }, IntPtr.Zero);\n    return list;\n  }\n  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowTextW(h, sb, 512); return sb.ToString(); }\n}\n'@ -ReferencedAssemblies System.Drawing\n$titles = ConvertFrom-Json $env:ARK_W32_TITLES\n$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)\n$out = @()\nforeach ($h in [ArkW32]::TopLevel()) {\n  $t = [ArkW32]::Title($h)\n  if ($titles -notcontains $t) { continue }\n  $procId = [uint32]0; [void][ArkW32]::GetWindowThreadProcessId($h, [ref]$procId)\n  $pname = $null; $exe = $null\n  try { $p = Get-Process -Id $procId -ErrorAction Stop; $pname = $p.ProcessName; $exe = $p.Path } catch {}\n  $r = New-Object ArkW32+RECT; [void][ArkW32]::GetClientRect($h, [ref]$r)\n  $out += [pscustomobject]@{ hwnd = [string]$h.ToInt64(); title = $t; pid = [int]$procId; process = $pname; exe = $exe;\n    visible = [ArkW32]::IsWindowVisible($h); minimized = [ArkW32]::IsIconic($h); client_w = $r.R - $r.L; client_h = $r.B - $r.T }\n}\n[pscustomobject]@{ is_admin = $isAdmin; windows = @($out) } | ConvertTo-Json -Depth 4 -Compress\n";
/** 以 PrintWindow(PW_CLIENTONLY | PW_RENDERFULLCONTENT) 截取客戶區到 PNG。 */
export declare const PS_CAPTURE = "\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n$ErrorActionPreference = 'Stop'\n\nAdd-Type -TypeDefinition @'\n\nusing System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;\npublic static class ArkW32 {\n  public delegate bool EnumProc(IntPtr h, IntPtr l);\n  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);\n  [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);\n  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);\n  [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr h);\n  [DllImport(\"user32.dll\")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);\n  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);\n  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }\n  [DllImport(\"user32.dll\")] public static extern bool GetClientRect(IntPtr h, out RECT r);\n  [DllImport(\"user32.dll\")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);\n  public static List<IntPtr> TopLevel() {\n    var list = new List<IntPtr>();\n    EnumWindows((h, l) => { if (GetWindow(h, 4) == IntPtr.Zero) list.Add(h); return true; }, IntPtr.Zero);\n    return list;\n  }\n  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowTextW(h, sb, 512); return sb.ToString(); }\n}\n'@ -ReferencedAssemblies System.Drawing\nAdd-Type -AssemblyName System.Drawing\n$h = [IntPtr]::new([int64]$env:ARK_W32_HWND)\n$r = New-Object ArkW32+RECT; [void][ArkW32]::GetClientRect($h, [ref]$r)\n$w = $r.R - $r.L; $hh = $r.B - $r.T\nif ($w -le 0 -or $hh -le 0) { throw \"client area is empty ($w x $hh)\" }\n$bmp = New-Object System.Drawing.Bitmap $w, $hh\n$g = [System.Drawing.Graphics]::FromImage($bmp)\n$hdc = $g.GetHdc()\n$ok = [ArkW32]::PrintWindow($h, $hdc, 3)\n$g.ReleaseHdc($hdc); $g.Dispose()\nif (-not $ok) { $bmp.Dispose(); throw 'PrintWindow returned false' }\n$bmp.Save($env:ARK_W32_OUT, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()\n'ok'\n";
export type PsRunner = (script: string, env: Record<string, string>, signal: AbortSignal) => Promise<ExecResult>;
export declare const defaultPsRunner: PsRunner;
/**
 * 純程式碼：從掃描結果選出唯一目標視窗。
 * 實機上官方 PC 版常伴隨一個隱藏的 640×480 同名佔位視窗（同一個 process）；
 * 且非管理員權限下對 ACE 提權進程呼叫 Get-Process 會拿不到 process（為 null）。
 * 因此：
 * 1. 若有設 processName，只在至少有一個視窗讀得到 process 時才過濾；若全部 process 都是 null（因未提權被拒），不誤殺全部候選。
 * 2. 多個同名視窗時，優先篩選 `visible && (minimized || (client_w >= 960 && client_h >= 540))` 以排除 640×480 隱藏佔位窗；篩完剛好 1 個就選中，仍 >1 才報錯不猜。
 */
export declare function selectWindow(scan: Win32Scan, cfg: Win32Config): {
    window: Win32Window | null;
    error: string | null;
};
export declare class Win32Backend implements DeviceBackend {
    readonly kind: "win32";
    private cfg;
    private ps;
    private platform;
    constructor(cfg: Win32Config, ps?: PsRunner, platform?: NodeJS.Platform);
    scan(signal: AbortSignal): Promise<{
        scan: Win32Scan | null;
        error: string | null;
    }>;
    probe(signal: AbortSignal): Promise<BackendProbe>;
    screenshot(signal: AbortSignal): Promise<Capture>;
}
