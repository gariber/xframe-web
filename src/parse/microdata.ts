import type { Post, Metric, MetricKind, Author, Media } from '../types'
import { tokenize } from './tokenize'

const INTERACTION: Record<string, MetricKind> = {
  'https://schema.org/ReplyAction': 'replies',
  'https://schema.org/ShareAction': 'reposts',
  'https://schema.org/LikeAction': 'likes',
  'https://schema.org/ViewAction': 'views',
}

/**
 * X 的卡片統計列順序。與 x.com 網頁本身的排列一致。
 *
 * schema.org 還提供 InteractAction（引用數），但卡片從未顯示它，因此不解析 ——
 * 解析了卻永遠不顯示的欄位只會讓人以為它有用。要加回來的話，MetricKind、
 * METRIC_META、INTERACTION、這個陣列四處一起補。
 */
const X_METRIC_ORDER: readonly MetricKind[] = ['views', 'replies', 'reposts', 'likes']

/** 從推文永久連結取出數字 ID。 */
export function extractTweetId(url: string): string | null {
  return url.match(/\/status\/(\d+)/)?.[1] ?? null
}

/**
 * 解一層 HTML 實體。
 *
 * X 的 `<meta itemprop="text">` 是雙重編碼的：屬性本身被解析器解過一次之後，
 * 內容裡仍然留著 `&amp;`。實測 `担任MAS&amp;Head of growth` 這則推文，
 * 同一份文字在 `<title>` 裡是正確的 `MAS&Head`。不解這一層，卡片上就會照
 * 字面印出 `&amp;`。
 *
 * 不用 DOMParser 解：那會把文字裡的 `<b>` 之類當成標籤處理，而這裡要的是
 * 純粹的字元轉換。`&amp;` 必須放在最後 —— 先解它的話，`&amp;lt;`（作者本人
 * 打出的 `&lt;` 字樣）會被連續解成 `<`，多解了一層。
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * 去掉尾端一個 t.co 短網址。
 *
 * 推文附了圖片或引用了另一則推文時，X 會在原始內文後面自動接一個指向該附件
 * 的 t.co 連結 —— 那不是作者打的字，X 自己的介面也不顯示它。
 *
 * 實測 22 則推文（4 個帳號）：`<meta itemprop="text">` 尾端出現 t.co 的次數是
 * 0，`<title>` 是 6；而在 13 則未被截斷的推文上，把 title 的尾端 t.co 去掉後
 * 與 meta 完全相同。也就是說「顯示用文字不含尾端 t.co」是 X 自己的規則，
 * 這裡只是照做。
 */
export function stripTrailingLink(s: string): string {
  return s.replace(/\s*https:\/\/t\.co\/\w+\s*$/, '')
}

/** `<title>` 的固定格式：`{顯示名稱} on X: "{完整內文}" / X` */
const TITLE_SUFFIX = '" / X'

/**
 * 從 `<title>` 取回完整內文。
 *
 * 為什麼需要這條路：X 把 `<meta itemprop="text">` 截在約 200 字。實測那則
 * AGI Bar 的推文 meta 只有 199 字（斷在「填到 Claude」），實際內文 538 字；
 * 另一則 meta 277 字、實際 1060 字。`articleBody` 也一樣被截，只是斷點不同。
 * 完整內文只存在於 `<title>`，以及 article 內一個沒有任何 itemprop 或
 * data-testid 的 span —— 後者的選擇器（`article > div > div > div > div`）
 * 太脆弱，X 改版就會壞掉且無聲無息。
 *
 * 安全條件是 `startsWith`：只有當 title 取出的字串確實是 meta 的延長時才採用。
 * meta 是結構化資料、可信但不完整；title 是慣例格式、完整但沒有保證。要求後者
 * 以前者開頭，等於用可信的那份去驗證另一份 —— X 哪天改了 title 格式，這裡會
 * 安靜地退回 meta 的內容（短，但正確），而不是把標題列的雜訊當成推文印出去。
 *
 * 實測 22 則全部通過這個檢查。
 */
export function fullTextFromTitle(
  title: string,
  authorName: string,
  metaText: string,
): { text: string; fromTitle: boolean } {
  const prefix = `${authorName} on X: "`
  if (!title.startsWith(prefix) || !title.endsWith(TITLE_SUFFIX)) {
    return { text: metaText, fromTitle: false }
  }
  const candidate = stripTrailingLink(title.slice(prefix.length, -TITLE_SUFFIX.length))
  return candidate.startsWith(metaText)
    ? { text: candidate, fromTitle: true }
    : { text: metaText, fromTitle: false }
}

/**
 * meta itemprop="text" 被視為可能截斷的長度下界。
 *
 * X 截在約 200 字，但不是精確值 —— 實測有 199 與 277 兩種。取 190 作為下界，
 * 寧可把剛好夠長的完整推文誤標為不確定，也不要把截斷的推文標成完整：前者
 * 只是多一行提示，後者是騙人。
 *
 * 主推文幾乎總能從 title 補回全文（實測 22 則全通過），所以這條路實際上
 * 只服務引用推文 —— 那是唯一沒有第二份來源可以驗證的地方。
 */
const META_TRUNCATION_FLOOR = 190

