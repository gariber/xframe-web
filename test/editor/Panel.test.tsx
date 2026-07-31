import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { readFileSync } from 'node:fs'
import { Panel } from '../../src/editor/Panel'
import { DEFAULT_SETTINGS } from '../../src/render/Card'
import * as exportMod from '../../src/render/export'
import * as storeMod from '../../src/editor/store'

vi.mock('../../src/render/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/render/export')>()
  return {
    ...actual,
    exportPng: vi.fn(),
    downloadBlob: vi.fn(),
  }
})

vi.mock('../../src/editor/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/editor/store')>()
  return {
    ...actual,
    loadSettings: vi.fn(actual.loadSettings),
    saveSettings: vi.fn(actual.saveSettings),
  }
})

const fx = readFileSync('test/fixtures/plain.html', 'utf8')
const PERMALINK = 'https://x.com/thsottiaux/status/2083053369351090254'

async function waitFor(check: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

function stubChrome() {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn(async (msg: { type: string }) => {
        if (msg.type === 'fetch-tweet-html') return { ok: true, type: 'fetch-tweet-html', html: fx }
        if (msg.type === 'hydrate-assets') return { ok: false, kind: 'network', message: 'stubbed' }
        return { ok: false, kind: 'unknown-request', message: 'stubbed' }
      }),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
    },
  })
}

let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  stubChrome()
  vi.mocked(exportMod.exportPng).mockReset()
  vi.mocked(exportMod.downloadBlob).mockReset()
  vi.mocked(storeMod.loadSettings).mockReset()
  vi.mocked(storeMod.saveSettings).mockReset()
})

afterEach(() => {
  render(null, host)
  host.remove()
  vi.unstubAllGlobals()
})

function mountReady() {
  vi.mocked(storeMod.loadSettings).mockResolvedValue(DEFAULT_SETTINGS)
  render(<Panel permalink={PERMALINK} onClose={() => {}} />, host)
  return waitFor(() => (host.querySelector('.xf-export') as HTMLButtonElement)?.disabled === false)
}

describe('Panel doExport 失敗處理（Fix A）', () => {
  it('exportPng 失敗時顯示錯誤訊息，而不是靜默恢復成「下載 PNG」', async () => {
    vi.mocked(exportMod.exportPng).mockRejectedValue(new Error('rasterize failed'))
    await mountReady()

    const btn = host.querySelector('.xf-export') as HTMLButtonElement
    btn.click()

    // 用「下載 PNG」等於初始（未 busy）文字去 waitFor 不可靠：mockRejectedValue
    // 產生的 promise 幾乎立刻 reject，busy true→false 整個循環可能在單一輪
    // setTimeout 觀測窗之間就跑完，導致文字比對從一開始就「碰巧」為真而完全
    // 沒等到 catch/finally 真的執行。改成等錯誤訊息本身出現 —— 它只會在
    // catch 執行後才存在，且不會像 busy 狀態那樣被 finally 立刻改回去。
    await waitFor(() => host.querySelector('.xf-export-error') !== null)

    expect(host.querySelector('.xf-export-error')?.textContent).toBe('產生圖片失敗，請重試')
    expect(exportMod.downloadBlob).not.toHaveBeenCalled()
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe('下載 PNG')
  })

  it('exportPng 成功時不顯示錯誤訊息', async () => {
    vi.mocked(exportMod.exportPng).mockResolvedValue(new Blob())
    await mountReady()

    const btn = host.querySelector('.xf-export') as HTMLButtonElement
    btn.click()

    await waitFor(() => vi.mocked(exportMod.downloadBlob).mock.calls.length > 0)

    expect(host.querySelector('.xf-export-error')).toBeNull()
  })
})

describe('Panel 初始設定載入失敗處理（Fix A）', () => {
  it('loadSettings 失敗時退回預設設定，而非讓 rejection 靜默消失', async () => {
    vi.mocked(storeMod.loadSettings).mockRejectedValue(new Error('storage broken'))
    render(<Panel permalink={PERMALINK} onClose={() => {}} />, host)

    await waitFor(() => (host.querySelector('.xf-export') as HTMLButtonElement)?.disabled === false)

    const fontSizeInput = host.querySelector('input[type="range"]:nth-of-type(1)') as HTMLInputElement
    // 面板應正常渲染並使用預設設定，而不是卡住或拋出未處理的 rejection
    expect(host.querySelector('.xf-panel')).not.toBeNull()
    expect(Number(fontSizeInput?.value || DEFAULT_SETTINGS.padding)).toBeGreaterThan(0)
  })
})

describe('Panel 抓推文失敗時的重試按鈕（Fix 4）', () => {
  it('錯誤畫面顯示可點擊的重試按鈕，點擊後重新發出 fetch-tweet-html 請求', async () => {
    const sendMessage = vi.fn(async (msg: { type: string }) => {
      if (msg.type === 'fetch-tweet-html') return { ok: false, kind: 'network', message: 'boom' }
      return { ok: false, kind: 'unknown-request', message: 'stubbed' }
    })
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
    })
    vi.mocked(storeMod.loadSettings).mockResolvedValue(DEFAULT_SETTINGS)
    render(<Panel permalink={PERMALINK} onClose={() => {}} />, host)

    await waitFor(() => host.querySelector('.xf-retry') !== null)
    const callsBeforeRetry = sendMessage.mock.calls.length

    const retryBtn = host.querySelector('.xf-retry') as HTMLButtonElement
    expect(retryBtn.tagName).toBe('BUTTON')
    retryBtn.click()

    await waitFor(() => sendMessage.mock.calls.length > callsBeforeRetry)
    expect(sendMessage.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'fetch-tweet-html' })
  })
})

describe('Panel 未知協定回應時的錯誤文案（Fix 5）', () => {
  it('kind 為 unknown-request 時顯示專屬文案，不會被籠統歸類成網路錯誤', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: false, kind: 'unknown-request', message: 'boom' })),
      },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
    })
    vi.mocked(storeMod.loadSettings).mockResolvedValue(DEFAULT_SETTINGS)
    render(<Panel permalink={PERMALINK} onClose={() => {}} />, host)

    await waitFor(() => host.querySelector('.xf-retry') !== null)
    expect(host.textContent).not.toContain('網路錯誤，請重試')
    expect(host.textContent).toContain('版本不相符')
  })
})

describe('Panel busy 時鎖定設定控制項（Fix B）', () => {
  it('匯出進行中時，設定 fieldset 應為 disabled，完成後恢復', async () => {
    let resolveExport!: (b: Blob) => void
    vi.mocked(exportMod.exportPng).mockImplementation(
      () => new Promise<Blob>((resolve) => { resolveExport = resolve }),
    )
    await mountReady()

    const fieldset = host.querySelector('fieldset') as HTMLFieldSetElement
    expect(fieldset.disabled).toBe(false)

    const btn = host.querySelector('.xf-export') as HTMLButtonElement
    btn.click()

    await waitFor(() => fieldset.disabled === true)
    expect(btn.textContent).toBe('產生中…')

    resolveExport(new Blob())
    await waitFor(() => fieldset.disabled === false)
  })
})
