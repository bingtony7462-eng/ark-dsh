/**
 * ark-core：全域設定、狀態落地、模組登記與 ark_status。
 * P0 範圍：設定、SQLite/JSONL、run_id、ark_status（唯讀）。
 * 任務狀態機、模式（follow/self/hybrid）、任務設定單屬 P1 之後，尚未實作。
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ArkStore } from './store.ts'
import { jsonRender, openObject, asJson } from '../shared/tool-helpers.ts'

export type Server = 'cn' | 'tw' | 'global' | 'jp' | 'unset'
export type Runtime = 'playcover' | 'adb' | 'win32' | 'unset'

export interface ArkCoreConfig {
  server: Server
  runtime: Runtime
  account: string
  timezone: string
  dataDir: string
}

export interface ModuleInfo { stage: string; implemented: boolean; note?: string }

/** 其他模組回報自身狀態給 ark_status 用的介面（由各服務實作）。 */
export interface StatusProvider { status(signal: AbortSignal): Promise<Record<string, unknown>> }

declare module '@deepseek-ai/cordis' {
  interface Context { ark: ArkCore }
}

/** 規格 v1.1 指定 macOS 路徑；Windows 用 %APPDATA%\\ark-dsh（使用者新增需求）。 */
export function defaultDataDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'ark-dsh')
  if (platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ark-dsh')
  return join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'ark-dsh')
}
export const DEFAULT_DATA_DIR = defaultDataDir()

export class ArkCore extends Service {
  static Config: z<ArkCoreConfig> = z.object({
    server: z.union(['cn', 'tw', 'global', 'jp', 'unset'] as const).default('unset').description('伺服器：國服 cn / 台服 tw / 國際服 global / 日服 jp'),
    runtime: z.union(['playcover', 'adb', 'win32', 'unset'] as const).default('unset').description('遊戲運行方式：playcover（Mac）/ adb（模擬器）/ win32（Windows 官方 PC 客戶端）'),
    account: z.string().default('').description('帳號標識（用於帳號不符熔斷）'),
    timezone: z.string().default('Asia/Hong_Kong'),
    dataDir: z.string().default(DEFAULT_DATA_DIR).description('狀態目錄；正式環境請保留預設'),
  }) as unknown as z<ArkCoreConfig>

  readonly config: ArkCoreConfig
  readonly store: ArkStore
  readonly bootId: string
  readonly modules = new Map<string, ModuleInfo>()

  constructor(ctx: Context, config: ArkCoreConfig) {
    super(ctx, 'ark')
    this.config = config
    this.store = new ArkStore(config.dataDir)
    this.bootId = randomUUID()
    this.modules.set('ark-core', { stage: 'P0', implemented: true, note: '狀態機/模式/任務設定單待 P1' })
    this.store.log(this.bootId, 'ark-core', 'boot', { server: config.server, runtime: config.runtime })
    ctx.effect(() => () => this.store.close())
  }

  newRunId(): string { return randomUUID() }

  registerModule(name: string, info: ModuleInfo): () => void {
    this.modules.set(name, info)
    return () => { this.modules.delete(name) }
  }
}

/** ark_status：唯讀總覽。不觸發任何遊戲操作。 */
export const statusPlugin = {
  name: 'ark-core-status',
  inject: ['tools', 'ark'] as const,
  apply(ctx: Context) {
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'ark_status',
      description: '明日方舟插件總覽：設定、儲存、MAA、裝置連線與截圖、各模組階段。唯讀，不操作遊戲。',
      parameters: {
        screenshot: { type: 'boolean', description: '是否實際截一張圖驗證（預設 true）' },
      },
      output: { schema: openObject, render: jsonRender },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const ark = ctx.ark
        const runId = ark.newRunId()
        const device = ctx.get('arkDevice') as (StatusProvider & { screenshotStatus?: (s: AbortSignal, take: boolean) => Promise<Record<string, unknown>> }) | undefined
        const maa = ctx.get('arkMaa') as StatusProvider | undefined
        const guardLoaded = !!ctx.get('arkGuard')
        const missingSettings: string[] = []
        if (ark.config.server === 'unset') missingSettings.push('server')
        if (ark.config.runtime === 'unset') missingSettings.push('runtime')

        const maaStatus = maa ? await maa.status(exec.signal) : { loaded: false }
        const deviceStatus = device
          ? (device.screenshotStatus ? await device.screenshotStatus(exec.signal, args.screenshot !== false) : await device.status(exec.signal))
          : { loaded: false }

        const value = {
          run_id: runId,
          checked_at: new Date().toISOString(),
          settings: { server: ark.config.server, runtime: ark.config.runtime, account_set: ark.config.account !== '', timezone: ark.config.timezone, missing: missingSettings },
          storage: ark.store.info(),
          guard_loaded: guardLoaded,
          // 紅線 2：ark-guard 未載入時，其他插件只能查詢。
          capabilities: guardLoaded ? 'guarded' : 'query_only',
          maa: maaStatus,
          device: deviceStatus,
          modules: Object.fromEntries(ark.modules),
        }
        ark.store.log(runId, 'ark-core', 'status', { device_ok: (deviceStatus as { ok?: boolean }).ok ?? null, guard_loaded: guardLoaded })
        return asJson(value)
      },
    })))
  },
}

export const name = 'ark-core'
export const inject = ['tools']
export const Config = ArkCore.Config

export function apply(ctx: Context, config: ArkCoreConfig) {
  ctx.plugin(ArkCore, config)
  ctx.plugin(statusPlugin)
}
