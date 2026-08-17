import { describe, it, expect } from 'vitest'
import {
  canvasPaddingY,
  canvasPaddingYStyle,
  canvasSizeStyle,
  fitPanelScale,
  statsFitScale,
  cardScale,
  CARD_ALPHA,
  STAT_ICON_EM,
  STORY_SAFE_PADDING_RATIO,
  ASPECT_VALUE,
} from '../../src/render/card.css'

describe('cardScale', () => {
  it('每一項都是基準字級的倍數，與 ThreadsFrame 的係數一致', () => {
    expect(cardScale(20, false)).toEqual({
      logo: 30,
      logoGap: 40,
      avatar: 52,
      avatarGap: 12,
      headGap: 22,
      name: 18,
      handle: 16,
      time: 16,
      stat: 16,
      brand: 12.4,
      gap: 16,
      timeGap: 14,
      ruleGap: 10,
      brandGap: 18,
    })
  })

  it('字級加倍時所有尺寸一起加倍', () => {
    const a = cardScale(20, false)
    const b = cardScale(40, false)
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      expect(b[key]).toBeCloseTo(a[key] * 2, 5)
    }
  })

  it('compact 只收斂家具與間距，字級一律不動', () => {
    const normal = cardScale(20, false)
    const compact = cardScale(20, true)
    // 讓出高度是為了給圖片，不該連帶讓文字變難讀。
    expect(compact.name).toBe(normal.name)
    expect(compact.time).toBe(normal.time)
    expect(compact.stat).toBe(normal.stat)
    expect(compact.brand).toBe(normal.brand)
    expect(compact.handle).toBe(normal.handle)
    expect(compact.logo).toBeLessThan(normal.logo)
    expect(compact.avatar).toBeLessThan(normal.avatar)
    expect(compact.gap).toBeLessThan(normal.gap)
    expect(compact.headGap).toBeLessThan(normal.headGap)
    expect(compact.brandGap).toBeLessThan(normal.brandGap)
  })

  it('品牌與上一列的間距比一般區塊間距更鬆', () => {
    const s = cardScale(20, false)
    // 它是整張卡片的收尾，貼著統計列會讀成統計列的一部分。
    expect(s.brandGap).toBeGreaterThan(s.ruleGap)
  })

  it('標誌下方的留白比其他區塊間距都大，標誌才不會壓在作者列上', () => {
    const s = cardScale(20, false)
    expect(s.logoGap).toBeGreaterThan(s.headGap)
    expect(s.logoGap).toBeGreaterThan(s.gap)
  })
})

describe('CARD_ALPHA', () => {
  it('維持時間與統計同層、品牌最輕、分隔線又比品牌更輕的層次', () => {
    expect(CARD_ALPHA.time).toBe(CARD_ALPHA.stats)
    expect(CARD_ALPHA.brand).toBeLessThan(CARD_ALPHA.stats)
    expect(CARD_ALPHA.divider).toBeLessThan(CARD_ALPHA.brand)
    expect(CARD_ALPHA.logo).toBeLessThan(1)
  })

  it('統計圖示相對數字略大，與 ThreadsFrame 的 0.85／0.8 相同', () => {
    expect(STAT_ICON_EM).toBeCloseTo(1.0625, 5)
  })
})

describe('canvasSizeStyle', () => {
  it('量測到高度時設為固定高度', () => {
    expect(canvasSizeStyle(405)).toEqual({ height: '405px', minHeight: 0 })
  })

  it('auto 與尚未量測時維持自動高度', () => {
    expect(canvasSizeStyle(undefined)).toEqual({ height: 'auto', minHeight: 0 })
  })

  it('非 auto 不再用 minHeight 冒充比例', () => {
    expect(canvasSizeStyle(800)).toEqual({ height: '800px', minHeight: 0 })
  })
})

describe('fitPanelScale', () => {
  it('內容過高時等比縮小至可用高度', () => {
    expect(fitPanelScale(580, 656)).toBeCloseTo(580 / 656)
  })

  it('內容放得下時不放大', () => {
    expect(fitPanelScale(600, 400)).toBe(1)
  })

  it('無效量測維持原尺寸', () => {
    expect(fitPanelScale(0, 400)).toBe(1)
    expect(fitPanelScale(400, 0)).toBe(1)
  })
})

describe('statsFitScale', () => {
  it('量到的自然寬度超出可用寬度時等比縮小，讓四組數據維持單列', () => {
    expect(statsFitScale(240, 280)).toBeCloseTo(240 / 280)
  })

  it('放得下就不縮，也永遠不放大', () => {
    expect(statsFitScale(554, 280)).toBe(1)
  })

  it('量測無效時維持原尺寸，不把內容縮成 0', () => {
    expect(statsFitScale(0, 280)).toBe(1)
    expect(statsFitScale(240, 0)).toBe(1)
  })

  it('縮放後的實際寬度不超過可用寬度——分隔線因此不會比統計列短', () => {
    for (const [available, natural] of [[240, 280], [120, 400], [554, 280], [300, 300]]) {
      expect(natural * statsFitScale(available, natural)).toBeLessThanOrEqual(available + 1e-9)
    }
  })
})

describe('canvasPaddingY', () => {
  it('9:16 依畫布寬度保留固定比例的 IG 上下安全區', () => {
    expect(canvasPaddingY('9:16', 28, 358)).toBeCloseTo(358 * STORY_SAFE_PADDING_RATIO)
    expect(canvasPaddingY('9:16', 28, 672)).toBeCloseTo(672 * STORY_SAFE_PADDING_RATIO)
  })

  it('使用者設定比安全區大時不縮小', () => {
    expect(canvasPaddingY('9:16', 80, 358)).toBe(80)
  })

  it('其他比例完全沿用使用者留白', () => {
    for (const aspect of ['auto', '1:1', '4:5']) {
      expect(canvasPaddingY(aspect, 28, 358)).toBe(28)
    }
  })

  it('CSS 樣式同樣以百分比表達安全區，輸出不受裝置寬度影響', () => {
    expect(canvasPaddingYStyle('9:16', 28)).toBe('max(28px, 15.625%)')
    expect(canvasPaddingYStyle('1:1', 28)).toBe('28px')
  })
})

describe('ASPECT_VALUE', () => {
  it('auto 沒有比例值，其餘三種都有', () => {
    expect(ASPECT_VALUE.auto).toBeUndefined()
    for (const a of ['1:1', '4:5', '9:16']) {
      expect(ASPECT_VALUE[a]).toBeTypeOf('number')
    }
  })
})
