/**
 * ark-planner：階段鎖定的佔位插件（P2 實作）。
 * 目前不註冊任何工具、不提供任何服務；可在 cordis.yml 單獨啟用/停用。
 * 內容：嘗試紀錄分欄、關卡狀態、ark_next_stage
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "ark-planner";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
