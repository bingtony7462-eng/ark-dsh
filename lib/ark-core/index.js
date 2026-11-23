/**
 * ark-core：全域設定、狀態落地、模組登記、自動偵測與 ark_status / ark_configure。
 * P0 範圍：設定（含 SQLite 持久化覆寫）、SQLite/JSONL、run_id、ark_status（唯讀）、ark_configure（僅改設定）。
 * 任務狀態機、模式（follow/self/hybrid）、任務設定單屬 P1 之後，尚未實作。
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArkStore } from "./store.js";
import { jsonRender, openObject, asJson, registerArkTool } from "../shared/tool-helpers.js";
/** 規格 v1.1 指定 macOS 路徑；Windows 用 %APPDATA%\\ark-dsh（使用者新增需求）。 */
export function defaultDataDir(platform = process.platform, env = process.env) {
    if (platform === 'darwin')
        return join(homedir(), 'Library', 'Application Support', 'ark-dsh');
    if (platform === 'win32')
        return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ark-dsh');
    return join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'ark-dsh');
}
export const DEFAULT_DATA_DIR = defaultDataDir();
export class ArkCore extends Service {
    static Config = z.object({
        server: z.union(['cn', 'tw', 'global', 'jp', 'unset']).default('unset').description('伺服器：國服 cn / 台服 tw / 國際服 global / 日服 jp'),
        runtime: z.union(['auto', 'playcover', 'adb', 'win32', 'unset']).default('auto').description('遊戲運行方式：auto（依系統與本機連線自動偵測）/ playcover / adb / win32 / unset'),
        account: z.string().default('').description('帳號標識（用於帳號不符熔斷）'),
        timezone: z.string().default('Asia/Hong_Kong'),
        dataDir: z.string().default(DEFAULT_DATA_DIR).description('狀態目錄；正式環境請保留預設'),
    });
    config;
    store;
    bootId;
    modules = new Map();
    constructor(ctx, config) {
        super(ctx, 'ark');
        this.config = config;
        this.store = new ArkStore(config.dataDir);
        this.bootId = randomUUID();
        this.modules.set('ark-core', { stage: 'P0', implemented: true, note: '隨插即用設定（ark_configure）與自動偵測已啟用；狀態機/模式/任務設定單待 P1' });
        const eff = this.effectiveSettings();
        this.store.log(this.bootId, 'ark-core', 'boot', { server: eff.server, runtime: eff.runtime, source: eff.source });
        ctx.effect(() => () => this.store.close());
    }
    newRunId() { return randomUUID(); }
    getPrefs() {
        return this.store.getKv('ark.prefs') ?? {};
    }
    savePrefs(patch) {
        const next = { ...this.getPrefs() };
        for (const [k, v] of Object.entries(patch)) {
            if (v !== undefined)
                next[k] = v;
        }
        this.store.setKv('ark.prefs', next);
        return next;
    }
    /** 整合 cordis.yml 設定與 SQLite 內透過 ark_configure 儲存的偏好（明確寫在 cordis.yml 的非預設值優先，否則用已儲存偏好）。 */
    effectiveSettings() {
        const p = this.getPrefs();
        const server = this.config.server !== 'unset' ? this.config.server : (p.server ?? 'unset');
        const serverSrc = this.config.server !== 'unset' ? 'config' : (p.server && p.server !== 'unset' ? 'saved' : 'default');
        // 若使用者在 cordis.yml 明確指定了非 auto（含 unset / adb / playcover / win32），尊重 cordis.yml；否則看 saved prefs，再退回 auto。
        const runtime = this.config.runtime !== 'auto' ? this.config.runtime : (p.runtime ?? 'auto');
        const runtimeSrc = this.config.runtime !== 'auto' ? 'config' : (p.runtime ? 'saved' : 'default');
        const account = this.config.account !== '' ? this.config.account : (p.account ?? '');
        const accountSrc = this.config.account !== '' ? 'config' : (p.account ? 'saved' : 'default');
        const timezone = this.config.timezone !== 'Asia/Hong_Kong' ? this.config.timezone : (p.timezone ?? this.config.timezone);
        const tzSrc = this.config.timezone !== 'Asia/Hong_Kong' ? 'config' : (p.timezone ? 'saved' : 'default');
        return { server, runtime, account, timezone, prefs: p, source: { server: serverSrc, runtime: runtimeSrc, account: accountSrc, timezone: tzSrc } };
    }
    registerModule(name, info) {
        this.modules.set(name, info);
        return () => { this.modules.delete(name); };
    }
}
/** ark_status（唯讀總覽）與 ark_configure（对话內免改檔設定，隨插即用）。 */
export const statusPlugin = {
    name: 'ark-core-status',
    inject: ['tools', 'ark'],
    apply(ctx) {
        ctx.effect(() => registerArkTool(ctx, { module: 'ark-core', tier: 'query' }, defineTool({
            name: 'ark_status',
            description: '明日方舟插件總覽：設定、儲存、MAA、裝置連線與截圖、各模組階段。唯讀，不操作遊戲。支援隨插即用自動偵測。',
            parameters: {
                screenshot: { type: 'boolean', description: '是否實際截一張圖驗證（預設 true）' },
            },
            output: { schema: openObject, render: jsonRender },
            isConcurrencySafe: () => false,
            async execute(args, exec) {
                const ark = ctx.ark;
                const runId = ark.newRunId();
                const eff = ark.effectiveSettings();
                const device = ctx.get('arkDevice');
                const maa = ctx.get('arkMaa');
                const guardLoaded = !!ctx.get('arkGuard');
                const deviceStatus = device
                    ? (device.screenshotStatus ? await device.screenshotStatus(exec.signal, args.screenshot !== false) : await device.status(exec.signal))
                    : { loaded: false };
                const resolvedRuntime = deviceStatus.active_backend ?? eff.runtime;
                const maaStatus = maa
                    ? (maa.statusForRuntime ? await maa.statusForRuntime(exec.signal, resolvedRuntime) : await maa.status(exec.signal))
                    : { loaded: false };
                const missingSettings = [];
                if (eff.server === 'unset')
                    missingSettings.push('server');
                if (eff.runtime === 'unset')
                    missingSettings.push('runtime');
                const value = {
                    run_id: runId,
                    checked_at: new Date().toISOString(),
                    settings: {
                        server: eff.server,
                        runtime: eff.runtime,
                        resolved_runtime: deviceStatus.active_backend ?? null,
                        account_set: eff.account !== '',
                        timezone: eff.timezone,
                        source: eff.source,
                        missing: missingSettings,
                        hint: missingSettings.length > 0 ? '可直接呼叫 ark_configure 設定（例如 server="tw", runtime="win32"），免手改設定檔' : null,
                    },
                    storage: ark.store.info(),
                    guard_loaded: guardLoaded,
                    // 紅線 2：ark-guard 未載入時，其他插件只能查詢。
                    capabilities: guardLoaded ? 'guarded' : 'query_only',
                    maa: maaStatus,
                    device: deviceStatus,
                    modules: Object.fromEntries(ark.modules),
                };
                ark.store.log(runId, 'ark-core', 'status', { device_ok: deviceStatus.ok ?? null, guard_loaded: guardLoaded, active_backend: deviceStatus.active_backend ?? null });
                return asJson(value);
            },
        })));
        ctx.effect(() => registerArkTool(ctx, { module: 'ark-core', tier: 'configure' }, defineTool({
            name: 'ark_configure',
            description: '在對話中直接檢視或儲存明日方舟插件設定（伺服器、運行方式、視窗標題、ADB 序號等），立即生效並持久化至本機 SQLite，無需手改 cordis.yml 或重啟 dsh。不操作遊戲。',
            parameters: {
                server: { type: 'string', enum: ['cn', 'tw', 'global', 'jp', 'unset'], description: '伺服器：cn（國服）/ tw（台服）/ global（國際服）/ jp（日服）' },
                runtime: { type: 'string', enum: ['auto', 'playcover', 'adb', 'win32', 'unset'], description: '運行方式：auto（自動偵測）/ win32（Windows PC 客戶端）/ adb（模擬器）/ playcover（Mac）' },
                account: { type: 'string', description: '帳號標識（選填，用於帳號不符熔斷）' },
                window_title: { type: 'string', description: '選填：Windows 官方 PC 版視窗標題（若不是預設的「明日方舟」或「Arknights」）' },
                process_name: { type: 'string', description: '選填：Windows 遊戲執行檔名稱，如 Arknights.exe' },
                adb_serial: { type: 'string', description: '選填：ADB 裝置位址，如 127.0.0.1:16384' },
                playcover_address: { type: 'string', description: '選填：PlayCover MaaTools 位址，如 localhost:1717' },
            },
            output: { schema: openObject, render: jsonRender },
            async execute(args) {
                const ark = ctx.ark;
                const runId = ark.newRunId();
                if (!ark.store.sqliteOk) {
                    return asJson({ ok: false, error: `SQLite 不可用，無法儲存設定：${ark.store.info().sqlite_error}` });
                }
                const patch = {};
                if (typeof args.server === 'string')
                    patch.server = args.server;
                if (typeof args.runtime === 'string')
                    patch.runtime = args.runtime;
                if (typeof args.account === 'string')
                    patch.account = args.account;
                if (typeof args.window_title === 'string') {
                    patch.windowTitles = args.window_title.trim() ? [args.window_title.trim(), '明日方舟', 'Arknights'] : undefined;
                }
                if (typeof args.process_name === 'string')
                    patch.processName = args.process_name;
                if (typeof args.adb_serial === 'string')
                    patch.adbSerial = args.adb_serial;
                if (typeof args.playcover_address === 'string')
                    patch.playcoverAddress = args.playcover_address;
                const saved = Object.keys(patch).length > 0 ? ark.savePrefs(patch) : ark.getPrefs();
                const eff = ark.effectiveSettings();
                ark.store.log(runId, 'ark-core', 'configure', { updated_keys: Object.keys(patch), effective: { server: eff.server, runtime: eff.runtime } });
                return asJson({
                    ok: true,
                    updated: Object.keys(patch),
                    saved_prefs: saved,
                    effective: {
                        server: eff.server,
                        runtime: eff.runtime,
                        account_set: eff.account !== '',
                        timezone: eff.timezone,
                        source: eff.source,
                    },
                });
            },
        })));
    },
};
export const name = 'ark-core';
export const inject = ['tools'];
export const Config = ArkCore.Config;
export function apply(ctx, config) {
    ctx.plugin(ArkCore, config);
    ctx.plugin(statusPlugin);
}
export { registerArkTool, getArkToolDeclaration, listArkToolDeclarations } from "../shared/tool-helpers.js";
