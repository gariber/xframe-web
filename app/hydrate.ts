import type { ParentPost, Post } from '../src/types'
import { fetchVideoBlob, hydrateAssets } from '../web/fetch'

/*
 * Threads 的圖片與影片放在 Meta 的 CDN。網頁版的 hydrateAssets 只認 X 的網域
 * （那是網頁版擋偽造連結的閘門），所以 app 另外放行這兩組。
 */
const THREADS_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/

function threadsCdn(url: string): boolean {
  try {
    return THREADS_CDN.test(new URL(url).hostname)
  } catch {
    return false
  }
}

async function toDataUrl(url: string): Promise<string | undefined> {
  if (!url || !threadsCdn(url)) return undefined
  try {
    const blob = await fetchThreadsBlob(url)
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

async function fetchThreadsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

async function hydrateOne<T extends Omit<Post, 'quoted' | 'replyTo'>>(p: T): Promise<T> {
  const [avatarDataUrl, ...media] = await Promise.all([
    toDataUrl(p.author.avatarUrl),
    ...p.media.map((m) => toDataUrl(m.url)),
  ])
  return {
    ...p,
    author: { ...p.author, avatarDataUrl },
    media: p.media.map((m, i) => ({ ...m, dataUrl: media[i] })),
  }
}

/**
 * X 的圖片不走 CapacitorHttp。
 *
 * app 裡的全域 fetch 被 CapacitorHttp 換成原生網路層，而 X 的圖片 CDN 對那條路
 * 一律回 351 Forbidden（同一個網址 curl 拿得到），頭像就退回成字母圓圈、推文
 * 裡的照片整張不見。X 的圖片本來就有 CORS（`access-control-allow-origin: *`），
 * 用 WebView 原本的 fetch 抓即可。Capacitor 把它留在 `window.CapacitorWebFetch`。
 */
function webFetch(): typeof fetch {
  const own = (globalThis as { CapacitorWebFetch?: typeof fetch }).CapacitorWebFetch
  return own ?? ((input, init) => fetch(input, init))
}

/** 圖片轉成 data URL：跨來源圖片會污染 canvas，匯出會整個失敗。 */
export async function hydrateApp(post: Post): Promise<Post> {
  if (post.platform === 'x') return hydrateAssets(post, webFetch())
  const [outer, replyTo, comments] = await Promise.all([
    hydrateOne(post),
    post.replyTo ? hydrateOne(post.replyTo as ParentPost) : undefined,
    post.comments ? Promise.all(post.comments.map(hydrateOne)) : undefined,
  ])
  return { ...outer, ...(replyTo ? { replyTo } : {}), ...(comments ? { comments } : {}) }
}

/** 影片的位元組：X 走網頁版那條（不送 Referer），Threads 走 Meta CDN。 */
export async function fetchAppVideo(url: string): Promise<Blob> {
  if (threadsCdn(url)) return fetchThreadsBlob(url)
  return fetchVideoBlob(url)
}
