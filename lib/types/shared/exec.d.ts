export interface ExecResult {
    ok: boolean;
    code: number | null;
    stdout: Buffer;
    stderr: string;
    timedOut: boolean;
    error?: string;
}
export interface ExecOptions {
    timeoutMs?: number;
    maxBytes?: number;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
}
export declare function run(bin: string, args: readonly string[], opts?: ExecOptions): Promise<ExecResult>;
