# ark-dsh：明日方舟自動遊玩 dsh 插件組

需求來源：開發規格書 v1.0 + 開發指令 v1.1（衝突時以 v1.1 為準，見文末「規格衝突」）。

## 目前階段：P0 環境（程式碼已完成，等待實機驗收）

| 模組 | 階段 | 狀態 |
|---|---|---|
| ark-core | P0 | 設定、SQLite + JSONL 落地、run_id、`ark_status` |
| ark-device | P0 | PlayCover / ADB / Windows PC（win32）後端，連線探測、截圖、全黑/單色/低解析度判定 |
| ark-maa | P0 | `maa_probe`：二進制、版本、MaaCore 是否就緒、實際子命令與路徑對照 |
| ark-guard | P1 | 佔位（未載入 = 其他插件只能查詢） |
| ark-box / ark-guide / ark-copilot / ark-planner | P2 | 佔位 |
| ark-strategy | P3 | 佔位 |

P0 只註冊三個唯讀工具：`ark_status`、`ark_screenshot`、`maa_probe`。沒有任何會戰鬥、消費或點擊的工具。

## 安裝：先選你的系統

> 這個插件**必須搭配 MAA 使用**：需要 maa-cli（命令列）+ MaaCore（核心）+ 資源檔。
> **macOS 和 Windows 要下載不同版本的 maa-cli**，請只照你那台電腦的段落做，不要混用。

| 你的電腦 | 遊戲怎麼跑 | maa-cli 安裝方式 | 安裝後的指令名 | 驗收用 `--runtime` |
|---|---|---|---|---|
| macOS（Apple Silicon） | PlayCover 或 Android 模擬器 | Homebrew | `maa` | `playcover` / `adb` |
| Windows 10/11（x64） | 官方 PC 客戶端（GRYPHLINK 啟動器）或 MuMu 12 | winget | `maa-cli` | `win32` / `adb` |

不用另外設定指令名：`ark-maa` 會先找 `maa`，找不到再找 `maa-cli`。

### macOS 版（終端機）

```sh
# 1. Node ≥ 22.5（使用內建 node:sqlite）
brew install node
# 2. macOS 版 maa-cli（不要下載 Windows 的 .exe / .zip）
brew install MaaAssistantArknights/tap/maa-cli
# 3. MaaCore + 資源
maa install
maa version            # 確認 MaaCore 已就緒
# 4. 本插件
git clone https://github.com/bingtony7462-eng/ark-dsh.git
cd ark-dsh
npm install
npm test
```

接著做下方「P0 實機驗收（Mac）」。

### Windows 版（PowerShell，以系統管理員身分執行）

```powershell
# 1. Node ≥ 22.5
winget install OpenJS.NodeJS.LTS
# 2. Windows 版 maa-cli（不要用 brew，也不要下載 macOS / Linux 版）
winget install --id MaaAssistantArknights.maa-cli -e --source winget
# 3. MaaCore 需要 VC++ 執行庫（管理員）
winget install "Microsoft.VCRedist.2015+.x64" --override "/repair /passive /norestart" --uninstall-previous --accept-package-agreements --force
# 4. 重新開一個 PowerShell 視窗讓 PATH 生效，再安裝 MaaCore + 資源
maa-cli install
maa-cli version        # 確認 MaaCore 已就緒
# 5. 本插件
git clone https://github.com/bingtony7462-eng/ark-dsh.git
cd ark-dsh
npm install
npm test
```

注意：
- winget 裝的指令名是 **`maa-cli`**，不是 `maa`；更新請用 `winget upgrade MaaAssistantArknights.maa-cli`，不要用 `maa self update`。
- 不想用 winget 時，可改用官方安裝腳本（裝完指令名是 `maa`）：
  `Invoke-WebRequest -Uri "https://raw.githubusercontent.com/MaaAssistantArknights/maa-cli/main/install.ps1" -OutFile install.ps1; .\install.ps1`
- 這裡裝的是 **maa-cli**，不是 MAA 圖形版（`MaaAssistantArknights.MaaAssistantArknights`）。圖形版本插件用不到。

接著做下方「Windows + 官方 PC 客戶端（台服）」的驗收。

