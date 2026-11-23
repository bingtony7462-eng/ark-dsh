/**
 * ark-dsh 組合總入口（供程式化載入與標準套件匯出使用）。
 * 在 dsh profile 中安裝時，dsh.bundle.patch 會讀取 cordis.patch.yml，將九個子插件獨立掛載（各自可單獨停用）。
 */
import type { Context } from '@deepseek-ai/cordis';
import * as core from './ark-core/index.ts';
import * as device from './ark-device/index.ts';
import * as maa from './ark-maa/index.ts';
import * as guard from './ark-guard/index.ts';
import * as box from './ark-box/index.ts';
import * as guide from './ark-guide/index.ts';
import * as copilot from './ark-copilot/index.ts';
import * as planner from './ark-planner/index.ts';
import * as strategy from './ark-strategy/index.ts';
export declare const name = "ark-dsh";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export { core, device, maa, guard, box, guide, copilot, planner, strategy };
