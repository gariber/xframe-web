import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { readFileSync } from 'node:fs'
import { Panel } from '../../src/editor/Panel'
import { DEFAULT_SETTINGS } from '../../src/render/Card'
import * as storeMod from '../../src/editor/store'

vi.mock('../../src/editor/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/editor/store')>()
  return { ...actual, loadSettings: vi.fn(actual.loadSettings), saveSettings: vi.fn(actual.saveSettings) }
})

const FOREIGN = readFileSync('test/fixtures/plain.html', 'utf8')
const PERMALINK = 'https://x.com/thsottiaux/status/2083053369351090254'

/** 中文推文：翻譯流程不該出現（XFrame 的產品規則是簡體、正體都不翻）。 */
const CHINESE_ID = '2083053369351090254'
const CHINESE = `<article data-tweet-id="${CHINESE_ID}" itemtype="https://schema.org/SocialMediaPosting">
  <meta itemprop="identifier" content="${CHINESE_ID}">
  <meta itemprop="text" content="今天天氣很好，出門走走。">
  <div itemprop="author"><meta itemprop="name" content="某人"><meta itemprop="alternateName" content="someone"></div>
</article>`

async function waitFor(check: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

let host: HTMLElement

function stubChrome(html: string) {
  // 直接抓打成失敗，讓測試走背景代抓那條穩定的路（見 Panel.test.tsx 的說明）
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('no direct fetch in test') }))
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn(async (msg: { type: string }) => {
        if (msg.type === 'fetch-tweet-html') return { ok: true, type: 'fetch-tweet-html', html }
        return { ok: false, kind: 'network', message: 'stubbed' }
      }),
      getManifest: () => ({ version: 'test' }),
    },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  vi.mocked(storeMod.loadSettings).mockReset()
  vi.mocked(storeMod.loadSettings).mockResolvedValue(DEFAULT_SETTINGS)
})

afterEach(() => {
  render(null, host)
  host.remove()
  vi.unstubAllGlobals()
})

async function mount(html = FOREIGN) {
  stubChrome(html)
  render(<Panel permalink={PERMALINK} onClose={() => {}} />, host)
  await waitFor(() => (host.querySelector('.xf-export') as HTMLButtonElement)?.disabled === false)
}

const mainBox = () => host.querySelector('#translation-main') as HTMLTextAreaElement | null
const cardBody = () => host.querySelector('.xf-preview [data-part="body"]') as HTMLElement
const mark = () => host.querySelector('.xf-preview [data-part="translated-from"]')
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function type(value: string) {
  const box = mainBox()!
  box.value = value
  await act(async () => { box.dispatchEvent(new Event('input', { bubbles: true })) })
  await flush()
}

async function click(label: string) {
  await act(async () => { button(label).click() })
  await flush()
}

/*
 * 擴充功能面板一度完全沒有翻譯流程 —— 網頁版有、面板沒有，而兩邊是同一個產品。
 * 現在兩邊共用 src/ui/TranslationPanel，這組測試守的是「面板真的把它接起來了」：
 * 光是元件存在不代表面板有渲染它、有把狀態接對。
 */
describe('面板的翻譯流程', () => {
  it('外文推文會出現貼上譯文的流程', async () => {
    await mount()
    expect(mainBox()).not.toBeNull()
    expect(host.textContent).toContain('貼上 X 翻好的譯文')
  })

  it('中文推文不出現翻譯流程', async () => {
    await mount(CHINESE)
    expect(mainBox()).toBeNull()
  })

  it('套用後卡片換成譯文，並標示翻譯自哪個語言', async () => {
    await mount()
    const before = cardBody().textContent
    expect(mark()).toBeNull()

    await type('這是我貼上的譯文。')
    await click('套用到卡片')

    expect(cardBody().textContent).toContain('這是我貼上的譯文。')
    expect(cardBody().textContent).not.toBe(before)
  })

  it('可以切回原文再切回譯文，原文不會被吃掉', async () => {
    await mount()
    const original = cardBody().textContent
    await type('這是我貼上的譯文。')
    await click('套用到卡片')

    await click('顯示原文')
    expect(cardBody().textContent).toBe(original)
    expect(mark()).toBeNull()

    await click('顯示譯文')
    expect(cardBody().textContent).toContain('這是我貼上的譯文。')
  })

  it('還原原文會清掉譯文與標示', async () => {
    await mount()
    const original = cardBody().textContent
    await type('這是我貼上的譯文。')
    await click('套用到卡片')

    await click('還原原文')
    expect(cardBody().textContent).toBe(original)
    expect(mainBox()!.value).toBe('')
  })

  // 空框就套用會讓卡片標成「翻譯自英文」卻什麼都沒變 —— 那行標示會說謊。
  it('貼上框是空的時不套用，並說明原因', async () => {
    await mount()
    await click('套用到卡片')
    expect(host.textContent).toContain('貼上框是空的')
    expect(mark()).toBeNull()
  })
})
