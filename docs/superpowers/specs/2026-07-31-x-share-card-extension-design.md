# X 推文分享圖產生器 — 設計文件

**日期**：2026-07-31
**專案代號**：xframe（工作名稱，上架前可改）
**狀態**：設計已確認，待撰寫實作計畫

---

## 1. 目標

Chrome 擴充功能。使用者在 X（Twitter）上看到一則推文，點擊推文內嵌的按鈕，開啟側邊編輯器，把該推文渲染成一張帶漂亮背景的分享圖，匯出 PNG。

**終點**：上架 Chrome Web Store，免費。

### 非目標

以下項目明確不做，避免範圍蔓延：

- 整串 thread 合併
- 留言區擷取
- 批次匯出
- 雲端同步、帳號系統
- 付費層
- 多語系（僅繁體中文 + 英文）
- X 以外的平台（Threads、小紅書、微博）
- 上傳自訂背景圖（背景全部由引擎生成，見 §6）

平台擴充透過 adapter 介面預留，但本次不實作。

---

## 2. 已確認的決策

| 決策點 | 結論 | 理由 |
|---|---|---|
| 平台 | 僅 X / Twitter | X 的 DOM 有大量 `data-testid`，抽取穩定性遠高於 Threads |
| 產品定位 | 上架 Chrome Web Store，免費 | 權限從第一天就守紀律 |
| 觸發方式 | 推文內嵌按鈕 → 側邊編輯器 | 摩擦最低，與同類工具一致 |
| 背景來源 | 全程式生成 | 零版權風險、包體不增肥、可無限變體 |
| 擷取範圍 | 單則推文 + 引用推文 | 引用推文在 X 上極常見，成本小 CP 值高 |
| 擷取方式 | 不帶 cookie 抓取推文頁，解析 schema.org microdata | 實測驗證，見 §4.0。取代原本的 React DOM 抓取 |
| 渲染路徑 | DOM 光柵化 | 見 §3 |

### 背景不使用現成桌布圖庫的原因

同類工具（如 ThreadFrame）直接打包 Apple 的 macOS / iOS 官方桌布。對於要上架的擴充功能，這是實質的著作權風險：一旦被檢舉，Chrome Web Store 下架不經申辯。

程式生成的替代方案在效果上不遜色，並額外取得三個優勢：

- 包體約 6–8 KB，對比 33 張 PNG 的 20–50 MB
- 可開放色相 / 亮度調整，使用者能把同一張紙調成自己的色系
- 可「隨機生成」，變體數量無上限

---

## 3. 渲染路徑選擇

| 方案 | 做法 | 評估 |
|---|---|---|
| **A. DOM 光柵化（採用）** | 用真實 HTML/CSS 繪製卡片，`modern-screenshot` 轉 PNG | 預覽即輸出。`backdrop-filter` 毛玻璃、CJK 換行、emoji 全部由瀏覽器免費提供。代價是需處理 canvas 跨域污染 |
| B. Canvas 2D 手繪 | 逐字逐框以 Canvas API 繪製 | 完全可控、無 CORS 問題，但中文斷行、emoji、圓角毛玻璃需自行實作，工作量約 5 倍 |
| C. Satori（HTML→SVG→PNG） | Vercel satori | 輸出穩定，但僅支援 CSS 子集，**不支援 `backdrop-filter`**，等同砍掉核心視覺 |

**採用 A。** B 等同重造瀏覽器排版引擎；C 犧牲了本專案最關鍵的視覺效果。

---

## 4. 架構

### 4.0 擷取策略（2026-07-31 實測後修訂）

**原設計為抓取登入後的 React DOM，已廢棄。** 實測發現更穩健的路徑。

對任一推文 URL 發出**不帶 cookie** 的請求（`fetch(url, { credentials: 'omit' })`），X 回傳伺服器渲染版頁面，內含完整 schema.org microdata：

