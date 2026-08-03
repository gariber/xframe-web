import { describe, it, expect } from 'vitest'
import { adapterFor, ADAPTERS } from '../../src/platforms'
import { xAdapter } from '../../src/platforms/x'

describe('adapterFor', () => {
  it('認得 x.com 與 twitter.com 的貼文連結', () => {
    expect(adapterFor('https://x.com/jack/status/20')).toBe(xAdapter)
    expect(adapterFor('https://twitter.com/jack/status/20')).toBe(xAdapter)
  })

  it('不認得其他網域', () => {
    expect(adapterFor('https://example.com/jack/status/20')).toBeUndefined()
    expect(adapterFor('https://www.threads.com/@a/post/B')).toBeUndefined()
  })

  it('網址不合法時不丟例外', () => {
    expect(adapterFor('not a url')).toBeUndefined()
  })

  it('不被字串掃描式的假網域誤導 —— host 才是唯一依據', () => {
    // 若 adapterFor 改用 includes/掃字串比對，這個惡意建構的網址會被誤判成 x.com。
    expect(adapterFor('https://evil.com/?x=x.com/a/status/1')).toBeUndefined()
  })
})

describe('ADAPTERS', () => {
  it('本階段只有 x 一份', () => {
    expect(ADAPTERS.map((a) => a.platform)).toEqual(['x'])
  })

  it('每份 adapter 的 hosts 都不為空 —— 空清單會讓 adapterFor 永遠比對不到', () => {
    for (const a of ADAPTERS) expect(a.hosts.length).toBeGreaterThan(0)
  })
})
