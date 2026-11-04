import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { isRefusedUrl, parseThreadsHtml, parseThreadsUrl } from '../../src/parse/threads'

/** 真實頁面（Googlebot UA 抓的），gzip 存放；見 scripts/capture-threads-fixtures.sh。 */
const fx = (n: string) => gunzipSync(readFileSync(`test/fixtures/threads-${n}.html.gz`)).toString('utf8')

const metric = (post: { metrics: { kind: string; value: number | null }[] }, kind: string) =>
  post.metrics.find((m) => m.kind === kind)?.value

/** 合成頁：與 ThreadsFrame worker 測試同一套形狀（舊的 `post` 鍵）。 */
function legacyPage(posts: object[]): string {
  return posts.map((p) => `<script>{"post":${JSON.stringify(p)}}</script>`).join('')
}

describe('parseThreadsUrl', () => {
  it('接受 threads.com / threads.net 的貼文網址，忽略查詢參數', () => {
    expect(parseThreadsUrl('https://www.threads.com/@mm791019/post/DfADzgzkyqC?xmt=abc')).toEqual({
      handle: 'mm791019',
      code: 'DfADzgzkyqC',
    })
    expect(parseThreadsUrl('https://threads.net/@a.b_c/post/X-1_y')).toEqual({ handle: 'a.b_c', code: 'X-1_y' })
  })

  it('其他網域或不是貼文頁一律拒絕', () => {
    expect(parseThreadsUrl('https://evil.com/@a/post/B')).toBeNull()
    expect(parseThreadsUrl('https://www.threads.com/@a')).toBeNull()
    expect(parseThreadsUrl('不是網址')).toBeNull()
  })
})

describe('isRefusedUrl', () => {
  it('落在 ?error=invalid_post 就是 Threads 不讓未登入讀', () => {
    expect(isRefusedUrl('https://www.threads.com/?error=invalid_post')).toBe(true)
    expect(isRefusedUrl('https://www.threads.com/@a/post/B')).toBe(false)
  })
})

describe('parseThreadsHtml', () => {
  it('純文字貼文：作者、內文、話題、時間、四項統計', () => {
    const r = parseThreadsHtml(fx('text'), 'DfADzgzkyqC')!
    expect(r.post.platform).toBe('threads')
    expect(r.post.author).toMatchObject({ name: '梁米米', handle: 'mm791019', handleDisplay: 'mm791019' })
    expect(r.post.rawText.startsWith('大家都是怎麼幫小孩戒掉睡覺時的尿布呀')).toBe(true)
    expect(r.post.text.map((s) => s.value).join('')).toBe(r.post.rawText)
    expect(r.post.topic).toBe('戒尿布')
    expect(r.post.createdAt).toBe(new Date(1793110870 * 1000).toISOString())
    expect(metric(r.post, 'likes')).toBe(57)
    expect(metric(r.post, 'replies')).toBe(54)
    expect(metric(r.post, 'reposts')).toBe(0)
    expect(metric(r.post, 'shares')).toBe(25)
    expect(r.post.media).toEqual([])
    expect(r.post.textComplete).toBe(true)
    expect(r.post.url).toBe('https://www.threads.com/@mm791019/post/DfADzgzkyqC')
    expect(r.likesKnown).toBe(true)
  })

  it('留言依讚數排序，最多 6 則，本身也是 Post', () => {
    const r = parseThreadsHtml(fx('text'), 'DfADzgzkyqC')!
    expect(r.comments).toHaveLength(6)
    expect(r.comments[0].author.handle).toBe('iamgdbabe')
    expect(metric(r.comments[0], 'likes')).toBe(4)
    expect(r.comments.every((c) => c.platform === 'threads')).toBe(true)
  })

  it('影片貼文：取 video_versions 成為一支影片，封面當圖', () => {
    const r = parseThreadsHtml(fx('video'), 'De_0StIEr2x')!
    expect(r.post.media).toHaveLength(1)
    expect(r.post.media[0].kind).toBe('video')
    expect(r.post.media[0].url).toMatch(/^https:\/\/.*cdninstagram\.com\//)
    expect(r.post.media[0].video?.url).toMatch(/\.mp4\?/)
    expect(r.post.media[0].video?.url).not.toContain('\\/')
  })

  it('單張圖片：取未被裁切的版本', () => {
    const r = parseThreadsHtml(fx('image'), 'DfBZOYkszrY')!
    expect(r.post.media).toHaveLength(1)
    expect(r.post.media[0].kind).toBe('photo')
    expect(r.post.media[0].url).toMatch(/^https:\/\//)
  })

  it('留言連結：主體是那則留言，不是頁面上第一則', () => {
    const r = parseThreadsHtml(fx('comment'), 'DfAFGQOk0Mt')!
    expect(r.post.rawText.startsWith('但他目前四歲了')).toBe(true)
  })

  it('目標短碼不在頁面上時回 null，絕不拿第一則交差', () => {
    expect(parseThreadsHtml(fx('refused'), 'Db579SgE2br')).toBeNull()
  })

  it('舊結構沒有讚數時保留 null，並回報 likesKnown = false', () => {
    const html = legacyPage([
      { code: 'A1', user: { username: 'u', full_name: 'U' }, caption: { text: 'hi' }, taken_at: 1, like_count: null },
    ])
    const r = parseThreadsHtml(html, 'A1')!
    expect(metric(r.post, 'likes')).toBeNull()
    expect(r.likesKnown).toBe(false)
  })

  it('多張圖依原順序，最多 4 張', () => {
    const img = (n: number) => ({
      original_width: 100,
      original_height: 100,
      image_versions2: { candidates: [{ url: `https://x.cdninstagram.com/${n}.jpg`, width: 1080, height: 1080 }] },
    })
    const html = legacyPage([
      { code: 'C1', user: { username: 'u' }, caption: { text: '' }, carousel_media: [1, 2, 3, 4, 5].map(img) },
    ])
    const r = parseThreadsHtml(html, 'C1')!
    expect(r.post.media.map((m) => m.url)).toEqual([1, 2, 3, 4].map((n) => `https://x.cdninstagram.com/${n}.jpg`))
  })
})
