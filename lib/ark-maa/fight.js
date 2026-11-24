import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
export function inspectProfile(dir, name) {
    const result = (path, error) => ({ name, path, error });
    if (!/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(name) || name.endsWith('.'))
        return result(null, 'profile 必須是名稱，不可使用路徑或命令列選項');
    if (!dir || !isAbsolute(dir))
        return result(null, 'maa dir config 未回傳有效的絕對路徑');
    for (const ext of ['toml', 'json', 'yaml']) {
        const path = join(dir, 'profiles', `${name}.${ext}`);
        try {
            if (statSync(path).isFile())
                return result(path, null);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                return result(null, `無法檢查 profile：${path}`);
        }
    }
    return result(null, `找不到 profile ${name}；請用執行 dsh 的帳號執行 maa init -n ${name}，不要加 --force`);
}
/** Only constructs arguments. Never starts MAA, authorizes medicine, or selects a device. */
export function fightArgv(input, address, profile) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(input.stage) || typeof input.stage !== 'string')
        throw new Error('無效的關卡代號');
    for (const [value, min] of [[input.times, 1], [input.medicine, 0]])
        if (!Number.isSafeInteger(value) || value < min || value > 2147483647)
            throw new Error('無效的次數或理智藥數量');
    if (!address || /^-|[\s\0]/.test(address))
        throw new Error('無效的 ADB 序號');
    return ['fight', input.stage, '--times', String(input.times), '--medicine', String(input.medicine), '--stone', '0', '-a', address, '-p', profile];
}
