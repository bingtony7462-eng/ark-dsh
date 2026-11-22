/** 裝置後端：PlayCover（MacPlayTools，無 ADB）與 ADB（Android 模擬器）。P0 只做查詢與截圖。 */
import { connect } from 'node:net'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../shared/exec.ts'

export interface BackendProbe {
  backend: 'playcover' | 'adb' | 'win32'
  tested: boolean
  connected: boolean | null
  address: string | null
  detail: Record<string, unknown>
  error: string | null
}

export interface Capture { png: Buffer | null; error: string | null; method: string }

export interface DeviceBackend {
  readonly kind: 'playcover' | 'adb' | 'win32'
  probe(signal: AbortSignal): Promise<BackendProbe>
  screenshot(signal: AbortSignal): Promise<Capture>
}

// ---------------- ADB ----------------
export interface AdbConfig { adbPath: string; serial: string }

export class AdbBackend implements DeviceBackend {
  readonly kind = 'adb' as const
  private cfg: AdbConfig
  constructor(cfg: AdbConfig) { this.cfg = cfg }

  private serialArgs(): string[] { return this.cfg.serial ? ['-s', this.cfg.serial] : [] }

  async probe(signal: AbortSignal): Promise<BackendProbe> {
    const r = await run(this.cfg.adbPath, ['devices'], { timeoutMs: 10_000, signal })
    if (!r.ok) return { backend: 'adb', tested: true, connected: false, address: this.cfg.serial || null, detail: { stderr: r.stderr.slice(0, 500) }, error: r.error ?? `adb devices 失敗（code ${r.code}）` }
    const devices = r.stdout.toString('utf8').split('\n').slice(1)
      .map(l => l.trim()).filter(Boolean)
      .map(l => { const [serial, state] = l.split(/\s+/); return { serial: serial!, state: state ?? '' } })
    const target = this.cfg.serial ? devices.find(d => d.serial === this.cfg.serial) : (devices.length === 1 ? devices[0] : undefined)
    const connected = target?.state === 'device'
    let error: string | null = null
    if (!target) error = this.cfg.serial ? `找不到設定的裝置 ${this.cfg.serial}` : (devices.length === 0 ? '沒有 ADB 裝置' : '有多台裝置，請在設定中指定 serial')
    else if (!connected) error = `裝置狀態為 ${target.state}`
    return { backend: 'adb', tested: true, connected, address: target?.serial ?? (this.cfg.serial || null), detail: { devices }, error }
  }

  async screenshot(signal: AbortSignal): Promise<Capture> {
    const r = await run(this.cfg.adbPath, [...this.serialArgs(), 'exec-out', 'screencap', '-p'], { timeoutMs: 20_000, signal })
    if (!r.ok) return { png: null, error: r.error ?? `screencap 失敗（code ${r.code}）：${r.stderr.slice(0, 300)}`, method: 'adb exec-out screencap -p' }
    return { png: r.stdout, error: null, method: 'adb exec-out screencap -p' }
  }
}

// ---------------- PlayCover ----------------
export interface PlayCoverConfig { address: string; appNames: string[] }

export interface MacWindow {
  id: number; owner: string; title: string; onScreen: boolean; layer: number
  bounds: { X: number; Y: number; Width: number; Height: number }
}

/** 以 JXA 讀 CGWindowList；需要「螢幕錄製」權限才讀得到視窗標題。 */
const JXA_LIST_WINDOWS = `
ObjC.import('CoreGraphics');
function list(opt){ return ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(opt, 0))) || [] }
var all = list(0), on = list(1);
var onIds = {}; on.forEach(function(w){ onIds[w.kCGWindowNumber] = true });
JSON.stringify(all.filter(function(w){ return w.kCGWindowLayer === 0 }).map(function(w){ return {
  id: w.kCGWindowNumber, owner: w.kCGWindowOwnerName || '', title: w.kCGWindowName || '',
  onScreen: !!onIds[w.kCGWindowNumber], layer: w.kCGWindowLayer, bounds: w.kCGWindowBounds
}}))
`

export function parseMaaToolsPort(title: string): string | null {
  const m = /\[(localhost|127\.0\.0\.1):(\d{2,5})\]/.exec(title)
  return m ? `${m[1]}:${m[2]}` : null
}

