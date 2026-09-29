import type { MediaKind } from '../types'

/**
 * 推文媒體的縮圖網址。
 *
 * X 把四種東西都放在 pbs.twimg.com，靠路徑的第一段區分：頭像在
 * `profile_images/`，照片在 `media/`，影片的封面在 `amplify_video_thumb/`
 * 或 `ext_tw_video_thumb/`，GIF（X 其實是存成無聲影片）在
 * `tweet_video_thumb/`。
 *
 * 這裡只列推文媒體那三類，頭像不在內 —— 頭像有自己的欄位，混進來會在卡片上
 * 多出一張作者大頭照。
 */
const THUMB_PATHS: ReadonlyArray<readonly [string, MediaKind]> = [
  ['media', 'photo'],
  ['amplify_video_thumb', 'video'],
  ['ext_tw_video_thumb', 'video'],
  ['tweet_video_thumb', 'gif'],
]

/** 屬於推文媒體的 <img>。DOM 那兩條路（公開頁與已登入頁）共用同一份定義。 */
export const TWEET_MEDIA_SELECTOR = THUMB_PATHS
  .map(([path]) => `img[src*="pbs.twimg.com/${path}/"]`)
  .join(',')

const MEDIA_HOST = 'pbs.twimg.com'

/**
 * 拆出「路徑第一段 + 之後那個 ID」。
 *
 * 比對主機名而不是用字串包含 —— `url.includes('pbs.twimg.com/media/')` 會把
 * `https://example.com/pbs.twimg.com/media/x.jpg` 當成推文圖片，那是一個攻擊者
 * 控制得了的網址長什麼樣就能命中的比對。這條路徑最後會被交去 fetch 並轉成
 * data URL 畫進卡片，主機名必須是真的比對過的。
 */
function parseThumb(url: string): { path: string; id: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.hostname !== MEDIA_HOST) return null
  const [, path, ...rest] = parsed.pathname.split('/')
  const id = rest[0]?.split('.')[0] ?? ''
  return path && id ? { path, id } : null
}

/** 由縮圖網址判斷這是照片、影片還是 GIF；不是推文媒體則回 null。 */
export function mediaKindOfUrl(url: string): MediaKind | null {
  const thumb = parseThumb(url)
  if (thumb === null) return null
  return THUMB_PATHS.find(([path]) => path === thumb.path)?.[1] ?? null
}

/**
 * 去重用的鍵。同一則媒體在 DOM 裡可能出現不只一次（縮圖與放大版並存），
 * 不去重的話卡片會排出兩張一模一樣的圖。
 *
 * 鍵含路徑段，照片與影片封面即使 ID 相同也不會互相蓋掉。
 */
export function mediaDedupeKey(url: string): string | null {
  const thumb = parseThumb(url)
  if (thumb === null || mediaKindOfUrl(url) === null) return null
  return `${thumb.path}:${thumb.id}`
}

/**
 * 一支影片的其中一種畫質。X 會同時給 HLS 播放清單與數種 progressive MP4。
 * 尺寸不在欄位裡，藏在網址路徑（`/vid/avc1/630x360/`）。
 */
export type VideoVariant = { url: string; bitrate: number | null; contentType: string }

/**
 * 挑哪一支下載的上限。
 *
 * 卡片輸出 1080 寬，影片框最多也就一千出頭的像素。X 最高那支是 1344×768 /
 * 10.4 Mbps —— 比 1260×720 那支（2.2 Mbps）多五倍的位元組，而兩者都會被我們
 * 重新編碼一次，畫面上看不出差別。這是手機的行動網路，多下載四倍的東西只是
 * 讓使用者多等。
 */
export const MAX_VIDEO_WIDTH = 1280

/** 由網址路徑取出這支變體的畫面寬度；X 的命名一向是 `/{寬}x{高}/`。 */
function widthOfVariant(url: string): number | null {
  const m = url.match(/\/(\d+)x(\d+)\//)
  return m === null ? null : Number(m[1])
}

/**
 * 挑一支能直接下載的 MP4。
 *
 * 只收 progressive MP4：HLS（`application/x-mpegURL`）是一份播放清單，Safari
 * 的 <video> 播得動，但我們要的是「抓成一個檔案、轉成 blob URL、畫進 canvas」
 * —— 那條路需要單一檔案，播放清單給不了。
 *
 * 在寬度上限以內取位元率最高的那支；全部都超過上限時取最小的那支，因為那時候
 * 「別讓使用者等太久」比畫質重要。
 */
export function pickVideoVariant(variants: readonly VideoVariant[]): string | null {
  const mp4 = variants.filter((v) => v.contentType === 'video/mp4' && v.url !== '')
  if (mp4.length === 0) return null
  const rank = (v: VideoVariant) => v.bitrate ?? 0
  const withinCap = mp4.filter((v) => {
    const w = widthOfVariant(v.url)
    return w === null || w <= MAX_VIDEO_WIDTH
  })
  const pool = withinCap.length > 0 ? withinCap : mp4
  const best = withinCap.length > 0
    ? pool.reduce((a, b) => (rank(b) > rank(a) ? b : a))
    : pool.reduce((a, b) => (rank(b) < rank(a) ? b : a))
  return best.url
}
