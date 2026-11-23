export interface BackendProbe {
    backend: 'playcover' | 'adb' | 'win32';
    tested: boolean;
    connected: boolean | null;
    address: string | null;
    detail: Record<string, unknown>;
    error: string | null;
}
export interface Capture {
    png: Buffer | null;
    error: string | null;
    method: string;
}
export interface DeviceBackend {
    readonly kind: 'playcover' | 'adb' | 'win32';
    probe(signal: AbortSignal): Promise<BackendProbe>;
    screenshot(signal: AbortSignal): Promise<Capture>;
}
export interface AdbConfig {
    adbPath: string;
    serial: string;
}
export declare class AdbBackend implements DeviceBackend {
    readonly kind: "adb";
    private cfg;
    constructor(cfg: AdbConfig);
    private serialArgs;
    probe(signal: AbortSignal): Promise<BackendProbe>;
    screenshot(signal: AbortSignal): Promise<Capture>;
}
export interface PlayCoverConfig {
    address: string;
    appNames: string[];
}
export interface MacWindow {
    id: number;
    owner: string;
    title: string;
    onScreen: boolean;
    layer: number;
    bounds: {
        X: number;
        Y: number;
        Width: number;
        Height: number;
    };
}
export declare function parseMaaToolsPort(title: string): string | null;
export declare function tcpProbe(address: string, timeoutMs?: number): Promise<boolean>;
export declare class PlayCoverBackend implements DeviceBackend {
    readonly kind: "playcover";
    private cfg;
    constructor(cfg: PlayCoverConfig);
    findWindow(signal: AbortSignal): Promise<{
        window: MacWindow | null;
        error: string | null;
        titlesReadable: boolean;
    }>;
    probe(signal: AbortSignal): Promise<BackendProbe>;
    screenshot(signal: AbortSignal): Promise<Capture>;
}
