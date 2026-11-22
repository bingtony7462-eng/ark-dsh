/**
 * ark-guard：階段鎖定的佔位插件（P1 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：資源硬限制、熔斷、權限門禁、通知；未載入前其他插件只能查詢
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../ark-core/index.ts'

export const name = 'ark-guard'
export const inject = ['ark']

export function apply(ctx: Context) {
  ctx.effect(() => ctx.ark.registerModule('ark-guard', { stage: 'P1', implemented: false, note: '資源硬限制、熔斷、權限門禁、通知；未載入前其他插件只能查詢' }))
}
