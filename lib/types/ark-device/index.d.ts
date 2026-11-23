/**
 * ark-device：裝置抽象、狀態與截圖（唯讀）。支援隨插即用自動偵測。
 * device_tap / device_swipe 依紅線 9 只處理突發彈窗，且需 ark-guard（P1）才開放，P0 不註冊。
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type DeviceBackend } from './backends.ts';
import { type Win32Config } from './win32.ts';
import type { ConcreteRuntime } from '../ark-core/index.ts';
export interface ArkDeviceConfig {
    backend: 'auto' | 'playcover' | 'adb' | 'win32';
    playcover: {
        address: string;
        appNames: string[];
    };
    adb: {
        adbPath: string;
        serial: string;
    };
    win32: Win32Config;
}
type Kind = ConcreteRuntime;
declare module '@deepseek-ai/cordis' {
    interface Context {
        arkDevice: ArkDevice;
    }
}
/** 依作業系統決定自動偵測順序：Windows 先找 PC 視窗再找模擬器；macOS 先找 PlayCover 再找模擬器。 */
export declare function autoOrder(platform?: NodeJS.Platform): Kind[];
export declare class ArkDevice extends Service {
    static inject: string[];
    /** 測試用：可注入替代後端或指定自動偵測平台。 */
    static overrides: Partial<Record<Kind, DeviceBackend>>;
    static platformOverride: NodeJS.Platform | null;
    static Config: z<ArkDeviceConfig>;
    readonly config: ArkDeviceConfig;
    constructor(ctx: Context, config: ArkDeviceConfig);
    /** 整合設定檔與 ark_configure 儲存的裝置參數。 */
    private currentBackends;
    get requestedMode(): 'auto' | 'unset' | Kind;
    status(signal: AbortSignal): Promise<Record<string, unknown>>;
    /**
     * 探測後端與截圖：
     * - 明確指定後端時：只測該後端，其餘如實標為「未測」。
     * - runtime=unset 時：不猜後端，全部標為「未測」。
     * - runtime=auto（隨插即用預設）時：依當前系統順序實測候選後端，每個測過的後端如實記錄 tested=true，沒測到的標「未測」。
     */
    screenshotStatus(signal: AbortSignal, take: boolean): Promise<Record<string, unknown>>;
}
export declare const toolsPlugin: {
    name: string;
    inject: readonly ["tools", "arkDevice", "ark"];
    apply(ctx: Context): void;
};
export declare const name = "ark-device";
export declare const inject: string[];
export declare const Config: z<ArkDeviceConfig>;
export declare function apply(ctx: Context, config: ArkDeviceConfig): void;
export {};
