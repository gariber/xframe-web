import { describe, it, expect, vi, afterEach } from 'vitest'
import { hydrateApp } from '../../app/hydrate'
import type { Post } from '../../src/types'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as { CapacitorWebFetch?: unknown }).CapacitorWebFetch
})

const xPost: Post = {
  id: '20',
  url: 'https://x.com/jack/status/20',
  platform: 'x',
  author: {
    name: 'jack', handle: 'jack', handleDisplay: '@jack',
    avatarUrl: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
  },
  rawText: 'hi',
  text: [{ type: 'text', value: 'hi' }],
  createdAt: '2006-03-21T20:50:14.000Z',
  metrics: [],
  media: [],
  source: 'fetch',
  textComplete: true,
}

describe('hydrateApp — X', () => {
  /*
   * app 裡的 fetch 被 CapacitorHttp 換成原生網路層，X 的圖片 CDN 對那條路回
   * 351 Forbidden，頭像就退回成字母圓圈。X 的圖片有 CORS（ACAO: *），改走
   * WebView 原本的 fetch 就拿得到。
   */
  it('X 的圖片走 WebView 原本的 fetch，不走原生網路層', async () => {
    const native = vi.fn(async () => new Response('Forbidden', { status: 351 }))
    vi.stubGlobal('fetch', native)
    const web = vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8]), {
      status: 200, headers: { 'content-type': 'image/jpeg' },
    }))
    ;(globalThis as { CapacitorWebFetch?: unknown }).CapacitorWebFetch = web
    const p = await hydrateApp(xPost)
    expect(p.author.avatarDataUrl).toMatch(/^data:image\/jpeg;base64,/)
    expect(native).not.toHaveBeenCalled()
  })
})
