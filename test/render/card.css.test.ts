import { describe, it, expect } from 'vitest'
import { canvasSizeStyle, ASPECT_VALUE } from '../../src/render/card.css'

describe('canvasSizeStyle', () => {
  it('量測到高度時設為最小高度', () => {
    expect(canvasSizeStyle(405)).toEqual({ minHeight: '405px' })
  })

  it('尚未量測到寬度時不設下限（auto 與初次渲染）', () => {
    expect(canvasSizeStyle(undefined)).toEqual({ minHeight: 0 })
  })

  it('永遠不產生固定 height —— 畫布只有下限，沒有上限', () => {
    expect(canvasSizeStyle(800)).not.toHaveProperty('height')
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
