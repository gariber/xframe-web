import type { Post, ParentPost } from '../src/types'
import { SSR_LANGUAGE, TweetFetchError } from '../src/background/fetch-tweet'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/**
 * 只允許這些來源。擴充功能靠 manifest 的 host_permissions 從架構上擋掉其他
 * 網域；網頁版改成直接 fetch 之後那道閘門就沒了，而 ?u= 參數會在載入時自動
 * 觸發抓取。沒有這份清單，一個構造過的連結就能讓頁面渲染出偽造的推文，
 * 而且套著本站真實的樣式。
 */
const TWEET_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'])
const ASSET_HOSTS = new Set(['pbs.twimg.com', 'abs.twimg.com'])
/** 影片自己一組。它走的是另一條路（不轉 data URL、不送 Referer），分開列才看得出來。 */
const VIDEO_HOSTS = new Set(['video.twimg.com'])

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
    // Accept-Language 與擴充功能版同理且同等重要：X 的未登入 SSR 會連 `<title>`
    // 樣板與操作列 aria-label 一起在地化，而新版頁面的內文與互動數只剩這兩個
    // 錨點。不固定語系的話，瀏覽器語言不是 en/zh 的使用者會整個解析不到 ——
    // 網頁版還沒有 DOM 降級路徑，結果是直接報「無法讀取這則推文」。
    // 這個值維持在 CORS-safelist 允許的字元內，不會觸發 preflight。
    res = await fetch(url, {
      credentials: 'omit',
      headers: { 'Accept-Language': SSR_LANGUAGE },
    })
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

/**
 * 回覆對象自己也可能引用了別人，所以它要多走一層。
 *
 * 少了這一層，卡片上父貼文的頭像與圖片仍是跨來源網址：匯出時 canvas 會被
 * 污染，整張圖直接失敗——不是那一張圖破圖而已。
 */
async function hydrateParent(parent: ParentPost): Promise<ParentPost> {
  const [outer, quoted] = await Promise.all([
    hydrateOne(parent),
    parent.quoted ? hydrateOne(parent.quoted) : undefined,
  ])
  return { ...outer, ...(quoted ? { quoted } : {}) }
}

export async function hydrateAssets(tweet: Post): Promise<Post> {
  const [outer, quoted, replyTo] = await Promise.all([
    hydrateOne(tweet),
    tweet.quoted ? hydrateOne(tweet.quoted) : undefined,
    tweet.replyTo ? hydrateParent(tweet.replyTo) : undefined,
  ])
  return {
    ...outer,
    ...(quoted ? { quoted } : {}),
    ...(replyTo ? { replyTo } : {}),
  }
}

/**
 * 抓推文的影片，轉成同源的 blob URL。
 *
 * 三件事跟抓圖不一樣：
 *
 * **不送 Referer。** X 的影片 CDN 有防盜連：帶著 Referer 的請求一律回 403，
 * 不帶就給。實測過各種標頭組合，只有 Referer 會觸發 —— Origin 與 Sec-Fetch-*
 * 都無所謂。瀏覽器跨來源請求預設會送來源網域，所以不明寫這一行就一定 403，
 * 而且症狀是「影片抓不到」，看起來很像 CORS，會把人引去查錯的方向。
 *
 * **不轉 data URL。** 一支五秒的影片就 220KB，長一點的好幾 MB；轉成 base64
 * 還要再脹三分之一，而且字串會整份留在記憶體裡。blob URL 是同源的，
 * <video> 讀它不會污染 canvas，這正是轉 data URL 原本要解決的問題。
 *
 * **不在 hydrateAssets 裡做。** 卡片只顯示封面圖就夠了；影片只有在使用者真的
 * 按下「存成影片」時才需要。放進 hydrate 等於每一則影片推文都先下載好幾 MB，
 * 而絕大多數人只是要一張圖。
 */
export async function fetchVideoBlobUrl(url: string): Promise<string> {
  if (!hostAllowed(url, VIDEO_HOSTS)) {
    throw new TweetFetchError('badurl', `不允許的影片來源：${url}`)
  }
  let res: Response
  try {
    res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new TweetFetchError(offline ? 'network' : 'cors', String(e))
  }
  // 403 在這裡幾乎一定是防盜連。留著這句是因為它看起來像權限問題，
  // 而真正的原因是上面那個 referrerPolicy 哪天被人拿掉了。
  if (!res.ok) throw new TweetFetchError('network', `影片 HTTP ${res.status}`)
  return URL.createObjectURL(await res.blob())
}
