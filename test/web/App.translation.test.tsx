import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { readFileSync } from 'node:fs'
import { App } from '../../web/App'

const fetchMocks = vi.hoisted(() => ({
  fetchTweetHtml: vi.fn(),
  hydrateAssets: vi.fn(),
}))

vi.mock('../../web/fetch', () => fetchMocks)

const fixture = readFileSync('test/fixtures/plain.html', 'utf8')
let host: HTMLDivElement

function button(label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  if (!match) throw new Error(`找不到按鈕：${label}`)
  return match
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function loadEnglishPost() {
  const input = host.querySelector('#tweet-url') as HTMLInputElement
  input.value = 'https://x.com/thsottiaux/status/2083053369351090254'
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  await flush()
  await act(async () => { button('產生卡片').click() })
  await flush()
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  document.documentElement.lang = 'zh-Hant'
  vi.spyOn(window, 'open').mockReturnValue({} as Window)
  fetchMocks.fetchTweetHtml.mockReset().mockResolvedValue(fixture)
  fetchMocks.hydrateAssets.mockReset().mockImplementation(async (post) => post)
  host = document.createElement('div')
  document.body.appendChild(host)
  render(<App />, host)
})

afterEach(() => {
  render(null, host)
  host.remove()
  vi.restoreAllMocks()
  history.replaceState(null, '', '/')
})

describe('貼上 X 譯文的面板', () => {
  it('卡片與原文區塊都不交給瀏覽器翻譯，貼上框是空的', async () => {
    await loadEnglishPost()

    const cardBody = host.querySelector('.preview [data-part="body"]') as HTMLElement
    const sourceBody = host.querySelector('.translation-source [data-part="body"]') as HTMLElement
    expect(cardBody.getAttribute('translate')).toBe('no')
    expect(sourceBody.closest('.translation-source')?.getAttribute('translate')).toBe('no')
    expect(sourceBody.lang).toBe('en')
    // 貼上框預設空白：預填原文的話使用者得先刪掉才能貼
    expect((host.querySelector('#translation-main') as HTMLTextAreaElement).value).toBe('')
  })

  it('打字不會即時改卡片，按套用後才替換，並可還原原文', async () => {
    await loadEnglishPost()
    const cardBody = () => host.querySelector('.preview [data-part="body"]') as HTMLElement
    const original = cardBody().textContent
    const textarea = host.querySelector('#translation-main') as HTMLTextAreaElement

    textarea.value = '這是貼上的譯文。'
    await act(async () => { textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    await flush()
    expect(cardBody().textContent).toBe(original)

    await act(async () => { button('套用到卡片').click() })
    await flush()
    expect(cardBody().textContent).toBe('這是貼上的譯文。')

    await act(async () => { button('還原原文').click() })
    await flush()
    expect(cardBody().textContent).toBe(original)
    expect((host.querySelector('#translation-main') as HTMLTextAreaElement).value).toBe('')
  })

  it('套用後卡片標出「翻譯自◯文」，還原後標示消失', async () => {
    await loadEnglishPost()
    const marker = () => host.querySelector('.preview [data-part="translated-from"]')
    expect(marker()).toBeNull()

    const textarea = host.querySelector('#translation-main') as HTMLTextAreaElement
    textarea.value = '這是貼上的譯文。'
    await act(async () => { textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { button('套用到卡片').click() })
    await flush()

    expect(marker()?.textContent).toBe('翻譯自英文')

    await act(async () => { button('還原原文').click() })
    await flush()
    expect(marker()).toBeNull()
  })

  it('來源語言可手動覆蓋——偵測分不出全漢字日文與中文', async () => {
    await loadEnglishPost()
    const select = host.querySelector('#translation-from') as HTMLSelectElement
    expect(select.value).toBe('en')

    select.value = 'ja'
    await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })) })

    const textarea = host.querySelector('#translation-main') as HTMLTextAreaElement
    textarea.value = '這是貼上的譯文。'
    await act(async () => { textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { button('套用到卡片').click() })
    await flush()

    expect(host.querySelector('.preview [data-part="translated-from"]')?.textContent)
      .toBe('翻譯自日文')
  })

  it('貼上框留空時給提示，不會把卡片標成譯文', async () => {
    await loadEnglishPost()
    const cardBody = () => host.querySelector('.preview [data-part="body"]') as HTMLElement
    const original = cardBody().textContent

    await act(async () => { button('套用到卡片').click() })
    await flush()

    expect(cardBody().textContent).toBe(original)
    expect(host.querySelector('.preview [data-part="translated-from"]')).toBeNull()
    expect(host.textContent).toContain('貼上框是空的')
  })

  it('不再有 Safari 專用分頁的入口', async () => {
    await loadEnglishPost()
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).not.toContain('開啟 Safari 翻譯分頁')
    expect(vi.mocked(window.open)).not.toHaveBeenCalled()
  })
})
