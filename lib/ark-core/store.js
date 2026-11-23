/**
 * 狀態落地：SQLite（設定、事件索引）+ JSONL（每日日誌，可回放）。
 * 位置：~/Library/Application Support/ark-dsh/（可由設定覆寫，僅供測試）。
 */
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const SCHEMA_VERSION = 1;
export class ArkStore {
    dir;
    screenshotDir;
    logDir;
    db = null;
    dbError = null;
    constructor(dir) {
        this.dir = dir;
        this.screenshotDir = join(dir, 'screenshots');
        this.logDir = join(dir, 'logs');
        mkdirSync(this.screenshotDir, { recursive: true });
        mkdirSync(this.logDir, { recursive: true });
        try {
            // node:sqlite 需 Node ≥ 22.5；不可用時如實回報，不靜默改用其他儲存。
            const { DatabaseSync } = require('node:sqlite');
            this.db = new DatabaseSync(join(dir, 'ark.sqlite'));
            this.db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL, run_id TEXT NOT NULL, module TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL
        );
      `);
            this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
        }
        catch (e) {
            this.db = null;
            this.dbError = e.message;
        }
    }
    info() {
        let v = null;
        if (this.db) {
            const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
            v = row ? Number(row.value) : null;
        }
        return { data_dir: this.dir, sqlite: this.db ? 'ok' : 'unavailable', sqlite_error: this.dbError, schema_version: v };
    }
    get sqliteOk() { return this.db !== null; }
    getKv(key) {
        if (!this.db)
            return undefined;
        const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
        return row ? JSON.parse(row.value) : undefined;
    }
    setKv(key, value) {
        if (!this.db)
            throw new Error(`SQLite 不可用：${this.dbError}`);
        this.db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
            .run(key, JSON.stringify(value), new Date().toISOString());
    }
    /** 事件同時寫 JSONL（回放用）與 SQLite（查詢用）。 */
    log(runId, module, kind, data = {}) {
        const ts = new Date().toISOString();
        const line = JSON.stringify({ ts, run_id: runId, module, kind, data });
        appendFileSync(join(this.logDir, `${ts.slice(0, 10)}.jsonl`), line + '\n');
        this.db?.prepare('INSERT INTO events (ts, run_id, module, kind, data) VALUES (?, ?, ?, ?, ?)').run(ts, runId, module, kind, JSON.stringify(data));
    }
    saveScreenshot(buf, tag) {
        const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${tag}_${randomUUID().slice(0, 8)}.png`;
        const p = join(this.screenshotDir, name);
        writeFileSync(p, buf);
        return p;
    }
    close() { this.db?.close(); this.db = null; }
}
