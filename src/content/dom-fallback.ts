import type { Post } from '../types'
import { tokenize } from '../parse/tokenize'
import { findPermalink, findTweetRoots } from './permalink'

/**
 * 從已登入頁面的 live DOM 讀取推文。
 *
 * 正常路徑是不帶 cookie 抓取公開頁面；鎖推內容不可見或 X 改動公開頁結構時，
 * 才退回使用者眼前的登入頁面。這個路徑本身不代表鎖推，必須另讀作者區的鎖頭。
 *
 * ⚠️ 本檔案與 permalink.ts 是全系統僅有的兩個依賴 X 頁面結構的模組。X 改版時
 * 只有這兩個檔案需要修。刻意不把選擇器擴散到別處。
 *
 * 以下核心選擇器於 2026-08-01、互動與鎖頭訊號於 2026-08-24 對登入狀態的
 * x.com 實測確認，不是憑推測撰寫：
 *   [data-testid="tweetText"]  → '看完 poi s03'
 *   [data-testid="User-Name"]  → '止痛藥水\n@0x001A'（名稱與帳號同元素，換行分隔）
 *   time[datetime]             → '2026-07-31T21:54:11.000Z'（ISO 8601，同 microdata）
 *   img[src*="profile_images"] → '…/78IKI5Gj_x96.jpg'
 *   [data-testid="icon-lock"]  → 作者為鎖推帳號（只在該推文 User-Name 內採信）
 *   reply／retweet／like／bookmark → aria-label 內的精確互動數
 */

const SEL = {
  text: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  time: 'time[datetime]',
  avatar: 'img[src*="profile_images"]',
} as const

/** 只取屬於這則推文本身的節點，不把巢狀引用推文的控制項混進來。 */
function ownedElements<T extends Element>(article: Element, selector: string): T[] {
  return [...article.querySelectorAll<T>(selector)].filter((el) => el.closest('article') === article)
}

/**
 * X 的 aria-label 會依語言變化，但精確計數仍使用十進位數字；抽出其中每段數字
 * 並移除千分位。讀不到就回空陣列，不拿可見縮寫或無標籤文字猜測。
 */
function accessibleCounts(element: Element | undefined): number[] {
  const label = element?.getAttribute('aria-label') ?? ''
  const matches = label.match(/[0-9][0-9,\.\s\u00a0\u202f]*/g) ?? []
  return matches.flatMap((match) => {
    const digits = match.replace(/\D/g, '')
    if (!digits) return []
    const value = Number(digits)
    return Number.isSafeInteger(value) ? [value] : []
  })
}

function accessibleCount(element: Element | undefined): number | null {
  return accessibleCounts(element)[0] ?? null
}

function domMetrics(article: Element, id: string): Post['metrics'] {
  const control = (testId: string) =>
    ownedElements(article, `[data-testid="${testId}"]`)[0]

  const viewsLink = ownedElements<HTMLAnchorElement>(article, 'a[href*="/analytics"]')
    .find((link) => {
      try {
        return new URL(link.getAttribute('href') ?? '', 'https://x.com').pathname
          .endsWith(`/status/${id}/analytics`)
      } catch {
        return false
      }
    })
  const reply = control('reply')
  const groupCounts = viewsLink
    ? accessibleCounts(reply?.closest('[role="group"][aria-label]') ?? undefined)
    : []
  // 詳情頁的瀏覽連結有時只有縮寫可見文字（45.3 萬），沒有 aria-label；同一
  // 互動群組的 aria-label 仍以瀏覽數作最後一項並提供精確整數。只有已確認存在
  // 這則推文自己的 /analytics 連結時才採用，避免把最後一項書籤數誤當瀏覽數。
  const views = accessibleCount(viewsLink) ?? groupCounts[groupCounts.length - 1] ?? null

  return [
    { kind: 'views', value: views },
    { kind: 'replies', value: accessibleCount(reply) },
    { kind: 'reposts', value: accessibleCount(control('retweet')) },
    { kind: 'likes', value: accessibleCount(control('like')) },
    { kind: 'bookmarks', value: accessibleCount(control('bookmark')) },
  ]
}

