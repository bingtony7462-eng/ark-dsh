import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, FIX } from './helpers.ts'
import { deriveRoutes } from '../src/ark-maa/probe.ts'
import { fightArgv, resolveClientType } from '../src/ark-maa/fight.ts'

test('Fight preflight: configured ADB and profile, no commands executed except probes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'fight-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const log = join(root, 'calls')
  for (const [key, value] of Object.entries({ FAKE_ADB_DEVICES: 'one\tdevice\ntwo\tdevice', FAKE_MAA_CONFIG: root, FAKE_MAA_LOG: log })) {
    const old = process.env[key]
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
    process.env[key] = value
  }
  const b = await boot({ profile: 'tw-local', device: { adb: { adbPath: join(FIX, 'fake-adb.sh'), serial: '' } } })
  t.after(() => b.dispose())
  const request = { stage: '1-7', times: 1, medicine: 0 }
  const build = () => b.ctx.arkMaa.buildFightArgs(request, new AbortController().signal)
  await assert.rejects(build, /多台/)
  for (const serial of ['one', 'two']) {
    b.ctx.ark.savePrefs({ adbSerial: serial })
    if (serial === 'one') {
      await assert.rejects(build, /maa init -n tw-local/)
      mkdirSync(join(root, 'profiles'))
      writeFileSync(join(root, 'profiles/tw-local.toml'), '[connection]\n')
    }
    assert.deepEqual(await build(), ['fight', '1-7', '--times', '1', '--medicine', '0', '--stone', '0', '--client-type', 'Txwy', '-a', serial, '-p', 'tw-local'])
  }
  for (const state of ['offline', 'unauthorized']) {
    process.env.FAKE_ADB_DEVICES = `one\tdevice\ntwo\t${state}`
    await assert.rejects(build, new RegExp(state))
  }
  assert.equal(deriveRoutes({ run: 'custom' }).fight, 'unavailable')
  assert.ok(readFileSync(log, 'utf8').trim().split('\n').every(cmd => ['--version', 'version', '--help', 'dir config'].includes(cmd)))
})

test('Fight preflight never redirects explicit win32 runtime to ADB', async t => {
  const b = await boot({ runtime: 'win32', device: { backend: 'adb' } })
  t.after(() => b.dispose())
  await assert.rejects(() => b.ctx.arkMaa.buildFightArgs({ stage: '1-7', times: 1, medicine: 0 }, new AbortController().signal), /不會從原生客戶端/)
})

test('client-type：依伺服器推導，台服一定帶 Txwy；推不出或矛盾時不硬跑', async t => {
  assert.equal(resolveClientType('tw'), 'Txwy')
  assert.equal(resolveClientType('cn'), 'Official')
  assert.equal(resolveClientType('cn', 'Bilibili'), 'Bilibili')
  assert.equal(resolveClientType('jp'), 'YoStarJP')
  assert.equal(resolveClientType('global'), 'YoStarEN')
  assert.throws(() => resolveClientType('unset'), /未設定伺服器/)
  assert.throws(() => resolveClientType('tw', 'Official'), /不符/)
  assert.throws(() => resolveClientType('tw', 'txwy-typo'), /無效/)
  assert.throws(() => fightArgv({ stage: '1-7', times: 1, medicine: 0 }, 'one', 'default', 'Bad' as never), /client-type/)

  const b = await boot({ server: 'unset', runtime: 'adb' })
  t.after(() => b.dispose())
  await assert.rejects(() => b.ctx.arkMaa.buildFightArgs({ stage: '1-7', times: 1, medicine: 0 }, new AbortController().signal), /未設定伺服器/)
})
