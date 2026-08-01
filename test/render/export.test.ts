import { describe, it, expect, vi } from 'vitest'
import { buildFilename } from '../../src/render/export'
import { DEFAULT_SETTINGS } from '../../src/render/Card'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'

const tweet = parseTweet(readFileSync('test/fixtures/plain.html', 'utf8'), '2083053369351090254')!

describe('buildFilename', () => {
  it('包含帳號與推文 ID', () => {
    const name = buildFilename(tweet)
    expect(name).toContain('thsottiaux')
    expect(name).toContain('2083053369351090254')
  })
  it('副檔名為 png', () => expect(buildFilename(tweet)).toMatch(/\.png$/))
  it('不含檔名不合法字元', () => {
    expect(buildFilename(tweet)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('handle 含特殊字元時仍安全', () => {
    const t = { ...tweet, author: { ...tweet.author, handle: 'a/b:c' } }
    expect(buildFilename(t)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('id 含特殊字元時仍安全', () => {
    const t = { ...tweet, id: '123/456:789' }
    expect(buildFilename(t)).not.toMatch(/[\/\\:*?"<>|]/)
  })
})

// 行動網頁版把卡片包在 scale() 裡讓整張塞進預覽框。modern-screenshot 的
// resolveBoundingBox 只在沒收到尺寸時才用 getBoundingClientRect()，而那個會
// 被祖先 transform 影響 —— 不明確給值的話匯出圖會縮成預覽大小且不報錯。
describe('匯出尺寸不受祖先 transform 影響', () => {
  it('明確傳入版面尺寸而非讓 modern-screenshot 自己量', async () => {
    const { domToBlob } = await import('modern-screenshot')
    const spy = vi.spyOn({ domToBlob }, 'domToBlob')
    void spy
    const calls: Array<Record<string, unknown>> = []
    vi.doMock('modern-screenshot', () => ({
      domToBlob: (_n: HTMLElement, o: Record<string, unknown>) => {
        calls.push(o)
        return Promise.resolve(new Blob(['x'], { type: 'image/png' }))
      },
    }))
    vi.resetModules()
    const { exportPng } = await import('../../src/render/export')
    const node = document.createElement('div')
    Object.defineProperty(node, 'offsetWidth', { value: 720, configurable: true })
    Object.defineProperty(node, 'offsetHeight', { value: 1280, configurable: true })
    await exportPng(node, DEFAULT_SETTINGS)
    expect(calls[0].width).toBe(720)
    expect(calls[0].height).toBe(1280)
    vi.doUnmock('modern-screenshot')
    vi.resetModules()
  })
})
