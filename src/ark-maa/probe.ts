/** 解析本機 maa-cli 的 --help / version 輸出，作為子命令基準（不臆測）。 */

export interface HelpCommands { commands: Record<string, string>; usage: string | null }

export function parseHelpCommands(help: string): HelpCommands {
  const lines = help.replace(/\r/g, '').split('\n')
  const usage = lines.find(l => l.startsWith('Usage:'))?.trim() ?? null
  const start = lines.findIndex(l => /^Commands:\s*$/.test(l))
  const commands: Record<string, string> = {}
  if (start < 0) return { commands, usage }
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() === '') break
    const m = /^\s{2,}([a-z][\w-]*)\s{2,}(.*)$/.exec(l) ?? /^\s{2,}([a-z][\w-]*)\s*$/.exec(l)
    if (m) commands[m[1]!] = (m[2] ?? '').trim()
  }
  return { commands, usage }
}

/** `maa version` 典型輸出：「maa-cli v0.7.5\nMaaCore v6.16.8」；格式不符則回 null，不猜。 */
export function parseVersions(text: string): { cli: string | null; core: string | null } {
  const cli = /maa-cli\s+v?(\d+\.\d+\.\d+[\w.-]*)/i.exec(text)?.[1] ?? null
  const core = /MaaCore\s+v?(\d+\.\d+\.\d+[\w.-]*)/i.exec(text)?.[1] ?? null
  return { cli, core }
}

/** 由實際子命令清單推導 ark-maa 各工具應走的路徑。 */
export function deriveRoutes(commands: Record<string, string>) {
  const has = (c: string) => Object.hasOwn(commands, c)
  return {
    fight: has('fight') ? 'maa fight' : 'unavailable',
    copilot: has('copilot') ? 'maa copilot' : 'unavailable',
    infrast: has('infrast') ? 'maa infrast' : (has('run') ? 'maa run + task file' : 'unavailable'),
    recruit: has('recruit') ? 'maa recruit' : (has('run') ? 'maa run + task file' : 'unavailable'),
    startup: has('startup') ? 'maa startup' : 'unavailable',
    closedown: has('closedown') ? 'maa closedown' : 'unavailable',
    hot_update: has('hot-update') ? 'maa hot-update' : 'unavailable',
    sss_copilot: has('ssscopilot') ? 'maa ssscopilot' : (has('sscopilot') ? 'maa sscopilot' : 'unavailable'),
    paradox_copilot: has('paradoxcopilot') ? 'maa paradoxcopilot' : 'unavailable',
    roguelike: has('roguelike') ? 'maa roguelike' : 'unavailable',
    reclamation: has('reclamation') ? 'maa reclamation' : 'unavailable',
    // Windows 官方 PC 客戶端需 MaaCore AttachWindow。maa-cli 穩定版沒有這條路
    // （PR #543 / #575 截至 2026-11 仍未合併）；出現 `connection` 子命令時只標「待驗證」，不當作可用。
    pc_client: has('connection') ? 'maybe: maa connection（需實測）' : 'unsupported',
  }
}

/** 執行路徑判定（純程式碼）：某運行方式目前能否交給 maa-cli 執行。 */
export function executionPath(runtime: string, routes: ReturnType<typeof deriveRoutes> | null): { status: 'ready' | 'blocked' | 'unknown'; reason: string | null } {
  if (!routes) return { status: 'unknown', reason: '尚未取得 maa 子命令清單' }
  if (runtime === 'win32') {
    if (routes.pc_client === 'unsupported') return { status: 'blocked', reason: 'maa-cli 尚不支援 Windows PC 客戶端（AttachWindow）；可改用 MuMu 12 + ADB，或等 P1 決定是否自建 MaaCore 橋接' }
    return { status: 'unknown', reason: routes.pc_client }
  }
  if (runtime === 'adb' || runtime === 'playcover') return { status: routes.copilot !== 'unavailable' ? 'ready' : 'blocked', reason: routes.copilot !== 'unavailable' ? null : '沒有 copilot 子命令' }
  return { status: 'unknown', reason: '未設定運行方式' }
}
