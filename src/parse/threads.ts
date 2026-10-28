import type { Media, Metric, Post } from '../types'
import { tokenize } from './tokenize'

/*
 * Threads 貼文頁 → Post。
 *
 * 移植自 ThreadsFrame 的 Cloudflare worker（threadframe-web/worker/src/index.js）。
 * Threads 對爬蟲 UA 回伺服器算繪的頁面，裡面內嵌整串討論的 JSON；這裡只負責
 * 從那份 HTML 挖出資料，不發任何網路請求 —— 取頁與重試在 platforms/threads.ts。
 *
 * 以下的常數與篩選規則都沿用 worker，每一條背後的實測理由寫在 worker 的註解裡。
 */

const POST_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'])

/** 一頁最多收這麼多則貼文就停手，避免長討論串拖慢解析。 */
const MAX_SCAN = 60
/** 最多帶幾則留言（依讚數由高到低）。 */
const MAX_COMMENTS = 6
/** 卡片最多畫幾張圖。 */
const MAX_IMAGES = 4
/** 2026-08 起 Threads 交替使用 `post` 與 Relay 的 `media` / `node` 三種鍵。 */
const POST_KEYS = ['"post":{', '"media":{', '"node":{']
/** 超過這個大小的候選幾乎都是包住整頁的外層容器。 */
const MAX_OBJECT_CHARS = 300_000
const MAX_CANDIDATES = 400
/** 候選物件開頭起算多遠之內要出現 `"caption"` 才值得解析。 */
const CAPTION_WINDOW = 30_000
/** 匯出寬 1080；單張滿寬，多張成格每格最寬一半。 */
const FULL_WIDTH = 1080
const CELL_WIDTH = 540

type Raw = any

export type ThreadsParse = {
  post: Post
  /** 主貼文底下的留言，已依讚數排序。 */
  comments: Post[]
  /**
   * 讚數是否拿得到。新的 Relay 結構整頁 like_count 都是 null，Threads 隨機回
   * 其中一種，所以拿不到時值得再抓一次。
   */
  likesKnown: boolean
}

export function parseThreadsUrl(url: string): { handle: string; code: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!POST_HOSTS.has(u.hostname)) return null
  const m = /^\/@([\w.]+)\/post\/([A-Za-z0-9_-]+)\/?$/.exec(u.pathname)
  return m ? { handle: m[1], code: m[2] } : null
}

/** Threads 把貼文頁轉到首頁 `?error=invalid_post`，等於明講「未登入讀不到這則」。 */
export function isRefusedUrl(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).searchParams.get('error') === 'invalid_post'
  } catch {
    return false
  }
}

