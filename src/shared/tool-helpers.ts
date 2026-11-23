/** 所有工具共用的輸出轉換與無外部套件型別宣告，避免綁死單一 dsh 內部套件版本。 */

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface TextContentBlock {
  type: 'text'
  text: string
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
