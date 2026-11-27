/**
 * ark-maa：maa-cli 橋接。P0 只做「探測」：二進制位置（含本機常見安裝路徑免重開終端機自動找尋）、版本、子命令、目錄。
 * 會改變遊戲狀態的 maa_fight / maa_copilot / maa_daily 等需 ark-guard（P1）才註冊。
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { run } from "../shared/exec.js";
import { fightArgv, inspectProfile, resolveClientType } from "./fight.js";
import { prepareCopilot } from "./copilot.js";
import { parseHelpCommands, parseVersions, deriveRoutes, executionPath } from "./probe.js";
import { jsonRender, openObject, asJson, registerArkTool } from "../shared/tool-helpers.js";
/** 找出本機常見套件管理器安裝位置（例如剛在 Windows 用 winget 裝完、還沒重開 dsh 導致不在 PATH 時）。 */
export function extraMaaCandidates(platform = process.platform, env = process.env) {
    const out = [];
    if (platform === 'win32') {
        const local = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
        const links = join(local, 'Microsoft', 'WinGet', 'Links', 'maa-cli.exe');
        if (existsSync(links))
            out.push(links);
        const pkgsDir = join(local, 'Microsoft', 'WinGet', 'Packages');
        if (existsSync(pkgsDir)) {
            try {
                for (const d of readdirSync(pkgsDir)) {
                    if (d.startsWith('MaaAssistantArknights.maa-cli')) {
                        const exe = join(pkgsDir, d, 'maa-cli.exe');
                        if (existsSync(exe))
                            out.push(exe);
                    }
                }
            }
            catch { /* ignore */ }
        }
        const cargo = join(homedir(), '.cargo', 'bin', 'maa.exe');
        if (existsSync(cargo))
            out.push(cargo);
    }
    else if (platform === 'darwin') {
        for (const p of ['/opt/homebrew/bin/maa', '/usr/local/bin/maa', join(homedir(), '.cargo', 'bin', 'maa')]) {
            if (existsSync(p))
                out.push(p);
        }
    }
    else {
        const cargo = join(homedir(), '.cargo', 'bin', 'maa');
        if (existsSync(cargo))
            out.push(cargo);
    }
    return out;
}
export function installHintForPlatform(platform = process.platform) {
    if (platform === 'win32') {
        return 'Windows 安裝：1) winget install --id MaaAssistantArknights.maa-cli -e --source winget  2) 以管理員安裝 VC++：winget install "Microsoft.VCRedist.2015+.x64" --accept-package-agreements --force  3) maa-cli install';
    }
    if (platform === 'darwin') {
        return 'macOS 安裝：brew install MaaAssistantArknights/tap/maa-cli && maa install';
    }
    return 'Linux 安裝：curl -fsSL https://raw.githubusercontent.com/MaaAssistantArknights/maa-cli/main/install.sh | bash && maa install';
}
export class ArkMaa extends Service {
    static inject = ['ark'];
    static Config = z.object({
        binary: z.string().default('maa'),
        fallbackBinary: z.string().default('maa-cli'),
        profile: z.string().default('default').description('maa-cli profiles/<name>.toml'),
    });
    config;
    constructor(ctx, config) {
        super(ctx, 'arkMaa');
        this.config = config;
    }
    async probe(signal) {
        const errors = [];
        let binary = null;
        let versionFlag = null;
        const useExtra = this.config.binary === 'maa' && this.config.fallbackBinary === 'maa-cli';
        const candidates = [...new Set([this.config.binary, this.config.fallbackBinary, ...(useExtra ? extraMaaCandidates() : [])].filter(Boolean))];
        for (const b of candidates) {
            const r = await run(b, ['--version'], { timeoutMs: 10_000, signal });
            if (r.ok) {
                binary = b;
                versionFlag = r.stdout.toString('utf8').trim();
                break;
            }
            errors.push(`${b} --version: ${r.error ?? `code ${r.code}`}`);
        }
        const base = {
            found: false, binary: null, version_flag: null, cli_version: null, core_version: null,
            core_ready: false, config_dir: null, usage: null, subcommands: [], routes: null,
            profile: inspectProfile(null, this.config.profile),
            probed_at: new Date().toISOString(), errors,
            install_hint: installHintForPlatform(),
        };
        if (!binary)
            return base;
        const ver = await run(binary, ['version'], { timeoutMs: 15_000, signal });
        const verText = ver.stdout.toString('utf8') + '\n' + ver.stderr;
        const v = parseVersions(verText + '\n' + (versionFlag ?? ''));
        if (!ver.ok)
            errors.push(`maa version: code ${ver.code} ${ver.stderr.slice(0, 200)}`);
        const help = await run(binary, ['--help'], { timeoutMs: 10_000, signal });
        const parsed = parseHelpCommands(help.stdout.toString('utf8'));
        if (!help.ok)
            errors.push(`maa --help: code ${help.code}`);
        const dir = await run(binary, ['dir', 'config'], { timeoutMs: 10_000, signal });
        const coreReady = ver.ok && v.core !== null;
        const result = {
            found: true,
            binary,
            version_flag: versionFlag,
            cli_version: v.cli,
            core_version: v.core,
            core_ready: coreReady,
            config_dir: dir.ok ? dir.stdout.toString('utf8').trim() : null,
            profile: inspectProfile(dir.ok ? dir.stdout.toString('utf8').trim() : null, this.config.profile),
            usage: parsed.usage,
            subcommands: Object.keys(parsed.commands),
            routes: Object.keys(parsed.commands).length ? deriveRoutes(parsed.commands) : null,
            probed_at: new Date().toISOString(),
            errors,
            install_hint: coreReady ? null : `已找到 ${binary}，但 MaaCore 尚未就緒，請執行：${binary} install`,
        };
        if (this.ctx.ark.store.sqliteOk)
            this.ctx.ark.store.setKv('maa.probe', result);
        return result;
    }
    async statusForRuntime(signal, runtime) {
        const p = await this.probe(signal);
        return { loaded: true, ...p, execution_path: executionPath(runtime, p.routes) };
    }
    /** P0 唯讀預檢，僅回傳 argv；不執行 fight，也不代表 guard 已批准。 */
    async buildFightArgs(input, signal) {
        const clientType = resolveClientType(this.ctx.ark.effectiveSettings().server, input.clientType);
        const device = this.ctx.get('arkDevice');
        if (!device)
            throw new Error('ark-device 未載入');
        const address = await device.fightAddress(signal);
        const p = await this.probe(signal);
        if (!p.core_ready || p.routes?.fight !== 'maa fight')
            throw new Error('MaaCore 或內建 fight 子命令未就緒');
        if (!p.profile.path || p.profile.error)
            throw new Error(p.profile.error ?? '缺少指定的 profile');
        return fightArgv(input, address, p.profile.name, clientType);
    }
    /**
     * P0 唯讀預檢（僅寫 ark-dsh 資料目錄）：固定作業副本、寫 maa run 任務檔並回傳 argv。
     * maa copilot 不接受 --client-type，所以改用任務檔頂層 client_type 讓非國服載入對應資源。
     * 不執行作業，也不代表 guard 已批准；執行前須以 verifyPinnedCopilot 再核對雜湊。
     */
    async buildCopilotArgs(input, signal) {
        const clientType = resolveClientType(this.ctx.ark.effectiveSettings().server, input.clientType);
        const device = this.ctx.get('arkDevice');
        if (!device)
            throw new Error('ark-device 未載入');
        const address = await device.fightAddress(signal);
        const p = await this.probe(signal);
        if (!p.core_ready || !p.subcommands.includes('run'))
            throw new Error('MaaCore 或 run 子命令未就緒');
        if (!p.profile.path || p.profile.error)
            throw new Error(p.profile.error ?? '缺少指定的 profile');
        return prepareCopilot(this.ctx.ark.config.dataDir, input, clientType, address, p.profile.name);
    }
    async status(signal) {
        return this.statusForRuntime(signal, this.ctx.ark.effectiveSettings().runtime);
    }
}
export const toolsPlugin = {
    name: 'ark-maa-tools',
    inject: ['tools', 'arkMaa'],
    apply(ctx) {
        ctx.effect(() => registerArkTool(ctx, { module: 'ark-maa', tier: 'query' }, defineTool({
            name: 'maa_probe',
            description: '探測本機 maa-cli：版本、MaaCore 是否就緒、實際子命令清單與各功能應走的命令（含自動搜尋 winget / Homebrew 安裝路徑）。唯讀。',
            parameters: {},
            output: { schema: openObject, render: jsonRender },
            async execute(_a, exec) { return asJson(await ctx.arkMaa.probe(exec.signal)); },
        })));
    },
};
export const name = 'ark-maa';
export const inject = ['tools', 'ark'];
export const Config = ArkMaa.Config;
export function apply(ctx, config) {
    ctx.plugin(ArkMaa, config);
    ctx.plugin(toolsPlugin);
    ctx.effect(() => ctx.ark.registerModule('ark-maa', { stage: 'P0', implemented: true, note: '僅探測（含自動路徑搜尋）；執行類工具待 P1（需 ark-guard）' }));
}
export { verifyPinnedCopilot, parseCopilotJson } from "./copilot.js";
export { resolveClientType, MAA_CLIENT_TYPES } from "./fight.js";
