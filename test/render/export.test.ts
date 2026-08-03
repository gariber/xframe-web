import { describe, it, expect, vi } from 'vitest'
import {
  buildFilename,
  exportScale,
  exportWidth,
  exportWidthBelowTarget,
  EXPORT_WIDTH,
  MAX_EXPORT_PIXELS,
} from '../../src/render/export'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'

const tweet = parseTweet(readFileSync('test/fixtures/plain.html', 'utf8'), '2083053369351090254')!

describe('buildFilename', () => {
  it('包含帳號與推文 ID', () => {
    const name = buildFilename(tweet)
    expect(name).toContain('thsottiaux')
    expect(name).toContain('2083053369351090254')
  })
  it('副檔名為 png', () => expect(buildFilename(tweet)).toMatch(/\.png$/))
  it('不含檔名不合法字元', () => {
    expect(buildFilename(tweet)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('handle 含特殊字元時仍安全', () => {
    const t = { ...tweet, author: { ...tweet.author, handle: 'a/b:c' } }
    expect(buildFilename(t)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('id 含特殊字元時仍安全', () => {
    const t = { ...tweet, id: '123/456:789' }
    expect(buildFilename(t)).not.toMatch(/[\/\\:*?"<>|]/)
  })
})

describe('exportScale：輸出寬度固定，不隨裝置畫面寬度變動', () => {
  // 這是整個改動的重點 —— 以前是「版面寬度 × 使用者選的倍率」，手機 358px
  // 只得到 716px 的圖，桌面同設定卻是 1440px。
  it.each([
    ['手機 9:16', 358, 636],
    ['手機 4:5', 358, 448],
    ['桌面擴充功能', 720, 900],
    ['極窄畫面', 280, 498],
  ])('%s 都輸出 %d 寬', (_label, w, h) => {
    expect(Math.round(w * exportScale(w, h))).toBe(EXPORT_WIDTH)
  })

  it('高度依比例跟著算，比例不變', () => {
    const [w, h] = [360, 450] // 正好 4:5
    const k = exportScale(w, h)
    expect(Math.round(w * k)).toBe(1080)
    expect(Math.round(h * k)).toBe(1350) // Instagram 直式原生尺寸
  })

  it('比版面大時放大、比版面小時縮小，都由同一個公式決定', () => {
    expect(exportScale(358, 636)).toBeGreaterThan(1)
    expect(exportScale(2000, 2000)).toBeLessThan(1)
  })

  // iOS Safari 超過約 1600 萬像素會靜靜給出全白畫布，不丟例外。
  it('極長的卡片壓在像素上限內，而不是無聲產出白圖', () => {
    const [w, h] = [358, 40_000]
    const k = exportScale(w, h)
    expect(w * k * h * k).toBeLessThanOrEqual(MAX_EXPORT_PIXELS + 1)
    expect(w * k).toBeLessThan(EXPORT_WIDTH) // 撞上限時寬度才會低於固定值
  })

  it('沒撞上限時不會被上限影響', () => {
    expect(exportScale(358, 636)).toBeCloseTo(EXPORT_WIDTH / 358, 10)
  })

  it('量到 0 時退回 1 而不是 Infinity', () => {
    expect(exportScale(0, 500)).toBe(1)
    expect(exportScale(500, 0)).toBe(1)
  })
})

describe('exportWidth', () => {
  it('一般尺寸輸出剛好是 EXPORT_WIDTH', () => {
    expect(exportWidth(540, 675)).toBe(EXPORT_WIDTH)
  })

  it('撞到像素上限時低於 EXPORT_WIDTH', () => {
    // 1080 寬時高度上限是 MAX_EXPORT_PIXELS / 1080 ≈ 14814px。
    // 用版面 540 寬、高度為該上限兩倍的卡片，必定超過。
    const layoutHeight = (MAX_EXPORT_PIXELS / EXPORT_WIDTH) * 2 * (540 / EXPORT_WIDTH)
    expect(exportWidth(540, layoutHeight)).toBeLessThan(EXPORT_WIDTH)
  })

  it('量不到尺寸時回傳 0 而非 NaN', () => {
    expect(exportWidth(0, 500)).toBe(0)
  })
})

describe('exportWidthBelowTarget', () => {
  // 從 Panel 的 JSX 條件式裡抽出來的純函式（同 canvasSizeStyle 的手法）：這樣
  // 「該不該顯示提示」這個判斷本身可以被斷言，不必依賴一定量不到真實幾何的
  // happy-dom 去間接檢查一個渲染輸出。
  it('一般尺寸沒撞上限，回傳 false', () => {
    expect(exportWidthBelowTarget(540, 675)).toBe(false)
  })

  it('撞到像素上限時回傳 true', () => {
    const layoutHeight = (MAX_EXPORT_PIXELS / EXPORT_WIDTH) * 2 * (540 / EXPORT_WIDTH)
    expect(exportWidthBelowTarget(540, layoutHeight)).toBe(true)
  })

  it('剛好等於 EXPORT_WIDTH 時回傳 false（門檻是嚴格小於，不是小於等於）', () => {
    expect(exportWidthBelowTarget(540, 675)).toBe(false)
  })
})

// 行動網頁版把卡片包在 scale() 裡讓整張塞進預覽框。modern-screenshot 的
// resolveBoundingBox 只在沒收到尺寸時才用 getBoundingClientRect()，而那個會
// 被祖先 transform 影響 —— 不明確給值的話匯出圖會縮成預覽大小且不報錯。
describe('匯出尺寸不受祖先 transform 影響', () => {
  it('明確傳入版面尺寸而非讓 modern-screenshot 自己量', async () => {
    const { domToBlob } = await import('modern-screenshot')
    const spy = vi.spyOn({ domToBlob }, 'domToBlob')
    void spy
    const calls: Array<Record<string, unknown>> = []
    vi.doMock('modern-screenshot', () => ({
      domToBlob: (_n: HTMLElement, o: Record<string, unknown>) => {
        calls.push(o)
        return Promise.resolve(new Blob(['x'], { type: 'image/png' }))
      },
    }))
    vi.resetModules()
    const { exportPng } = await import('../../src/render/export')
    const node = document.createElement('div')
    Object.defineProperty(node, 'offsetWidth', { value: 720, configurable: true })
    Object.defineProperty(node, 'offsetHeight', { value: 1280, configurable: true })
    await exportPng(node)
    expect(calls[0].width).toBe(720)
    expect(calls[0].height).toBe(1280)
    vi.doUnmock('modern-screenshot')
    vi.resetModules()
  })
})
