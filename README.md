# ark-dsh：明日方舟自動遊玩 dsh 隨插即用插件組

需求來源：開發規格書 v1.0 + 開發指令 v1.1（衝突時以 v1.1 為準，見文末「規格衝突」）。

## 一鍵安裝（隨插即用，免手改路徑與設定檔）

目前已照社群主流 dsh 插件（`dsh.bundle` + `cordis.patch.yml` + 預編譯 `lib/*.js`）打包，**不需要自己複製 YAML、不需要手改絕對路徑、也不需要在安裝時跑 TypeScript 編譯**：

```sh
# 1. 直接從 GitHub 裝進你的 dsh profile（例如 web）：
dsh plugin --profile web add github:bingtony7462-eng/ark-dsh

# 若你用的是桌面端（DSH Desktop），請在「設定 → 插件」安裝，或先下載壓縮包 / git clone 後在終端機裝本地目錄：
# git clone https://github.com/bingtony7462-eng/ark-dsh.git
# dsh plugin --profile web add ./ark-dsh
```

裝好後重啟一次 dsh，直接在對話框跟 DeepSeek 說：
- **「幫我把方舟插件設成台服，並檢查現在的連線狀態」**

AI 就會自動呼叫 `ark_configure` 把伺服器存進本機資料庫，接著呼叫 `ark_status` 自動偵測你的遊戲視窗（Windows PC 版 / Mac PlayCover / 模擬器）並截圖驗證。全程免改設定檔。

---

## 目前階段：P0 環境（程式碼已完成，等待實機驗收）

| 模組 | 階段 | 狀態 |
|---|---|---|
| ark-core | P0 | 設定、SQLite + JSONL 落地、run_id、`ark_status`、`ark_configure`（對話內免改檔設定） |
| ark-device | P0 | PlayCover / ADB / Windows PC（win32）後端，支援 `auto` 自動偵測、連線探測、截圖、全黑/單色/低解析度判定 |
| ark-maa | P0 | `maa_probe`：自動尋找本機安裝路徑（含 winget / Homebrew 目錄）、版本、MaaCore 是否就緒、實際子命令與路徑對照 |
| ark-guard | P1 | 佔位（未載入 = 其他插件只能查詢） |
| ark-box / ark-guide / ark-copilot / ark-planner | P2 | 佔位 |
| ark-strategy | P3 | 佔位 |

P0 只註冊四個安全工具：`ark_status`、`ark_configure`、`ark_screenshot`、`maa_probe`。沒有任何會戰鬥、消費或點擊遊戲畫面的工具。

---

## 前置準備：依你的系統安裝對應版本的 MAA

> 這個插件需要搭配 **maa-cli**（命令列）+ **MaaCore**（核心與資源檔）。
> **macOS 和 Windows 要裝不同版本的 maa-cli**，請只照你那台電腦的段落做，不要混用。
> 裝完不用手改設定：`ark-maa` 會自動掃描 PATH 以及 winget / Homebrew 的預設安裝位置。

| 你的電腦 | 遊戲怎麼跑 | maa-cli 安裝方式 | 安裝後的指令名 | 自動偵測順序 (`runtime: auto`) |
|---|---|---|---|---|
| Windows 10/11（x64） | 官方 PC 客戶端（GRYPHLINK 啟動器）或 MuMu 12 | winget | `maa-cli` | 先找 `win32` 視窗，再找 `adb` |
| macOS（Apple Silicon） | PlayCover 或 Android 模擬器 | Homebrew | `maa` | 先找 `playcover`，再找 `adb` |

### Windows 版（PowerShell，以系統管理員身分執行）

```powershell
# 1. Windows 版 maa-cli（不要用 brew，也不要裝圖形版 MaaAssistantArknights）
winget install --id MaaAssistantArknights.maa-cli -e --source winget

# 2. MaaCore 需要 VC++ 執行庫（管理員）
winget install "Microsoft.VCRedist.2015+.x64" --override "/repair /passive /norestart" --uninstall-previous --accept-package-agreements --force

# 3. 開一個新的 PowerShell 視窗讓 PATH 生效，下載 MaaCore + 資源
maa-cli install
maa-cli version        # 確認 MaaCore 已就緒
```

注意：
- winget 裝出來的指令名是 **`maa-cli`**（更新請用 `winget upgrade MaaAssistantArknights.maa-cli`）。即使你還沒重開 dsh 導致 PATH 還沒刷新，`ark-maa` 也會自動去 `%LOCALAPPDATA%\Microsoft\WinGet` 找執行檔。
- 若不想用 winget，也可用官方腳本（裝完指令名是 `maa`）：
  `Invoke-WebRequest -Uri "https://raw.githubusercontent.com/MaaAssistantArknights/maa-cli/main/install.ps1" -OutFile install.ps1; .\install.ps1`

### macOS 版（終端機）

```sh
# 1. macOS 版 maa-cli（不要下載 Windows 的 .exe / .zip）
brew install MaaAssistantArknights/tap/maa-cli

# 2. 下載 MaaCore + 資源
maa install
maa version            # 確認 MaaCore 已就緒
```

