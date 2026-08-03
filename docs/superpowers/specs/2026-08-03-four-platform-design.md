# 四平台分享圖卡 — 設計文件

把目前只做 X 的擴充功能與行動網頁，擴到 X / Threads / 微博 / 小紅書四個平台，
共用一份 codebase、一個擴充功能、一個行動網頁。

本文所有「實測」數字都是 2026-08-03 當天實際發出請求量到的，不是推估。

---

## 目標

- **一個 Chrome 擴充功能**，四個平台都能用。
- **一個行動網頁**，能力範圍由技術邊界決定（見下節），不假裝四個都行。
- 卡片的視覺語言、背景引擎、匯出流程四個平台共用。

## 非目標

- 不做留言擷取。
- 不做影片，輪播中的影片只取封面圖。
- 不做私人／鎖定帳號的自動擷取（那些內容對未登入請求本來就不存在）。
- 不為了讓行動網頁支援微博／小紅書而在伺服器上存放使用者的登入 cookie。

---

## 擷取矩陣

這張表是整份設計的地基。每一格都經過實測。

| 平台 | Chrome 擴充 | 行動網頁 |
| --- | --- | --- |
| X | 免 cookie 抓 HTML → microdata（+ `<title>` 補全文） | 同左，瀏覽器直接抓 |
| Threads | 讀已登入頁面的 DOM | 經 Cloudflare Worker 代理 |
| 微博 | 讀已登入頁面的 DOM | **不支援** |
| 小紅書 | 讀已登入頁面的 DOM | **不支援** |

### 實測證據

**X — `x.com` 反射 Origin。**

```
$ curl -sI -H "Origin: https://example.com" https://x.com/jack/status/20
access-control-allow-origin: https://example.com
```

行動網頁能直接抓 X，靠的是這個。不是預設行為，是 X 允許的，可能被收回 ——
`web/fetch.ts` 已有 `cors` 錯誤分類承接這種情況。

**X — 不改用 `cdn.syndication.twimg.com`。**

該端點回乾淨 JSON、`text` 不受 microdata 的 200 字截斷影響，看起來比解析 HTML
漂亮，但兩個理由排除它：

1. `access-control-allow-origin: https://platform.twitter.com` —— 寫死單一來源，
   不是反射。瀏覽器頁面呼叫不到，行動網頁用不了。
2. 統計數據是殘的。實測一則推文：`favorite_count: 2769`、`conversation_count: 270`，
   而 `reply_count` / `retweet_count` / `quote_count` / `view_count` **全部是 `null`**。
   卡片上四個數字會剩兩個。

microdata 那條路要多配一段 `<title>` 補全文，但五個數字都拿得到。維持現狀。

**Threads — 內容綁 User-Agent，且完全不回 CORS。**

| UA | 回應 |
| --- | --- |
| 一般瀏覽器 | 260 KB JS 空殼，`<title>Threads</title>`，零個 og 標籤 |
| `facebookexternalhit/1.1` | 568 KB，**有** og 標籤，**沒有**內嵌 JSON |
| `Googlebot/2.1` | 568 KB，有 og 標籤，**有**內嵌 JSON |

`/embed` 端點也是同一份空殼，換它沒有用。且 `threads.com` 的回應不含任何
`access-control-allow-origin`，瀏覽器頁面一律拿不到 —— 這不是反爬強度的問題，
是瀏覽器根本不會把回應交給 JS。**行動網頁上 Threads 必須經代理，沒有第二條路。**

**微博 / 小紅書 — 擋的是 session 與簽章，代理解不掉。**

```
$ curl -A "<iPhone UA>" https://m.weibo.cn/api/container/getIndex?containerid=102803
HTTP 432                                  # 反爬攔截，要 visitor cookie

$ curl -A "<Chrome UA>" https://www.xiaohongshu.com/explore/<id>
302 → /404/sec_<token>?source=xhs_sec_server   # 安全牆
```

兩者都不回 CORS 標頭。與 Threads 的差別是關卡的性質：Threads 擋 UA，換個 UA 就過，
內容本來就是公開給連結預覽用的；這兩家擋的是登入態與請求簽章，代理沒有使用者的
session，而且 Cloudflare 出口是機房 IP，在它們眼裡比住宅 IP 更可疑。

要讓代理過去只有一途：把真實登入 cookie 放上伺服器。那台機器就會持有使用者的
微博與小紅書帳號，cookie 過期即全面停擺，且明確違反對方條款。**不做。**

