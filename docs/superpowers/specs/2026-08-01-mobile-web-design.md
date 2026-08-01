# XFrame 行動網頁版 — 設計文件

**日期**：2026-08-01
**狀態**：設計已確認，待撰寫實作計畫
**前置**：Chrome 擴充功能已上架（見 `2026-07-31-x-share-card-extension-design.md`）

---

## 1. 目標

一個公開網址的網頁版 XFrame，在 iPhone Safari（以及任何桌面瀏覽器）上：貼上推文網址 →
自動抓取 → 調整外觀 → 存成圖片。不需安裝擴充功能、不需捷徑、不需任何 app。

可加入 iOS 主畫面，行為接近原生 app。

### 非目標

- 不做 Safari 擴充功能（需 Apple 開發者帳號與 App Store 審查）
- 不做 Scriptable 版本
- 不做整串 thread、留言區、批次匯出（延續擴充功能的非目標）
- 不做帳號、雲端同步、付費層

---

## 2. 關鍵前提（2026-08-01 實測）

**X 允許跨來源讀取。** 這推翻了先前「網頁必須手動輸入」的假設。

以 iPhone Safari 的 User-Agent 加上 `Sec-Fetch-Mode: cors`、`Sec-Fetch-Site: cross-site`
標頭實測：

| 端點 | `Access-Control-Allow-Origin` | 內容 |
|---|---|---|
| `x.com/<user>/status/<id>` | 回傳請求的 Origin | 177,103 字元，含完整 microdata |
| `publish.twitter.com/oembed` | 回傳請求的 Origin | 作者 + 內文 |
| `pbs.twimg.com/profile_images/…` | 回傳請求的 Origin | 圖片，可進 canvas 不污染 |
| `Origin: null`（本機檔案） | 回傳 `null` | 規格上允許，但見下方 |

**對照組**：`google.com`、`apple.com`、`news.ycombinator.com` 皆**無**此標頭 ——
證明這台機器上的 TLS 代理沒有注入標頭，上述結果為 X 的真實行為。

### 兩個由此而來的推論

**瀏覽器 `fetch` 預設不帶跨來源 cookie。** `credentials` 預設為 `same-origin`，
所以跨來源請求自動是未驗證的 —— 整個 microdata 架構的前提在網頁版自動成立，
不需要像 service worker 那樣明寫 `credentials: 'omit'`。

**不能用本機檔案。** 雖然 `Origin: null` 被 X 接受，但 Safari 對 `file://` 頁面
預設禁止 fetch（連同源都擋），與 CORS 無關。必須有真正的託管。

### 殘餘風險

X 的跨來源政策沒有文件保證，是實測出來的行為。若 X 關閉此行為，網頁版即失效
（擴充功能不受影響，它有 host 權限）。**網頁版的架構風險高於擴充功能。**

---

## 3. 架構

### 3.1 程式碼共用

擴充功能已經把抓取與渲染分得夠開，行動版只需替換抓取層：

| 模組 | 處置 |
|---|---|
| `src/parse/microdata.ts` | 原封不動 |
| `src/parse/tokenize.ts` | 原封不動 |
| `src/render/backgrounds.ts` | 原封不動 |
| `src/render/Card.tsx` | 僅新增 9:16 模式（見 §4） |
| `src/render/export.ts` | 原封不動 |
| `src/types.ts` | 新增一個 aspect 值 |

### 3.2 新增檔案

```
web/
  index.html      行動版外殼（含 PWA meta 與 manifest 連結）
  main.tsx        進入點：網址輸入、狀態機、版面
  fetch.ts        抓取轉接層：直接 fetch，取代 service worker 訊息傳遞
  Sheet.tsx       可收合的設定分區元件
  manifest.json   PWA manifest（名稱、圖示、standalone）
vite.web.config.ts
```

`web/fetch.ts` 對外提供與擴充功能相同語意的兩個函式，讓上層邏輯不必知道自己跑在哪：

```ts
fetchTweetHtml(url: string): Promise<string>     // 直接 fetch，不帶 cookie
hydrateAssets(tweet: TweetData): Promise<TweetData>  // 直接抓圖轉 data URL
```

錯誤分類沿用 `TweetFetchError` 的 `not-found` / `rate-limited` / `network`，
外加一個 `cors` —— 當 fetch 因跨來源被擋時，錯誤訊息要明確指出「X 可能已變更政策」，
而不是含糊的網路錯誤。這是本架構最可能失效的地方，出事時必須一眼看得出來。

### 3.3 資料流

```
使用者貼上網址（或 ?u= 參數帶入）
  → extractTweetId 取出 ID
  → fetch x.com 頁面（跨來源、無 cookie）
  → parseTweet 解析 microdata → TweetData
  → 抓頭像與圖片轉 data URL
  → Card 渲染預覽
  → 使用者調整（設定存 localStorage）
  → exportPng 光柵化預覽節點 → 顯示為 <img>
  → iOS 長按存圖 / 桌面下載按鈕
```

