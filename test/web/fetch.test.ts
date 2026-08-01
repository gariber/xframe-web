import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTweetHtml, hydrateAssets } from '../../web/fetch'
import { TweetFetchError } from '../../src/background/fetch-tweet'
import type { TweetData } from '../../src/types'

const URL_ = 'https://x.com/a/status/123'

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchTweetHtml', () => {
  it('成功時回傳 HTML 內容', async () => {
    stubFetch(async () => new Response('<html>ok</html>', { status: 200 }))
    expect(await fetchTweetHtml(URL_)).toBe('<html>ok</html>')
  })

  it('不得帶 cookie —— 未驗證請求是整個架構的前提', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response('x', { status: 200 }) })
    await fetchTweetHtml(URL_)
    expect(seen?.credentials).not.toBe('include')
  })

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'network'],
  ])('HTTP %i 對應 kind=%s', async (status, kind) => {
    stubFetch(async () => new Response('', { status }))
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind })
  })

  it('TypeError（跨來源被擋的典型症狀）歸類為 cors，不是含糊的網路錯誤', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'cors' })
  })

  it('非 TypeError 的例外歸類為 network', async () => {
    stubFetch(async () => { throw new Error('boom') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'network' })
  })

  it('拋出的是 TweetFetchError', async () => {
    stubFetch(async () => new Response('', { status: 404 }))
    await expect(fetchTweetHtml(URL_)).rejects.toBeInstanceOf(TweetFetchError)
  })
})

const tweet = (over: Partial<TweetData> = {}): TweetData => ({
  id: '1', url: URL_, source: 'microdata',
  author: { name: 'A', handle: 'a', avatarUrl: 'https://pbs.twimg.com/profile_images/1/x_normal.jpg' },
  rawText: 'hi', text: [{ type: 'text', value: 'hi' }], createdAt: '',
  stats: { replies: null, reposts: null, quotes: null, likes: null, views: null },
  media: [], ...over,
})

describe('hydrateAssets', () => {
  it('頭像升級尺寸後轉為 data URL', async () => {
    stubFetch(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { 'content-type': 'image/jpeg' },
    }))
    const t = await hydrateAssets(tweet())
    expect(t.author.avatarUrl).toContain('_400x400')
    expect(t.author.avatarDataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('單一資產失敗不影響其餘欄位', async () => {
    stubFetch(async () => { throw new TypeError('blocked') })
    const t = await hydrateAssets(tweet())
    expect(t.author.avatarDataUrl).toBeUndefined()
    expect(t.rawText).toBe('hi')
  })

  it('引用推文的資產一併處理', async () => {
    stubFetch(async () => new Response(new Uint8Array([1]), {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    const q = { ...tweet(), author: { name: 'B', handle: 'b', avatarUrl: 'https://p/b_normal.png' } }
    const t = await hydrateAssets(tweet({ quoted: q }))
    expect(t.quoted!.author.avatarDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
