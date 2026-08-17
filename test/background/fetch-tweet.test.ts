import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTweetHtml, SSR_LANGUAGE } from '../../src/background/fetch-tweet'

const URL_ = 'https://x.com/a/status/123'

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchTweetHtml（擴充功能 service worker 版）', () => {
  it('成功時回傳 HTML 內容', async () => {
    stubFetch(async () => new Response('<html>ok</html>', { status: 200 }))
    expect(await fetchTweetHtml(URL_)).toBe('<html>ok</html>')
  })

  it('明寫 credentials: omit —— 帶 cookie 會拿到 SPA 外殼而不是 SSR 頁面', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response('x', { status: 200 }) })
    await fetchTweetHtml(URL_)
    expect(seen?.credentials).toBe('omit')
  })

  // 這是 2026-08 那次無聲退化的根因之一：X 的未登入 SSR 會依 Accept-Language 把
  // `<title>` 樣板（`{名稱} on X: "..."` → `Xユーザーの{名稱}さん:`）與操作列的
  // aria-label（Reply/Repost/Like → 返信/リポスト/いいね）一起在地化，而新版頁面
  // 已移除 itemprop="text" 與 interactionStatistic，內文與互動數只剩這兩個錨點。
  // 使用者的瀏覽器語言不是 en/zh 時，整個公開抓取會解析失敗並退化成 DOM 路徑。
  it('固定送英文 Accept-Language，讓解析結果不隨使用者的瀏覽器語系飄移', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response('x', { status: 200 }) })
    await fetchTweetHtml(URL_)
    expect(new Headers(seen?.headers).get('Accept-Language')).toBe(SSR_LANGUAGE)
    expect(SSR_LANGUAGE).toMatch(/^en\b/)
  })

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'network'],
  ])('HTTP %i 對應 kind=%s', async (status, kind) => {
    stubFetch(async () => new Response('', { status }))
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind })
  })

  it('fetch 本身拋出時歸類為 network', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'network' })
  })
})
