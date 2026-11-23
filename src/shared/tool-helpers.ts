/**
 * 所有工具共用的輸出轉換與工具宣告表（registerArkTool）。
 * 每個由 ark-dsh 註冊的工具都必須經過 registerArkTool 寫入宣告表（tier），
 * 讓 P1 的 ark-guard 可以依宣告表放行 query / configure 類唯讀工具，並對未宣告的 ark_/maa_/device_ 工具執行 fail-closed 攔截。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface TextContentBlock {
  type: 'text'
  text: string
}

/**
 * 工具權限層級宣告：
 * - query：純查詢 / 唯讀截圖（ark-guard 未載入時可用，ark-guard 載入後直接放行）
 * - configure：僅修改插件本機設定（不碰遊戲、不花資源；ark-guard 載入後同樣放行）
 * - action：會操作遊戲但屬免審批日常範圍（需 ark-guard 載入才可用）
 * - approval：涉及資源消耗或實戰等需 tools/pre-execute 回 ask 批准（需 ark-guard 載入）
 */
export type ArkToolTier = 'query' | 'configure' | 'action' | 'approval'

export interface ArkToolMeta {
  name: string
  module: string
  tier: ArkToolTier
}

const ARK_TOOL_DECLARATIONS = new Map<string, ArkToolMeta>()

/** 取得工具的宣告資訊（供 ark-guard 或測試核對；未宣告回 undefined）。 */
export function getArkToolDeclaration(name: string): ArkToolMeta | undefined {
  return ARK_TOOL_DECLARATIONS.get(name)
}

/** 列出目前所有已宣告的 ark 工具。 */
export function listArkToolDeclarations(): ArkToolMeta[] {
  return [...ARK_TOOL_DECLARATIONS.values()]
}

/** 統一註冊入口：同時向宣告表與 ctx.tools 登記，卸載時一併清除。 */
export function registerArkTool(ctx: Context, meta: Omit<ArkToolMeta, 'name'>, definition: ToolDefinition): () => void {
  const entry: ArkToolMeta = { name: definition.name, module: meta.module, tier: meta.tier }
  ARK_TOOL_DECLARATIONS.set(definition.name, entry)
  const disposeTool = ctx.tools.register(definition)
  return () => {
    disposeTool()
    if (ARK_TOOL_DECLARATIONS.get(definition.name) === entry) {
      ARK_TOOL_DECLARATIONS.delete(definition.name)
    }
  }
}

/** 所有工具的 render：只輸出精簡 JSON，不輸出長篇文字。 */
export function jsonRender(_args: unknown, value: unknown): TextContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** 工具輸出統一用開放物件 + json 成員，內容由各模組自行保證結構。 */
export const openObject = { type: 'object', additionalProperties: true } as const

/** 轉成無 undefined 的純 JSON 物件（工具輸出邊界）。 */
export function asJson(v: unknown): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(v)) as Record<string, JsonValue>
}