```html
<article data-tweet-id="…" itemtype="https://schema.org/SocialMediaPosting">
  <meta itemprop="identifier"  content="2083053369351090254">
  <meta itemprop="text"        content="推文全文">
  <meta itemprop="dateCreated" content="2026-07-31T04:53:19.000Z">
  <div itemprop="author" itemtype="https://schema.org/Person">
    <meta itemprop="name"          content="Tibo">
    <meta itemprop="alternateName" content="thsottiaux">
    <meta itemprop="image"         content="https://pbs.twimg.com/profile_images/…_normal.jpg">
  </div>
  <div itemprop="interactionStatistic" itemtype="https://schema.org/InteractionCounter">
    <meta itemprop="interactionType"      content="https://schema.org/LikeAction">
    <meta itemprop="userInteractionCount" content="5840">
  </div>
  <!-- 引用推文為巢狀 article -->
  <article itemprop="citation" itemtype="https://schema.org/SocialMediaPosting">…</article>
</article>
```

已實測確認：

| 項目 | 結果 |
|---|---|
| 未登入 fetch 推文頁 | `200`，microdata 完整 |
| 互動數 | 六種齊全：Likes / Retweets / Quotes / Replies / Views / Follows |
| 引用推文 | 巢狀 `<article itemprop="citation">`，僅一層 |
| 推文圖片 | `<img src="https://pbs.twimg.com/media/…?format=webp&name=medium">` |
| 頭像放大 | `_normal.jpg` → `_400x400.jpg` 回傳 `200 image/jpeg` |
| 不存在的推文 | `404`，無 `article` 節點 |
| 連續 5 次請求 | 全 `200`，每次約 1.5 秒（HTML 約 177 KB） |

**採用此路徑的理由：**

- 因為明確送 `credentials: 'omit'`，登入與否結果一致，不受使用者帳號狀態影響
- microdata 是 X 的 SEO 基礎設施，X 有強烈動機維持其穩定，遠優於混淆過的 React class name
- 資料是結構化的，不需要從畫面文字反解「1141」是回覆數還是讚數
- 測試 fixture 就是一份存檔的 HTML，取得容易、可版控

**代價：** 每次擷取需一次約 1.5 秒的網路請求，編輯器必須有載入狀態。

**殘餘風險：** 若 X 停止對未登入請求提供 microdata，此路徑失效。屆時退化為 §7 的手動編輯模式。不另建第二套 DOM 抓取器（YAGNI）。

### 4.1 模組切分

```
content/
  detector.ts     MutationObserver 監看 timeline，為每則推文注入按鈕
  permalink.ts    ★ 唯一的 DOM 依賴：從推文節點找出 /status/ 永久連結
background/
  fetch-tweet.ts  service worker：不帶 cookie 抓取推文頁 HTML
  asset-proxy.ts  service worker：代抓頭像 / 圖片 → base64
parse/
  microdata.ts    HTML 字串 → TweetData（純函式，可離線測試）
editor/
  panel.tsx       Shadow DOM 側邊欄（Preact）
  store.ts        設定狀態 + chrome.storage 持久化
render/
  backgrounds.ts  背景生成引擎
  card.tsx        卡片模板
  export.ts       modern-screenshot → PNG（2x / 3x）
```

原 `selectors.ts` 從「抽取 12 個欄位」縮減為 `permalink.ts` 的「找出一個 href」，易碎面積大幅下降。

### 4.2 各模組契約

**`permalink.ts`** — 系統唯一的 live DOM 依賴。`findPermalink(el: HTMLElement): string | null`，從推文節點找出 `a[href*="/status/"]` 並正規化為絕對 URL。不得在其他任何檔案出現 X 頁面的 CSS 選擇器。

**`microdata.ts`** — 純函式 `parseTweet(html: string): TweetData | null`。不接觸 `chrome.*` API、不發網路請求、不依賴 live DOM。以 `DOMParser` 解析傳入的 HTML 字串。可用存檔的 HTML fixture 直接單元測試。

**`fetch-tweet.ts`** — service worker。`fetchTweetHtml(url: string): Promise<string>`，必須送 `credentials: 'omit'`。此參數是整個擷取策略的前提，不可省略。

**`asset-proxy.ts`** — 接收 URL 陣列，回傳 base64 data URL 陣列。存在的唯一理由是繞開 canvas 跨域污染。負責頭像 `_normal` → `_400x400` 與圖片 `name=medium` → `name=large` 的網址升級。

