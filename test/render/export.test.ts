import { describe, it, expect } from 'vitest'
import { buildFilename } from '../../src/render/export'
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
