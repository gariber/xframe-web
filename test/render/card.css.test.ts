import { describe, it, expect } from 'vitest'
import {
  canvasPaddingY,
  canvasPaddingYStyle,
  canvasSizeStyle,
  fitPanelScale,
  statsFitScale,
  STORY_SAFE_PADDING_RATIO,
  ASPECT_VALUE,
} from '../../src/render/card.css'

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
  it('窄畫布等比縮小互動數，讓四組數據維持單列', () => {
    expect(statsFitScale(240, 20, true)).toBeCloseTo(240 / 280)
  })

  it('空間足夠、未顯示統計或量測無效時不放大也不縮小', () => {
    expect(statsFitScale(554, 20, true)).toBe(1)
    expect(statsFitScale(240, 20, false)).toBe(1)
    expect(statsFitScale(0, 20, true)).toBe(1)
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