官方安裝說明：[maa-cli 安裝與編譯](https://docs.maa.plus/en-us/manual/cli/install.html)。

## P0 實機驗收（Mac）

先確認遊戲已開、視窗在目前桌面且未最小化，然後二選一：

```sh
# PlayCover（MaaTools 位址會從視窗標題 [localhost:端口] 讀取）
npm run p0 -- --server tw --runtime playcover

# Android 模擬器（ADB）
npm run p0 -- --server tw --runtime adb --adb-serial 127.0.0.1:16384
```

腳本以真實 dsh ToolRegistry 載入九個插件並呼叫 `ark_status`，不操作遊戲。報告寫入
`~/Library/Application Support/ark-dsh/acceptance/p0-<時間>.json`，截圖存在同目錄的 `screenshots/`。
通過條件：maa 找得到、MaaCore 就緒、使用中的後端連得上、截圖有效、SQLite 可用。沒用到的後端會標「未測」。

PlayCover 注意：讀取視窗標題需要「系統設定 → 隱私權與安全性 → 螢幕錄製」授權給你執行的終端機。

## Windows + 官方 PC 客戶端（台服）

適用：用 GRYPHLINK（鷹角英文版）啟動器開的台服 PC 版。

安裝請看上方「Windows 版」。

### P0 實機驗收

1. 先用啟動器**手動開好遊戲**（MAA 的 PC 控制器不支援自動啟動遊戲，見 MAA issue #17653）。
2. 視窗不要最小化，建議 16:9（例如 1920×1080 視窗化）。
3. 用「以系統管理員身分執行」開 PowerShell（遊戲以管理員權限執行時，一般權限讀不到它的視窗）。
4. 執行：

```powershell
npm run p0 -- --server tw --runtime win32
# 視窗標題不是「明日方舟」/「Arknights」時：
npm run p0 -- --server tw --runtime win32 --window-title "實際標題" --process-name Arknights.exe
```

報告寫入 `%APPDATA%\ark-dsh\acceptance\`。輸出裡的 `win32` 欄位會列出找到的視窗標題、進程名稱、
大小、是否管理員；找不到視窗時會列出所有候選視窗，把那段貼給我即可。

### 截圖方式與限制

- 截圖用 PowerShell + Win32 `PrintWindow`（只讀，不送任何點擊/按鍵），存成 PNG 後做全黑/單色/解析度檢查。
- 若遊戲用硬體加速導致 `PrintWindow` 拿到全黑畫面，`ark_status` 會如實回報「畫面全黑」，不會當作成功。
- 台服 PC 版有 ACE 反作弊。P0 只讀視窗畫面；之後若要送輸入，風險需你自行評估。

### 執行路徑：目前被擋住（P1 前要決定）

P0 只驗收「看得到」。真正讓 MAA 去打，需要 MaaCore 接到 PC 視窗（`AsstAttachWindow`），但
**maa-cli 穩定版還不支援 PC 客戶端**（PR #543 / #575 都尚未合併），所以 `ark_status.maa.execution_path`
在 win32 會回 `blocked`。三個選項：

| 選項 | 說明 | 代價 |
|---|---|---|
| A. MuMu 12 + ADB | 在 Windows 裝 MuMu 12 跑台服 Android 版，`--runtime adb` | 要另裝模擬器，帳號在模擬器裡登入；MAA 官方推薦、最穩 |
| B. 自建 MaaCore 橋接 | ark-maa 直接載入 MaaCore.dll 呼叫 AttachWindow | 要寫 FFI 橋接，不經 maa-cli，需要更多實機驗證 |
| C. 等 maa-cli 合併 PC 支援 | 合併後 `maa_probe` 會自動偵測 `connection` 子命令 | 時間不確定 |

另外：maa-cli 的 `client_type` 可選值是 Official / Bilibili / Txwy / YoStarEN / YoStarJP / YoStarKR；
台服對應 `Txwy`，但 GRYPHLINK 發行的 PC 版是否也用 `Txwy`，**未驗證**。

## 掛到 dsh

複製 `cordis.example.yml` 為 `cordis.yml`，把 `/ABS/PATH` 換成絕對路徑、填好 `server` / `runtime`，然後：

```sh
pnpm dsh web --patch /ABS/PATH/ark-dsh/cordis.yml
```

任一插件可加 `disabled: true` 單獨停用。

## 已確認的 API 依據（不臆測）

- `defineTool`、`ToolRegistry.register/guard/execute`、`PreToolDecision`（`allow`/`deny`/`ask`）取自 npm `@deepseek-ai/dsh-tools@0.0.1-rc.1` 的型別定義，並在測試中實際執行。
- 實測：`tools/pre-execute` 回 `ask` 但沒有 approval 服務時，呼叫會被拒（fail-closed）；P1 的批准流程會依賴這一點。
- cordis.yml 的 `insert` / `id` / `name` / `config` / `disabled` 取自官方文件。
- maa-cli 子命令基準取自 maa-dsh-skill 收錄的 v0.7.5 `--help`；**正式基準以你本機 `maa --help` 為準**（`maa_probe` 會讀實際輸出並存入 SQLite）。

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
