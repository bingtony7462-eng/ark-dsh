/** 不經 shell 的子進程執行，帶逾時與輸出上限。外部輸入永遠以 argv 傳入，不拼字串。 */
import { spawn } from 'node:child_process';
export function run(bin, args, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const maxBytes = opts.maxBytes ?? 32 * 1024 * 1024;
    return new Promise(resolve => {
        let settled = false;
        let timer;
        const out = [];
        let outLen = 0;
        let err = '';
        let timedOut = false;
        const finish = (r) => {
            if (!settled) {
                settled = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                resolve(r);
            }
        };
        let child;
        try {
            child = spawn(bin, args, { shell: false, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'], signal: opts.signal });
        }
        catch (e) {
            finish({ ok: false, code: null, stdout: Buffer.alloc(0), stderr: '', timedOut: false, error: String(e) });
            return;
        }
        timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
        child.stdout.on('data', (b) => {
            outLen += b.length;
            if (outLen > maxBytes) {
                child.kill('SIGTERM');
                return;
            }
            out.push(b);
        });
        child.stderr.on('data', (b) => { if (err.length < 64 * 1024)
            err += b.toString('utf8'); });
        child.on('error', e => finish({ ok: false, code: null, stdout: Buffer.concat(out), stderr: err, timedOut, error: e.message }));
        child.on('close', code => finish({ ok: code === 0 && !timedOut, code, stdout: Buffer.concat(out), stderr: err, timedOut }));
    });
}
