import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRegistry, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { PNG } from 'pngjs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '../src/ark-core/index.ts'
import * as device from '../src/ark-device/index.ts'
import * as maa from '../src/ark-maa/index.ts'
import * as guard from '../src/ark-guard/index.ts'
import * as box from '../src/ark-box/index.ts'
import * as guide from '../src/ark-guide/index.ts'
import * as copilot from '../src/ark-copilot/index.ts'
import * as planner from '../src/ark-planner/index.ts'
import * as strategy from '../src/ark-strategy/index.ts'

export const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
export const tick = () => new Promise(r => setTimeout(r, 30))

export function makePng(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): string {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y); const o = (y * w + x) * 4
    png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255
  }
  const p = join(mkdtempSync(join(tmpdir(), 'ark-png-')), 'shot.png')
  writeFileSync(p, PNG.sync.write(png))
  return p
}

export interface Boot { ctx: Context; dataDir: string; call(name: string, args?: Record<string, unknown>): Promise<ToolExecutionResult>; dispose(): Promise<void> }

export async function boot(opts: { runtime?: 'auto' | 'adb' | 'playcover' | 'win32' | 'unset'; server?: 'cn' | 'tw' | 'global' | 'jp' | 'unset'; dataDir?: string; maaBin?: string; device?: Record<string, unknown> } = {}): Promise<Boot> {
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'ark-data-'))
  const ctx = new Context()
  ctx.plugin(SystemPrompt)
  ctx.plugin(ToolRegistry)
  const fork = ctx.plugin({ name: 'ark-all', apply(c: Context) {
    c.plugin(core, { server: opts.server ?? 'tw', runtime: opts.runtime ?? 'adb', dataDir } as never)
    c.plugin(device, (opts.device ?? { adb: { adbPath: join(FIX, 'fake-adb.sh'), serial: '127.0.0.1:16384' } }) as never)
    c.plugin(maa, { binary: opts.maaBin ?? join(FIX, 'fake-maa.sh'), fallbackBinary: '/nonexistent/maa-cli' } as never)
    for (const p of [guard, box, guide, copilot, planner, strategy]) c.plugin(p)
  } })
  await tick(); await tick()
  let n = 0
  return {
    ctx, dataDir,
    call: (name, args = {}) => ctx.tools.execute({ callId: `t${n++}` as never, name, arguments: args, signal: new AbortController().signal }),
    dispose: async () => { fork.dispose(); await tick() },
  }
}