官方安裝說明：[maa-cli 安裝與編譯](https://docs.maa.plus/en-us/manual/cli/install.html)。

---

## P0 實機驗收

你可以直接在 dsh 對話裡叫 AI 跑 `ark_status`，也可以在終端機直接跑驗收腳本（不經過模型、不操作遊戲）：

```sh
git clone https://github.com/bingtony7462-eng/ark-dsh.git
cd ark-dsh
npm install
npm run p0             # 隨插即用：預設 server=tw、runtime=auto 自動偵測並截圖
```

### Windows + 官方 PC 客戶端（台服 GRYPHLINK 啟動器）注意事項

1. 先用啟動器**手動開好遊戲**（MAA 的 PC 控制器不支援自動啟動遊戲，見 MAA issue #17653）。
2. 視窗不要最小化，建議 16:9（例如 1920×1080 視窗化）。
3. 用「以系統管理員身分執行」開 PowerShell 或啟動 dsh（遊戲以管理員權限執行時，一般權限讀不到它的視窗）。
4. 若視窗標題不是預設的 `明日方舟` 或 `Arknights`：
   - 在 dsh 對話裡直接跟 AI 說：`視窗標題是 XXX`（AI 會用 `ark_configure` 記住）；
   - 或跑腳本時加上參數：`npm run p0 -- --window-title "實際標題" --process-name Arknights.exe`。

報告會寫入 `%APPDATA%\ark-dsh\acceptance\`（macOS 為 `~/Library/Application Support/ark-dsh/acceptance/`）。

### 截圖方式與 Windows 執行路徑限制（P1 前要決定）

- **截圖**：Windows 用 PowerShell + Win32 `PrintWindow`（只讀，不送任何點擊/按鍵）。若硬體加速導致截到全黑畫面，`ark_status` 會如實回報「畫面全黑」，不會假裝成功。台服 PC 版有 ACE 反作弊，P0 只讀畫面；之後若要送輸入，風險需自行評估。
- **P1 執行路徑**：**maa-cli 穩定版還不支援連接 PC 客戶端**（PR #543 / #575 尚未合併），所以 `ark_status.maa.execution_path` 在 `win32` 會如實回報 `blocked`。進入 P1 前請三選一：
  - **A. MuMu 12 + ADB**：在 Windows 裝 MuMu 12 跑台服 Android 版（MAA 官方推薦、最穩）。
  - **B. 自建 MaaCore 橋接**：`ark-maa` 直接載入 `MaaCore.dll` 呼叫 `AsstAttachWindow`（不經 maa-cli，需較多實機測試）。
  - **C. 等 maa-cli 合併 PC 支援**：合併後 `maa_probe` 會自動偵測 `connection` 子命令。

---

## 進階：單獨停用模組或手動覆寫設定

安裝 `ark-dsh` bundle 後，九個插件（`ark-core`、`ark-device`、`ark-maa`、`ark-guard`、`ark-box`、`ark-guide`、`ark-copilot`、`ark-planner`、`ark-strategy`）各自擁有獨立 `id`。若你想在自己的 profile 裡停用某個插件（例如停用 `ark-strategy`），只需在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 加上：

```yaml
- id: ark-strategy
  disabled: true
```

若你是從 dsh 原始碼開發環境用 `--patch` 啟動，也可參考倉庫內的 `cordis.example.yml`。

---

## 已確認的 API 依據（不臆測）

- 打包與掛載契約：依 dsh 官方 `dsh-app-boot` / `dsh-plugin-manager` 實作，`package.json` 宣告 `dsh.bundle.patch = "./cordis.patch.yml"`、`engines.dsh >= 0.1.0-alpha.0`、以及覆蓋 0.0.1 至 0.2.3 各預發布線的 `peerDependencies`，並隨倉庫預編譯 `lib/*.js` 免除 pnpm `allowBuilds` 阻擋。
- 工具註冊與門禁：`defineTool`、`ToolsService.register/guard/execute`、`PreToolDecision`（`allow`/`deny`/`ask`）取自 `@deepseek-ai/dsh-tools` 型別定義，並在測試中實際執行。
- maa-cli 子命令基準取自 maa-dsh-skill 收錄的 v0.7.5 `--help`；**正式基準以你本機 `maa --help` / `maa-cli --help` 為準**（`maa_probe` 會讀實際輸出並存入 SQLite）。

## 規格衝突（v1.0 vs v1.1，已依 v1.1 處理）

1. 模組數：v1.0 八個，v1.1 九個（新增 ark-strategy）。
2. 碎石：v1.0「UI 明確批准單次」、功能 C 有 `/approve 碎石1`；v1.1 所有自動模式 stone=0 且禁止遠端碎石批准。
3. 失敗處理：v1.0「首次失敗就換人重試、失敗 2 次換攻略」；v1.1 follow 模式不得擅自換人或換作業，自主嘗試上限 5 次。
4. 熔斷門檻：v1.0 同關連敗 3 次；v1.1 自主嘗試每關 5 次。兩者並存待確認（建議：follow 模式 3 次，self 模式 5 次）。
5. 階段：v1.0 的 P3=B 站 L3、P4=影片 L4；v1.1 改為 P3=自己打、P4=混合推圖，B 站與影片移到 P5。
6. 子命令：v1.0 設計了 `maa_infrast` / `maa_recruit`，但 maa-cli v0.7.5 沒有這兩個子命令 → 依 v1.1 改走 `maa run` + 任務檔。
7. 「戰鬥中漏怪立刻退出可返還理智」（v1.0 4.7）是未驗證的遊戲規則，v1.1 未提及，暫不實作。
8. maa-dsh-skill 預設基建 `replenish = true`（自動補貨源石碎片，會花資源）。依 v1.1 紅線 4，P1 預設會關掉，需授權才開。
9. 平台：v1.1 規定資料放 `~/Library/Application Support/ark-dsh/`（macOS 路徑），Windows 改用 `%APPDATA%\ark-dsh\`；v1.1 的 Cookie 存 Keychain，Windows 上對應 Windows 認證管理員（P5 才用到，屆時實作）。
10. 運行方式：v1.0/v1.1 只列 PlayCover / 模擬器；新增 Windows 官方 PC 客戶端（win32），P0 可驗收，P1 起執行路徑見上方選項。
