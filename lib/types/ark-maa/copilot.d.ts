import { type MaaClientType } from './fight.ts';
export interface CopilotRequest {
    /** 已下載到本機的作業 JSON 絕對路徑。 */
    file: string;
    /** 預覽時記錄的 SHA-256（64 位十六進位）；不符就拒絕。 */
    sha256: string;
    /** 是否讓 MAA 自動編隊，預設 false（需先手動編好隊）。 */
    formation?: boolean;
    /** 單一作業重複次數，預設 1。 */
    loopTimes?: number;
    /** 選填：覆寫由 ark-core.server 推導的客戶端類型；必須與伺服器一致。 */
    clientType?: MaaClientType;
}
export interface CopilotPlan {
    argv: string[];
    client_type: MaaClientType;
    sha256: string;
    stage_name: string;
    pinned_path: string;
    task_file: string;
}
/** 純程式碼：檢查是否為支援的一般作業格式，回傳關卡名稱。 */
export declare function parseCopilotJson(buf: Buffer): {
    stage_name: string;
};
/** 執行前再核對一次固定副本（避免預覽後被替換）。 */
export declare function verifyPinnedCopilot(pinnedPath: string, expected: string): void;
/**
 * 固定作業副本並寫出 maa run 任務檔。只寫入 ark-dsh 資料目錄，不碰 MAA 設定目錄。
 * 自動模式一律不吃理智藥（use_sanity_potion=false），也不自動啟動或關閉遊戲。
 */
export declare function prepareCopilot(dataDir: string, req: CopilotRequest, clientType: MaaClientType, address: string, profile: string): CopilotPlan;
