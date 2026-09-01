# MatterDock UI/UX 全流程巡檢報告

日期：2026-09-01  
結果：完成巡檢；沒有修改產品程式碼、公共 API 或資料表。

## 執行方式與覆蓋範圍

- 以 production build 啟動 Electron，使用獨立的 `MATTERDOCK_USER_DATA` 暫存目錄及 `MATTERDOCK_DISABLE_SEED=1`；測試完成後刪除暫存資料。
- 以英文 `en` 和繁體中文（香港）`zh-HK` 走訪空白狀態及代表性資料：機構、聯絡人、Matter、標籤、下一步行動、等待中、時間線活動、文件、搜尋、別名、備份／還原／匯出及語言切換。
- 以約 `1344×841` 及最小支援尺寸 `980×680` 檢查長文字、對話框、鍵盤焦點、窄視窗及中英文排版。
- 互動證據及已匿名化的 DOM 快照集中在 [`docs/ux-audit/2026-09-01/`](docs/ux-audit/2026-09-01/)；快照在 [`full-audit-observations.json`](docs/ux-audit/2026-09-01/full-audit-observations.json)。

### 基線同步說明

- 原始互動證據是在 `b361254b` 基線上擷取；其後 Windows release hardening PR #1 合併為 `5a85ff5`。
- `b361254b..5a85ff5` 沒有修改 `src/renderer/**`；相關變更集中在 Windows packaging、main-process release safety、E2E 啟動參數及 release 相關 i18n 文案，因此本報告所列的 renderer UI/UX findings 沒有被該次 merge 改寫。
- 本 audit 分支已同步 `5a85ff5`；同步後以現行 source 重新核對 findings，並以目前完整 GitHub CI 作為驗證基線。

## 優先級摘要

| ID | 優先級 | 問題 | 主要影響 |
| --- | --- | --- | --- |
| UX-01 | 高 | Matter 沒有永久刪除或清理入口 | 誤建、重複及敏感資料無法由產品流程移除 |
| UX-02 | 中 | 機構／聯絡人刪除沒有確認，與文件／時間線不一致 | 誤刪風險及操作預期不一致 |
| UX-03 | 中 | Toast 可無上限堆疊並覆蓋內容／對話框 | 低高度或快速工作流時遮擋操作 |
| UX-04 | 中 | 長文件路徑造成 Matter 詳情內層水平捲軸 | 窄視窗內容被截斷，需左右捲動 |
| UX-05 | 中 | 主導覽 landmark 錯誤標為「Matters」 | 螢幕閱讀器使用者得到錯誤頁面結構 |
| UX-06 | 中 | 路由切換後焦點留在側欄連結 | 鍵盤／螢幕閱讀器使用者不易知道主內容已改變 |
| UX-07 | 中 | Combobox 已選機構以原始 UUID 作無障礙文字 | 螢幕閱讀器讀出不可理解的識別碼 |
| UX-08 | 低 | Today 的 Recent Matters 空白區只有標題 | 使用者不清楚是沒有資料還是載入失敗 |

## 詳細問題

### UX-01｜Matter 沒有永久刪除或清理路徑（高）

**位置／控制項**：Matter 詳情右側 `Archive`／`Restore`；Matters 狀態篩選的 `Archived`。

**重現步驟**

1. 在空白工作區建立一個 Matter，例如 `Erroneous duplicate`。
2. 開啟 Matter 詳情，檢查右側生命週期操作。
3. 點擊 `Archive`，再到 Matters 將狀態篩選為 `Archived`。

**預期行為**：產品應清楚提供永久刪除、可復原垃圾桶，或明確且可理解的保留政策；若只允許封存，應向使用者說明資料仍然保留及如何處理誤建／敏感資料。

**實際行為**：詳情只有 `Archive`／`Restore`。封存只把 Matter 從預設清單及 Today／Waiting 隱藏，資料仍可在 `Archived` 找回；UI 和資料層都沒有 Matter remove/delete 能力。DOM 按鈕快照沒有 `Delete`，Matter API key 只有 `list/get/create/update/archive/restore/setTags/linkContact/unlinkContact`。

