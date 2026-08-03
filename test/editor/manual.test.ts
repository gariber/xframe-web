import { describe, it, expect } from 'vitest'
import { buildManualTweet, MANUAL_ID } from '../../src/editor/manual'
import { buildFilename } from '../../src/render/export'

const ok = { name: 'Tibo', handle: 'thsottiaux', text: 'hello world' }

describe('buildManualTweet 必填欄位', () => {
  it('三欄齊全時產出 Post', () => {
    expect(buildManualTweet(ok)).not.toBeNull()
  })

  it.each([
    ['name', { ...ok, name: '' }],
    ['handle', { ...ok, handle: '' }],
    ['text', { ...ok, text: '' }],
  ])('缺少 %s 時回傳 null，不產出殘缺圖', (_field, input) => {
    expect(buildManualTweet(input)).toBeNull()
  })

  it.each([
    ['name', { ...ok, name: '   ' }],
    ['handle', { ...ok, handle: '  ' }],
    ['text', { ...ok, text: '\n \t ' }],
  ])('只有空白的 %s 視同未填', (_field, input) => {
    expect(buildManualTweet(input)).toBeNull()
  })
})

describe('buildManualTweet 欄位正規化', () => {
  it('去除 handle 開頭的 @', () => {
    expect(buildManualTweet({ ...ok, handle: '@thsottiaux' })!.author.handle).toBe('thsottiaux')
  })

  it('連續的 @ 也一併去除', () => {
    expect(buildManualTweet({ ...ok, handle: '@@foo' })!.author.handle).toBe('foo')
  })

  it('修剪姓名前後空白', () => {
    expect(buildManualTweet({ ...ok, name: '  Tibo  ' })!.author.name).toBe('Tibo')
  })

  it('不修剪內文——換行與縮排是使用者刻意排版的一部分', () => {
    const text = 'a\n\n  b'
    expect(buildManualTweet({ ...ok, text })!.rawText).toBe(text)
  })
})

describe('buildManualTweet 走既有的降級路徑', () => {
  const t = buildManualTweet(ok)!

  it('四項互動數皆為 null，與「真的是 0」可區分', () => {
    expect(t.metrics).toEqual([
      { kind: 'views', value: null },
      { kind: 'replies', value: null },
      { kind: 'reposts', value: null },
      { kind: 'likes', value: null },
    ])
  })

  it('無頭像網址，交給 Avatar 的首字母色塊', () => {
    expect(t.author.avatarUrl).toBe('')
    expect(t.author.avatarDataUrl).toBeUndefined()
  })

  it('無圖片、無引用推文', () => {
    expect(t.media).toEqual([])
    expect(t.quoted).toBeUndefined()
  })

  it('createdAt 為空字串，relTime 不會渲染出 NaN', () => {
    expect(t.createdAt).toBe('')
  })
})

describe('buildManualTweet 文字分段', () => {
  it('內文經過 tokenize，hashtag 與 mention 仍可上色', () => {
    const t = buildManualTweet({ ...ok, text: 'hi @openai about #ai' })!
    expect(t.text.map((s) => s.type)).toEqual(['text', 'mention', 'text', 'hashtag'])
  })

  it('分段串接回去等於原文', () => {
    const text = 'see https://x.com/a and #tag'
    const t = buildManualTweet({ ...ok, text })!
    expect(t.text.map((s) => s.value).join('')).toBe(text)
  })
})

describe('buildManualTweet 與匯出檔名', () => {
  it('id 為明顯合成值，不冒充真實推文 ID', () => {
    expect(MANUAL_ID).not.toMatch(/^\d+$/)
    expect(buildManualTweet(ok)!.id).toBe(MANUAL_ID)
  })

  it('惡意 handle 不會流進檔名', () => {
    const t = buildManualTweet({ ...ok, handle: 'a/b:c*d' })!
    expect(buildFilename(t)).not.toMatch(/[\/\\:*?"<>|]/)
  })

  it('來源是 manual，不冒充抓取結果', () => {
    // 沒有任何東西被抓取過，標成 'fetch' 等於在資料裡說謊。目前只有 'dom'
    // 有分支邏輯，所以這個值今天不影響行為 —— 正因為如此才要有測試守著，
    // 否則日後有人依 source 分流時才會發現它一直是錯的。
    expect(buildManualTweet(ok)!.source).toBe('manual')
  })
})