function looksComplete(text: string, fromTitle: boolean): boolean {
  return fromTitle || text.length < META_TRUNCATION_FLOOR
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
  // 只對顯示用文字解實體。帳號是 [\w]+ 不可能含實體，頭像網址解了反而可能
  // 改壞查詢字串。
  return {
    name: decodeEntities(name),
    handle,
    handleDisplay: '@' + handle,
    avatarUrl: metaOf(a, 'image') ?? '',
  }
}

function parseMetrics(article: Element): Metric[] {
  const found = new Map<MetricKind, number>()
  // 直接子層過濾至關重要：作者的追蹤者統計巢狀在 author 節點之下，不可混入
  for (const block of directChildren(article, 'interactionStatistic')) {
    const type = block.querySelector('[itemprop="interactionType"]')?.getAttribute('content')
    const count = block.querySelector('[itemprop="userInteractionCount"]')?.getAttribute('content')
    const kind = type ? INTERACTION[type] : undefined
    if (kind && count) {
      const n = Number(count)
      if (Number.isFinite(n)) found.set(kind, n)
    }
  }
  // 依固定順序輸出，而非依 DOM 中出現的順序 —— 後者會讓卡片的統計列順序
  // 隨 X 的標記變動而改變。
  return X_METRIC_ORDER.map((kind) => ({ kind, value: found.get(kind) ?? null }))
}

/**
 * 取得屬於此 article 的圖片。
 * `img.closest('article') === article` 是正確歸屬的關鍵：若圖片位於巢狀的
 * 引用推文內，其最近的 article 祖先會是引用推文而非外層推文。
 */
function parseMedia(article: Element): Media[] {
  return [...article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')]
    .filter((img) => img.closest('article') === article)
    .map((img) => ({
      url: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
    }))
    .filter((m) => m.url !== '')
}

/**
 * 解析單一 article 節點。不含引用推文與圖片。也不含 textComplete —— 這一層
 * 拿不到 title（截斷判斷需要它），由兩個呼叫點各自依自己的情境補上。
 */
function parseArticle(article: Element): Omit<Post, 'quoted' | 'media' | 'text' | 'textComplete'> | null {
  const author = parseAuthor(article)
  const raw = metaOf(article, 'text')
  const rawText = raw === null ? null : decodeEntities(raw)
  const id = metaOf(article, 'identifier') ?? article.getAttribute('data-tweet-id')
  if (!author || rawText === null || !id) return null

  return {
    id,
    url: metaOf(article, 'url') ?? `https://x.com/${author.handle}/status/${id}`,
    platform: 'x',
    author,
    // 這個模組只解析公開頁面的 schema.org microdata，資料來源永遠是 fetch
    // （不帶 cookie 的公開抓取）。DOM 降級路徑由 content/dom-fallback 負責，
    // 不會經過這裡。
    source: 'fetch',
    rawText,
    createdAt: metaOf(article, 'dateCreated') ?? metaOf(article, 'datePublished') ?? '',
    metrics: parseMetrics(article),
  }
}

export function parseTweet(html: string, tweetId: string): Post | null {
  if (!html) return null
  // tweetId 一律是 extractTweetId 用 \d+ 擷取出的純數字字串，放進雙引號屬性選擇器
  // 本來就安全（不含引號或反斜線），不需要 CSS.escape。實測發現 happy-dom 對
  // CSS.escape 產生的識別碼跳脫序列（例如純數字字串會被轉成 `\32 083...`）在
  // 引號屬性值裡解析錯誤，選擇器完全比對不到（0 筆），所以改用純數字守衛 + 原樣
  // 內插，這比未經檢查的內插更安全，也避開了這個 happy-dom 限制。
  if (!/^\d+$/.test(tweetId)) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = doc.querySelector(
    `article[data-tweet-id="${tweetId}"][itemtype="https://schema.org/SocialMediaPosting"]`,
  )
  if (!article) return null

  const base = parseArticle(article)
  if (!base) return null

  // 只有主推文能從 title 補回完整內文：一份文件只有一個 <title>，而它描述的
  // 是主推文。引用推文的內文若超過 200 字仍會是截斷的 —— 這是這個資料來源
  // 的極限，不是可以在這裡繞過的東西。
  const { text: fullText, fromTitle } = fullTextFromTitle(
    doc.querySelector('title')?.textContent ?? '',
    base.author.name,
    base.rawText,
  )

  // 引用推文不是直接子節點，須以後代選擇器尋找
  const citeEl = article.querySelector('article[itemprop="citation"]')
  let quoted: Omit<Post, 'quoted'> | undefined
  if (citeEl) {
    const cbase = parseArticle(citeEl)
    if (cbase) {
      quoted = {
        ...cbase,
        text: tokenize(cbase.rawText),
        media: parseMedia(citeEl),
        // 一份文件只有一個 <title>，而它描述的是主推文。引用推文沒有第二份
        // 來源可以驗證，只能靠長度判斷 —— 這是這個資料來源的極限。
        textComplete: looksComplete(cbase.rawText, false),
      }
    }
  }

  return {
    ...base,
    rawText: fullText,
    text: tokenize(fullText),
    media: parseMedia(article),
    textComplete: looksComplete(fullText, fromTitle),
    ...(quoted ? { quoted } : {}),
  }
}
