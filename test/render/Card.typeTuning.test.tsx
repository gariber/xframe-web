import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import type { Post, TypeTuning } from '../../src/types'

const post: Post = {
  id: '1',
  url: 'https://x.com/a/status/1',
  platform: 'x',
  author: { name: 'A', handle: 'a', handleDisplay: '@a', avatarUrl: '' },
  rawText: '內文 text',
  text: [{ type: 'text', value: '內文 text' }],
  createdAt: '2026-10-28T12:00:00.000Z',
  metrics: [],
  media: [],
  source: 'fetch',
  textComplete: true,
}

function mount(typeTuning?: TypeTuning) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card post={post} settings={DEFAULT_SETTINGS} typeTuning={typeTuning} />, host)
  return {
    body: host.querySelector<HTMLElement>('[data-part="body"]')!,
    name: host.querySelector<HTMLElement>('[data-part="name"]')!,
  }
}

describe('Card typeTuning', () => {
  it('Card applies typeTuning line-height and weights', () => {
    const { body, name } = mount({ lineHeight: 1.9, letterSpacingEm: 0.06, bodyWeight: 300, nameWeight: 600 })
    expect(body.style.lineHeight).toBe('1.9')
    expect(body.style.letterSpacing).toBe('0.06em')
    expect(body.style.fontWeight).toBe('300')
    expect(name.style.fontWeight).toBe('600')
  })

  it('Card without typeTuning renders as before', () => {
    const { body, name } = mount()
    expect(body.style.lineHeight).toBe('1.62')
    expect(body.style.letterSpacing).toBe('')
    expect(body.style.fontWeight).toBe('')
    expect(name.style.fontWeight).toBe('700')
  })
})
