/**
 * ark-core：全域設定、狀態落地、模組登記、自動偵測與 ark_status / ark_configure。
 * P0 範圍：設定（含 SQLite 持久化覆寫）、SQLite/JSONL、run_id、ark_status（唯讀）、ark_configure（僅改設定）。
 * 任務狀態機、模式（follow/self/hybrid）、任務設定單屬 P1 之後，尚未實作。
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { ArkStore } from './store.ts';
export type Server = 'cn' | 'tw' | 'global' | 'jp' | 'unset';
export type Runtime = 'auto' | 'playcover' | 'adb' | 'win32' | 'unset';
export type ConcreteRuntime = 'playcover' | 'adb' | 'win32';
export interface ArkCoreConfig {
    server: Server;
    runtime: Runtime;
    account: string;
    timezone: string;
    dataDir: string;
}
export interface PersistedPrefs {
    server?: Server;
    runtime?: Runtime;
    account?: string;
    timezone?: string;
    windowTitles?: string[];
    processName?: string;
    adbSerial?: string;
    playcoverAddress?: string;
}
export interface ModuleInfo {
    stage: string;
    implemented: boolean;
    note?: string;
}
/** 其他模組回報自身狀態給 ark_status 用的介面（由各服務實作）。 */
export interface StatusProvider {
    status(signal: AbortSignal): Promise<Record<string, unknown>>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        ark: ArkCore;
    }
}
/** 規格 v1.1 指定 macOS 路徑；Windows 用 %APPDATA%\\ark-dsh（使用者新增需求）。 */
export declare function defaultDataDir(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
export declare const DEFAULT_DATA_DIR: string;
export declare class ArkCore extends Service {
    static Config: z<ArkCoreConfig>;
    readonly config: ArkCoreConfig;
    readonly store: ArkStore;
    readonly bootId: string;
    readonly modules: Map<string, ModuleInfo>;
    constructor(ctx: Context, config: ArkCoreConfig);
    newRunId(): string;
    getPrefs(): PersistedPrefs;
    savePrefs(patch: PersistedPrefs): PersistedPrefs;
    /** 整合 cordis.yml 設定與 SQLite 內透過 ark_configure 儲存的偏好（明確寫在 cordis.yml 的非預設值優先，否則用已儲存偏好）。 */
    effectiveSettings(): {
        server: Server;
        runtime: Runtime;
        account: string;
        timezone: string;
        prefs: PersistedPrefs;
        source: Record<string, 'config' | 'saved' | 'default'>;
    };
    registerModule(name: string, info: ModuleInfo): () => void;
}
/** ark_status（唯讀總覽）與 ark_configure（对话內免改檔設定，隨插即用）。 */
export declare const statusPlugin: {
    name: string;
    inject: readonly ["tools", "ark"];
    apply(ctx: Context): void;
};
export declare const name = "ark-core";
export declare const inject: string[];
export declare const Config: z<ArkCoreConfig>;
export declare function apply(ctx: Context, config: ArkCoreConfig): void;
export { registerArkTool, getArkToolDeclaration, listArkToolDeclarations, type ArkToolMeta, type ArkToolTier } from '../shared/tool-helpers.ts';
