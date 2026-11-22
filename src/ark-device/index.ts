/**
 * ark-device：裝置抽象、狀態與截圖（唯讀）。
 * device_tap / device_swipe 依紅線 9 只處理突發彈窗，且需 ark-guard（P1）才開放，P0 不註冊。
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { AdbBackend, PlayCoverBackend, type DeviceBackend, type BackendProbe } from './backends.ts'
import { Win32Backend, type Win32Config } from './win32.ts'
import { checkPng } from '../shared/png.ts'
import { jsonRender, openObject, asJson } from '../shared/tool-helpers.ts'
import type {} from '../ark-core/index.ts'

export interface ArkDeviceConfig {
  backend: 'auto' | 'playcover' | 'adb' | 'win32'
  playcover: { address: string; appNames: string[] }
  adb: { adbPath: string; serial: string }
  win32: Win32Config
}

type Kind = 'playcover' | 'adb' | 'win32'

declare module '@deepseek-ai/cordis' {
  interface Context { arkDevice: ArkDevice }
}

export class ArkDevice extends Service {
  static inject = ['ark']
  /** 測試用：可注入替代後端。 */
  static overrides: Partial<Record<Kind, DeviceBackend>> = {}
  static Config: z<ArkDeviceConfig> = z.object({
    backend: z.union(['auto', 'playcover', 'adb', 'win32'] as const).default('auto').description('auto = 跟隨 ark-core.runtime'),
    playcover: z.object({
      address: z.string().default('').description('MaaTools 位址，如 localhost:1717；留空則從視窗標題讀取'),
      appNames: z.array(z.string()).default(['明日方舟', 'Arknights', 'アークナイツ']),
    }),
    adb: z.object({
      adbPath: z.string().default('adb'),
      serial: z.string().default('').description('如 127.0.0.1:16384；留空時僅一台裝置才自動選'),
    }),
    win32: z.object({
      windowTitles: z.array(z.string()).default(['明日方舟', 'Arknights']).description('遊戲視窗標題（完全相符）'),
      processName: z.string().default('').description('選填：執行檔名稱，例如 Arknights.exe'),
    }),
  }) as unknown as z<ArkDeviceConfig>

  readonly config: ArkDeviceConfig
  readonly backends: Record<Kind, DeviceBackend>

  constructor(ctx: Context, config: ArkDeviceConfig) {
    super(ctx, 'arkDevice')
    this.config = config
    this.backends = {
      playcover: new PlayCoverBackend(config.playcover),
      adb: new AdbBackend(config.adb),
      win32: new Win32Backend(config.win32),
      ...ArkDevice.overrides,
    }
  }

  get activeKind(): Kind | null {
    if (this.config.backend !== 'auto') return this.config.backend
    const rt = this.ctx.ark.config.runtime
    return rt === 'unset' ? null : rt
  }

  async status(signal: AbortSignal) { return this.screenshotStatus(signal, false) }

  /** 只測目前啟用的後端；另一個標為「未測」，不推論。 */
  async screenshotStatus(signal: AbortSignal, take: boolean): Promise<Record<string, unknown>> {
    const active = this.activeKind
    const untested = (k: Kind): BackendProbe => ({ backend: k, tested: false, connected: null, address: null, detail: { note: '未測' }, error: null })
    const backends: Record<string, unknown> = { playcover: untested('playcover'), adb: untested('adb'), win32: untested('win32') }
    if (!active) {
      return { ok: false, active_backend: null, backends, screenshot: { taken: false }, error: '未設定遊戲運行方式（ark-core.runtime）' }
    }
    const probe = await this.backends[active].probe(signal)
    backends[active] = probe
    let shot: Record<string, unknown> = { taken: false }
    if (take) {
      const cap = await this.backends[active].screenshot(signal)
      if (!cap.png) {
        shot = { taken: false, method: cap.method, error: cap.error }
      } else {
        const check = checkPng(cap.png)
        const path = this.ctx.ark.store.saveScreenshot(cap.png, `status-${active}`)
        shot = { taken: true, method: cap.method, path, bytes: cap.png.length, ...check }
      }
    }
    const ok = probe.connected === true && (!take || (shot as { valid?: boolean }).valid === true)
    return { ok, active_backend: active, backends, screenshot: shot, error: ok ? null : (probe.error ?? (shot as { reason?: string; error?: string }).reason ?? (shot as { error?: string }).error ?? null) }
  }
}

export const toolsPlugin = {
  name: 'ark-device-tools',
  inject: ['tools', 'arkDevice', 'ark'] as const,
  apply(ctx: Context) {
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'ark_screenshot',
      description: '截取遊戲畫面並檢查有效性（尺寸、全黑、單色）。唯讀。',
      parameters: {},
      output: { schema: openObject, render: jsonRender },
      async execute(_args, exec) {
        const r = await ctx.arkDevice.screenshotStatus(exec.signal, true)
        return asJson({ ok: r.ok, active_backend: r.active_backend, screenshot: r.screenshot, error: r.error })
      },
    })))
  },
}

export const name = 'ark-device'
export const inject = ['tools', 'ark']
export const Config = ArkDevice.Config

export function apply(ctx: Context, config: ArkDeviceConfig) {
  ctx.plugin(ArkDevice, config)
  ctx.plugin(toolsPlugin)
  ctx.effect(() => ctx.ark.registerModule('ark-device', { stage: 'P0', implemented: true, note: 'tap/swipe、視窗守護排程、startup/closedown 待 P1' }))
}
