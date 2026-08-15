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

describe('Safari 可編輯翻譯面板', () => {
  it('正式卡片與主頁來源都不交給 Safari 直接翻譯，譯文仍可編輯', async () => {
    await loadEnglishPost()

    const cardBody = host.querySelector('.preview [data-part="body"]') as HTMLElement
    const sourceBody = host.querySelector('.translation-source [data-part="body"]') as HTMLElement
    expect(cardBody.getAttribute('translate')).toBe('no')
    expect(sourceBody.closest('.translation-source')?.getAttribute('translate')).toBe('no')
    expect(sourceBody.lang).toBe('en')
    expect(host.querySelector('#translation-main')).not.toBeNull()
  })

  it('編輯草稿不會即時改卡片，按套用後才替換，並可還原原文', async () => {
    await loadEnglishPost()
    const cardBody = () => host.querySelector('.preview [data-part="body"]') as HTMLElement
    const original = cardBody().textContent
    const textarea = host.querySelector('#translation-main') as HTMLTextAreaElement

    textarea.value = '這是使用者編輯過的繁體中文譯文。'
    await act(async () => { textarea.dispatchEvent(new Event('input', { bubbles: true })) })
    await flush()
    expect(cardBody().textContent).toBe(original)

    button('套用到卡片').click()
    await flush()
    expect(cardBody().textContent).toBe('這是使用者編輯過的繁體中文譯文。')
    expect(host.textContent).toContain('譯文已套用到卡片。')

    button('還原原文').click()
    await flush()
    expect(cardBody().textContent).toBe(original)
    expect((host.querySelector('#translation-main') as HTMLTextAreaElement).value).toBe(original)
  })

  it('Safari 專用分頁送回譯文後，先進入編輯框而不直接改卡片', async () => {
    await loadEnglishPost()
    const cardBody = host.querySelector('.preview [data-part="body"]') as HTMLElement
    const original = cardBody.textContent
    button('開啟 Safari 翻譯分頁').click()
    await flush()

    const openedUrl = vi.mocked(window.open).mock.calls[0]?.[0] as URL
    const token = openedUrl.searchParams.get('safari-translate')!
    const key = `xframe.web.safari-translation.result.${token}`
    const result = JSON.stringify({ main: 'Safari 產生的繁體中文譯文。', quoted: null })
    localStorage.setItem(key, result)

    window.dispatchEvent(new StorageEvent('storage', { key, newValue: result }))
    await flush()

    expect((host.querySelector('#translation-main') as HTMLTextAreaElement).value)
      .toBe('Safari 產生的繁體中文譯文。')
    expect(cardBody.textContent).toBe(original)
    expect(host.textContent).toContain('可以先修改，再套用到卡片')
  })

  it('開啟專用分頁時只傳外文原文與分段，不直接改卡片', async () => {
    await loadEnglishPost()
    const original = (host.querySelector('.preview [data-part="body"]') as HTMLElement).textContent

    button('開啟 Safari 翻譯分頁').click()
    await flush()

    const openedUrl = vi.mocked(window.open).mock.calls[0]?.[0] as URL
    expect(openedUrl.searchParams.get('safari-translate')).toBeTruthy()
    const token = openedUrl.searchParams.get('safari-translate')!
    const payload = JSON.parse(localStorage.getItem(`xframe.web.safari-translation.request.${token}`)!)
    expect(payload.main.original).toBe(original)
    expect((host.querySelector('.preview [data-part="body"]') as HTMLElement).textContent).toBe(original)
  })
})
