import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { boot, makePng } from './helpers.ts'
import { ArkDevice, autoOrder } from '../src/ark-device/index.ts'
import { Win32Backend, PS_SCAN, PS_CAPTURE, type PsRunner } from '../src/ark-device/win32.ts'
import { extraMaaCandidates } from '../src/ark-maa/index.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const good = makePng(1920, 1080, (x, y) => [(x * 11) % 256, (y * 7) % 256, 140])

test('autoOrder：依平台排定隨插即用偵測順序', () => {
  assert.deepEqual(autoOrder('win32'), ['win32', 'adb'])
  assert.deepEqual(autoOrder('darwin'), ['playcover', 'adb'])
  assert.deepEqual(autoOrder('linux'), ['adb'])
})

test('ark_configure：對話中免改檔設定，寫入 SQLite 且重啟後仍生效', async () => {
  const b1 = await boot({ server: 'unset', runtime: 'auto' })
  const r1 = await b1.call('ark_configure', { server: 'tw', runtime: 'win32', window_title: 'Arknights', account: 'tony-tw' })
  assert.equal(r1.isError, false)
  const v1 = r1.value as any
  assert.equal(v1.ok, true)
  assert.equal(v1.effective.server, 'tw')
  assert.equal(v1.effective.runtime, 'win32')
  assert.equal(v1.effective.account_set, true)
  assert.equal(v1.effective.source.server, 'saved')
  assert.equal(v1.effective.source.runtime, 'saved')
  const dir = b1.dataDir
  await b1.dispose()

  const b2 = await boot({ server: 'unset', runtime: 'auto', dataDir: dir })
  const eff = b2.ctx.ark.effectiveSettings()
  assert.equal(eff.server, 'tw')
  assert.equal(eff.runtime, 'win32')
  assert.equal(eff.account, 'tony-tw')
  assert.deepEqual(eff.prefs.windowTitles, ['Arknights', '明日方舟', 'Arknights'])
  await b2.dispose()
})

test('runtime=auto（Windows 模擬）：自動偵測命中 win32，未測到的 playcover/adb 如實標為未測', async () => {
  const ps: PsRunner = async (script, env) => {
    if (script === PS_SCAN) return { ok: true, code: 0, stdout: Buffer.from(JSON.stringify({ is_admin: true, windows: [{ hwnd: '777', title: 'Arknights', pid: 100, process: 'Arknights', exe: null, visible: true, minimized: false, client_w: 1920, client_h: 1080 }] })), stderr: '', timedOut: false }
    if (script === PS_CAPTURE) { writeFileSync(env.ARK_W32_OUT!, readFileSync(good)); return { ok: true, code: 0, stdout: Buffer.from('ok'), stderr: '', timedOut: false } }
    return { ok: false, code: 1, stdout: Buffer.alloc(0), stderr: 'bad', timedOut: false }
  }
  ArkDevice.platformOverride = 'win32'
  ArkDevice.overrides = { win32: new Win32Backend({ windowTitles: ['明日方舟', 'Arknights'], processName: '' }, ps, 'win32') }
  try {
    const b = await boot({ runtime: 'auto', server: 'unset' })
    const v = (await b.call('ark_status')).value as any
    assert.equal(v.device.ok, true, JSON.stringify(v.device))
    assert.equal(v.device.mode, 'auto')
    assert.equal(v.device.active_backend, 'win32')
    assert.equal(v.device.backends.win32.tested, true)
    assert.equal(v.device.backends.adb.tested, false)
    assert.equal(v.device.backends.playcover.tested, false)
    assert.equal(v.settings.resolved_runtime, 'win32')
    assert.match(v.settings.hint, /ark_configure/)
    assert.equal(v.maa.execution_path.status, 'blocked')
    await b.dispose()
  } finally {
    ArkDevice.overrides = {}
    ArkDevice.platformOverride = null
  }
})

test('extraMaaCandidates：Windows winget Links / Packages 目錄能自動被找到（免重開機刷新 PATH）', () => {
  const fakeLocal = mkdtempSync(join(tmpdir(), 'ark-winget-'))
  const pkgExeDir = join(fakeLocal, 'Microsoft', 'WinGet', 'Packages', 'MaaAssistantArknights.maa-cli_Microsoft.Winget.Source_8wekyb3d8bbwe')
  mkdirSync(pkgExeDir, { recursive: true })
  const exe = join(pkgExeDir, 'maa-cli.exe')
  writeFileSync(exe, 'stub')
  const cands = extraMaaCandidates('win32', { LOCALAPPDATA: fakeLocal })
  assert.ok(cands.includes(exe), JSON.stringify(cands))
})

test('dsh.bundle 清單與預編譯契約：package.json、cordis.patch.yml 與九個子入口完整對齊', async () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.private, undefined, 'dsh 插件索引與 bundle 不應設 private: true')
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.ok(typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.length > 0)
  assert.ok(pkg.peerDependencies?.['@deepseek-ai/cordis'])
  assert.ok(pkg.peerDependencies?.['@deepseek-ai/dsh-tools'])

  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  const modules = ['ark-core', 'ark-device', 'ark-maa', 'ark-guard', 'ark-box', 'ark-guide', 'ark-copilot', 'ark-planner', 'ark-strategy']
  for (const m of modules) {
    assert.ok(patch.includes(`id: ${m}`), `cordis.patch.yml 缺少 id: ${m}`)
    assert.ok(patch.includes(`name: 'ark-dsh/${m}'`), `cordis.patch.yml 缺少 name: 'ark-dsh/${m}'`)
    assert.ok(pkg.exports[`./${m}`]?.default === `./lib/${m}/index.js`, `exports 缺少 ./${m}`)
    if (existsSync(join(ROOT, 'lib'))) {
      assert.ok(existsSync(join(ROOT, 'lib', m, 'index.js')), `預編譯產物缺少 lib/${m}/index.js`)
    }
  }
})
