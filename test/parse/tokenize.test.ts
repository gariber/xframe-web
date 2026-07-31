import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/parse/tokenize'

describe('tokenize', () => {
  it('純文字回傳單一 text 分段', () => {
    expect(tokenize('hello world')).toEqual([{ type: 'text', value: 'hello world' }])
  })

  it('空字串回傳空陣列', () => {
    expect(tokenize('')).toEqual([])
  })

  it('辨識 hashtag', () => {
    expect(tokenize('go #ai now')).toEqual([
      { type: 'text', value: 'go ' },
      { type: 'hashtag', value: '#ai' },
      { type: 'text', value: ' now' },
    ])
  })

  it('辨識中文 hashtag', () => {
    expect(tokenize('看 #人工智慧 嗎')).toEqual([
      { type: 'text', value: '看 ' },
      { type: 'hashtag', value: '#人工智慧' },
      { type: 'text', value: ' 嗎' },
    ])
  })

  it('辨識 mention', () => {
    expect(tokenize('hi @openai !')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@openai' },
      { type: 'text', value: ' !' },
    ])
  })

  it('辨識連結並保留 href', () => {
    const out = tokenize('see https://x.com/a here')
    expect(out[1]).toEqual({
      type: 'link', value: 'https://x.com/a', href: 'https://x.com/a',
    })
  })

  it('連結結尾的標點不併入網址', () => {
    const out = tokenize('go https://x.com/a.')
    expect(out[1]).toMatchObject({ type: 'link', value: 'https://x.com/a' })
    expect(out[2]).toEqual({ type: 'text', value: '.' })
  })

  it('保留換行', () => {
    expect(tokenize('a\n\nb')).toEqual([{ type: 'text', value: 'a\n\nb' }])
  })

  it('emoji 留在 text 分段內', () => {
    expect(tokenize('yes 🎉')).toEqual([{ type: 'text', value: 'yes 🎉' }])
  })

  it('多個 token 混合', () => {
    const out = tokenize('@a #b https://c.com d')
    expect(out.map((s) => s.type)).toEqual(['mention', 'text', 'hashtag', 'text', 'link', 'text'])
  })
})
