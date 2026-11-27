import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, FIX } from './helpers.ts'
import { parseCopilotJson, prepareCopilot, verifyPinnedCopilot } from '../src/ark-maa/copilot.ts'

const job = { stage_name: 'main_01-07', opers: [{ name: '能天使', skill: 3 }], actions: [{ type: 'Deploy', name: '能天使', location: [5, 3], direction: 'Right' }] }
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

function writeJob(root: string, body: unknown = job) {
  const file = join(root, 'job.json')
  const text = JSON.stringify(body)
  writeFileSync(file, text)
  return { file, sha256: sha(text) }
}

test('copilot 作業格式：只接受一般作業 JSON，其他一律拒絕', () => {
  assert.equal(parseCopilotJson(Buffer.from(JSON.stringify(job))).stage_name, 'main_01-07')
  assert.throws(() => parseCopilotJson(Buffer.from('#!/bin/sh\nrm -rf /')), /JSON/)
  assert.throws(() => parseCopilotJson(Buffer.from(JSON.stringify({ ...job, type: 'SSS' }))), /不支援/)
  assert.throws(() => parseCopilotJson(Buffer.from(JSON.stringify({ ...job, actions: [] }))), /actions/)
  assert.throws(() => parseCopilotJson(Buffer.from(JSON.stringify({ ...job, stage_name: '../x' }))), /stage_name/)
})

test('copilot 任務檔：頂層 client_type、不吃藥、不自動開關遊戲，並固定雜湊副本', t => {
  const root = mkdtempSync(join(tmpdir(), 'copilot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const data = join(root, 'data')
  const req = writeJob(root)
  const plan = prepareCopilot(data, req, 'Txwy', '127.0.0.1:16384', 'default')
  assert.equal(plan.argv[0], 'run')
  assert.equal(plan.argv[1], plan.task_file.replace(/\.json$/, ''))
  assert.deepEqual(plan.argv.slice(2), ['-a', '127.0.0.1:16384', '-p', 'default'])
  assert.ok(!plan.argv.includes('--client-type'), 'maa run / copilot 都不接受 --client-type')
  const task = JSON.parse(readFileSync(plan.task_file, 'utf8'))
  assert.equal(task.client_type, 'Txwy')
  assert.equal(task.startup, false)
  assert.equal(task.closedown, false)
  assert.equal(task.tasks.length, 1)
  assert.equal(task.tasks[0].type, 'Copilot')
  assert.equal(task.tasks[0].params.use_sanity_potion, false)
  assert.equal(task.tasks[0].params.filename, plan.pinned_path)
  assert.notEqual(plan.pinned_path, req.file)
  assert.equal(sha(readFileSync(plan.pinned_path)), req.sha256)

  // 預覽後原檔被換掉 → 雜湊不符，拒絕
  writeFileSync(req.file, JSON.stringify({ ...job, stage_name: 'main_04-04' }))
  assert.throws(() => prepareCopilot(data, req, 'Txwy', '127.0.0.1:16384', 'default'), /雜湊不符/)
  // 固定副本被改 → 執行前核對失敗
  writeFileSync(plan.pinned_path, '{}')
  assert.throws(() => verifyPinnedCopilot(plan.pinned_path, req.sha256), /雜湊不符/)
})

test('copilot 參數防呆：相對路徑、非 json、錯誤雜湊、異常序號', t => {
  const root = mkdtempSync(join(tmpdir(), 'copilot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const req = writeJob(root)
  const data = join(root, 'data')
  assert.throws(() => prepareCopilot(data, { ...req, file: 'job.json' }, 'Txwy', 'one', 'default'), /絕對路徑/)
  const py = join(root, 'job.py'); writeFileSync(py, 'print(1)')
  assert.throws(() => prepareCopilot(data, { file: py, sha256: sha('print(1)') }, 'Txwy', 'one', 'default'), /\.json/)
  assert.throws(() => prepareCopilot(data, { ...req, sha256: 'abc' }, 'Txwy', 'one', 'default'), /SHA-256/)
  assert.throws(() => prepareCopilot(data, req, 'Txwy', '--serial', 'default'), /ADB/)
  assert.throws(() => prepareCopilot(data, { ...req, loopTimes: 0 }, 'Txwy', 'one', 'default'), /loopTimes/)
})

test('buildCopilotArgs：依伺服器推導客戶端；伺服器未設定或 win32 時不建立', async t => {
  const root = mkdtempSync(join(tmpdir(), 'copilot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [key, value] of Object.entries({ FAKE_ADB_DEVICES: 'one\tdevice', FAKE_MAA_CONFIG: root })) {
    const old = process.env[key]
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
    process.env[key] = value
  }
  mkdirSync(join(root, 'profiles'))
  writeFileSync(join(root, 'profiles/default.toml'), '[connection]\n')
  const req = writeJob(root)
  const signal = new AbortController().signal

  const tw = await boot({ server: 'tw', device: { adb: { adbPath: join(FIX, 'fake-adb.sh'), serial: 'one' } } })
  t.after(() => tw.dispose())
  const plan = await tw.ctx.arkMaa.buildCopilotArgs(req, signal)
  assert.equal(plan.client_type, 'Txwy')
  assert.ok(plan.task_file.startsWith(tw.dataDir))
  assert.equal(JSON.parse(readFileSync(plan.task_file, 'utf8')).client_type, 'Txwy')
  await assert.rejects(() => tw.ctx.arkMaa.buildCopilotArgs({ ...req, clientType: 'Official' }, signal), /不符/)

  const unset = await boot({ server: 'unset', device: { adb: { adbPath: join(FIX, 'fake-adb.sh'), serial: 'one' } } })
  t.after(() => unset.dispose())
  await assert.rejects(() => unset.ctx.arkMaa.buildCopilotArgs(req, signal), /未設定伺服器/)

  const w32 = await boot({ server: 'tw', runtime: 'win32', device: { backend: 'adb' } })
  t.after(() => w32.dispose())
  await assert.rejects(() => w32.ctx.arkMaa.buildCopilotArgs(req, signal), /不會從原生客戶端/)
})