**使用者影響**：誤建、重複案件、測試資料及需要清理的敏感紀錄不能按產品流程刪除；使用者也可能把「封存」誤解成「刪除」。

**證據**：[`audit-en-matter-initial.png`](docs/ux-audit/2026-09-01/audit-en-matter-initial.png)、[`audit-en-after-archive.png`](docs/ux-audit/2026-09-01/audit-en-after-archive.png)、[`MatterDetailPage.tsx#L171-L178`](src/renderer/src/features/matters/MatterDetailPage.tsx#L171)、[`ipc.ts#L46-L56`](src/shared/ipc.ts#L46)。

**建議／產品決策**：二選一並寫入產品政策：

- 保留政策：把按鈕及說明改成「封存（不會刪除資料）」並提供管理員／工作區層級的資料清理方案；或
- 刪除政策：加入可復原 Trash，再提供受保護的永久刪除（輸入 Matter 標題確認、說明關聯資料如何處理、必要時留下稽核紀錄）。

這不是本次巡檢中直接改 code 的項目，因為永久刪除的保留期限、關聯資料 cascade 及備份中的資料處理需要產品決策。

### UX-02｜機構／聯絡人刪除沒有確認對話框（中）

**位置／控制項**：機構詳情及聯絡人詳情右上角 `Delete`。

**重現步驟**

1. 在隔離工作區建立沒有關聯 Matter 的機構及聯絡人。
2. 開啟機構詳情，點擊 `Delete`；重複在聯絡人詳情操作。
3. 對比文件 `Remove` 及時間線活動 `Delete`。

**預期行為**：所有不可逆刪除操作使用一致的確認內容，並說明會否影響關聯資料。

**實際行為**：機構及聯絡人點擊後立即刪除、沒有 dialog，直接返回列表並顯示成功 Toast；文件及時間線則有確認 dialog，並明確說明不可復原或原始檔案不受影響。隔離測試量得兩個刪除流程的 dialog count 都是 `0`。

**使用者影響**：誤點即可刪除資料，且使用者在不同資料類型之間不能建立一致的操作預期。

**證據**：[`audit-en-organisation.png`](docs/ux-audit/2026-09-01/audit-en-organisation.png)、[`audit-en-contact.png`](docs/ux-audit/2026-09-01/audit-en-contact.png)、[`audit-en-delete-confirmations.png`](docs/ux-audit/2026-09-01/audit-en-delete-confirmations.png)、[`ContactPages.tsx#L129-L134`](src/renderer/src/features/contacts/ContactPages.tsx#L129)、[`OrganisationPages.tsx#L157-L162`](src/renderer/src/features/organisations/OrganisationPages.tsx#L157)、[`MatterTimeline.tsx#L121-L138`](src/renderer/src/features/timeline/MatterTimeline.tsx#L121)。

**建議**：統一使用確認 dialog；對有關聯 Matter 的刪除，先顯示關聯數量及解除／重新指派要求；可加入短時間 Undo Toast。

### UX-03｜Toast 無上限堆疊並覆蓋對話框（中）

**位置／控制項**：全域右下角通知。

**重現步驟**

1. 在 `980×680` 視窗快速建立 6 個 Matter，使成功通知連續出現。
2. 立即開啟 `New matter` dialog。

**預期行為**：通知數量受控、不遮擋 modal 或重要控制項；重複成功訊息應合併或可關閉。

**實際行為**：同時存在 6 個 Toast；在測試尺寸下其中 5 個與 dialog 的 bounding box 重疊。Toast provider 將每次訊息直接 append，只有 3.8 秒後才移除，沒有數量上限、關閉按鈕或重複訊息合併。

**使用者影響**：快速工作流會製造噪音；在低高度視窗中通知遮住表單內容及背景操作。

**證據**：[`audit-en-toast-stack-narrow.png`](docs/ux-audit/2026-09-01/audit-en-toast-stack-narrow.png)、[`toast.tsx#L11-L33`](src/renderer/src/lib/toast.tsx#L11)、[`app.css#L908-L926`](src/renderer/src/styles/app.css#L908)。

**建議**：最多顯示 3 個、相同成功訊息合併、加入 dismiss、modal 開啟時重新定位或暫停顯示；錯誤訊息可保留較長時間。

### UX-04｜長文件路徑令窄視窗出現內層水平捲軸（中）

**位置／控制項**：Matter 詳情的 Documents card；`980×680`。

**重現步驟**

1. 將一個長檔名／長路徑的文件以 `Reference original` 加入 Matter。
2. 將視窗縮至 `980×680`，開啟該 Matter。

**預期行為**：檔名及路徑在 card 內截斷或換行，不改變主欄寬度，也不需水平捲動。

**實際行為**：`.matter-main` 的 `clientWidth` 是 `437px`、`scrollWidth` 是 `551px`；文件 card 是 `381px` 寬但 `scrollWidth` 是 `523px`。`.doc-path` 設定 `white-space: nowrap`，量得 `clientWidth=420`、`scrollWidth=1178`，因此主欄出現水平捲軸。

**使用者影響**：文件區內容被右側截斷；使用者需要左右捲動才能查看完整資訊，亦可能誤以為頁面版面壞掉。

**證據**：[`audit-en-document-narrow-metrics.png`](docs/ux-audit/2026-09-01/audit-en-document-narrow-metrics.png)、[`DocumentRow.tsx#L37-L45`](src/renderer/src/features/documents/DocumentRow.tsx#L37)、[`app.css#L974-L979`](src/renderer/src/styles/app.css#L974)。

**建議**：以檔名作主要顯示、完整路徑只放 tooltip／複製路徑；或對 path 使用 `min-width:0`、`max-width:100%`、`overflow-wrap:anywhere`，並檢查 flex/grid 子項的最小寬度。

### UX-05｜主導覽 landmark 錯誤標為「Matters」（中，無障礙）

**位置／控制項**：所有頁面的側欄 `<nav>`。

**重現步驟**：使用螢幕閱讀器的 landmark 導覽，或在 DOM 檢查 `<nav>` 的 `aria-label`。

**預期行為**：包含 Today、Matters、Waiting、Search、Organisations、Contacts、Settings 的 `<nav>` 應標記為 `Primary navigation`／`主要導覽`。

**實際行為**：整個導覽 landmark 的 `aria-label` 是 `Matters`（中文為 `事項`），與其實際包含的頁面不相符。

**使用者影響**：螢幕閱讀器使用者會誤以為 landmark 只代表 Matters 頁面，降低方向感。

**證據**：DOM 量測 `navLabel: "Matters"`；[`Sidebar.tsx#L31-L43`](src/renderer/src/app/layout/Sidebar.tsx#L31)。

**建議**：新增 `nav.primary` 翻譯，例如英文 `Primary navigation`、繁中 `主要導覽`。

### UX-06｜路由切換後焦點留在側欄（中，無障礙）

**位置／控制項**：側欄連結與頁面切換。

**重現步驟**

1. 用鍵盤 focus `Today`，按 Enter。
2. 再 focus `Settings`，按 Enter。
3. 讀取 `document.activeElement`。

**預期行為**：新頁面載入後把焦點移到頁面 `h1`／主內容容器，並讓螢幕閱讀器得知頁面已改變。

**實際行為**：Today 切換後焦點仍是 `<a>Today</a>`，Settings 切換後仍是 `<a>Settings</a>`；`main h1` 沒有 `tabindex`，`main` 也沒有 label 或 live announcement。

**使用者影響**：鍵盤使用者要自行再進入主內容；螢幕閱讀器使用者可能錯過新頁面的標題和內容。

**證據**：隔離 DOM 測試結果 `afterToday.activeTag="a"`、`afterSettings.activeTag="a"`；空白頁快照亦記錄焦點沒有移往標題。可與 [`Sidebar.tsx`](src/renderer/src/app/layout/Sidebar.tsx) 及頁面 `h1` 結構一併修正。

**建議**：路由變更時 focus 一個 `tabIndex={-1}` 的頁面標題／主容器；保留正常 Tab 順序，並視需要加入簡短 `aria-live` 狀態。

### UX-07｜已選機構的無障礙文字暴露原始 UUID（中，無障礙）

**位置／控制項**：Matter 詳情及建立 Matter dialog 的 Organisation Combobox。

**重現步驟**

1. 建立或選取一個機構，例如 `Test Organisation`。
2. 檢查 Combobox 的可見值及 DOM 中的螢幕閱讀器文字。

**預期行為**：可見名稱及螢幕閱讀器都讀出 `Test Organisation`。

**實際行為**：可見 input 顯示機構名稱，但 `Combobox` 另外渲染 `<span class="sr-only">Selected {value}</span>`，而 `value` 是機構 UUID；DOM body 因而包含 `Selected <uuid>`。

**使用者影響**：無障礙樹會包含無法辨識的長識別碼，螢幕閱讀器可能讀出它而遮蔽真正的機構名稱。

**證據**：匿名化快照的 Organisation field 同時有可見 `Test Organisation` 及 `Selected <uuid>`；[`Combobox.tsx#L62-L94`](src/renderer/src/components/ui/Combobox.tsx#L62)。

**建議**：Combobox 接受 selected label，或以可見 query 生成 `aria-label`／`aria-describedby`；不要把內部 ID 作為使用者可聽見的文字。

### UX-08｜Today 的 Recent Matters 空白狀態缺少說明（低）

**位置／頁面**：Today → `Recent matters`。

**重現步驟**：在空白工作區開啟 Today。

**預期行為**：每個空白分區都應有清楚的 empty-state 文案及適當下一步，例如 `No recent matters yet`／`Create a matter`。

**實際行為**：`Needs attention` 和 `Waiting` 有空白說明，但 `Recent matters` 只有 section heading，下面完全留白。

**使用者影響**：首次使用者不能確定這是「沒有最近事項」、資料尚未載入，還是畫面遺漏。

**證據**：[`en-empty-today.png`](docs/ux-audit/2026-09-01/en-empty-today.png)。

**建議**：加入 `No recent matters yet`，並提供建立 Matter 或前往 Matters 的入口；中文同步提供對應翻譯。

## 快速改善項目

1. 統一機構／聯絡人／文件／時間線的 destructive action confirmation。
2. Toast 設上限、dismiss 及重複訊息合併；先處理 `980×680` modal 重疊。
3. 修正主導覽 label、路由 focus 及 Combobox selected label；這些是低風險的無障礙修正。
4. 文件路徑改為檔名優先顯示，避免長字串把 `.matter-main` 撐出水平捲軸。
5. 補上 Today → Recent matters 的空白說明。
6. Archive 可加上「已從主要清單隱藏，可從 Archived 還原」的說明或 Undo Toast，降低使用者把封存當成刪除的機會。

## 需要產品決策的項目

- Matter 是否需要使用者可操作的永久刪除？若需要，是 Trash、延遲刪除還是立即刪除？
- 永久刪除是否 cascade actions、waiting、events、documents metadata、聯絡／機構關聯，以及備份中的副本？
- 敏感資料清理是否需要 workspace 管理員權限、輸入標題確認及稽核紀錄？
- 若政策是只保留封存，介面及文件應如何明確表達 retention，不應讓 Archive 看起來像 Delete 的替代品。

## 驗證基線與限制

- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm test`：32 個 test files、197 個 tests 通過。
- `npm run build`：通過。
- `npm run test:e2e`：在 PR #1 合併後的現行 CI 通過；PR #1 已把 Electron E2E 啟動參數統一加入 `--disable-gpu` 與 `--no-sandbox`。原始 audit 擷取環境曾出現 `Target crashed` / `exit_code=-1073741515`，這只保留作歷史測試環境紀錄，不再視為目前驗證限制。
- 現行完整 Windows CI 亦涵蓋 unpacked build、packaged Electron smoke、x64 NSIS installer build、release artifact validation 及 installer artifact upload。
- 本次沒有修改 `src/`、API 或 schema；audit evidence 固定存放於 `docs/ux-audit/2026-09-01/`，避免把一般 Playwright 生成目錄當成長期文件位置。