export function tcpProbe(address: string, timeoutMs = 3000): Promise<boolean> {
  const [host, portStr] = address.split(':')
  const port = Number(portStr)
  if (!host || !Number.isInteger(port)) return Promise.resolve(false)
  return new Promise(resolve => {
    const s = connect({ host, port })
    const done = (v: boolean) => { s.destroy(); resolve(v) }
    s.setTimeout(timeoutMs, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

export class PlayCoverBackend implements DeviceBackend {
  readonly kind = 'playcover' as const
  private cfg: PlayCoverConfig
  constructor(cfg: PlayCoverConfig) { this.cfg = cfg }

  async findWindow(signal: AbortSignal): Promise<{ window: MacWindow | null; error: string | null; titlesReadable: boolean }> {
    if (process.platform !== 'darwin') return { window: null, error: `PlayCover 後端只支援 macOS（目前 ${process.platform}）`, titlesReadable: false }
    const r = await run('osascript', ['-l', 'JavaScript', '-e', JXA_LIST_WINDOWS], { timeoutMs: 10_000, signal })
    if (!r.ok) return { window: null, error: `讀取視窗清單失敗：${r.error ?? r.stderr.slice(0, 300)}`, titlesReadable: false }
    let wins: MacWindow[]
    try { wins = JSON.parse(r.stdout.toString('utf8')) } catch { return { window: null, error: '視窗清單不是 JSON', titlesReadable: false } }
    const titlesReadable = wins.some(w => w.title !== '')
    const cands = wins.filter(w => this.cfg.appNames.some(n => w.owner.includes(n) || w.title.includes(n)))
    const win = cands.find(w => parseMaaToolsPort(w.title)) ?? cands.sort((a, b) => b.bounds.Width * b.bounds.Height - a.bounds.Width * a.bounds.Height)[0] ?? null
    return { window: win, error: win ? null : '找不到明日方舟視窗', titlesReadable }
  }

  async probe(signal: AbortSignal): Promise<BackendProbe> {
    const { window, error, titlesReadable } = await this.findWindow(signal)
    const fromTitle = window ? parseMaaToolsPort(window.title) : null
    const address = this.cfg.address || fromTitle
    const detail: Record<string, unknown> = {
      window_found: !!window,
      window_id: window?.id ?? null,
      window_title: window?.title ?? null,
      // 不在 onScreen 清單 = 已最小化、在其他桌面，或被台前調度切走 → 截圖會失效
      window_on_current_space: window ? window.onScreen : null,
      window_size: window ? `${window.bounds.Width}x${window.bounds.Height}` : null,
      titles_readable: titlesReadable,
      address_source: this.cfg.address ? 'config' : (fromTitle ? 'window_title' : null),
    }
    if (!titlesReadable && process.platform === 'darwin') detail.hint = '讀不到視窗標題：請在「系統設定 → 隱私權與安全性 → 螢幕錄製」允許執行 dsh 的終端機'
    if (!window) return { backend: 'playcover', tested: true, connected: false, address, detail, error }
    if (!window.onScreen) return { backend: 'playcover', tested: true, connected: false, address, detail, error: '遊戲視窗不在目前桌面或已最小化' }
    if (!address) return { backend: 'playcover', tested: true, connected: false, address: null, detail, error: '取不到 MaaTools 位址（標題列 [localhost:端口] 或設定 playcover.address）' }
    const ok = await tcpProbe(address)
    return { backend: 'playcover', tested: true, connected: ok, address, detail, error: ok ? null : `MaaTools 埠 ${address} 連不上（檢查 PlayCover 設定是否勾選 MaaTools）` }
  }

  async screenshot(signal: AbortSignal): Promise<Capture> {
    const { window, error } = await this.findWindow(signal)
    if (!window) return { png: null, error, method: 'screencapture -l' }
    const tmp = join(tmpdir(), `ark-pc-${process.pid}-${Date.now()}.png`)
    const r = await run('screencapture', ['-x', '-o', '-l', String(window.id), tmp], { timeoutMs: 15_000, signal })
    if (!r.ok) return { png: null, error: `screencapture 失敗：${r.error ?? r.stderr.slice(0, 300)}`, method: 'screencapture -l' }
    try { return { png: readFileSync(tmp), error: null, method: 'screencapture -l' } }
    catch (e) { return { png: null, error: (e as Error).message, method: 'screencapture -l' } }
    finally { rmSync(tmp, { force: true }) }
  }
}
