import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import type { CardSettings, Media, Post } from '../../src/types'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const photo = (n: number): Media => ({ url: `https://x/${n}.jpg`, dataUrl: PIXEL, alt: '', kind: 'photo' })
const video: Media = {
  url: 'https://x/cover.jpg',
  dataUrl: PIXEL,
  alt: '',
  kind: 'video',
  video: { url: 'https://x/v.mp4', durationMs: 1000 },
}

const LONG = '這是一段很長的內文，'.repeat(80)

function post(media: Media[], rawText = '短內文'): Post {
  return {
    id: '1',
    url: 'https://x.com/a/status/1',
    platform: 'x',
    author: { name: 'A', handle: 'a', handleDisplay: '@a', avatarUrl: '' },
    rawText,
    text: [{ type: 'text', value: rawText }],
    createdAt: '2026-10-28T12:00:00.000Z',
    metrics: [],
    media,
    source: 'fetch',
    textComplete: true,
  }
}

const APP: CardSettings = { ...DEFAULT_SETTINGS, aspect: '9:16', wholeMedia: true }

function mount(p: Post, settings: CardSettings) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card post={p} settings={settings} />, host)
  return host
}

const images = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-part="media"][data-owner="main"] img[data-part="media-image"]')] as HTMLImageElement[]

describe('Card — wholeMedia（app：媒體不裁切）', () => {
  it('每張照片照自己的比例滿寬呈現，不用 cover 裁切', () => {
    const el = mount(post([photo(1), photo(2), photo(3)]), APP)
    const imgs = images(el)
    expect(imgs).toHaveLength(3)
    for (const img of imgs) {
      expect(img.style.objectFit).not.toBe('cover')
      expect(img.style.width).toBe('100%')
      expect(img.style.height).toBe('')
    }
    const box = el.querySelector('[data-part="media"][data-owner="main"]') as HTMLElement
    expect(box.style.height).toBe('')
  })

  it('直影片＋長內文：內文一個字都不少', () => {
    const el = mount(post([video], LONG), APP)
    const body = el.querySelector('[data-part="body"]') ?? el
    expect(body.textContent).toContain(LONG)
    expect(images(el)[0].style.objectFit).not.toBe('cover')
  })

  it('沒開 wholeMedia 時（網頁版）照片仍是固定圖框、cover 裁切', () => {
    expect(DEFAULT_SETTINGS.wholeMedia).toBeFalsy()
    const el = mount(post([photo(1)]), { ...DEFAULT_SETTINGS, aspect: '9:16' })
    expect(images(el)[0].style.objectFit).toBe('cover')
  })
})
