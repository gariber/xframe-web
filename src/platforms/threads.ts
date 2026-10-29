import type { Adapter } from './types'
import type { Post } from '../types'
import { isRefusedUrl, parseThreadsHtml, parseThreadsUrl } from '../parse/threads'

/**
 * Threads 只對爬蟲 UA 回伺服器算繪、內嵌貼文 JSON 的版本。
 *
 * 只在 iOS app 裡用得到：app 的 fetch 由 CapacitorHttp 走原生網路層，不受
 * CORS 限制，可以自己換 UA 直接抓。瀏覽器頁面做不到（Threads 不回 CORS 標頭），
 * 所以這個 adapter 不在網頁版與擴充功能的註冊表裡。
 */
export const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

export const THREADS_HOSTS = ['threads.com', 'threads.net'] as const

const ATTEMPTS = 3
const BACKOFF_MS = 600

export type ThreadsFetchErrorKind = 'refused' | 'network' | 'not-found' | 'badurl'

export class ThreadsFetchError extends Error {
  constructor(public kind: ThreadsFetchErrorKind, message: string) {
    super(message)
    this.name = 'ThreadsFetchError'
  }
}

export type ThreadsDeps = {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
}

const defaultDeps = (): ThreadsDeps => ({
  fetch: (...args) => globalThis.fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
})

/**
 * Threads app 的「分享」給的是 `threads.com/share/_xxxx` 短網址，302 到真正的
 * 貼文頁（`/@帳號/post/代碼?xmt=…`）。跟著轉一次，拿最後的網址回來；不是短網址、
 * 或轉去的不是貼文頁，就回 null。查詢字串丟掉：那是追蹤參數。
 */
async function resolveShareLink(url: string, deps: ThreadsDeps): Promise<string | null> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!THREADS_HOSTS.some((h) => u.hostname === h || u.hostname === `www.${h}`)) return null
  if (!/^\/share\/[\w-]+\/?$/.test(u.pathname)) return null
  let res: Response
  try {
    res = await deps.fetch(url, { headers: { 'User-Agent': GOOGLEBOT_UA } })
  } catch {
    throw new ThreadsFetchError('network', '短網址打不開')
  }
  // 被擋的貼文，短網址一路轉到首頁的 ?error=invalid_post——那是登入牆，不是壞網址。
  if (isRefusedUrl(res.url)) throw new ThreadsFetchError('refused', 'Threads 不讓未登入讀取這則貼文')
  const final = new URL(res.url)
  final.search = ''
  return parseThreadsUrl(final.href) ? final.href : null
}

/**
 * 取一則 Threads 貼文。
 *
 * 重試與「補讚數」都沿用 ThreadsFrame worker 的實測規則：Threads 偶爾回精簡頁或
 * 短暫限流，重試幾次就好；新的 Relay 結構整頁 like_count 都是 null，而 Threads
 * 隨機回新舊兩種，所以拿到沒有讚數的那份時再碰一次運氣。
 */
export async function acquireThreads(sharedUrl: string, deps: ThreadsDeps = defaultDeps()): Promise<Post> {
  const url = parseThreadsUrl(sharedUrl) ? sharedUrl : await resolveShareLink(sharedUrl, deps)
  const target = url ? parseThreadsUrl(url) : null
  if (!url || !target) throw new ThreadsFetchError('badurl', `不是 Threads 貼文連結：${sharedUrl}`)

  let best: Post | null = null
  let refused = false
  let lastStatus = 0
  let networkFailed = false
  let retriedForLikes = false

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await deps.fetch(url, {
        headers: { 'User-Agent': GOOGLEBOT_UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      })
    } catch {
      networkFailed = true
      await deps.sleep(BACKOFF_MS * (attempt + 1))
      continue
    }
    lastStatus = res.status
    if (!res.ok) {
      await deps.sleep(BACKOFF_MS * (attempt + 1))
      continue
    }
    if (isRefusedUrl(res.url)) {
      refused = true
      continue
    }
    const parsed = parseThreadsHtml(await res.text(), target.code)
    if (!parsed) continue

    if (!best || parsed.likesKnown) best = { ...parsed.post, comments: parsed.comments }
    if (parsed.likesKnown || retriedForLikes) break
    retriedForLikes = true
  }

  if (best) return best
  if (refused) {
    throw new ThreadsFetchError('refused', 'Threads 不讓未登入讀取這則貼文')
  }
  // 一次都沒連上：是網路的問題，不能說貼文不存在——那會讓人以為不用再試了。
  if (networkFailed && !lastStatus) {
    throw new ThreadsFetchError('network', '連不上 Threads')
  }
  if (lastStatus && lastStatus !== 200) {
    throw new ThreadsFetchError('network', `Threads 沒有回應（HTTP ${lastStatus}）`)
  }
  throw new ThreadsFetchError('not-found', '抓到了頁面卻讀不出貼文內容')
}

/**
 * 「原貼文＋某一則留言」：主體是留言，原貼文當作它回覆的對象，卡片用父貼文的
 * 串接線畫出來。
 */
export async function acquireComment(postUrl: string, commentUrl: string, deps: ThreadsDeps = defaultDeps()): Promise<Post> {
  const [original, comment] = await Promise.all([acquireThreads(postUrl, deps), acquireThreads(commentUrl, deps)])
  return { ...comment, replyTo: original }
}

export const threadsAdapter: Adapter = {
  platform: 'threads',
  hosts: THREADS_HOSTS,
  findPermalinks: () => [],
  acquire: (url) => acquireThreads(url),
}
