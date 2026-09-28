import { describe, it, expect, vi } from 'vitest'
import {
  buildFilename,
  cropTo,
  exportScale,
  exportLayoutHeight,
  exportPixelSize,
  exportWidth,
  exportWidthBelowTarget,
  rasterLayoutHeight,
  EXPORT_WIDTH,
  MAX_EXPORT_PIXELS,
} from '../../src/render/export'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'
import type { Post } from '../../src/types'

const post = parseTweet(readFileSync('test/fixtures/plain.html', 'utf8'), '2083053369351090254')!

describe('buildFilename', () => {
  it('包含帳號與推文 ID', () => {
    const name = buildFilename(post)
    expect(name).toContain('thsottiaux')
    expect(name).toContain('2083053369351090254')
  })
  it('副檔名為 png', () => expect(buildFilename(post)).toMatch(/\.png$/))
  it('不含檔名不合法字元', () => {
    expect(buildFilename(post)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('handle 含特殊字元時仍安全', () => {
    const p = { ...post, author: { ...post.author, handle: 'a/b:c' } }
    expect(buildFilename(p)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('id 含特殊字元時仍安全', () => {
    const p = { ...post, id: '123/456:789' }
    expect(buildFilename(p)).not.toMatch(/[\/\\:*?"<>|]/)
  })

  it('前綴用 platform 而非寫死的 x', () => {
    expect(buildFilename({ ...post, platform: 'x', author: { ...post.author, handle: 'jack' }, id: '20' }))
      .toBe('x-jack-20.png')
  })

  // Platform 目前只有 'x' 一個真實成員，上面那個斷言因此無法區分「前綴確實讀自
  // post.platform」與「前綴仍是寫死的 'x-'，恰好與 platform 的唯一值相同」。這裡
  // 用型別斷言塞一個真實情境不存在的假值，只為了讓測試能觀察到兩者的差異，
  // 不代表 Platform 真的有第二個成員。
  it('前綴確實讀自 post.platform，不是恰好等於寫死值', () => {
    const fakePlatform = 'zzz' as Post['platform']
    expect(buildFilename({ ...post, platform: fakePlatform, author: { ...post.author, handle: 'jack' }, id: '20' }))
      .toBe('zzz-jack-20.png')
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

describe('exportLayoutHeight：固定比例輸出精確平台尺寸', () => {
  it('手機版 9:16 不受 offsetHeight 整數捨入影響', () => {
    const h = exportLayoutHeight(358, 636, '9:16')
    expect(Math.round(h * (EXPORT_WIDTH / 358))).toBe(1920)
  })

  it.each([
    ['1:1', 1080],
    ['4:5', 1350],
    ['9:16', 1920],
  ])('%s 對應 1080×%d', (aspect, expectedHeight) => {
    const h = exportLayoutHeight(358, 1, aspect)
    expect(Math.round(h * (EXPORT_WIDTH / 358))).toBe(expectedHeight)
  })

  it('auto 沿用內容實際高度', () => {
    expect(exportLayoutHeight(358, 712, 'auto')).toBe(712)
  })
})

/*
 * 圖片底部那條白線。
 *
 * 瀏覽器把 SVG 圖片的內在尺寸四捨五入成整數 CSS px，所以 390px 寬的 9:16
 * 卡片（版面高度 693.333…px）被包成 SVG 後只剩 693px 高，最後 0.333px 的
 * 內容在光柵化的當下就被裁掉；modern-screenshot 仍照 693.333 算出 1920 列的
 * canvas，於是最後一列整條 alpha = 0。分享時轉成 JPEG 或貼在白底上，那條
 * 全透明的列就變成一條白線。
 *
 * 這組斷言鎖住的是「交出去的高度必須是整數」這個因果，而不是白線本身 ——
 * 白線只有真的版面引擎量得到（實測是用 headless Chromium 讀匯出 PNG 最後
 * 一列的 alpha 確認的），happy-dom 看不到。
 */
describe('rasterLayoutHeight：交給光柵化器的高度一律是整數', () => {
  it.each([
    ['9:16 @390', 693.3333333333334, 694],
    ['9:16 @430', 764.4444444444445, 765],
    ['4:5 @390', 487.5, 488],
    ['9:16 @360 本來就是整數', 640, 640],
  ])('%s → %d', (_label, layoutHeight, expected) => {
    expect(rasterLayoutHeight(layoutHeight)).toBe(expected)
  })

  it('一律往上取整，內容才不可能被裁掉', () => {
    for (const h of [100.01, 100.4, 100.5, 100.99]) {
      expect(rasterLayoutHeight(h)).toBeGreaterThanOrEqual(h)
      expect(Number.isInteger(rasterLayoutHeight(h))).toBe(true)
    }
  })

  it('量到 0 時至少還是 1，不會做出零尺寸畫布', () => {
    expect(rasterLayoutHeight(0)).toBe(1)
  })
})

describe('exportPixelSize：輸出仍是平台原生尺寸', () => {
  it.each([
    ['1:1', 1, 1080],
    ['4:5', 4 / 5, 1350],
    ['9:16', 9 / 16, 1920],
  ])('%s @390 → 1080×%d', (_label, ratio, expectedHeight) => {
    expect(exportPixelSize(390, 390 / ratio)).toEqual([EXPORT_WIDTH, expectedHeight])
  })

  it('刻意吃分數版高度 —— 拿取整過的 693 去算會掉到 1919，那就不是原生尺寸了', () => {
    expect(exportPixelSize(390, 693.3333333333334)[1]).toBe(1920)
    expect(exportPixelSize(390, 693)[1]).toBe(1919)
  })

  it('量不到尺寸時回傳 0 而非 NaN', () => {
    expect(exportPixelSize(0, 500)).toEqual([0, 0])
  })
})

describe('cropTo：把多出來的那一列切掉', () => {
  const canvas = (w: number, h: number) => {
    const el = document.createElement('canvas')
    el.width = w
    el.height = h
    return el
  }

  it('尺寸已經吻合時原樣回傳，不白白多配一張畫布', () => {
    const el = canvas(1080, 1920)
    expect(cropTo(el, 1080, 1920)).toBe(el)
  })

  it('多出來的列被裁掉，回傳的是新畫布', () => {
    const el = canvas(1080, 1921)
    const out = cropTo(el, 1080, 1920)
    expect(out).not.toBe(el)
    expect([out.width, out.height]).toEqual([1080, 1920])
  })
})

// 行動網頁版把卡片包在 scale() 裡讓整張塞進預覽框。modern-screenshot 的
// resolveBoundingBox 只在沒收到尺寸時才用 getBoundingClientRect()，而那個會
// 被祖先 transform 影響 —— 不明確給值的話匯出圖會縮成預覽大小且不報錯。
describe('exportPng 交給 modern-screenshot 的尺寸', () => {
  async function capture(width: number, height: number, aspect?: string) {
    const calls: Array<Record<string, unknown>> = []
    vi.doMock('modern-screenshot', () => ({
      domToCanvas: (_n: HTMLElement, o: Record<string, unknown>) => {
        calls.push(o)
        const el = document.createElement('canvas')
        el.width = Math.floor((o.width as number) * (o.scale as number))
        el.height = Math.floor((o.height as number) * (o.scale as number))
        el.toBlob = (cb: BlobCallback) => cb(new Blob(['x'], { type: 'image/png' }))
        return Promise.resolve(el)
      },
    }))
    vi.resetModules()
    const mod = await import('../../src/render/export')
    const node = document.createElement('div')
    Object.defineProperty(node, 'offsetWidth', { value: width, configurable: true })
    Object.defineProperty(node, 'offsetHeight', { value: height, configurable: true })
    if (aspect) node.dataset.aspect = aspect
    await mod.exportPng(node)
    vi.doUnmock('modern-screenshot')
    vi.resetModules()
    return calls[0]
  }

  it('明確傳入版面尺寸而非讓 modern-screenshot 自己量', async () => {
    const opts = await capture(720, 1280)
    expect(opts.width).toBe(720)
    expect(opts.height).toBe(1280)
  })

  it('固定比例的分數高度先取整才交出去', async () => {
    const opts = await capture(390, 693, '9:16')
    expect(opts.height).toBe(694)
    expect(Number.isInteger(opts.height)).toBe(true)
  })
})
