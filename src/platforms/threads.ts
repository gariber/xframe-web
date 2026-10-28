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
 * 取一則 Threads 貼文。
 *
 * 重試與「補讚數」都沿用 ThreadsFrame worker 的實測規則：Threads 偶爾回精簡頁或
 * 短暫限流，重試幾次就好；新的 Relay 結構整頁 like_count 都是 null，而 Threads
 * 隨機回新舊兩種，所以拿到沒有讚數的那份時再碰一次運氣。
 */
export async function acquireThreads(url: string, deps: ThreadsDeps = defaultDeps()): Promise<Post> {
  const target = parseThreadsUrl(url)
  if (!target) throw new ThreadsFetchError('badurl', `不是 Threads 貼文連結：${url}`)

  let best: Post | null = null
  let refused = false
  let lastStatus = 0
  let retriedForLikes = false

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await deps.fetch(url, {
        headers: { 'User-Agent': GOOGLEBOT_UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      })
    } catch {
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

    if (!best || parsed.likesKnown) best = parsed.post
    if (parsed.likesKnown || retriedForLikes) break
    retriedForLikes = true
  }

  if (best) return best
  if (refused) {
    throw new ThreadsFetchError('refused', 'Threads 不讓未登入讀取這則貼文')
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
