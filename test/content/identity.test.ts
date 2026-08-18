import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
// warnIfAnotherCopyIsRunning 刻意不在這裡靜態匯入：它的「只警告一次」旗標是
// 模組層級狀態，每個案例都要用 vi.resetModules() 取得乾淨的實例。
import {
  EXTENSION_ID, MARK, BUTTON_CLASS, HOST_ID, LEGACY_MARK, LEGACY_HOST_ID,
} from '../../src/content/identity'

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => vi.restoreAllMocks())

describe('本副本的 DOM 識別字串', () => {
  it('注入標記與 host id 都帶著擴充功能自己的 ID', () => {
    expect(MARK).toBe(`${LEGACY_MARK}-${EXTENSION_ID}`)
    expect(HOST_ID).toBe(`${LEGACY_HOST_ID}-${EXTENSION_ID}`)
    expect(BUTTON_CLASS).toContain(EXTENSION_ID)
  })

  // 這正是 0.3.0 以前的問題：兩份副本共用同一組字串，先跑的標記完 anchor，
  // 後跑的整個跳過，頁面上只有一顆按鈕且不知道屬於誰。
  it('命名空間後的標記不等於舊版的共用標記', () => {
    expect(MARK).not.toBe(LEGACY_MARK)
    expect(HOST_ID).not.toBe(LEGACY_HOST_ID)
  })
})

/*
 * 同時裝著兩份 XFrame 時，兩份都會在推文右上角注入按鈕，而定位一模一樣
 * （top:8px right:8px）—— 按鈕完全重疊，使用者點到的永遠是同一顆，而且看不出
 * 是哪一份的。症狀是「明明裝了新版，行為卻始終是舊版」，且沒有任何錯誤訊息。
 * 舊版不會印任何 log，只能從它留在 DOM 上的痕跡反推。
 */
describe('偵測頁面上的其他 XFrame 副本', () => {
  // 警告是「一次性」的（發現之後就不再重複刷 console），那個旗標是模組層級的
  // 狀態。每個案例都重新載入模組，否則第一個觸發警告的測試會讓後面的全部變成
  // 假通過。
  async function detectWith(html: string): Promise<number> {
    vi.resetModules()
    document.body.innerHTML = html
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await import('../../src/content/identity')
    mod.warnIfAnotherCopyIsRunning()
    const calls = warn.mock.calls.length
    warn.mockRestore()
    return calls
  }

  it('乾淨的頁面不發警告', async () => {
    expect(await detectWith('')).toBe(0)
  })

  it('看到舊版的共用注入標記就警告', async () => {
    expect(await detectWith(`<div ${LEGACY_MARK}></div>`)).toBe(1)
  })

  it('看到舊版的 shadow host 就警告', async () => {
    expect(await detectWith(`<div id="${LEGACY_HOST_ID}"></div>`)).toBe(1)
  })

  it('看到別份副本的命名空間 host 也警告', async () => {
    expect(await detectWith(`<div id="${LEGACY_HOST_ID}-someotherextensionid"></div>`)).toBe(1)
  })

  it('自己的 host 與自己的標記不算另一份副本', async () => {
    expect(await detectWith(`<div id="${HOST_ID}"></div><div ${MARK}></div>`)).toBe(0)
  })

  it('只警告一次，不重複刷 console', async () => {
    vi.resetModules()
    document.body.innerHTML = `<div ${LEGACY_MARK}></div>`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await import('../../src/content/identity')
    mod.warnIfAnotherCopyIsRunning()
    mod.warnIfAnotherCopyIsRunning()
    mod.warnIfAnotherCopyIsRunning()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('警告內容說得出該怎麼處理', async () => {
    vi.resetModules()
    document.body.innerHTML = `<div ${LEGACY_MARK}></div>`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await import('../../src/content/identity')
    mod.warnIfAnotherCopyIsRunning()
    const text = String(warn.mock.calls[0]![0])
    expect(text).toContain('另一份 XFrame')
    expect(text).toContain('chrome://extensions')
  })
})
