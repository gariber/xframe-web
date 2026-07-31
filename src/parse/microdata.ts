import type { TweetData, Stats, Author } from '../types'

const INTERACTION: Record<string, keyof Stats> = {
  'https://schema.org/ReplyAction': 'replies',
  'https://schema.org/ShareAction': 'reposts',
  'https://schema.org/InteractAction': 'quotes',
  'https://schema.org/LikeAction': 'likes',
  'https://schema.org/ViewAction': 'views',
}

/** 從推文永久連結取出數字 ID。 */
export function extractTweetId(url: string): string | null {
  return url.match(/\/status\/(\d+)/)?.[1] ?? null
}

/**
 * `:scope > [itemprop="..."]` 的等效實作。
 *
 * happy-dom（測試環境）目前不支援 `:scope` combinator ——
 * `el.querySelectorAll(':scope > [itemprop="x"]')` 一律回傳空集合，即使在
 * 最小合成的 DOM 上也一樣。真實瀏覽器（本模組實際執行的 service worker /
 * page context）support 良好，但我們不能讓正確性依賴測試環境剛好不會走到
 * 的路徑，所以在兩邊都用「只看直接子元素」的手刻版本取代 `:scope >`，
 * 語意完全相同、且不受環境差異影響。
 *
 * 這正是本檔案存在的理由：外層推文與巢狀的引用推文（citation article）、
 * 以及作者卡片內巢狀的追蹤者統計，都必須被嚴格限制在「直接子層」，否則
 * 讚數/瀏覽數等欄位會被巢狀節點的同名 itemprop 污染。
 */
function directChildren(root: Element, prop: string): Element[] {
  return [...root.children].filter((el) => el.getAttribute('itemprop') === prop)
}

function directChild(root: Element, prop: string): Element | null {
  return directChildren(root, prop)[0] ?? null
}

/** 取得直接子層的 microdata 屬性值。避免抓到引用推文的欄位。 */
function metaOf(root: Element, prop: string): string | null {
  return directChild(root, prop)?.getAttribute('content') ?? null
}

function parseAuthor(article: Element): Author | null {
  const a = directChild(article, 'author')
  if (!a) return null
  const name = metaOf(a, 'name')
  const handle = metaOf(a, 'alternateName')
  if (!name || !handle) return null
  return { name, handle, avatarUrl: metaOf(a, 'image') ?? '' }
}

function parseStats(article: Element): Stats {
  const stats: Stats = {
    replies: null, reposts: null, quotes: null, likes: null, views: null,
  }
  // 直接子層過濾至關重要：作者的追蹤者統計巢狀在 author 節點之下，不可混入
  for (const block of directChildren(article, 'interactionStatistic')) {
    const type = block.querySelector('[itemprop="interactionType"]')?.getAttribute('content')
    const count = block.querySelector('[itemprop="userInteractionCount"]')?.getAttribute('content')
    const key = type ? INTERACTION[type] : undefined
    if (key && count !== null && count !== undefined && count !== '') {
      const n = Number(count)
      if (Number.isFinite(n)) stats[key] = n
    }
  }
  return stats
}

/** 解析單一 article 節點。不含引用推文與圖片，由 Task 4 補上。 */
export function parseArticle(article: Element): Omit<TweetData, 'quoted' | 'media' | 'text'> | null {
  const author = parseAuthor(article)
  const rawText = metaOf(article, 'text')
  const id = metaOf(article, 'identifier') ?? article.getAttribute('data-tweet-id')
  if (!author || rawText === null || !id) return null

  return {
    id,
    url: metaOf(article, 'url') ?? `https://x.com/${author.handle}/status/${id}`,
    author,
    rawText,
    createdAt: metaOf(article, 'dateCreated') ?? metaOf(article, 'datePublished') ?? '',
    stats: parseStats(article),
  }
}

/**
 * 移除 `<script>` 與 `<link>` 標籤後再交給 DOMParser。
 *
 * X 的真實頁面內嵌了會操作 `document.currentScript` 的 inline script，以及
 * 會觸發字型/樣式表下載的 `<link rel="preload"|"stylesheet">`。規格上
 * DOMParser 產生的文件應該是 inert（script 不執行），但 happy-dom（測試
 * 環境）並未如此實作，執行到 `document.currentScript.remove()` 時會因
 * `currentScript` 為 null 而拋錯；`<link rel="stylesheet">` 則會觸發實際
 * 網路請求，在這台機器的假 DNS 環境下非同步失敗，污染測試輸出。
 *
 * 這兩種標籤都不承載任何 microdata（itemprop 只出現在 `<meta>` 與
 * `<div>`），移除它們對解析結果沒有影響，卻讓本模組在真實瀏覽器與
 * happy-dom 下行為一致、且是純字串操作，不引入任何環境依賴。
 */
function sanitize(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
}

export function parseTweet(html: string, tweetId: string): TweetData | null {
  if (!html) return null
  // tweetId 一律是 extractTweetId 用 \d+ 擷取出的純數字字串，放進雙引號屬性選擇器
  // 本來就安全（不含引號或反斜線），不需要 CSS.escape。實測發現 happy-dom 對
  // CSS.escape 產生的識別碼跳脫序列（例如純數字字串會被轉成 `\32 083...`）在
  // 引號屬性值裡解析錯誤，選擇器完全比對不到（0 筆），所以改用純數字守衛 + 原樣
  // 內插，這比未經檢查的內插更安全，也避開了這個 happy-dom 限制。
  if (!/^\d+$/.test(tweetId)) return null
  const doc = new DOMParser().parseFromString(sanitize(html), 'text/html')
  const article = doc.querySelector(
    `article[data-tweet-id="${tweetId}"][itemtype="https://schema.org/SocialMediaPosting"]`,
  )
  if (!article) return null

  const base = parseArticle(article)
  if (!base) return null

  return { ...base, text: [], media: [] }
}
