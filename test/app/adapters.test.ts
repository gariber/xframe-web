import { describe, it, expect } from 'vitest'
import { APP_ADAPTERS, appAdapterFor, extractShareUrl } from '../../app/adapters'
import { ADAPTERS } from '../../src/platforms'
import { threadsAdapter } from '../../src/platforms/threads'
import { xAdapter } from '../../src/platforms/x'

describe('app 的 adapter 註冊表', () => {
  it('app 認得 X 與 Threads', () => {
    expect(APP_ADAPTERS.map((a) => a.platform)).toEqual(['x', 'threads'])
    expect(appAdapterFor('https://www.threads.com/@a/post/B')).toBe(threadsAdapter)
    expect(appAdapterFor('https://threads.net/@a/post/B')).toBe(threadsAdapter)
    expect(appAdapterFor('https://x.com/a/status/1')).toBe(xAdapter)
  })

  it('網頁版與擴充功能的註冊表仍只有 X', () => {
    expect(ADAPTERS.map((a) => a.platform)).toEqual(['x'])
  })
})

describe('extractShareUrl', () => {
  it('去掉 X 分享帶的追蹤參數', () => {
    expect(extractShareUrl('https://x.com/u/status/123?s=46&t=abc')).toBe('https://x.com/u/status/123')
  })

  it('從「內文＋網址」的分享文字裡抽出 Threads 連結', () => {
    expect(extractShareUrl('看看這個 https://www.threads.com/@u/post/ABC?xmt=zz 好好笑')).toBe(
      'https://www.threads.com/@u/post/ABC',
    )
  })

  it('接受 threads.net', () => {
    expect(extractShareUrl('https://threads.net/@u/post/ABC')).toBe('https://threads.net/@u/post/ABC')
  })

  it('網址後面黏著中文標點也能正確切開', () => {
    expect(extractShareUrl('https://x.com/u/status/9，太好笑')).toBe('https://x.com/u/status/9')
  })

  it('保留不是追蹤用途的參數', () => {
    expect(extractShareUrl('https://x.com/u/status/9?lang=ja&utm_source=a')).toBe('https://x.com/u/status/9?lang=ja')
  })

  it('其他網域（含路徑裡藏 x.com 的）一律不收', () => {
    expect(extractShareUrl('https://example.com/x.com/u/status/1')).toBeNull()
    expect(extractShareUrl('沒有網址')).toBeNull()
  })

  it('有多個網址時取第一個認得的', () => {
    expect(extractShareUrl('https://example.com/a https://x.com/u/status/2 https://x.com/u/status/3')).toBe(
      'https://x.com/u/status/2',
    )
  })
})