/** 從 '{' 開始做括號配對，取出完整 JSON 物件字串。 */
function sliceObject(s: string, start: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** 頁面上所有貼文物件，依出現順序、以 code 去重。 */
function scanPosts(html: string): Raw[] {
  const found: { at: number; obj: Raw }[] = []
  for (const key of POST_KEYS) {
    let from = 0
    for (let n = 0; n < MAX_CANDIDATES; n++) {
      const at = html.indexOf(key, from)
      if (at === -1) break
      from = at + key.length
      const start = at + key.length - 1
      const caption = html.indexOf('"caption"', start)
      if (caption === -1 || caption - start > CAPTION_WINDOW) continue
      const raw = sliceObject(html, start)
      if (!raw || raw.length > MAX_OBJECT_CHARS) continue
      let obj: Raw
      try {
        obj = JSON.parse(raw)
      } catch {
        continue
      }
      if (!obj?.user?.username || obj?.caption === undefined) continue
      found.push({ at, obj })
    }
  }
  found.sort((a, b) => a.at - b.at)

  const posts: Raw[] = []
  const seen = new Set<string>()
  for (const { obj } of found) {
    if (posts.length >= MAX_SCAN) break
    if (obj.code) {
      if (seen.has(obj.code)) continue
      seen.add(obj.code)
    }
    posts.push(obj)
  }
  return posts
}

/** candidates 裡混著被裁過的版本；先依原圖比例篩掉，再挑剛好夠用的最小張。 */
function pickImage(node: Raw, minWidth: number): string | null {
  const list = node?.image_versions2?.candidates
  if (!Array.isArray(list)) return null
  let usable = list.filter((c: Raw) => c?.url && c?.width)
  const w = node?.original_width
  const h = node?.original_height
  if (w && h) {
    const want = w / h
    const same = usable.filter((c: Raw) => c.height && Math.abs(c.width / c.height - want) / want < 0.02)
    if (same.length > 0) usable = same
  }
  if (usable.length === 0) return null
  const enough = usable.filter((c: Raw) => c.width >= minWidth).sort((a: Raw, b: Raw) => a.width - b.width)
  if (enough.length > 0) return enough[0].url
  return usable.sort((a: Raw, b: Raw) => b.width - a.width)[0].url
}

function toMedia(node: Raw, minWidth: number): Media | null {
  const url = pickImage(node, minWidth)
  const video = Array.isArray(node?.video_versions) ? node.video_versions.find((v: Raw) => v?.url) : null
  if (video) {
    return {
      url: url ?? '',
      alt: '',
      kind: 'video',
      video: { url: video.url, durationMs: Math.round((Number(node.video_duration) || 0) * 1000) },
    }
  }
  return url ? { url, alt: node?.accessibility_caption ?? '', kind: 'photo' } : null
}

function collectMedia(post: Raw): Media[] {
  const nodes: Raw[] = Array.isArray(post.carousel_media) ? post.carousel_media : [post]
  return nodes
    .map((node, i) => toMedia(node, i === 0 ? FULL_WIDTH : CELL_WIDTH))
    .filter((m): m is Media => m !== null)
    .slice(0, MAX_IMAGES)
}

function topicName(post: Raw): string | undefined {
  const value = post?.text_post_app_info?.tag_header?.display_name
  if (typeof value !== 'string') return undefined
  return value.trim() || undefined
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function toPost(raw: Raw, handle: string): Post {
  const info = raw.text_post_app_info ?? {}
  const username: string = raw.user?.username ?? ''
  const rawText: string = raw.caption?.text ?? ''
  const metrics: Metric[] = [
    { kind: 'likes', value: num(raw.like_count) },
    { kind: 'replies', value: num(info.direct_reply_count ?? raw.reply_count) },
    { kind: 'reposts', value: num(info.repost_count) },
    { kind: 'shares', value: num(info.reshare_count) },
  ]
  return {
    id: raw.code ?? '',
    url: `https://www.threads.com/@${username || handle}/post/${raw.code ?? ''}`,
    platform: 'threads',
    author: {
      name: raw.user?.full_name || username,
      handle: username,
      // Threads 的帳號前面不加 @
      handleDisplay: username,
      avatarUrl: raw.user?.profile_pic_url ?? '',
    },
    rawText,
    text: tokenize(rawText),
    createdAt: new Date((num(raw.taken_at) ?? 0) * 1000).toISOString(),
    metrics,
    media: collectMedia(raw),
    source: 'fetch',
    textComplete: true,
    topic: topicName(raw),
  }
}

/**
 * 取出短碼對得上的那則與它底下的留言。
 *
 * 主貼文永遠排在留言前面，而頁面（包含被轉回首頁的情況）也內嵌別的貼文，
 * 所以只認短碼精確相符的那一則；找不到就是 null，不拿第一則交差。
 */
export function parseThreadsHtml(html: string, wantedCode: string): ThreadsParse | null {
  const posts = scanPosts(html)
  const at = posts.findIndex((p) => p.code === wantedCode)
  if (at === -1) return null
  const main = posts[at]
  const handle = main.user?.username ?? ''
  const comments = posts
    .slice(at + 1)
    .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
    .slice(0, MAX_COMMENTS)
    .map((c) => toPost(c, c.user?.username ?? handle))
  return { post: toPost(main, handle), comments, likesKnown: typeof main.like_count === 'number' }
}