**`backgrounds.ts`** — 純函式 `generate(kind, palette, seed): string`，回傳 CSS `background` 值。無 DOM 依賴，可 snapshot 測試。

**`card.tsx`** — 吃 `TweetData` + `CardSettings`，回傳渲染節點。**同時作為預覽與匯出來源**。

**`export.ts`** — 吃 DOM 節點，回傳 PNG Blob。

### 4.3 關鍵約束

**預覽節點本身即為被光柵化的節點。** 預覽與輸出使用同一份 DOM，結構上排除「預覽與下載長得不一樣」這類 bug。

### 4.4 資料流

```
使用者點擊內嵌按鈕
  → permalink.ts 從推文節點取得 /status/ URL
  → editor 立即掛載，顯示載入狀態（此步驟約 1.5 秒，不可無回饋）
  → fetch-tweet.ts 不帶 cookie 抓取該 URL 的 HTML
  → microdata.ts 解析 → TweetData（頭像/圖片欄位為原始 URL）
  → asset-proxy.ts 升級網址並代抓資產，回填 dataUrl
  → card.tsx 即時渲染預覽
  → 使用者調整設定（即時反映）
  → export.ts 對預覽節點光柵化 → 下載 PNG
```

---

## 5. 資料模型

```ts
type Segment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'emoji'; value: string }

type TweetData = {
  id: string
  url: string
  author: {
    name: string
    handle: string
    avatarUrl: string
    avatarDataUrl?: string
  }
  text: Segment[]
  rawText: string
  createdAt: string        // ISO 8601
  stats: {
    replies: number | null
    reposts: number | null
    quotes: number | null
    likes: number | null
    views: number | null
  }
  media: { url: string; dataUrl?: string; alt: string }[]
  quoted?: Omit<TweetData, 'quoted'>   // 不遞迴，僅一層
}
```

`rawText` 為 microdata `itemprop="text"` 的原始字串；`text` 由 `rawText` 經 tokenizer 切成 Segment 陣列，才能對 hashtag / mention / 連結上色。兩者並存是因為匯出檔名與無障礙文字需要純字串。

`stats` 五個欄位對應 microdata 的五種 `interactionType`：`ReplyAction` / `ShareAction` / `InteractAction` / `LikeAction` / `ViewAction`。各欄位可為 `null`：X 在部分情境不提供某些數字，`null` 表示「該值不存在」，與 `0` 語意不同，UI 需區分處理。

**無 `verified` 欄位。** microdata 不提供驗證徽章資訊，不為此單一欄位另建 DOM 抓取路徑。

```ts
type CardSettings = {
  background: { kind: BgKind; palette: string; seed: number }
  padding: number          // 卡片外留白
  fontSize: number
  panelColor: string       // 卡片底板色
  panelOpacity: number     // 卡片底板透明度
  fontFamily: string
  textColor: string
  show: {
    avatar: boolean
    stats: boolean
    timestamp: boolean
    media: boolean
  }
  aspect: 'auto' | '1:1' | '4:5' | '16:9'
  scale: 2 | 3
}
```

`CardSettings` 透過 `chrome.storage.local` 持久化，下次開啟沿用。

`panelColor` + `panelOpacity` 取代深淺主題切換：淺色背景配淺色底板、深色背景配深色底板，由使用者自行決定，不另設 theme 開關。

hashtag、mention、連結三種 segment 使用由 `textColor` 衍生的強調色（同色相、提高彩度），而非獨立設定項。

---

## 6. 背景引擎

五種類型，各搭配八組調色盤：

| 類型 | 實作 |
|---|---|
| `mesh` | 4 個 `radial-gradient` 依 seed 分佈 + 底色漸層 |
| `aurora` | 2 個大橢圓 gradient + 中央光暈，深色底 |
| `wave` | 3 層由下往上堆疊的橢圓 gradient |
| `split` | 硬邊 `linear-gradient` 雙色分割 |
| `grid` | 雙向 `repeating-linear-gradient` 網格 + 底色漸層 |

調色盤：`sunset` / `ocean` / `violet` / `forest` / `candy` / `midnight` / `sand` / `mono`