因此行動網頁支援 X 與 Threads，不支援微博與小紅書。這不是取捨，是邊界。

---

## Threads 代理（既有）

實作已存在於 `gariber/threadframe-web` 的 `worker/`，單檔、零相依、184 行。
完整介面規格見該 repo 的 `worker/API.md`，本節只記錄整合時需要知道的部分。

**端點**：三個，全部 `GET`，同一路徑以 query 區分。

| | 用途 | 回應 |
| --- | --- | --- |
| `GET /` | 健康檢查 | `{ ok: true, usage: "…" }` |
| `GET /?url=` | 取貼文 | JSON（見下）、`access-control-allow-origin: *`、`cache-control: max-age=300` |
| `GET /?img=` | 圖片代理 | 圖片本體、CORS 標頭、`max-age=86400` |

**回傳欄位**：`url / username / name / verified / avatar / text / takenAt /
likes / replies / reposts / shares / images[]`。數值欄位在來源缺該欄時是 `null`
而不是 `0`。`images[]` 最多 4 張。

**錯誤碼**：`bad_url`(400) / `not_threads`(400) / `host_not_allowed`(403) /
`not_found`(404) / `method_not_allowed`(405) / `upstream`(502)。

**`?img=` 是必要的，不是便利設施。** `cdninstagram.com` 不回 CORS，前端直接載入
會污染 canvas，匯出時 `toBlob` 丟 `SecurityError`。前端還必須設
`img.crossOrigin = "anonymous"`，否則有 CORS 標頭也一樣會被污染。這與擴充功能版
用背景 service worker 代抓轉 base64 是同一個問題的兩種解法。

**部署位址不寫死**，前端存在 `localStorage` 的 `threadframe.worker`。合併後沿用
這個做法：Worker 位址是使用者設定，不是編譯期常數。

### 對 `API.md` 的兩處修正

整合時實測與該文件不一致，以實測為準：

1. **`facebookexternalhit` 不會被導向登入頁。** 實測回 200、最終網址就是貼文網址、
   og 標籤完整含貼文內文，568 KB。該文件說它「會被導向登入頁，不可用」。
   結論仍然正確（它確實沒有內嵌 JSON，`thread_items` / `caption` 皆為 0），
   但理由是錯的，而這個差別有用途 —— 見下一點。
2. **存在一層可用的降級來源。** Googlebot 若哪天失效，`facebookexternalhit` 仍能
   取得 og 標籤，足以組出作者、內文與單張圖，只是拿不到互動數。這比直接回
   `not_found` 好。Worker 可加這層降級，並在回應中標記資料不完整。

`API.md` 另有一句「X 有公開的輕量 JSON 端點可讓瀏覽器直接呼叫」，該端點
（`cdn.syndication.twimg.com`）的 CORS 寫死 `platform.twitter.com`，瀏覽器呼叫不到。
行動網頁抓 X 靠的是 `x.com` HTML 反射 Origin。

### 未解的營運問題

Worker **沒有 rate limit** —— 沒有計數、配額或驗證，任何知道網址的人都能呼叫。
保護只有兩道主機白名單。目前位址由使用者自行填入尚可接受；一旦隨擴充功能或
網頁散布一個預設位址，就必須先加上限流。這是上線前的阻擋項，不是待辦事項。

---

## 資料模型

`TweetData` 改名為 `Post` 並泛化。改動集中在四處：

```ts
export type Platform = 'x' | 'threads' | 'weibo' | 'xhs'

export type MetricKind =
  | 'views' | 'replies' | 'reposts' | 'quotes' | 'likes' | 'bookmarks' | 'shares'

export type Metric = { kind: MetricKind; value: number | null }

export type Post = {
  platform: Platform
  id: string
  url: string
  author: Author        // 見下：handle 的呈現交給 adapter
  title?: string        // 小紅書筆記標題，與內文分屬兩段
  rawText: string
  text: Segment[]
  textComplete: boolean // 見下
  createdAt: string
  metrics: Metric[]     // 有序，由 adapter 決定放哪幾個、什麼順序
  media: Media[]
  source: PostSource
  quoted?: Omit<Post, 'quoted'>
}
```

**`metrics` 從固定五欄改為有序陣列。** 現行 `Stats` 是寫死的
`{replies, reposts, quotes, likes, views}`，`Card.tsx` 的統計列也把 X 的四個圖示
與標籤硬編在裡面。小紅書的**收藏**在這個結構裡沒有位置，而那是它最重要的指標；
Threads 有 `shares` 而 X 沒有。改成有序陣列後，各平台放什麼、順序如何，由 adapter
決定，Card 只負責畫。`MetricKind` 對應到圖示表，缺圖示的 kind 在建置期就會被
type 抓到。

