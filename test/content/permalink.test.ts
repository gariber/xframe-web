import { describe, it, expect, beforeEach } from 'vitest'
import { findPermalink, findTweetRoots } from '../../src/content/permalink'

beforeEach(() => { document.body.innerHTML = '' })

function make(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe('findPermalink', () => {
  it('從相對路徑連結取得絕對網址', () => {
    const el = make('<article><a href="/tibo/status/123">t</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/tibo/status/123')
  })

  it('已是絕對網址則保留', () => {
    const el = make('<article><a href="https://x.com/a/status/9">t</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/a/status/9')
  })

  it('忽略 /photo/ 等尾綴，取正規化網址', () => {
    const el = make('<article><a href="/a/status/55/photo/1">t</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/a/status/55')
  })

  it('忽略 /quotes、/likes 等分析頁連結', () => {
    const el = make('<article><a href="/a/status/77/quotes">q</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/a/status/77')
  })

  it('無 status 連結回傳 null', () => {
    const el = make('<article><a href="/tibo">t</a></article>')
    expect(findPermalink(el)).toBeNull()
  })

  it('取第一個 status 連結，不受引用推文干擾', () => {
    const el = make(
      '<article><a href="/outer/status/1">a</a><article><a href="/inner/status/2">b</a></article></article>',
    )
    expect(findPermalink(el)).toBe('https://x.com/outer/status/1')
  })

  it('即使引用推文的連結在文件順序中排在前面，仍取外層自己的連結', () => {
    // 這個案例才會真正驗證 closest() 排除巢狀連結的邏輯：
    // 若移除該邏輯，querySelectorAll 會先命中內層引用推文的連結。
    const el = make(
      '<article><article><a href="/inner/status/2">b</a></article><a href="/outer/status/1">a</a></article>',
    )
    expect(findPermalink(el)).toBe('https://x.com/outer/status/1')
  })
})

describe('findTweetRoots', () => {
  it('找出所有 article 節點', () => {
    make('<div><article><a href="/a/status/1">x</a></article><article><a href="/b/status/2">y</a></article></div>')
    expect(findTweetRoots(document)).toHaveLength(2)
  })

  it('排除沒有 status 連結的 article', () => {
    make('<div><article><a href="/a/status/1">x</a></article><article><p>no link</p></article></div>')
    expect(findTweetRoots(document)).toHaveLength(1)
  })

  it('巢狀 article 不重複計算，只取最外層', () => {
    make('<div><article><a href="/a/status/1">x</a><article><a href="/b/status/2">y</a></article></article></div>')
    expect(findTweetRoots(document)).toHaveLength(1)
  })
})