**沒有 DOM 降級路徑。** 鎖推推文在網頁版無解 —— 頁面沒有使用者的登入狀態，
X 不會回傳內容。錯誤訊息需明說「鎖推內容請用 Chrome 擴充功能」。

---

## 4. 新的比例模式：9:16（最小高度）

**這是網頁版的預設值**，語意與現有固定比例不同：

| 模式 | 語意 | 內容超出時 |
|---|---|---|
| `auto` | 高度等於內容 | 不會超出 |
| `1:1` / `4:5` / `16:9` | **鎖死**高度 | 裁切 + 漸層淡出 |
| **`9:16`（新）** | **最小**高度 | **繼續變高，不裁切** |

短推文也能填滿直式畫面（適合限時動態），長推文不會被切掉。

實作上：`minHeight = 量測寬度 × 16 / 9`，不設 `height`。因為不鎖死高度，
`fitFontSize` 與 `MAX_CHARS` 對此模式**不套用額外縮小係數**，行為與 `auto` 相同。

---

## 5. 版面

手機是單欄，不是把桌面版縮小：

- **上方**：卡片預覽，滿版寬度，隨內容變高
- **中段**：主要動作 —— 網址輸入列（含「貼上」按鈕）、「存成圖片」
- **下方**：設定分為四個**可收合分區**，預設全部收合
  1. 背景紙張（色票改為橫向捲動，避免 40 張佔滿畫面）
  2. 畫布與排版
  3. 顯示項目
  4. 隱私

「貼上」按鈕使用 `navigator.clipboard.readText()`，Safari 會顯示一次確認提示。
若不可用則退回讓使用者手動貼進輸入框。

### 存圖

匯出後把 PNG 顯示為一個 `<img>`，並提示「長按圖片 → 加入照片」。
桌面瀏覽器另外顯示下載按鈕（沿用 `downloadBlob`）。

---

## 6. PWA

- `manifest.json`：`display: standalone`、`theme_color`、`background_color`
- `apple-touch-icon`（180×180）與 `apple-mobile-web-app-capable`
- 圖示沿用 `scripts/make-icons.py`，加產 180 與 512 尺寸
- **不做 service worker / 離線快取** —— 核心功能本來就需要網路，離線沒有意義（YAGNI）

---

## 7. 捷徑版本

因網頁支援 `?u=` 參數，捷徑不需自行抓取任何內容，共三個動作：

1. 接收分享的 URL
2. 文字：`https://<網址>/?u=` + 分享的網址（URL 編碼）
3. 開啟網址

先前擔心的「捷徑的取得 URL 內容是否帶 cookie」不再相關 —— 捷徑不抓取。

交付物為**逐步建置說明**（捷徑只能從 iPhone 上的 app 產生 iCloud 連結，無法交付檔案）。

---

## 8. 託管

**GitHub Pages。** 免費、永久，且全程可在瀏覽器完成 —— 註冊、建 repo、
網頁介面上傳、開啟 Pages，不需要 git 或指令列。

排除的選項：
- **Claude artifact** —— 實測其安全政策擋掉所有對外 fetch（測試頁的控制組即因此失敗）
- **本機檔案** —— Safari 禁止 `file://` 頁面 fetch

---

## 9. 錯誤處理

| 情況 | 行為 |
|---|---|
| 網址不是推文連結 | 「這看起來不是推文網址」，不發請求 |
| 404 | 「這則推文已不存在」 |
| 429 | 「X 暫時限制了請求，請稍後再試」 |
| **跨來源被擋** | 「X 已變更存取政策，網頁版暫時無法使用，請改用 Chrome 擴充功能」 |
| 解析不到必填欄位 | 「無法讀取這則推文 —— 若是鎖推帳號，網頁版無法取得，請用 Chrome 擴充功能」 |
| 頭像／圖片抓取失敗 | 沿用既有降級：首字母色塊、隱藏圖位 |

---

## 10. 測試

- **共用模組**：既有測試全部沿用，不得因新增 9:16 而失敗
- **新增**：`fetch.ts` 的錯誤分類（用 mock Response，不打真實網路）
- **新增**：9:16 的最小高度語意（斷言 `minHeight` 有值且 `height` 未設）
- **真瀏覽器**：比例與版面在 dev server 量測驗證
- **僅使用者可驗**：iPhone Safari 的實際抓取、長按存圖手感、加入主畫面行為

---

## 11. 實作順序

1. `9:16` 最小高度模式（改動最小，且是預設值）
2. `web/fetch.ts` 抓取轉接層 + 錯誤分類
3. 行動版外殼與可收合分區
4. PWA manifest 與圖示
5. 建置設定與 GitHub Pages 部署說明
6. 捷徑建置說明
