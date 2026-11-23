import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { boot, makePng, FIX } from './helpers.ts'
import { parseHelpCommands, parseVersions, deriveRoutes } from '../src/ark-maa/probe.ts'
import { parseMaaToolsPort } from '../src/ark-device/backends.ts'
import { checkPng } from '../src/shared/png.ts'

// 假的 maa/adb 是 bash 腳本，Windows 上跳過這些模擬測試（Windows 請用 npm run p0 做實機驗收）
const skipShell = process.platform === 'win32'

const good = makePng(1920, 1080, (x, y) => [(x * 7) % 256, (y * 3) % 256, (x + y) % 256])
const black = makePng(1920, 1080, () => [0, 0, 0])
const small = makePng(640, 360, (x, y) => [(x * 7) % 256, (y * 3) % 256, 90])

test('maa --help 解析：v0.7.5 沒有 infrast/recruit 子命令，改走 maa run', () => {
  const { commands } = parseHelpCommands(readFileSync(join(FIX, 'maa-help-v0.7.5.txt'), 'utf8'))
  assert.equal(Object.keys(commands).length, 25)
  assert.ok(commands.fight && commands.copilot && commands.run)
  assert.equal(commands.infrast, undefined)
  const routes = deriveRoutes(commands)
  assert.equal(routes.infrast, 'maa run + task file')
  assert.equal(routes.recruit, 'maa run + task file')
  assert.equal(routes.sss_copilot, 'maa ssscopilot')
})

test('版本解析：格式不符回 null，不猜', () => {
  assert.deepEqual(parseVersions('maa-cli v0.7.5\nMaaCore v6.16.8'), { cli: '0.7.5', core: '6.16.8' })
  assert.deepEqual(parseVersions('something else'), { cli: null, core: null })
})

test('PlayCover 標題列位址解析', () => {
  assert.equal(parseMaaToolsPort('明日方舟 [localhost:1717]'), 'localhost:1717')
  assert.equal(parseMaaToolsPort('明日方舟'), null)
})

test('截圖判定：正常 / 全黑 / 解析度過低', () => {
  assert.equal(checkPng(readFileSync(good)).valid, true)
  const b = checkPng(readFileSync(black)); assert.equal(b.valid, false); assert.equal(b.black, true)
  const s = checkPng(readFileSync(small)); assert.equal(s.valid, false); assert.match(s.reason!, /解析度過低/)
  assert.equal(checkPng(Buffer.from('not a png')).valid, false)
})

test('ark_status（模擬 ADB）：回報後端、連線、有效截圖；PlayCover 標明未測', { skip: skipShell }, async () => {
  process.env.FAKE_ADB_DEVICES = '127.0.0.1:16384\tdevice'
  process.env.FAKE_ADB_PNG = good
  const b = await boot({ runtime: 'adb' })
  const r = await b.call('ark_status')
  assert.equal(r.isError, false, JSON.stringify(r))
  const v = r.value as any
  assert.equal(v.device.ok, true)
  assert.equal(v.device.active_backend, 'adb')
  assert.equal(v.device.backends.adb.tested, true)
  assert.equal(v.device.backends.adb.connected, true)
  assert.equal(v.device.backends.playcover.tested, false)
  assert.equal(v.device.backends.playcover.detail.note, '未測')
  assert.equal(v.device.screenshot.valid, true)
  assert.equal(v.device.screenshot.width, 1920)
  assert.ok(existsSync(v.device.screenshot.path))
  assert.equal(v.maa.found, true)
  assert.equal(v.maa.cli_version, '0.7.5')
  assert.equal(v.maa.core_version, '6.16.8')
  assert.equal(v.maa.routes.infrast, 'maa run + task file')
  assert.equal(v.storage.sqlite, 'ok')
  // 紅線 2：ark-guard 未實作/未載入 → 只能查詢
  assert.equal(v.guard_loaded, false)
  assert.equal(v.capabilities, 'query_only')
  assert.equal(v.modules['ark-guard'].implemented, false)
  assert.equal(v.modules['ark-strategy'].stage, 'P3')
  await b.dispose()
})

