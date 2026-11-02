import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { siThreads, siX } from 'simple-icons'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import { THREADS_CARD_METRIC_ORDER, X_CARD_METRIC_ORDER } from '../../src/render/metrics'
import type { Post } from '../../src/types'

const threadsPost: Post = {
  id: 'DABC123',
  url: 'https://www.threads.com/@gariber/post/DABC123',
  platform: 'threads',
  author: { name: 'Gariber', handle: 'gariber', handleDisplay: 'gariber', avatarUrl: '' },
  rawText: '今天的光很好',
  text: [{ type: 'text', value: '今天的光很好' }],
  createdAt: '2026-10-28T12:00:00.000Z',
  metrics: [
    { kind: 'shares', value: 4 },
    { kind: 'reposts', value: 3 },
    { kind: 'replies', value: 2 },
    { kind: 'likes', value: 1 },
  ],
  media: [],
  source: 'fetch',
  textComplete: true,
  topic: '攝影',
}

function mount(post: Post) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card post={post} settings={DEFAULT_SETTINGS} />, host)
  return host
}

function statLabels(el: HTMLElement): string[] {
  return [...el.querySelectorAll('[data-part="stats"] svg[aria-label]')].map((s) => s.getAttribute('aria-label')!)
}

describe('Card — Threads', () => {
  it('Threads 貼文用 Threads 的標誌', () => {
    const el = mount(threadsPost)
    const mark = el.querySelector('[data-part="threads-mark"] path')
    expect(mark?.getAttribute('d')).toBe(siThreads.path)
    expect(el.querySelector('[data-part="x-mark"]')).toBeNull()
  })

  it('統計列照 Threads 的順序：讚、回覆、轉發、分享（aria 標籤兩平台共用）', () => {
    expect(THREADS_CARD_METRIC_ORDER).toEqual(['likes', 'replies', 'reposts', 'shares'])
    expect(statLabels(mount(threadsPost))).toEqual(['讚', '回覆', '轉推', '分享'])
  })

  it('話題顯示在作者帳號旁', () => {
    const el = mount(threadsPost)
    const topic = el.querySelector('[data-part="topic"]') as HTMLElement
    expect(topic.textContent).toContain('攝影')
    expect(topic.parentElement).toBe((el.querySelector('[data-part="handle"]') as HTMLElement).parentElement)
  })

  it('只顯示帳號、不顯示暱稱（照 Threads，暱稱只會多佔字）', () => {
    const el = mount({ ...threadsPost, author: { ...threadsPost.author, name: '原子美術' } })
    expect(el.querySelector('[data-part="name"]')).toBeNull()
    expect(el.textContent).not.toContain('原子美術')
    expect(el.querySelector('[data-part="handle"]')?.textContent).toBe('gariber')
  })

  it('X 貼文仍同時顯示暱稱與帳號', () => {
    const el = mount({ ...threadsPost, platform: 'x', topic: undefined, author: { ...threadsPost.author, name: '原子美術', handleDisplay: '@gariber' } })
    expect(el.querySelector('[data-part="name"]')?.textContent).toBe('原子美術')
    expect(el.querySelector('[data-part="handle"]')?.textContent).toBe('@gariber')
  })

  it('X 貼文仍是 X 的標誌與順序，沒有話題', () => {
    const el = mount({ ...threadsPost, platform: 'x', topic: undefined, author: { ...threadsPost.author, handleDisplay: '@gariber' } })
    expect(el.querySelector('[data-part="x-mark"] path')?.getAttribute('d')).toBe(siX.path)
    expect(statLabels(el)).toEqual(X_CARD_METRIC_ORDER.map((k) => ({ replies: '回覆', reposts: '轉推', likes: '讚', bookmarks: '書籤' })[k as string]))
    expect(el.querySelector('[data-part="topic"]')).toBeNull()
  })
})
