/**
 * ark-copilot：階段鎖定的佔位插件（P2 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：作業校驗、dry-run、演習、失敗歸因
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "ark-copilot";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