/**
 * 從 User-Name 的多行文字拆出名稱與帳號。
 *
 * 實測格式為 `名稱\n@帳號`，但時間軸檢視會多帶時間（`名稱\n@帳號\n·\n5 小時`），
 * 已驗證帳號也可能插入額外節點。因此不靠行號取值，改用語意判斷：
 * 帳號是第一個以 @ 開頭的行，名稱是第一個不以 @ 開頭、也不是分隔符的行。
 */
export function parseUserName(raw: string): { name: string; handle: string } | null {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const handleLine = lines.find((l) => l.startsWith('@'))
  const nameLine = lines.find((l) => !l.startsWith('@') && l !== '·')
  if (!handleLine || !nameLine) return null
  return { name: nameLine, handle: handleLine.slice(1) }
}

/**
 * 這則推文自己的圖片。
 *
 * 這裡原本固定回空陣列，理由是「時間軸的圖片節點與引用推文的難以可靠區分，
 * 歸屬錯誤會把別人的圖畫進卡片」。那個顧慮本身成立，但解法後來已經有了：
 * ownedElements 用 `closest('article') === article` 把節點嚴格限制在這則推文
 * 內，巢狀的引用推文有自己的 article，不會被算進來 —— 公開抓取路徑的
 * parseMedia 用的正是同一招。既然歸屬能保證正確，就沒有再少給的理由：降級後
 * 那張卡片少了圖，對使用者而言就是「明明有圖卻沒有圖」。
 *
 * 只認 `pbs.twimg.com/media/`：頭像在 profile_images、影片縮圖在
 * amplify_video_thumb，兩者都不是推文圖片，比照公開路徑一併排除。
 *
 * 同一張圖在 DOM 裡可能出現不只一次（例如縮圖與放大版並存），依 media key
 * 去重，否則卡片會排出兩張一模一樣的圖。
 */
function domMedia(article: Element): Post['media'] {
  const seen = new Set<string>()
  const media: Post['media'] = []
  for (const img of ownedElements<HTMLImageElement>(article, 'img[src*="pbs.twimg.com/media/"]')) {
    const url = img.getAttribute('src') ?? ''
    const key = url.match(/\/media\/([^/?#.]+)/)?.[1]
    if (!url || !key || seen.has(key)) continue
    seen.add(key)
    media.push({ url, alt: img.getAttribute('alt') ?? '' })
  }
  return media
}

/** 找出頁面上對應該永久連結的推文節點。 */
function findArticle(permalink: string): Element | null {
  return findTweetRoots(document).find((el) => findPermalink(el) === permalink) ?? null
}

/**
 * 讀取指定推文。拿不到必填欄位（名稱／帳號／內文）時回傳 null，由呼叫端
 * 決定如何降級 —— 絕不產出殘缺資料。
 */
export function extractFromDom(permalink: string): Post | null {
  const article = findArticle(permalink)
  if (!article) return null

  const rawText = article.querySelector<HTMLElement>(SEL.text)?.innerText ?? ''
  const userNameRaw = article.querySelector<HTMLElement>(SEL.userName)?.innerText ?? ''
  const who = parseUserName(userNameRaw)
  if (!who || !rawText.trim()) return null

  const id = permalink.match(/\/status\/(\d+)/)?.[1] ?? ''
  const userName = ownedElements<HTMLElement>(article, SEL.userName)[0]

  return {
    id,
    url: permalink,
    platform: 'x',
    author: {
      name: who.name,
      handle: who.handle,
      handleDisplay: '@' + who.handle,
      avatarUrl: article.querySelector<HTMLImageElement>(SEL.avatar)?.src ?? '',
    },
    rawText,
    text: tokenize(rawText),
    createdAt: article.querySelector(SEL.time)?.getAttribute('datetime') ?? '',
    // 2026-08-24 實測：reply／retweet／like／bookmark 有穩定 data-testid 與精確
    // 數字；瀏覽數則在這則推文自己的 /analytics 連結上。缺任何一項就保留 null。
    metrics: domMetrics(article, id),
    // 歸屬由 ownedElements 保證（見 domMedia）——與公開抓取路徑同一套規則。
    media: domMedia(article),
    source: 'dom',
    // 只看這則推文自己的作者區，避免把頁首「目前登入帳號」的鎖頭誤套到貼文。
    isProtected: Boolean(userName?.querySelector('[data-testid="icon-lock"]')),
    // 從已登入頁面的 live DOM 讀到什麼就是什麼，沒有第二份來源會截斷它，
    // 定義上就是完整內文。
    textComplete: true,
  }
}
