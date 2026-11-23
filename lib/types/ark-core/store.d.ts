export interface StoreInfo {
    data_dir: string;
    sqlite: 'ok' | 'unavailable';
    sqlite_error: string | null;
    schema_version: number | null;
}
export declare const SCHEMA_VERSION = 1;
export declare class ArkStore {
    readonly dir: string;
    readonly screenshotDir: string;
    readonly logDir: string;
    private db;
    private dbError;
    constructor(dir: string);
    info(): StoreInfo;
    get sqliteOk(): boolean;
    getKv<T>(key: string): T | undefined;
    setKv(key: string, value: unknown): void;
    /** 事件同時寫 JSONL（回放用）與 SQLite（查詢用）。 */
    log(runId: string, module: string, kind: string, data?: Record<string, unknown>): void;
    saveScreenshot(buf: Buffer, tag: string): string;
    close(): void;
}
