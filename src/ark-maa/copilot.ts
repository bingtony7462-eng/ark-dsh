/**
 * 作業（Copilot）參數建構：只產生 argv 與本地任務檔，不啟動 MAA。
 *
 * maa-cli v0.7.8 的 `maa copilot` 不接受 --client-type，資源只依整份任務設定的
 * client_type 載入（run/mod.rs：task_config.client_type.resource()）。因此非國服改走
 * `maa run <任務檔絕對路徑>`，在任務檔頂層寫 client_type，讓 MaaCore 載入
 * resource/global/<client>（例如 txwy）。
 *
 * 紅線 5：作業只當資料。只接受 .json 作業檔，解析並檢查結構；不執行任何內容。
 * 紅線 6：以 SHA-256 固定本地副本（內容定址），任務檔只引用這份副本；
 *         執行前呼叫 verifyPinnedCopilot 再核對一次雜湊。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import { MAA_CLIENT_TYPES, type MaaClientType } from './fight.ts'

export interface CopilotRequest {
  /** 已下載到本機的作業 JSON 絕對路徑。 */
  file: string
  /** 預覽時記錄的 SHA-256（64 位十六進位）；不符就拒絕。 */
  sha256: string
  /** 是否讓 MAA 自動編隊，預設 false（需先手動編好隊）。 */
  formation?: boolean
  /** 單一作業重複次數，預設 1。 */
  loopTimes?: number
  /** 選填：覆寫由 ark-core.server 推導的客戶端類型；必須與伺服器一致。 */
  clientType?: MaaClientType
}

export interface CopilotPlan {
  argv: string[]
  client_type: MaaClientType
  sha256: string
  stage_name: string
  pinned_path: string
  task_file: string
}

const MAX_BYTES = 2 * 1024 * 1024

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** 純程式碼：檢查是否為支援的一般作業格式，回傳關卡名稱。 */
export function parseCopilotJson(buf: Buffer): { stage_name: string } {
  let doc: unknown
  try { doc = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')) }
  catch { throw new Error('作業不是有效的 JSON') }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('作業頂層必須是物件')
  const d = doc as Record<string, unknown>
  if (d.type !== undefined && d.type !== 'Copilot') throw new Error(`不支援的作業類型：${String(d.type)}（保全派駐、悖論模擬另有任務）`)
  if (typeof d.stage_name !== 'string' || !/^[\p{L}\p{N}_#-]{1,64}$/u.test(d.stage_name)) throw new Error('作業缺少有效的 stage_name')
  if (!Array.isArray(d.actions) || d.actions.length === 0 || !d.actions.every(a => a && typeof a === 'object' && !Array.isArray(a)))
    throw new Error('作業缺少有效的 actions')
  for (const key of ['opers', 'groups'] as const)
    if (d[key] !== undefined && !Array.isArray(d[key])) throw new Error(`作業的 ${key} 必須是陣列`)
  return { stage_name: d.stage_name }
}

function readChecked(file: string, expected: string): Buffer {
  const st = statSync(file)
  if (!st.isFile()) throw new Error('作業路徑不是檔案')
  if (st.size > MAX_BYTES) throw new Error('作業檔過大')
  const buf = readFileSync(file)
  const actual = sha256(buf)
  if (actual !== expected) throw new Error(`作業雜湊不符（預期 ${expected.slice(0, 12)}…，實際 ${actual.slice(0, 12)}…）`)
  return buf
}

function writeAtomic(path: string, data: Buffer | string) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

/** 執行前再核對一次固定副本（避免預覽後被替換）。 */
export function verifyPinnedCopilot(pinnedPath: string, expected: string): void {
  parseCopilotJson(readChecked(pinnedPath, expected))
}

/**
 * 固定作業副本並寫出 maa run 任務檔。只寫入 ark-dsh 資料目錄，不碰 MAA 設定目錄。
 * 自動模式一律不吃理智藥（use_sanity_potion=false），也不自動啟動或關閉遊戲。
 */
export function prepareCopilot(dataDir: string, req: CopilotRequest, clientType: MaaClientType, address: string, profile: string): CopilotPlan {
  if (typeof req.file !== 'string' || !isAbsolute(req.file)) throw new Error('作業必須是本機絕對路徑；請先下載並預覽')
  if (extname(req.file).toLowerCase() !== '.json') throw new Error('只接受 .json 作業檔')
  if (typeof req.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(req.sha256)) throw new Error('缺少有效的 SHA-256')
  if (!(MAA_CLIENT_TYPES as readonly string[]).includes(clientType)) throw new Error('無效的 client_type')
  const loopTimes = req.loopTimes ?? 1
  if (!Number.isSafeInteger(loopTimes) || loopTimes < 1 || loopTimes > 99) throw new Error('無效的 loopTimes')
  if (req.formation !== undefined && typeof req.formation !== 'boolean') throw new Error('formation 必須是布林值')
  if (!address || /^-|[\s\0]/.test(address)) throw new Error('無效的 ADB 序號')
  if (!isAbsolute(dataDir)) throw new Error('資料目錄必須是絕對路徑')

  const buf = readChecked(req.file, req.sha256)
  const { stage_name } = parseCopilotJson(buf)

  const pinDir = join(dataDir, 'copilot')
  const taskDir = join(dataDir, 'maa-tasks')
  mkdirSync(pinDir, { recursive: true })
  mkdirSync(taskDir, { recursive: true })
  const pinned = join(pinDir, `${req.sha256}.json`)
  writeAtomic(pinned, buf)
  verifyPinnedCopilot(pinned, req.sha256)

  const task = {
    client_type: clientType,
    startup: false,
    closedown: false,
    tasks: [{
      type: 'Copilot',
      params: {
        filename: pinned,
        formation: req.formation ?? false,
        loop_times: loopTimes,
        use_sanity_potion: false,
      },
    }],
  }
  // maa run 會替路徑補副檔名，所以檔名本身不能有點號；argv 傳不含副檔名的路徑。
  const taskBase = join(taskDir, `copilot-${req.sha256.slice(0, 16)}-${clientType}`)
  writeAtomic(`${taskBase}.json`, JSON.stringify(task, null, 2))

  return {
    argv: ['run', taskBase, '-a', address, '-p', profile],
    client_type: clientType,
    sha256: req.sha256,
    stage_name,
    pinned_path: pinned,
    task_file: `${taskBase}.json`,
  }
}
