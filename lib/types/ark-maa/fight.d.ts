export interface FightRequest {
    stage: string;
    times: number;
    medicine: number;
    /** 選填：覆寫由 ark-core.server 推導的客戶端類型；必須與伺服器一致。 */
    clientType?: MaaClientType;
}
/** maa-cli 的 --client-type 可選值（maa-cli v0.7.8 `maa fight --help`）。 */
export declare const MAA_CLIENT_TYPES: readonly ["Official", "Bilibili", "Txwy", "YoStarEN", "YoStarJP", "YoStarKR"];
export type MaaClientType = typeof MAA_CLIENT_TYPES[number];
/**
 * 依伺服器決定 --client-type。maa-cli 只有在 fight 任務帶 client_type 時才載入
 * resource/global/<client>（例如 txwy）；不帶就用國服資源，台服繁中 OCR 永遠比對不上。
 * 推不出來或與伺服器矛盾時直接報錯，不用國服資源硬跑。
 */
export declare function resolveClientType(server: string, override?: string): MaaClientType;
export declare function inspectProfile(dir: string | null, name: string): {
    name: string;
    path: string | null;
    error: string | null;
};
/** Only constructs arguments. Never starts MAA, authorizes medicine, or selects a device. */
export declare function fightArgv(input: FightRequest, address: string, profile: string, clientType: MaaClientType): string[];
