import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { App, type AppDeps } from '../../app/App'
import { MOODS } from '../../app/moods'
import { ThreadsFetchError } from '../../src/platforms/threads'
import type { Post } from '../../src/types'

function post(id: string, text: string, platform: Post['platform'] = 'threads'): Post {
  return {
    id,
    url: `https://www.threads.com/@a/post/${id}`,
    platform,
    author: { name: `作者${id}`, handle: 'a', handleDisplay: 'a', avatarUrl: '' },
    rawText: text,
    text: [{ type: 'text', value: text }],
    createdAt: '2026-10-28T12:00:00.000Z',
    metrics: [],
    media: [],
    source: 'fetch',
    textComplete: true,
  }
}

const ORIGINAL = post('ORIG', '原本的貼文')
const COMMENT = post('CMT', '這是留言')
const WITH_COMMENTS: Post = {
  ...ORIGINAL,
  comments: [1, 2, 3, 4, 5, 6].map((n) => post(`C${n}`, `留言${n}`)),
}

function deps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    acquire: async () => ORIGINAL,
    acquireComment: async () => COMMENT,
    hydrate: async (p) => p,
    ...over,
  }
}

let host: HTMLElement
afterEach(() => { render(null, host); host.remove() })

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

async function mount(d: AppDeps) {
  host = document.createElement('div')
  document.body.appendChild(host)
  await act(() => { render(<App deps={d} initialUrl="https://www.threads.com/@a/post/ORIG" />, host) })
  await flush()
  await flush()
}

const mainCard = () => host.querySelector('[data-part="main-card"]')!
const commentTexts = () =>
  [...host.querySelectorAll('[data-part="main-card"] [data-part="comment-body"]')].map((e) => e.textContent)
const bgIdOf = () => (host.querySelector('[data-part="main-card"]') as HTMLElement).dataset.bgId!

describe('App main screen', () => {
  it('tapping a mood updates the card without scrolling', async () => {
    await mount(deps())
    const humor = MOODS.find((m) => m.id === 'humor')!
    const thumb = host.querySelector<HTMLButtonElement>('[data-mood="humor"]')!
    await act(() => { thumb.click() })
    expect(humor.paperIds).toContain(bgIdOf())
    expect(thumb.getAttribute('aria-pressed')).toBe('true')
    expect(mainCard()).toBeTruthy()
  })

  it('reshuffle keeps the mood', async () => {
    await mount(deps())
    await act(() => { host.querySelector<HTMLButtonElement>('[data-mood="soft"]')!.click() })
    const soft = MOODS.find((m) => m.id === 'soft')!
    const before = bgIdOf()
    await act(() => { host.querySelector<HTMLButtonElement>('[data-action="reshuffle"]')!.click() })
    expect(bgIdOf()).not.toBe(before)
    expect(soft.paperIds).toContain(bgIdOf())
    expect(host.querySelector('[data-mood="soft"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('drawer exposes paper, padding, font size, panel color and opacity', async () => {
    await mount(deps())
    const drawer = host.querySelector('[data-part="tweak-drawer"]')!
    expect(drawer.querySelector('[data-control="paper"]')).toBeTruthy()
    for (const label of ['留白', '文字尺寸', '底板顏色', '底板透明度']) {
      expect(drawer.textContent).toContain(label)
    }
    const padding = drawer.querySelector<HTMLInputElement>('[data-control="padding"]')!
    await act(() => {
      padding.value = '10'
      padding.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector<HTMLInputElement>('[data-control="padding"]')!.value).toBe('10')
  })

  it('adding a comment link shows the original post with only that comment', async () => {
    await mount(deps({ acquire: async () => WITH_COMMENTS }))
    const input = host.querySelector<HTMLInputElement>('[data-control="comment-url"]')!
    await act(() => {
      input.value = 'https://www.threads.com/@b/post/CMT'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(() => { host.querySelector<HTMLButtonElement>('[data-action="add-comment"]')!.click() })
    await flush()
    await flush()
    const card = mainCard()
    expect(card.querySelector('[data-part="body"]')!.textContent).toContain('原本的貼文')
    expect(commentTexts()).toEqual(['這是留言'])
    const boxes = [...host.querySelectorAll<HTMLInputElement>('[data-control="comment-pick"]')]
    expect(boxes.filter((b) => b.checked)).toHaveLength(1)
  })

  it('turning comments on shows the top 4 by default', async () => {
    await mount(deps({ acquire: async () => WITH_COMMENTS }))
    expect(commentTexts()).toEqual([])
    const toggle = host.querySelector<HTMLInputElement>('[data-control="show-comments"]')!
    await act(() => { toggle.click() })
    expect(commentTexts()).toEqual(['留言1', '留言2', '留言3', '留言4'])
    const fifth = host.querySelectorAll<HTMLInputElement>('[data-control="comment-pick"]')[4]
    await act(() => { fifth.click() })
    expect(commentTexts()).toEqual(['留言1', '留言2', '留言3', '留言4', '留言5'])
  })

  it('drawer offers absolute time', async () => {
    await mount(deps())
    const select = host.querySelector<HTMLSelectElement>('[data-control="time-format"]')!
    await act(() => {
      select.value = 'absolute'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const time = mainCard().querySelector('[data-part="time"]')!
    expect(time.textContent).toMatch(/2026/)
  })

  it('video without a known duration is labelled without seconds', async () => {
    const withVideo: Post = {
      ...ORIGINAL,
      media: [{ url: 'https://x/c.jpg', dataUrl: 'data:image/png;base64,AA==', alt: '', kind: 'video', video: { url: 'https://x/v.mp4', durationMs: 0 } }],
    }
    await mount(deps({ acquire: async () => withVideo }))
    expect(host.querySelector('[data-action="share"]')!.textContent).toBe('分享影片')
  })

  it('a second share replaces the current card', async () => {
    let load: (url: string) => void = () => {}
    const second = post('SECOND', '第二則分享')
    const d = deps({ acquire: async (url) => (url.includes('SECOND') ? second : ORIGINAL) })
    host = document.createElement('div')
    document.body.appendChild(host)
    await act(() => { render(<App deps={d} subscribe={(l) => { load = l }} />, host) })
    await act(() => { load('https://www.threads.com/@a/post/ORIG') })
    await flush()
    await act(() => { load('https://www.threads.com/@a/post/SECOND') })
    await flush()
    await flush()
    expect(mainCard().textContent).toContain('第二則分享')
    expect(mainCard().textContent).not.toContain('原本的貼文')
  })

  it('refused threads post shows the login-wall explanation', async () => {
    await mount(deps({ acquire: async () => { throw new ThreadsFetchError('refused', 'login wall') } }))
    expect(host.textContent).toContain(
      'Threads 不讓未登入讀取這則貼文（可能是敏感內容、私人帳號或已刪除）。可以改用複製貼文文字貼上。',
    )
  })
})
