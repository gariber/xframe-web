import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { readFileSync } from 'node:fs'
import type { Media, Post } from '../../src/types'
import { App } from '../../web/App'

const fetchMocks = vi.hoisted(() => ({
  fetchTweetHtml: vi.fn(),
  hydrateAssets: vi.fn(),
  fetchVideoBlob: vi.fn(),
}))

vi.mock('../../web/fetch', () => fetchMocks)

const PNG = 'data:image/png;base64,eA=='
const photo = (n: number): Media => ({
  url: `https://pbs.twimg.com/media/p${n}.jpg`, alt: `p${n}`, kind: 'photo', dataUrl: PNG,
})

let host: HTMLDivElement

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** 載入一則推文：影片那一則的 HTML，資產階段再依 extra 補上照片。 */
async function load(extra: (post: Post) => Media[]) {
  fetchMocks.hydrateAssets.mockImplementation(async (post: Post) => ({
    ...post,
    media: extra({ ...post, media: post.media.map((m) => ({ ...m, dataUrl: PNG })) }),
  }))
  const input = host.querySelector('#tweet-url') as HTMLInputElement
  input.value = 'https://x.com/mirochill/status/2097052743252783448'
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  await flush()
  const go = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === '產生卡片')!
  await act(async () => { go.click() })
  await flush()
}

const photoChoice = () => [...host.querySelectorAll('label.thread-choice')]
  .find((l) => l.textContent?.includes('同時分享照片'))?.querySelector('input') as HTMLInputElement | undefined
const mainKinds = () => [...host.querySelectorAll('.preview [data-owner="main"] [data-part="media-image"]')]
  .map((n) => (n as HTMLElement).dataset.kind)
const positionSlider = () => [...host.querySelectorAll('label')].some((l) => l.textContent?.includes('圖片位置'))

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  fetchMocks.fetchTweetHtml.mockReset()
    .mockResolvedValue(readFileSync('test/fixtures/inline-store-video.html', 'utf8'))
  fetchMocks.hydrateAssets.mockReset()
  fetchMocks.fetchVideoBlob.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  render(<App />, host)
})

afterEach(() => {
  render(null, host)
  host.remove()
  vi.restoreAllMocks()
})

/*
 * 影片優先：有影片也有照片的推文，預設只放影片，勾「同時分享照片」才連照片
 * 一起放（最多 1 支影片 + 3 張照片）。選擇規則本身在 Card.test.tsx 測，
 * 這裡測的是網頁上那個勾選框接得對不對。
 */
describe('同時分享照片', () => {
  it('預設只放影片；勾了之後照片照原本的順序一起放', async () => {
    await load((post) => [photo(1), ...post.media, photo(2)])
    expect(mainKinds()).toEqual(['video'])

    const box = photoChoice()!
    expect(box.checked).toBe(false)
    await act(async () => { box.click() })
    await flush()
    expect(mainKinds()).toEqual(['photo', 'video', 'photo'])
  })

  it('勾選會被記住 —— 跟「帶上被回覆／被引用的那一則」一樣', async () => {
    await load((post) => [...post.media, photo(1)])
    await act(async () => { photoChoice()!.click() })
    await flush()
    const saved = JSON.parse(localStorage.getItem('xframe.web.settings') ?? '{}')
    expect(saved.show?.photosWithVideo).toBe(true)
  })

  it('只有影片的推文不出現這個勾選框 —— 勾了也不會有任何變化', async () => {
    await load((post) => post.media)
    expect(photoChoice()).toBeUndefined()
  })

  it('只放影片時收起「圖片位置」，放進格子之後才出現', async () => {
    await load((post) => [...post.media, photo(1)])
    expect(positionSlider()).toBe(false)
    await act(async () => { photoChoice()!.click() })
    await flush()
    expect(positionSlider()).toBe(true)
  })
})