**`textComplete` 是新的，而且必要。** Card 目前已有一種截斷：`maxCharsFor(aspect)`
判斷內容塞不塞得進所選比例，塞不下就套漸層淡出。那是**版面截斷** —— 全文我們有，
只是這個比例放不下，使用者換個比例就解決。另一種是**來源截斷** —— 全文根本沒拿到，
換什麼比例都救不回來。兩者在卡片上都表現為「文字沒了」，混在同一個布林裡，
使用者會一直調比例卻永遠調不出全文。

來源截斷在四個平台都會發生：

| 情境 | 成因 |
| --- | --- |
| X 引用推文超過 200 字 | 一份文件只有一個 `<title>`，它描述主推文；引用推文無從補全（`microdata.ts:190-191` 已註明） |
| 微博長微博 | DOM 預設收合在「展开」後 |
| 小紅書長筆記 | 同上 |
| Threads | Worker 取自內嵌 JSON，目前未觀察到截斷 |

因為 `quoted` 的型別是 `Omit<Post, 'quoted'>`，引用貼文自動帶有自己的
`textComplete` —— 正好對上「主推文完整、引用推文截斷」這個 X 實際會出現的組合。

微博與小紅書的 adapter 在讀 DOM 前**先點掉「展开」**（content script 在頁面內，
可直接觸發），成功即 `textComplete: true`。這是 DOM 路徑相對於免 cookie 抓取
唯一的優勢，該用。

**`Author` 的 handle 呈現交給 adapter。** 現行 `Card.tsx` 把 `@` 前綴寫死。
微博沒有公開 handle，小紅書是「小红书号」，兩者都不該掛 `@`。改為 adapter 產出
`handleDisplay: string`（已含前綴或為空字串），Card 原樣輸出。

**`PostSource`** 沿用現行 `TweetSource` 的語意並擴充：`'fetch' | 'proxy' | 'dom' | 'manual'`。
它一路影響 UI —— 現行邏輯是來源為 DOM 時顯示傳播範圍提醒、身分遮蔽預設開啟，
這個行為保留並套用到微博與小紅書。

---

## Adapter 介面

每個平台一份，是整個設計裡唯一與平台相關的地方。

```ts
export type Adapter = {
  platform: Platform
  /** manifest host_permissions 與執行期比對共用的同一份來源 */
  hosts: string[]
  /** content script：在頁面上找出可產卡的貼文與注入按鈕的位置 */
  findPermalinks(root: ParentNode): { url: string; anchor: Element }[]
  /** 取得貼文。實作可為免 cookie 抓取、經代理、或讀當前 DOM */
  acquire(url: string, ctx: AcquireContext): Promise<Post>
  /** 這個平台在行動網頁上是否可用 */
  web: boolean
}
```

四份實作：

| adapter | `acquire` | `web` |
| --- | --- | --- |
| `x` | 免 cookie 抓 HTML → microdata → `<title>` 補全文；失敗降級讀 DOM | `true` |
| `threads` | 擴充：讀 DOM。網頁：呼叫 Worker | `true` |
| `weibo` | 展開「展开」→ 讀 DOM | `false` |
| `xhs` | 展開「展开」→ 讀 DOM | `false` |

行動網頁的建置只註冊 `web: true` 的 adapter，微博與小紅書的程式碼不進 web bundle。

### 圖片與 canvas 污染

四個平台共通的約束：跨來源圖片會污染 canvas，匯出整個失敗。現行做法是背景
service worker 代抓轉 base64（`src/background/asset-proxy.ts`），對 X 有效。
另外兩個平台有額外條件：

- **微博的 `*.sinaimg.cn` 檢查 Referer。** 背景 worker 發出的請求沒有正確 Referer
  會被擋。解法是改由 content script 抓（頁面 origin 即 weibo.com，Referer 天然正確），
  或用 `declarativeNetRequest` 補上。實作時先試 content script，那條路不需要新權限。
- **小紅書的 `*.xhscdn.com`** 同樣要驗證，做法比照。

---

## 渲染

`Card.tsx` 拆成兩層。

