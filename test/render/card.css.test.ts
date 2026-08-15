import { describe, it, expect } from 'vitest'
import { canvasSizeStyle, fitPanelScale, ASPECT_VALUE } from '../../src/render/card.css'

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

describe('ASPECT_VALUE', () => {
  it('auto 沒有比例值，其餘三種都有', () => {
    expect(ASPECT_VALUE.auto).toBeUndefined()
    for (const a of ['1:1', '4:5', '9:16']) {
      expect(ASPECT_VALUE[a]).toBeTypeOf('number')
    }
  })
})
