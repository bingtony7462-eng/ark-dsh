/** 解析本機 maa-cli 的 --help / version 輸出，作為子命令基準（不臆測）。 */
export interface HelpCommands {
    commands: Record<string, string>;
    usage: string | null;
}
export declare function parseHelpCommands(help: string): HelpCommands;
/** `maa version` 典型輸出：「maa-cli v0.7.5\nMaaCore v6.16.8」；格式不符則回 null，不猜。 */
export declare function parseVersions(text: string): {
    cli: string | null;
    core: string | null;
};
/** 由實際子命令清單推導 ark-maa 各工具應走的路徑。 */
export declare function deriveRoutes(commands: Record<string, string>): {
    fight: string;
    copilot: string;
    infrast: string;
    recruit: string;
    startup: string;
    closedown: string;
    hot_update: string;
    sss_copilot: string;
    paradox_copilot: string;
    roguelike: string;
    reclamation: string;
    pc_client: string;
};
/** 執行路徑判定（純程式碼）：某運行方式目前能否交給 maa-cli 執行。 */
export declare function executionPath(runtime: string, routes: ReturnType<typeof deriveRoutes> | null): {
    status: 'ready' | 'blocked' | 'unknown';
    reason: string | null;
};
