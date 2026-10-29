import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { acquireComment, acquireThreads, ThreadsFetchError, threadsAdapter } from '../../src/platforms/threads'

const fx = (n: string) => gunzipSync(readFileSync(`test/fixtures/threads-${n}.html.gz`)).toString('utf8')

type FakeResponse = { ok: boolean; status: number; url: string; text: () => Promise<string> }
const page = (url: string, html: string, status = 200): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  text: async () => html,
})

/** 依序回傳 responses，並記下每次請求帶的標頭。 */
function fakeFetch(responses: FakeResponse[]) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} })
    return responses[Math.min(calls.length - 1, responses.length - 1)]
  }
  return { fn: fn as unknown as typeof fetch, calls }
}
const noSleep = async () => {}

const TEXT_URL = 'https://www.threads.com/@mm791019/post/DfADzgzkyqC'
const COMMENT_URL = 'https://www.threads.com/@mm791019/post/DfAFGQOk0Mt'

describe('acquireThreads', () => {
  it('帶回貼文底下的熱門留言（依讚數排序，不含主貼文）', async () => {
    const f = fakeFetch([page(TEXT_URL, fx('text'))])
    const post = await acquireThreads(TEXT_URL, { fetch: f.fn, sleep: noSleep })
    const comments = post.comments ?? []
    expect(comments.length).toBeGreaterThan(0)
    expect(comments.every((c) => c.id !== post.id)).toBe(true)
    const likes = comments.map((c) => c.metrics.find((m) => m.kind === 'likes')?.value ?? 0)
    expect([...likes].sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual(likes)
  })

  it('分享短網址先跟著轉址，再照真正的貼文網址解析', async () => {
    const SHARE = 'https://www.threads.com/share/_2Tm1nlch/'
    const f = fakeFetch([page(`${TEXT_URL}?xmt=AQG0&slof=1`, fx('text'))])
    const post = await acquireThreads(SHARE, { fetch: f.fn, sleep: noSleep })
    expect(post.author.handle).toBe('mm791019')
    expect(f.calls[0].url).toBe(SHARE)
    expect(f.calls[0].headers['User-Agent']).toMatch(/Googlebot/)
  })

  it('短網址轉去的不是貼文時丟 badurl', async () => {
    const f = fakeFetch([page('https://www.threads.com/', '<html></html>')])
    await expect(acquireThreads('https://www.threads.com/share/_nope/', { fetch: f.fn, sleep: noSleep }))
      .rejects.toMatchObject({ kind: 'badurl' })
  })

  it('以爬蟲 UA 取頁並解析出貼文', async () => {
    const f = fakeFetch([page(TEXT_URL, fx('text'))])
    const post = await acquireThreads(TEXT_URL, { fetch: f.fn, sleep: noSleep })
    expect(post.author.handle).toBe('mm791019')
    expect(f.calls[0].headers['User-Agent']).toMatch(/Googlebot/)
  })

  it('轉到 ?error=invalid_post 時丟 refused', async () => {
    const refused = 'https://www.threads.com/?error=invalid_post'
    const f = fakeFetch([page(refused, fx('refused'))])
    await expect(acquireThreads('https://www.threads.com/@foodlove_0810/post/Db579SgE2br', { fetch: f.fn, sleep: noSleep }))
      .rejects.toMatchObject({ kind: 'refused' })
  })

  it('暫時失敗會重試，最多 3 次', async () => {
    const f = fakeFetch([page(TEXT_URL, '', 500), page(TEXT_URL, '', 500), page(TEXT_URL, fx('text'))])
    const post = await acquireThreads(TEXT_URL, { fetch: f.fn, sleep: noSleep })
    expect(post.id).toBe('DfADzgzkyqC')
    expect(f.calls).toHaveLength(3)
  })

  it('三次都失敗時丟 network', async () => {
    const f = fakeFetch([page(TEXT_URL, '', 500)])
    await expect(acquireThreads(TEXT_URL, { fetch: f.fn, sleep: noSleep })).rejects.toBeInstanceOf(ThreadsFetchError)
    expect(f.calls).toHaveLength(3)
  })

  it('讀不到讚數時多抓一次補回來', async () => {
    const noLikes = `<script>{"post":${JSON.stringify({ code: 'A1', user: { username: 'u' }, caption: { text: 'x' }, like_count: null })}}</script>`
    const withLikes = noLikes.replace('"like_count":null', '"like_count":9')
    const url = 'https://www.threads.com/@u/post/A1'
    const f = fakeFetch([page(url, noLikes), page(url, withLikes)])
    const post = await acquireThreads(url, { fetch: f.fn, sleep: noSleep })
    expect(post.metrics.find((m) => m.kind === 'likes')?.value).toBe(9)
    expect(f.calls).toHaveLength(2)
  })

  it('不是 Threads 貼文網址時丟 badurl，不發請求', async () => {
    const f = fakeFetch([])
    await expect(acquireThreads('https://x.com/a/status/1', { fetch: f.fn, sleep: noSleep })).rejects.toMatchObject({ kind: 'badurl' })
    expect(f.calls).toHaveLength(0)
  })
})

describe('acquireComment', () => {
  it('原貼文＋留言：主體是留言，replyTo 是原貼文', async () => {
    const f = fakeFetch([])
    f.fn = (async (url: string) => (url === COMMENT_URL ? page(COMMENT_URL, fx('comment')) : page(TEXT_URL, fx('text')))) as unknown as typeof fetch
    const post = await acquireComment(TEXT_URL, COMMENT_URL, { fetch: f.fn, sleep: noSleep })
    expect(post.id).toBe('DfAFGQOk0Mt')
    expect(post.replyTo?.url).toBe(TEXT_URL)
  })
})

describe('threadsAdapter', () => {
  it('負責 threads.com 與 threads.net，沒有頁面注入', () => {
    expect(threadsAdapter.platform).toBe('threads')
    expect(threadsAdapter.hosts).toEqual(['threads.com', 'threads.net'])
    expect(threadsAdapter.findPermalinks(document)).toEqual([])
  })
})
