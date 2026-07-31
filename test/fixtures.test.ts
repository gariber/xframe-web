import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

const NAMES = ['plain', 'quoted', 'media', 'quoted-with-media']

describe('fixtures', () => {
  it.each(NAMES)('%s 存在且含 microdata article', (name) => {
    const path = `test/fixtures/${name}.html`
    expect(existsSync(path)).toBe(true)
    const html = readFileSync(path, 'utf8')
    expect(html.length).toBeGreaterThan(100_000)
    expect(html).toContain('itemType="https://schema.org/SocialMediaPosting"')
    expect(html).toContain('data-tweet-id')
  })

  it('quoted fixture 含引用推文', () => {
    const html = readFileSync('test/fixtures/quoted.html', 'utf8')
    expect(html).toContain('itemProp="citation"')
  })

  it('media fixture 含推文圖片', () => {
    const html = readFileSync('test/fixtures/media.html', 'utf8')
    expect(html).toContain('pbs.twimg.com/media/')
  })
})