**顆粒層**：SVG `feTurbulence` 產生的 noise，以 `mix-blend-mode: overlay` 疊加，opacity 約 0.3。這是讓程式漸層擺脫廉價感的關鍵，不可省略。

seed 為整數，配合線性同餘產生器保證同一 seed 輸出穩定 —— 使用者收藏的背景不會在下次開啟時變樣。

5 種類型 × 8 組調色盤 = 40 張預設背景，另加「隨機生成」按鈕（隨機 kind + palette + seed），變體數量無上限。

---

## 7. 錯誤處理

| 情況 | 行為 |
|---|---|
| 找不到永久連結（`permalink.ts` 回傳 null） | 按鈕不注入。使用者不會看到一個按了沒反應的按鈕 |
| fetch 回傳 404（推文已刪除） | 顯示「這則推文已不存在」 |
| fetch 回傳 429（觸發限流） | 顯示「X 暫時限制了請求，請稍後再試」，不自動重試 |
| fetch 網路失敗 | 顯示錯誤 + 「重試」按鈕 |
| 解析不到必填欄位（保護帳號等） | 顯示「無法讀取這則推文」+ 開啟手動編輯模式。**絕不產出殘缺圖** |
| 頭像抓取失敗 | 退化為首字母色塊（monogram） |
| 推文圖片抓取失敗 | 該圖位隱藏，其餘照常渲染 |
| canvas 跨域污染 | 已由 asset-proxy 從架構上排除；若仍發生則降級為無頭像並記錄 |
| 推文過長 | 自動縮字級至下限，仍超出則截斷並加漸層淡出 |
| X 停止提供 microdata | 全面退化為手動編輯模式，不另建 DOM 抓取器 |

必填欄位定義為：`author.name`、`author.handle`、`text`。缺任一者即視為解析失敗。

---

## 8. 權限

```json
{
  "permissions": ["storage"],
  "host_permissions": [
    "*://x.com/*",
    "*://twitter.com/*",
    "*://pbs.twimg.com/*",
    "*://abs.twimg.com/*"
  ]
}
```

不使用 `<all_urls>`、不使用 `tabs`、不接入任何分析或遙測服務。

此配置使隱私權政策得以聲明「不蒐集、不傳輸任何使用者資料」，為過審最順的姿勢。所有處理皆在本機完成。

---

## 9. 測試策略

**解析層（重點）** — 存檔真實 X 推文頁 HTML 作為 fixture，涵蓋：

- 純文字推文
- 含引用推文
- 含單圖 / 多圖
- 長文（超過摺疊閾值）
- 中日韓文字
- 大量 emoji
- 已驗證帳號 / 未驗證帳號
- 部分互動數缺失

fixture 取得方式：`curl` 該推文 URL（不帶 cookie）存成 `.html`。因為與擴充功能實際請求的是同一份資源，fixture 與正式環境無落差。

對每個 fixture 斷言 `parseTweet()` 輸出。此層為 X 改版時的迴歸防線。

**背景引擎** — snapshot 測試，確認同 seed 輸出穩定。

**匯出** — 手動 checklist：CJK 換行正確、emoji 未變豆腐字、2x / 3x 皆清晰、毛玻璃有渲染出來。

---

## 10. 技術選型

- **建置**：Vite + CRXJS
- **UI**：Preact（編輯器面板控制項多，需要響應式；Preact 約 3 KB）
- **樣式隔離**：Shadow DOM，避免 X 全域 CSS 污染面板
- **光柵化**：`modern-screenshot`
- **語言**：TypeScript

---

## 11. 實作順序

§4.0 的實測已消除最大的不確定性 —— 擷取路徑已驗證可行，不再需要試錯。

1. 專案骨架 + fixtures 蒐集
2. 解析層（`microdata.ts`）+ fixtures 測試
3. 背景引擎
4. 卡片模板
5. 匯出 + 資產代理
6. 內容腳本（`permalink.ts` + `detector.ts`）
7. 編輯器面板串接
8. 上架素材（商店截圖、隱私權政策、說明文案）

Chrome Web Store 審核為 1–3 天的等待時間，屬日曆時間而非工時，需計入上線排程。
