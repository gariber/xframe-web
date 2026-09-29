import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTweetHtml, fetchVideoBlobUrl, hydrateAssets } from '../../web/fetch'
import { TweetFetchError } from '../../src/background/fetch-tweet'
import type { Post } from '../../src/types'

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

  it('明寫 credentials: omit —— 未驗證請求是整個架構的前提，不靠部署拓撲', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response('x', { status: 200 }) })
    await fetchTweetHtml(URL_)
    expect(seen?.credentials).toBe('omit')
  })

  // X 的未登入 SSR 會依 Accept-Language 在地化 `<title>` 樣板與操作列 aria-label，
  // 而新版頁面的內文與互動數只剩這兩個錨點。不固定語系，非 en/zh 的使用者就整個
  // 解析不到。
  it('固定送英文 Accept-Language —— 否則非英文瀏覽器拿到在地化的 title 與 aria-label', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response('x', { status: 200 }) })
    await fetchTweetHtml(URL_)
    expect(new Headers(seen?.headers).get('Accept-Language')).toBe('en-US,en;q=0.9')
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

  it('離線時歸類為 network，不誤報成跨來源被擋', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'network' })
  })

  it('連線正常時的 TypeError 才歸類為 cors', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'cors' })
  })

  it('拋出的是 TweetFetchError', async () => {
    stubFetch(async () => new Response('', { status: 404 }))
    await expect(fetchTweetHtml(URL_)).rejects.toBeInstanceOf(TweetFetchError)
  })
})

const tweet = (over: Partial<Post> = {}): Post => ({
  id: '1', url: URL_, platform: 'x', source: 'fetch',
  author: { name: 'A', handle: 'a', handleDisplay: '@a', avatarUrl: 'https://pbs.twimg.com/profile_images/1/x_normal.jpg' },
  rawText: 'hi', text: [{ type: 'text', value: 'hi' }], createdAt: '',
  metrics: [
    { kind: 'views', value: null },
    { kind: 'replies', value: null },
    { kind: 'reposts', value: null },
    { kind: 'likes', value: null },
  ],
  media: [], textComplete: true, ...over,
})

describe('來源允許清單', () => {
  it.each([
    'https://x.com/a/status/1',
    'https://twitter.com/a/status/1',
    'https://mobile.twitter.com/a/status/1',
  ])('允許 %s', async (u) => {
    stubFetch(async () => new Response('ok', { status: 200 }))
    await expect(fetchTweetHtml(u)).resolves.toBe('ok')
  })

  it.each([
    'https://evil.example/x/status/1',
    'https://x.com.evil.example/a/status/1',
    'https://notx.com/a/status/1',
  ])('拒絕 %s 且完全不發出請求', async (u) => {
    const spy = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await expect(fetchTweetHtml(u)).rejects.toMatchObject({ kind: 'badurl' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('資產只允許 twimg，其餘不發請求且降級為無圖', async () => {
    const spy = vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', spy)
    const t = await hydrateAssets(tweet({
      author: { name: 'A', handle: 'a', handleDisplay: '@a', avatarUrl: 'https://evil.example/a.png' },
    }))
    expect(t.author.avatarDataUrl).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })
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
    const q = { ...tweet(), author: { name: 'B', handle: 'b', handleDisplay: '@b', avatarUrl: 'https://pbs.twimg.com/profile_images/2/b_normal.png' } }
    const t = await hydrateAssets(tweet({ quoted: q }))
    expect(t.quoted!.author.avatarDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

/*
 * X 的影片 CDN 有防盜連：帶著 Referer 的請求一律回 403，不帶就給。實測過各種
 * 標頭組合，只有 Referer 會觸發。瀏覽器跨來源請求預設會送來源網域，所以不明寫
 * referrerPolicy 就一定 403 —— 而且症狀看起來很像 CORS，會把人引去查錯的方向。
 *
 * 這一組斷言存在的唯一理由，就是不讓那一行在未來被人順手拿掉。
 */
describe('fetchVideoBlobUrl', () => {
  const VIDEO = 'https://video.twimg.com/amplify_video/1/vid/avc1/630x360/a.mp4?tag=29'

  /* 只換掉 createObjectURL 這一個方法。整個 URL 換成物件的話，hostAllowed 裡的
     `new URL(...)` 會一起壞掉，測試就變成在驗一個不存在的失敗。 */
  const withObjectUrl = (value: string) => {
    const original = URL.createObjectURL
    URL.createObjectURL = () => value
    return () => { URL.createObjectURL = original }
  }

  it('明寫 referrerPolicy: no-referrer —— 拿掉就 403', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response(new Blob(['x']), { status: 200 }) })
    const restore = withObjectUrl('blob:fake')
    try {
      await fetchVideoBlobUrl(VIDEO)
    } finally { restore() }
    expect(seen?.referrerPolicy).toBe('no-referrer')
    expect(seen?.credentials).toBe('omit')
  })

  it('回傳同源的 blob URL —— <video> 讀它才不會污染 canvas', async () => {
    stubFetch(async () => new Response(new Blob(['x']), { status: 200 }))
    const restore = withObjectUrl('blob:made-one')
    try {
      expect(await fetchVideoBlobUrl(VIDEO)).toBe('blob:made-one')
    } finally { restore() }
  })

  it('只允許 video.twimg.com —— 別的主機連打都不打', async () => {
    const spy = vi.fn(async () => new Response(new Blob(['x']), { status: 200 }))
    stubFetch(spy)
    await expect(fetchVideoBlobUrl('https://evil.example.com/a.mp4')).rejects.toBeInstanceOf(TweetFetchError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('403 會丟出來而不是靜靜回一個壞掉的網址', async () => {
    stubFetch(async () => new Response('', { status: 403 }))
    await expect(fetchVideoBlobUrl(VIDEO)).rejects.toThrow(/403/)
  })
})
