export interface ScreenshotCheck {
    valid: boolean;
    width: number | null;
    height: number | null;
    mean_luma: number | null;
    luma_stddev: number | null;
    black: boolean;
    uniform: boolean;
    reason: string | null;
}
export declare function checkPng(buf: Buffer): ScreenshotCheck;
