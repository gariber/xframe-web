import type { Post } from '../src/types'
import { TweetFetchError } from '../src/background/fetch-tweet'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/**
 * 只允許這些來源。擴充功能靠 manifest 的 host_permissions 從架構上擋掉其他
 * 網域；網頁版改成直接 fetch 之後那道閘門就沒了，而 ?u= 參數會在載入時自動
 * 觸發抓取。沒有這份清單，一個構造過的連結就能讓頁面渲染出偽造的推文，
 * 而且套著本站真實的樣式。
 */
const TWEET_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const ASSET_HOSTS = new Set(['pbs.twimg.com', 'abs.twimg.com'])

function hostAllowed(url: string, allowed: ReadonlySet<string>): boolean {
  try {
    return allowed.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * 抓取推文頁 HTML。
 *
 * 與擴充功能版的差別：這裡在頁面本身跨來源 fetch，不經 service worker。
 * `credentials: 'omit'` 明寫出來，不靠「跨來源請求預設不送 cookie」這個部署拓撲
 * 假設 —— 這頁若哪天被架在 *.x.com / *.twitter.com 子網域下就會變成同源，
 * 預設反而會送 cookie，讓「未驗證請求才拿得到 microdata」這個架構前提悄悄失效。
 * 不可改成 'include'。
 */
export async function fetchTweetHtml(url: string): Promise<string> {
  if (!hostAllowed(url, TWEET_HOSTS)) {
    throw new TweetFetchError('badurl', `不允許的來源：${url}`)
  }
  let res: Response
  try {
    res = await fetch(url, { credentials: 'omit' })
  } catch (e) {
    // TypeError: Failed to fetch 是瀏覽器的通用網路失敗症狀 —— 跨來源被擋、
    // 離線、DNS 失敗都長這樣，光看例外分不出來。離線是唯一能可靠判斷的，
    // 先排除掉，剩下的 TypeError 才有理由歸給跨來源。
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const kind = offline ? 'network' : e instanceof TypeError ? 'cors' : 'network'
    throw new TweetFetchError(kind, String(e))
  }
  if (res.status === 404) throw new TweetFetchError('not-found', '推文不存在')
  if (res.status === 429) throw new TweetFetchError('rate-limited', 'X 限制了請求')
  if (!res.ok) throw new TweetFetchError('network', `HTTP ${res.status}`)
  return res.text()
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** 抓圖轉 data URL。理由同擴充功能版：跨來源圖片會污染 canvas，匯出會整個失敗。 */
async function toDataUrl(url: string): Promise<string | undefined> {
  if (!hostAllowed(url, ASSET_HOSTS)) return undefined
  try {
    const res = await fetch(url, { credentials: 'omit' })
    if (!res.ok) return undefined
    const buf = new Uint8Array(await res.arrayBuffer())
    const mime = res.headers.get('content-type') ?? 'image/jpeg'
    return `data:${mime};base64,${bytesToBase64(buf)}`
  } catch {
    return undefined
  }
}

async function hydrateOne<T extends Omit<Post, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  const [avatarDataUrl, ...mediaData] = await Promise.all([
    avatarUrl ? toDataUrl(avatarUrl) : Promise.resolve(undefined),
    ...t.media.map((m) => toDataUrl(upgradeMediaUrl(m.url))),
  ])
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl },
    media: t.media.map((m, i) => ({ ...m, url: upgradeMediaUrl(m.url), dataUrl: mediaData[i] })),
  }
}

export async function hydrateAssets(tweet: Post): Promise<Post> {
  const outer = await hydrateOne(tweet)
  if (!tweet.quoted) return outer
  return { ...outer, quoted: await hydrateOne(tweet.quoted) }
}
