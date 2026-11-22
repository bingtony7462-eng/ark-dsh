import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, existsSync } from 'node:fs'
import { Win32Backend, selectWindow, PS_SCAN, PS_CAPTURE, type PsRunner, type Win32Window } from '../src/ark-device/win32.ts'
import { ArkDevice } from '../src/ark-device/index.ts'
import { defaultDataDir } from '../src/ark-core/index.ts'
import { executionPath, deriveRoutes, parseHelpCommands } from '../src/ark-maa/probe.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boot, makePng, FIX } from './helpers.ts'

const good = makePng(1920, 1080, (x, y) => [(x * 5) % 256, (y * 9) % 256, 120])
const black = makePng(1920, 1080, () => [0, 0, 0])
const cfg = { windowTitles: ['明日方舟', 'Arknights'], processName: '' }
const win = (o: Partial<Win32Window> = {}): Win32Window => ({ hwnd: '1311234', title: '明日方舟', pid: 4242, process: 'Arknights', exe: 'D:\\Games\\Arknights\\Arknights.exe', visible: true, minimized: false, client_w: 1920, client_h: 1080, ...o })
const ok = (s: string) => ({ ok: true, code: 0, stdout: Buffer.from(s), stderr: '', timedOut: false })

/** 模擬 PowerShell：掃描回傳指定視窗，截圖把 png 複製到 ARK_W32_OUT。 */
function fakePs(windows: Win32Window[], png: string, isAdmin = true): PsRunner & { calls: { script: string; env: Record<string, string> }[] } {
  const calls: { script: string; env: Record<string, string> }[] = []
  const fn = (async (script: string, env: Record<string, string>) => {
    calls.push({ script, env })
    if (script === PS_SCAN) return ok(JSON.stringify({ is_admin: isAdmin, windows: windows.length === 1 ? windows[0] : windows }))
    if (script === PS_CAPTURE) { copyFileSync(png, env.ARK_W32_OUT!); return ok('ok') }
    return { ok: false, code: 1, stdout: Buffer.alloc(0), stderr: 'unknown script', timedOut: false }
  }) as unknown as PsRunner & { calls: typeof calls }
  fn.calls = calls
  return fn
}

test('selectWindow：0 個 / 多個同名 / 用執行檔名稱消歧義', () => {
  assert.match(selectWindow({ is_admin: true, windows: [] }, cfg).error!, /找不到/)
  const two = { is_admin: true, windows: [win(), win({ hwnd: '9', process: 'notepad' })] }
  assert.match(selectWindow(two, cfg).error!, /2 個同名視窗/)
  assert.equal(selectWindow(two, { ...cfg, processName: 'Arknights.exe' }).window?.hwnd, '1311234')
})

test('Win32 探測：正常視窗 → connected；標題以環境變數傳入，不拼進腳本', async () => {
  const ps = fakePs([win()], good)
  const b = new Win32Backend(cfg, ps, 'win32')
  const p = await b.probe(new AbortController().signal)
  assert.equal(p.connected, true)
  assert.equal(p.address, 'hwnd:1311234')
  assert.equal((p.detail as any).aspect_16_9, true)
  assert.equal(ps.calls[0]!.env.ARK_W32_TITLES, JSON.stringify(cfg.windowTitles))
  assert.ok(!PS_SCAN.includes('明日方舟'))
})

test('Win32 探測：最小化 → 不可用；非管理員 → 回報提示', async () => {
  const p = await new Win32Backend(cfg, fakePs([win({ minimized: true })], good, false), 'win32').probe(new AbortController().signal)
  assert.equal(p.connected, false)
  assert.match(p.error!, /最小化/)
  assert.equal((p.detail as any).is_admin, false)
  assert.match((p.detail as any).admin_note, /系統管理員/)
})

test('Win32 後端在非 Windows 上如實回報不支援', async () => {
  const p = await new Win32Backend(cfg, fakePs([win()], good), 'linux').probe(new AbortController().signal)
  assert.equal(p.connected, false)
  assert.match(p.error!, /只支援 Windows/)
})

test('ark_status（模擬 Windows PC 端）：有效截圖 + 執行路徑標為 blocked', async () => {
  ArkDevice.overrides = { win32: new Win32Backend(cfg, fakePs([win()], good), 'win32') }
  try {
    const b = await boot({ runtime: 'win32' })
    const v = (await b.call('ark_status')).value as any
    assert.equal(v.device.ok, true, JSON.stringify(v.device))
    assert.equal(v.device.active_backend, 'win32')
    assert.equal(v.device.backends.win32.tested, true)
    assert.equal(v.device.backends.adb.tested, false)
    assert.equal(v.device.backends.playcover.tested, false)
    assert.equal(v.device.screenshot.valid, true)
    assert.match(v.device.screenshot.method, /PrintWindow/)
    assert.ok(existsSync(v.device.screenshot.path))
    assert.equal(v.maa.execution_path.status, 'blocked')
    assert.match(v.maa.execution_path.reason, /尚不支援 Windows PC/)
    await b.dispose()
  } finally { ArkDevice.overrides = {} }
})

test('ark_status（模擬 Windows PC 端）：PrintWindow 拿到全黑畫面 → 失敗', async () => {
  ArkDevice.overrides = { win32: new Win32Backend(cfg, fakePs([win()], black), 'win32') }
  try {
    const b = await boot({ runtime: 'win32' })
    const v = (await b.call('ark_status')).value as any
    assert.equal(v.device.ok, false)
    assert.equal(v.device.error, '畫面全黑')
    await b.dispose()
  } finally { ArkDevice.overrides = {} }
})

test('執行路徑：maa-cli v0.7.5 無 PC 端支援；adb 可用', () => {
  const routes = deriveRoutes(parseHelpCommands(readFileSync(join(FIX, 'maa-help-v0.7.5.txt'), 'utf8')).commands)
  assert.equal(routes.pc_client, 'unsupported')
  assert.equal(executionPath('win32', routes).status, 'blocked')
  assert.equal(executionPath('adb', routes).status, 'ready')
  assert.equal(executionPath('win32', { ...routes, pc_client: 'maybe: maa connection（需實測）' }).status, 'unknown')
})

test('資料目錄：macOS / Windows / 其他', () => {
  assert.match(defaultDataDir('darwin', {}), /Library[\\/]Application Support[\\/]ark-dsh$/)
  assert.equal(defaultDataDir('win32', { APPDATA: 'C:\\Users\\t\\AppData\\Roaming' }), join('C:\\Users\\t\\AppData\\Roaming', 'ark-dsh'))
  assert.match(defaultDataDir('linux', {}), /\.local[\\/]share[\\/]ark-dsh$/)
})
