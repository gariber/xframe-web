import type { TweetData } from '../types'

/**
 * X 的頭像網址有多種尺寸後綴，不只 `_normal`。實測登入版頁面的 DOM 拿到的是
 * `_x96`（96px），若只認 `_normal` 就會原樣放行，拿 96px 小圖做 2x 匯出會糊掉。
 *
 * 已知變體：_normal(48) / _bigger(73) / _mini(24) / _x96(96) / _WxH。
 * 一律換成 _400x400，本身就是 400x400 時取代結果相同，重複套用安全。
 */
const AVATAR_SIZE_SUFFIX = /_(normal|bigger|mini|x\d+|\d+x\d+)\.(jpg|jpeg|png|webp)(\?|$)/i

export function upgradeAvatarUrl(url: string): string {
  if (!url) return url
  return url.replace(AVATAR_SIZE_SUFFIX, '_400x400.$2$3')
}

export function upgradeMediaUrl(url: string): string {
  if (!url) return url
  // name=orig 是比 large 更高一階的畫質；不可把它「升級」成 large，那其實是降級
  if (/[?&]name=orig(&|$)/.test(url)) return url
  if (/[?&]name=/.test(url)) return url.replace(/([?&]name=)\w+/, '$1large')
  return url + (url.includes('?') ? '&' : '?') + 'name=large'
}

/** Service worker 沒有 FileReader，須手動將位元組轉 base64。 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** 抓圖並轉成 data URL。存在的唯一理由是繞開 canvas 跨域污染。 */
async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error(`asset fetch failed: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const mime = res.headers.get('content-type') ?? 'image/jpeg'
  return `data:${mime};base64,${bytesToBase64(buf)}`
}

/** 盡力而為：單一資產失敗不影響其餘欄位，由 UI 各自降級。 */
async function settle(url: string): Promise<string | undefined> {
  try {
    return await toDataUrl(url)
  } catch {
    return undefined
  }
}

async function hydrateOne<T extends Omit<TweetData, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  const [avatarDataUrl, ...mediaData] = await Promise.all([
    avatarUrl ? settle(avatarUrl) : Promise.resolve(undefined),
    ...t.media.map((m) => settle(upgradeMediaUrl(m.url))),
  ])
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl },
    media: t.media.map((m, i) => ({
      ...m,
      url: upgradeMediaUrl(m.url),
      dataUrl: mediaData[i],
    })),
  }
}

export async function hydrateAssets(tweet: TweetData): Promise<TweetData> {
  const outer = await hydrateOne(tweet)
  if (!tweet.quoted) return outer
  return { ...outer, quoted: await hydrateOne(tweet.quoted) }
}
