/** 不經 shell 的子進程執行，帶逾時與輸出上限。外部輸入永遠以 argv 傳入，不拼字串。 */
import { spawn } from 'node:child_process'

export interface ExecResult {
  ok: boolean
  code: number | null
  stdout: Buffer
  stderr: string
  timedOut: boolean
  error?: string
}

export interface ExecOptions {
  timeoutMs?: number
  maxBytes?: number
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}

export function run(bin: string, args: readonly string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000
  const maxBytes = opts.maxBytes ?? 32 * 1024 * 1024
  return new Promise(resolve => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const out: Buffer[] = []
    let outLen = 0
    let err = ''
    let timedOut = false
    const finish = (r: ExecResult) => {
      if (!settled) {
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        resolve(r)
      }
    }
    let child
    try {
      child = spawn(bin, args, { shell: false, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'], signal: opts.signal })
    } catch (e) {
      finish({ ok: false, code: null, stdout: Buffer.alloc(0), stderr: '', timedOut: false, error: String(e) })
      return
    }
    timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    child.stdout.on('data', (b: Buffer) => {
      outLen += b.length
      if (outLen > maxBytes) { child.kill('SIGTERM'); return }
      out.push(b)
    })
    child.stderr.on('data', (b: Buffer) => { if (err.length < 64 * 1024) err += b.toString('utf8') })
    child.on('error', e => finish({ ok: false, code: null, stdout: Buffer.concat(out), stderr: err, timedOut, error: e.message }))
    child.on('close', code => finish({ ok: code === 0 && !timedOut, code, stdout: Buffer.concat(out), stderr: err, timedOut }))
  })
}
