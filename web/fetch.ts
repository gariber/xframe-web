import type { TweetData } from '../src/types'
import { TweetFetchError } from '../src/background/fetch-tweet'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/**
 * 抓取推文頁 HTML。
 *
 * 與擴充功能版的差別：這裡在頁面本身跨來源 fetch，不經 service worker。
 * 瀏覽器對跨來源請求的 `credentials` 預設是 `same-origin`，也就是不送 cookie ——
 * 「未驗證請求才拿得到 microdata」這個架構前提因此自動成立。不可改成 'include'。
 */
export async function fetchTweetHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    // 跨來源被擋在瀏覽器裡的典型症狀就是 TypeError: Failed to fetch。
    // 這是本架構最可能失效之處（X 若關閉跨來源存取），必須與一般網路錯誤區分，
    // 否則使用者只會看到「網路錯誤」，查不出真正原因。
    const kind = e instanceof TypeError ? 'cors' : 'network'
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
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = new Uint8Array(await res.arrayBuffer())
    const mime = res.headers.get('content-type') ?? 'image/jpeg'
    return `data:${mime};base64,${bytesToBase64(buf)}`
  } catch {
    return undefined
  }
}

async function hydrateOne<T extends Omit<TweetData, 'quoted'>>(t: T): Promise<T> {
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

export async function hydrateAssets(tweet: TweetData): Promise<TweetData> {
  const outer = await hydrateOne(tweet)
  if (!tweet.quoted) return outer
  return { ...outer, quoted: await hydrateOne(tweet.quoted) }
}