**`CardShell`** —— 平台無關，承接目前所有難的部分：畫布、程式生成背景、顆粒疊層、
比例量測與定值高度、面板縮放、溢出漸層淡出。這些是實測踩出來的（`Card.tsx` 裡
關於 `aspect-ratio` 與量測互相打架的那段註解、`fitFontSize` 的 CJK 加權、
`offsetWidth` 而非 `getBoundingClientRect` 的理由），**只能有一份，不得複製**。

**版型** —— 掛在 shell 裡的面板內容：

- `TextLayout`：現行版型。作者列 → 內文 → 圖片格 → 引用 → 時間 → 統計列。
  X / Threads / 微博的預設。
- `MediaLayout`：首圖置頂大圖，下接標題、內文、統計列。小紅書的預設。
  帶圖的微博與推文也能切換過來用。

版型是設定項而非平台屬性 —— 任何平台都能切換，只是各平台預設不同。兩種版型都
必須通過同一組比例（`auto` / `1:1` / `4:5` / `9:16`）與溢出處理的測試。

**統計列**改為走 `metrics` 陣列渲染，圖示由 `MetricKind` 查表。現行的 K/M 縮寫、
`tabular-nums`、`nowrap`、中點分隔全部保留。

**來源截斷的呈現**與版面截斷分開：版面截斷維持漸層淡出；`textComplete === false`
時在內文末尾加明確標記與一行低對比說明，讓使用者知道這裡調比例沒有用。

---

## 逃生口

微博與小紅書的 DOM 路徑會週期性壞掉 —— 對方改一次 class name 就壞。這是平台
決定的，不是架構選錯，設計上要正面承接而不是假裝不會發生。

現有的**手動編輯模式**（`src/editor/manual.ts`）在這兩個平台上升格為一等公民：
擷取失敗時直接開啟手動輸入，而不是顯示錯誤後讓使用者自己找入口。Threads 的
Worker 回 `not_found` 時（Meta 改版）同樣走這條路。

---

## 隱私與上架

**擴充功能不經 Worker。** `PRIVACY.md` 宣告全本機處理、零遙測，商店的資料用途
全部勾「不蒐集」，且 XFrame 已送審。讓擴充改走 Worker，等於那台機器會看到使用者
每一則想做成卡片的貼文網址，上述宣告全部作廢，必須重新送審。而擴充在四個平台上
本來就不需要代理 —— 使用者按按鈕時人就在該平台的登入頁上。Worker 只服務行動網頁的
Threads 一條路徑。

**行動網頁必須明講。** 啟用 Worker 後資料不再完全留在裝置上，貼文連結會送到該服務。
`API.md` 已記載這點，行動網頁的說明也要寫清楚。

**新增的 host_permissions**：`*://weibo.com/*`、`*://m.weibo.cn/*`、
`*://www.xiaohongshu.com/*`、`*://www.threads.com/*`、`*://www.threads.net/*`，
以及對應的圖片 CDN。`test/manifest.dist.test.ts` 直接檢查建置產物的權限，
新增後該測試要同步更新 —— 它存在的目的是擋住 `@crxjs/vite-plugin`（目前釘在 beta）
注入非預期權限，不能因為擴充平台就放寬。

**名稱**：`SUBMISSION.md` 已記錄「XFrame」使用 X 商標的風險。四平台版本不只做 X，
這個名字更站不住腳。商店策略本輪不決定，但實作時 manifest 的 `name` 應抽成單一
常數，改名時只動一處。

---

## 分階段

三階段，每一階段結束時擴充與行動網頁都應是可用狀態。

1. **抽象化，不新增平台。** `TweetData` → `Post`、adapter 介面、`CardShell` 拆分、
   `metrics` 陣列、`textComplete`。只有 `x` 一份 adapter。現有 286 個測試全綠是
   這一階段的驗收標準 —— 抽象若正確，行為不該有任何改變。
2. **Threads。** 擴充讀 DOM，行動網頁接 Worker（含位址設定 UI 與健康檢查）。
   第一次驗證 adapter 介面能同時容納 DOM 與代理兩種擷取。
3. **微博與小紅書。** 兩份 DOM adapter、`MediaLayout`、「展开」展開邏輯、
   圖片 Referer 處理、手動編輯模式升格。

先做階段 1 而不是直接加平台，理由是抽象的正確性只有在既有行為不變的前提下才驗證得了。
若把新平台與重構混在一起，測試變紅時分不出是抽象錯了還是新平台的擷取寫錯。

---

## 待決

- Worker 的 rate limit（上線前阻擋項，見上）。
- 商店策略與最終名稱。
- Worker 是否加上 `facebookexternalhit` 降級層。
