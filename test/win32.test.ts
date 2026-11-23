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

test('selectWindow：0 個 / 多個同名 / 用執行檔名稱消歧義 / 排除 640x480 隱藏佔位窗與未提權 null process', () => {
  assert.match(selectWindow({ is_admin: true, windows: [] }, cfg).error!, /找不到/)
  const two = { is_admin: true, windows: [win(), win({ hwnd: '9', process: 'notepad' })] }
  assert.match(selectWindow(two, cfg).error!, /2 個候選同名視窗/)
  assert.equal(selectWindow(two, { ...cfg, processName: 'Arknights.exe' }).window?.hwnd, '1311234')

  // 實機情境 B1：官方 PC 版同時存在 1920x1080 遊戲主窗 + 640x480 隱藏佔位窗（同一個 process）
  const realAndHiddenPlaceholder = {
    is_admin: true,
    windows: [
      win({ hwnd: '55501', visible: false, client_w: 640, client_h: 480 }),
      win({ hwnd: '55502', visible: true, client_w: 1920, client_h: 1080 }),
    ],
  }
  assert.equal(selectWindow(realAndHiddenPlaceholder, cfg).window?.hwnd, '55502')

  // 實機情境 B2：即使佔位窗 visible=true 但尺寸只有 640x480，同樣自動選中 >=960x540 的遊戲主窗
  const realAndSmallPlaceholder = {
    is_admin: true,
    windows: [
      win({ hwnd: '55503', visible: true, client_w: 640, client_h: 480 }),
      win({ hwnd: '55504', visible: true, client_w: 1280, client_h: 720 }),
    ],
  }
  assert.equal(selectWindow(realAndSmallPlaceholder, cfg).window?.hwnd, '55504')

  // 實機情境 B3：非系統管理員下 ACE 提權進程使 Get-Process 被拒（process 全為 null），即使設了 processName 也不會把候選濾光
  const nonAdminAce = {
    is_admin: false,
    windows: [
      win({ hwnd: '66601', process: null, exe: null, visible: false, client_w: 640, client_h: 480 }),
      win({ hwnd: '66602', process: null, exe: null, visible: true, client_w: 1920, client_h: 1080 }),
    ],
  }
  assert.equal(selectWindow(nonAdminAce, { ...cfg, processName: 'Arknights.exe' }).window?.hwnd, '66602')
})

test('PS_SCAN / PS_CAPTURE：開頭強制設定 Console::OutputEncoding 與 $OutputEncoding 為 UTF-8，且 scan 相容 UTF-8 BOM', async () => {
  for (const script of [PS_SCAN, PS_CAPTURE]) {
    assert.match(script, /\[Console\]::OutputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/)
    assert.match(script, /\$OutputEncoding\s*=\s*\[System\.Text\.Encoding\]::UTF8/)
  }
  const psWithBom: PsRunner = async () => ({
    ok: true,
    code: 0,
    stdout: Buffer.from('\uFEFF' + JSON.stringify({ is_admin: true, windows: win({ title: '明日方舟' }) }), 'utf8'),
    stderr: '',
    timedOut: false,
  })
  const b = new Win32Backend(cfg, psWithBom, 'win32')
  const s = await b.scan(new AbortController().signal)
  assert.equal(s.error, null)
  assert.equal(s.scan?.windows[0]?.title, '明日方舟')
})

test('Win32 截圖：非管理員下 PrintWindow 失敗時明確提示 ACE 提權需系統管理員身分', async () => {
  const psFailPrint: PsRunner = async (script) => {
    if (script === PS_SCAN) return ok(JSON.stringify({ is_admin: false, windows: win({ process: null }) }))
    return { ok: false, code: 1, stdout: Buffer.alloc(0), stderr: 'PrintWindow returned false', timedOut: false }
  }
  const cap = await new Win32Backend(cfg, psFailPrint, 'win32').screenshot(new AbortController().signal)
  assert.equal(cap.png, null)
  assert.match(cap.error!, /PrintWindow returned false/)
  assert.match(cap.error!, /系統管理員/)
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
