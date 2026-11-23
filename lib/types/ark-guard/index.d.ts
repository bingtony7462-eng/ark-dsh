/**
 * ark-guard：階段鎖定的佔位插件（P1 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：資源硬限制、熔斷、權限門禁、通知；未載入前其他插件只能查詢
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "ark-guard";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
