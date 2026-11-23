/**
 * ark-device：裝置抽象、狀態與截圖（唯讀）。支援隨插即用自動偵測。
 * device_tap / device_swipe 依紅線 9 只處理突發彈窗，且需 ark-guard（P1）才開放，P0 不註冊。
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { AdbBackend, PlayCoverBackend, type DeviceBackend, type BackendProbe } from './backends.ts'
import { Win32Backend, type Win32Config } from './win32.ts'
import { checkPng } from '../shared/png.ts'
import { jsonRender, openObject, asJson, registerArkTool } from '../shared/tool-helpers.ts'
import type { ConcreteRuntime } from '../ark-core/index.ts'

export interface ArkDeviceConfig {
  backend: 'auto' | 'playcover' | 'adb' | 'win32'
  playcover: { address: string; appNames: string[] }
  adb: { adbPath: string; serial: string }
  win32: Win32Config
}

type Kind = ConcreteRuntime

declare module '@deepseek-ai/cordis' {
  interface Context { arkDevice: ArkDevice }
}

/** 依作業系統決定自動偵測順序：Windows 先找 PC 視窗再找模擬器；macOS 先找 PlayCover 再找模擬器。 */
export function autoOrder(platform: NodeJS.Platform = process.platform): Kind[] {
  if (platform === 'win32') return ['win32', 'adb']
  if (platform === 'darwin') return ['playcover', 'adb']
  return ['adb']
}

export class ArkDevice extends Service {
  static inject = ['ark']
  /** 測試用：可注入替代後端或指定自動偵測平台。 */
  static overrides: Partial<Record<Kind, DeviceBackend>> = {}
  static platformOverride: NodeJS.Platform | null = null

  static Config: z<ArkDeviceConfig> = z.object({
    backend: z.union(['auto', 'playcover', 'adb', 'win32'] as const).default('auto').description('auto = 跟隨 ark-core.runtime 或依系統自動偵測'),
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

  constructor(ctx: Context, config: ArkDeviceConfig) {
    super(ctx, 'arkDevice')
    this.config = config
  }

  /** 整合設定檔與 ark_configure 儲存的裝置參數。 */
  private currentBackends(): Record<Kind, DeviceBackend> {
    const prefs = this.ctx.ark.getPrefs()
    const pcCfg = {
      ...this.config.playcover,
      address: this.config.playcover.address || prefs.playcoverAddress || '',
    }
    const adbCfg = {
      ...this.config.adb,
      serial: this.config.adb.serial || prefs.adbSerial || '',
    }
    const w32Cfg: Win32Config = {
      windowTitles: (this.config.win32.windowTitles.length > 0 && (this.config.win32.windowTitles.length !== 2 || this.config.win32.windowTitles[0] !== '明日方舟' || this.config.win32.windowTitles[1] !== 'Arknights'))
        ? this.config.win32.windowTitles
        : (prefs.windowTitles ?? this.config.win32.windowTitles),
      processName: this.config.win32.processName || prefs.processName || '',
    }
    return {
      playcover: new PlayCoverBackend(pcCfg),
      adb: new AdbBackend(adbCfg),
      win32: new Win32Backend(w32Cfg),
      ...ArkDevice.overrides,
    }
  }

  get requestedMode(): 'auto' | 'unset' | Kind {
    if (this.config.backend !== 'auto') return this.config.backend
    return this.ctx.ark.effectiveSettings().runtime
  }

  async status(signal: AbortSignal) { return this.screenshotStatus(signal, false) }

  /**
   * 探測後端與截圖：
   * - 明確指定後端時：只測該後端，其餘如實標為「未測」。
   * - runtime=unset 時：不猜後端，全部標為「未測」。
   * - runtime=auto（隨插即用預設）時：依當前系統順序實測候選後端，每個測過的後端如實記錄 tested=true，沒測到的標「未測」。
   */
  async screenshotStatus(signal: AbortSignal, take: boolean): Promise<Record<string, unknown>> {
    const mode = this.requestedMode
    const untested = (k: Kind): BackendProbe => ({ backend: k, tested: false, connected: null, address: null, detail: { note: '未測' }, error: null })
    const backends: Record<Kind, BackendProbe> = { playcover: untested('playcover'), adb: untested('adb'), win32: untested('win32') }

    if (mode === 'unset') {
      return { ok: false, mode: 'unset', active_backend: null, backends, screenshot: { taken: false }, error: '未設定遊戲運行方式（可呼叫 ark_configure 設定，或設為 auto 自動偵測）' }
    }

    const impls = this.currentBackends()
    let active: Kind | null = null
    let chosenProbe: BackendProbe | null = null

    if (mode === 'auto') {
      const order = autoOrder(ArkDevice.platformOverride ?? process.platform)
      const errors: string[] = []
      for (const k of order) {
        const p = await impls[k].probe(signal)
        backends[k] = p
        if (p.connected === true) {
          active = k
          chosenProbe = p
          break
        }
        if (p.error) errors.push(`${k}: ${p.error}`)
      }
      if (!active) {
        return {
          ok: false,
          mode: 'auto',
          active_backend: null,
          tried_order: order,
          backends,
          screenshot: { taken: false },
          error: `自動偵測未找到已連線的遊戲視窗或模擬器（${errors.join('；')}）`,
        }
      }
    } else {
      active = mode
      chosenProbe = await impls[active].probe(signal)
      backends[active] = chosenProbe
    }

    let shot: Record<string, unknown> = { taken: false }
    if (take && chosenProbe?.connected === true) {
      const cap = await impls[active].screenshot(signal)
      if (!cap.png) {
        shot = { taken: false, method: cap.method, error: cap.error }
      } else {
        const check = checkPng(cap.png)
        const path = this.ctx.ark.store.saveScreenshot(cap.png, `status-${active}`)
        shot = { taken: true, method: cap.method, path, bytes: cap.png.length, ...check }
      }
    } else if (take && chosenProbe?.connected !== true) {
      // 某些情況（如探測失敗但仍想嘗試截圖，或維持單一後端行為）：若明確指定後端，照常嘗試截圖以取得完整錯誤原因
      if (mode !== 'auto') {
        const cap = await impls[active].screenshot(signal)
        if (!cap.png) {
          shot = { taken: false, method: cap.method, error: cap.error }
        } else {
          const check = checkPng(cap.png)
          const path = this.ctx.ark.store.saveScreenshot(cap.png, `status-${active}`)
          shot = { taken: true, method: cap.method, path, bytes: cap.png.length, ...check }
        }
      }
    }

    const ok = chosenProbe?.connected === true && (!take || (shot as { valid?: boolean }).valid === true)
    return {
      ok,
      mode,
      active_backend: active,
      backends,
      screenshot: shot,
      error: ok ? null : (chosenProbe?.error ?? (shot as { reason?: string; error?: string }).reason ?? (shot as { error?: string }).error ?? null),
    }
  }
}

export const toolsPlugin = {
  name: 'ark-device-tools',
  inject: ['tools', 'arkDevice', 'ark'] as const,
  apply(ctx: Context) {
    ctx.effect(() => registerArkTool(ctx, { module: 'ark-device', tier: 'query' }, defineTool({
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
  ctx.effect(() => ctx.ark.registerModule('ark-device', { stage: 'P0', implemented: true, note: '支援隨插即用自動偵測；tap/swipe、視窗守護排程、startup/closedown 待 P1' }))
}
