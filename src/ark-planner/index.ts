/**
 * ark-planner：階段鎖定的佔位插件（P2 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：嘗試紀錄分欄、關卡狀態、ark_next_stage
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../ark-core/index.ts'

export const name = 'ark-planner'
export const inject = ['ark']

export function apply(ctx: Context) {
  ctx.effect(() => ctx.ark.registerModule('ark-planner', { stage: 'P2', implemented: false, note: '嘗試紀錄分欄、關卡狀態、ark_next_stage' }))
}
