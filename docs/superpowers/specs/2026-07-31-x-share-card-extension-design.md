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

### 4.1 模組切分

```
content/
  detector.ts     MutationObserver 監看 timeline，為每則推文注入按鈕
  selectors.ts    ★ 所有 X DOM 選擇器集中於此，系統唯一的易碎點
  extractor.ts    DOM → TweetData（純函式，可離線測試）
background/
  asset-proxy.ts  service worker 代抓頭像 / 圖片 → base64
editor/
  panel.tsx       Shadow DOM 側邊欄（Preact）
  store.ts        設定狀態 + chrome.storage 持久化
render/
  backgrounds.ts  背景生成引擎
  card.tsx        卡片模板
  export.ts       modern-screenshot → PNG（2x / 3x）
```

### 4.2 各模組契約

**`selectors.ts`** — 匯出具名選擇器常數與 fallback 鏈。X 改版時，修改集中在此單一檔案。不得在其他任何檔案出現 CSS 選擇器字串。

**`extractor.ts`** — 純函式 `extract(el: HTMLElement): TweetData | null`。不接觸 `chrome.*` API、不發網路請求。可用存檔的 HTML fixture 直接單元測試。

**`asset-proxy.ts`** — 唯一接觸網路的模組。接收 URL 陣列，回傳 base64 data URL 陣列。存在的唯一理由是繞開 canvas 跨域污染。

**`backgrounds.ts`** — 純函式 `generate(kind, palette, seed): string`，回傳 CSS `background` 值。無 DOM 依賴，可 snapshot 測試。

**`card.tsx`** — 吃 `TweetData` + `CardSettings`，回傳渲染節點。**同時作為預覽與匯出來源**。

**`export.ts`** — 吃 DOM 節點，回傳 PNG Blob。

### 4.3 關鍵約束

**預覽節點本身即為被光柵化的節點。** 預覽與輸出使用同一份 DOM，結構上排除「預覽與下載長得不一樣」這類 bug。

### 4.4 資料流

```
使用者點擊內嵌按鈕
  → extractor 從 article 節點抽出 TweetData（頭像/圖片欄位為原始 URL）
  → 送 background service worker 代抓資產，回填 dataUrl
  → editor 掛載側邊欄，card.tsx 即時渲染預覽
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
  author: {
    name: string
    handle: string
    avatarUrl: string
    avatarDataUrl?: string
    verified: boolean
  }
  text: Segment[]
  createdAt: string
  stats: {
    replies: number | null
    reposts: number | null
    likes: number | null
    views: number | null
    bookmarks: number | null
  }
  media: { url: string; dataUrl?: string; alt: string }[]
  quoted?: Omit<TweetData, 'quoted'>   // 不遞迴，僅一層
}
```

`text` 採分段結構而非純字串，才能對 hashtag / mention / 連結上色。

`stats` 各欄位可為 `null`：X 在部分情境不顯示某些數字，`null` 表示「該值不存在」，與 `0` 語意不同，UI 需區分處理。

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
| 抽取不到必填欄位（作者名 / 內文） | 顯示「抓取失敗」橫幅 + 開啟手動編輯模式。**絕不產出殘缺圖** |
| 頭像抓取失敗 | 退化為首字母色塊（monogram） |
| 推文圖片抓取失敗 | 該圖位隱藏，其餘照常渲染 |
| canvas 跨域污染 | 已由 asset-proxy 從架構上排除；若仍發生則降級為無頭像並記錄 |
| 推文過長 | 自動縮字級至下限，仍超出則截斷並加漸層淡出 |
| X 改版導致大面積抽取失敗 | 修改集中於 `selectors.ts` |

必填欄位定義為：`author.name`、`author.handle`、`text`。缺任一者即視為抽取失敗。

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

**抽取層（重點）** — 存檔真實 X 頁面 HTML 作為 fixture，涵蓋：

- 純文字推文
- 含引用推文
- 含單圖 / 多圖
- 長文（超過摺疊閾值）
- 中日韓文字
- 大量 emoji
- 已驗證帳號 / 未驗證帳號
- 部分互動數缺失

對每個 fixture 斷言 `extract()` 輸出。此層為 X 改版時的迴歸防線。

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

抽取層排第一。它是全系統唯一有真實不確定性的部分 —— X 的 DOM 結構必須對照實際頁面驗證，不能憑推測撰寫。不確定性應盡早暴露。

1. 抽取層 + fixtures 測試
2. 背景引擎
3. 卡片模板
4. 編輯器面板
5. 匯出 + CORS 代理
6. 上架素材（商店截圖、隱私權政策、說明文案）

Chrome Web Store 審核為 1–3 天的等待時間，屬日曆時間而非工時，需計入上線排程。
