/**
 * P0 實機驗收腳本（在你的 Mac 上執行，不經 dsh 模型、不操作遊戲）：
 *   npm run p0 -- --server tw --runtime playcover
 *   npm run p0 -- --server tw --runtime adb --adb-serial 127.0.0.1:16384
 *   npm run p0 -- --server tw --runtime win32            （Windows 官方 PC 客戶端，先手動開好遊戲）
 *   npm run p0 -- --server tw --runtime win32 --window-title 明日方舟 --process-name Arknights.exe
 * 以真實 dsh ToolRegistry 載入九個插件並呼叫 ark_status，報告寫入
 * 資料目錄的 acceptance/p0-<時間>.json（macOS：~/Library/Application Support/ark-dsh；Windows：%APPDATA%\\ark-dsh）。
 */
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRegistry } from '@deepseek-ai/dsh-tools'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import * as core from '../src/ark-core/index.ts'
import * as device from '../src/ark-device/index.ts'
import * as maa from '../src/ark-maa/index.ts'
import * as guard from '../src/ark-guard/index.ts'
import * as box from '../src/ark-box/index.ts'
import * as guide from '../src/ark-guide/index.ts'
import * as copilot from '../src/ark-copilot/index.ts'
import * as planner from '../src/ark-planner/index.ts'
import * as strategy from '../src/ark-strategy/index.ts'

const { values } = parseArgs({ options: {
  server: { type: 'string', default: 'unset' },
  runtime: { type: 'string', default: 'unset' },
  'adb-path': { type: 'string', default: 'adb' },
  'adb-serial': { type: 'string', default: '' },
  'playcover-address': { type: 'string', default: '' },
  'window-title': { type: 'string', multiple: true, default: ['明日方舟', 'Arknights'] },
  'process-name': { type: 'string', default: '' },
  'data-dir': { type: 'string', default: core.DEFAULT_DATA_DIR },
} })

if (!['cn', 'tw', 'global', 'jp'].includes(values.server!)) { console.error('--server 必須是 cn / tw / global / jp'); process.exit(2) }
if (!['playcover', 'adb', 'win32'].includes(values.runtime!)) { console.error('--runtime 必須是 playcover / adb / win32'); process.exit(2) }

const tick = () => new Promise(r => setTimeout(r, 50))
const ctx = new Context()
ctx.plugin(SystemPrompt)
ctx.plugin(ToolRegistry)
ctx.plugin({ name: 'ark-all', apply(c: Context) {
  c.plugin(core, { server: values.server, runtime: values.runtime, dataDir: values['data-dir'] } as never)
  c.plugin(device, { playcover: { address: values['playcover-address'] }, adb: { adbPath: values['adb-path'], serial: values['adb-serial'] }, win32: { windowTitles: values['window-title'], processName: values['process-name'] } } as never)
  c.plugin(maa, {} as never)
  for (const p of [guard, box, guide, copilot, planner, strategy]) c.plugin(p)
} })
await tick(); await tick()

const r = await ctx.tools.execute({ callId: 'p0-acceptance' as never, name: 'ark_status', arguments: { screenshot: true }, signal: AbortSignal.timeout(120_000) })
if (r.isError) { console.error(JSON.stringify(r.error)); process.exit(2) }
const v = r.value as any
const verdict = {
  maa_found: v.maa.found === true,
  maa_core_ready: v.maa.core_ready === true,
  device_connected: v.device.backends?.[v.device.active_backend]?.connected === true,
  screenshot_valid: v.device.screenshot?.valid === true,
  sqlite_ok: v.storage.sqlite === 'ok',
}
// P0 驗收只看環境；執行路徑另外回報（win32 目前 blocked 不影響 P0，但會擋 P1 之後的執行）
const pass = Object.values(verdict).every(Boolean)
const out = join(values['data-dir'], 'acceptance')
mkdirSync(out, { recursive: true })
const file = join(out, `p0-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify({ kind: 'real_machine', pass, verdict, platform: process.platform, node: process.version, status: v }, null, 2))
console.log(JSON.stringify({ pass, verdict, execution_path: v.maa.execution_path ?? null, win32: v.device.backends?.win32?.detail ?? null, report: file, screenshot: v.device.screenshot?.path ?? null, error: v.device.error }, null, 2))
process.exit(pass ? 0 : 1)
