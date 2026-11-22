/**
 * ark-guide：階段鎖定的佔位插件（P2 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：L1/L2 作業檢索（L3/L4 屬 P5）
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../ark-core/index.ts'

export const name = 'ark-guide'
export const inject = ['ark']

export function apply(ctx: Context) {
  ctx.effect(() => ctx.ark.registerModule('ark-guide', { stage: 'P2', implemented: false, note: 'L1/L2 作業檢索（L3/L4 屬 P5）' }))
}
