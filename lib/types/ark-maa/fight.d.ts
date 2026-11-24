export interface FightRequest {
    stage: string;
    times: number;
    medicine: number;
}
export declare function inspectProfile(dir: string | null, name: string): {
    name: string;
    path: string | null;
    error: string | null;
};
/** Only constructs arguments. Never starts MAA, authorizes medicine, or selects a device. */
export declare function fightArgv(input: FightRequest, address: string, profile: string): string[];
