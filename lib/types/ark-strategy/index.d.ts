/**
 * ark-strategy：階段鎖定的佔位插件（P3 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：L5 自主規劃（白名單普通關）
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "ark-strategy";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
