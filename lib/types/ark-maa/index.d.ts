/**
 * ark-maa：maa-cli 橋接。P0 只做「探測」：二進制位置（含本機常見安裝路徑免重開終端機自動找尋）、版本、子命令、目錄。
 * 會改變遊戲狀態的 maa_fight / maa_copilot / maa_daily 等需 ark-guard（P1）才註冊。
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { inspectProfile, type FightRequest } from './fight.ts';
import { deriveRoutes } from './probe.ts';
export interface ArkMaaConfig {
    binary: string;
    fallbackBinary: string;
    profile: string;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        arkMaa: ArkMaa;
    }
}
export interface MaaProbe {
    found: boolean;
    binary: string | null;
    version_flag: string | null;
    cli_version: string | null;
    core_version: string | null;
    core_ready: boolean;
    config_dir: string | null;
    profile: ReturnType<typeof inspectProfile>;
    usage: string | null;
    subcommands: string[];
    routes: ReturnType<typeof deriveRoutes> | null;
    probed_at: string;
    errors: string[];
    install_hint?: string | null;
}
/** 找出本機常見套件管理器安裝位置（例如剛在 Windows 用 winget 裝完、還沒重開 dsh 導致不在 PATH 時）。 */
export declare function extraMaaCandidates(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string[];
export declare function installHintForPlatform(platform?: NodeJS.Platform): string;
export declare class ArkMaa extends Service {
    static inject: string[];
    static Config: z<ArkMaaConfig>;
    readonly config: ArkMaaConfig;
    constructor(ctx: Context, config: ArkMaaConfig);
    probe(signal: AbortSignal): Promise<MaaProbe>;
    statusForRuntime(signal: AbortSignal, runtime: string): Promise<Record<string, unknown>>;
    /** P0 唯讀預檢，僅回傳 argv；不執行 fight，也不代表 guard 已批准。 */
    buildFightArgs(input: FightRequest, signal: AbortSignal): Promise<string[]>;
    status(signal: AbortSignal): Promise<Record<string, unknown>>;
}
export declare const toolsPlugin: {
    name: string;
    inject: readonly ["tools", "arkMaa"];
    apply(ctx: Context): void;
};
export declare const name = "ark-maa";
export declare const inject: string[];
export declare const Config: z<ArkMaaConfig>;
export declare function apply(ctx: Context, config: ArkMaaConfig): void;