test('ark_status：畫面全黑 → ok=false 並寫明原因', { skip: skipShell }, async () => {
  process.env.FAKE_ADB_DEVICES = '127.0.0.1:16384\tdevice'
  process.env.FAKE_ADB_PNG = black
  const b = await boot({ runtime: 'adb' })
  const v = (await b.call('ark_status')).value as any
  assert.equal(v.device.ok, false)
  assert.equal(v.device.screenshot.black, true)
  assert.equal(v.device.error, '畫面全黑')
  await b.dispose()
})

test('ark_status：裝置離線 / 找不到', { skip: skipShell }, async () => {
  process.env.FAKE_ADB_PNG = good
  process.env.FAKE_ADB_DEVICES = '127.0.0.1:16384\toffline'
  let b = await boot({ runtime: 'adb' })
  let v = (await b.call('ark_status')).value as any
  assert.equal(v.device.ok, false); assert.match(v.device.error, /offline/)
  await b.dispose()
  process.env.FAKE_ADB_DEVICES = ''
  b = await boot({ runtime: 'adb' })
  v = (await b.call('ark_status')).value as any
  assert.equal(v.device.ok, false); assert.match(v.device.error, /找不到/)
  await b.dispose()
})

test('ark_status：未設定運行方式 → 不猜後端，兩者皆未測', async () => {
  const b = await boot({ runtime: 'unset' })
  const v = (await b.call('ark_status')).value as any
  assert.equal(v.device.ok, false)
  assert.equal(v.device.active_backend, null)
  assert.ok(v.settings.missing.includes('runtime'))
  assert.equal(v.device.backends.adb.tested, false)
  await b.dispose()
})

test('PlayCover 後端在非 macOS 上如實回報不支援（不假裝成功）', { skip: process.platform === 'darwin' }, async () => {
  const b = await boot({ runtime: 'playcover', device: {} })
  const v = (await b.call('ark_status')).value as any
  assert.equal(v.device.ok, false)
  assert.equal(v.device.backends.playcover.tested, true)
  assert.match(v.device.error, /只支援 macOS/)
  await b.dispose()
})

test('找不到 maa 時回報 found=false', { skip: skipShell }, async () => {
  const b = await boot({ maaBin: '/nonexistent/maa' })
  const v = (await b.call('maa_probe')).value as any
  assert.equal(v.found, false)
  assert.equal(v.errors.length, 2)
  await b.dispose()
})

test('P0 工具面：只有唯讀與設定工具；無戰鬥/消費/點擊工具', async () => {
  const b = await boot()
  const names = b.ctx.tools.schemas().map(s => s.name).sort()
  assert.deepEqual(names, ['ark_configure', 'ark_screenshot', 'ark_status', 'maa_probe'])
  for (const n of ['maa_fight', 'maa_copilot', 'device_tap', 'device_swipe', 'maa_daily']) {
    const r = await b.call(n)
    assert.equal(r.isError, true)
  }
  await b.dispose()
})

test('狀態落地：重啟後 SQLite 與 JSONL 保留', { skip: skipShell }, async () => {
  process.env.FAKE_ADB_DEVICES = '127.0.0.1:16384\tdevice'
  process.env.FAKE_ADB_PNG = good
  const b1 = await boot()
  await b1.call('ark_status')
  const dir = b1.dataDir
  await b1.dispose()
  const b2 = await boot({ dataDir: dir })
  const probe = b2.ctx.ark.store.getKv<any>('maa.probe')
  assert.equal(probe.cli_version, '0.7.5')
  const logs = readdirSync(join(dir, 'logs'))
  assert.equal(logs.length, 1)
  const lines = readFileSync(join(dir, 'logs', logs[0]!), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(lines.filter(l => l.kind === 'boot').length, 2)
  assert.ok(lines.some(l => l.kind === 'status'))
  await b2.dispose()
})
