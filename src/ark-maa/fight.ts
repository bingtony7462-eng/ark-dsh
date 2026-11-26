import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export interface FightRequest {
  stage: string
  times: number
  medicine: number
  /** 選填：覆寫由 ark-core.server 推導的客戶端類型；必須與伺服器一致。 */
  clientType?: MaaClientType
}

/** maa-cli 的 --client-type 可選值（maa-cli v0.7.8 `maa fight --help`）。 */
export const MAA_CLIENT_TYPES = ['Official', 'Bilibili', 'Txwy', 'YoStarEN', 'YoStarJP', 'YoStarKR'] as const
export type MaaClientType = typeof MAA_CLIENT_TYPES[number]

/** 每個伺服器允許的客戶端；第一個是預設值。unset 不推導。 */
const SERVER_CLIENTS: Record<string, readonly MaaClientType[]> = {
  cn: ['Official', 'Bilibili'],
  tw: ['Txwy'],
  jp: ['YoStarJP'],
  global: ['YoStarEN', 'YoStarKR'],
}

/**
 * 依伺服器決定 --client-type。maa-cli 只有在 fight 任務帶 client_type 時才載入
 * resource/global/<client>（例如 txwy）；不帶就用國服資源，台服繁中 OCR 永遠比對不上。
 * 推不出來或與伺服器矛盾時直接報錯，不用國服資源硬跑。
 */
export function resolveClientType(server: string, override?: string): MaaClientType {
  const allowed = SERVER_CLIENTS[server]
  if (!allowed) throw new Error(`未設定伺服器（目前 ${server}），無法決定 --client-type；請先用 ark_configure 設定 server`)
  if (override === undefined) return allowed[0]!
  if (!(MAA_CLIENT_TYPES as readonly string[]).includes(override)) throw new Error(`無效的 clientType：${override}`)
  if (!allowed.includes(override as MaaClientType)) throw new Error(`clientType ${override} 與伺服器 ${server} 不符（允許：${allowed.join(' / ')}）`)
  return override as MaaClientType
}

export function inspectProfile(dir: string | null, name: string) {
  const result = (path: string | null, error: string | null) => ({ name, path, error })
  if (!/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(name) || name.endsWith('.'))
    return result(null, 'profile 必須是名稱，不可使用路徑或命令列選項')
  if (!dir || !isAbsolute(dir)) return result(null, 'maa dir config 未回傳有效的絕對路徑')
  for (const ext of ['toml', 'json', 'yaml']) {
    const path = join(dir, 'profiles', `${name}.${ext}`)
    try { if (statSync(path).isFile()) return result(path, null) }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return result(null, `無法檢查 profile：${path}`)
    }
  }
  return result(null, `找不到 profile ${name}；請用執行 dsh 的帳號執行 maa init -n ${name}，不要加 --force`)
}

/** Only constructs arguments. Never starts MAA, authorizes medicine, or selects a device. */
export function fightArgv(input: FightRequest, address: string, profile: string, clientType: MaaClientType): string[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input.stage) || typeof input.stage !== 'string')
    throw new Error('無效的關卡代號')
  for (const [value, min] of [[input.times, 1], [input.medicine, 0]] as const)
    if (!Number.isSafeInteger(value) || value < min || value > 2147483647) throw new Error('無效的次數或理智藥數量')
  if (!address || /^-|[\s\0]/.test(address)) throw new Error('無效的 ADB 序號')
  if (!(MAA_CLIENT_TYPES as readonly string[]).includes(clientType)) throw new Error('無效的 --client-type')
  return ['fight', input.stage, '--times', String(input.times), '--medicine', String(input.medicine), '--stone', '0', '--client-type', clientType, '-a', address, '-p', profile]
}
