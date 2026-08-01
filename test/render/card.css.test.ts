import { describe, it, expect } from 'vitest'
import { canvasSizeStyle, MIN_HEIGHT_ASPECTS, ASPECT_VALUE } from '../../src/render/card.css'

describe('canvasSizeStyle', () => {
  it('固定比例：鎖死 height，minHeight 為 0', () => {
    expect(canvasSizeStyle(false, 405)).toEqual({ height: '405px', minHeight: 0 })
  })

  it('最小高度模式：設 minHeight，不設 height', () => {
    expect(canvasSizeStyle(true, 1280)).toEqual({ height: undefined, minHeight: '1280px' })
  })

  it('尚未量測到寬度時兩者皆不鎖（auto 與初次渲染）', () => {
    expect(canvasSizeStyle(false, undefined)).toEqual({ height: undefined, minHeight: 0 })
    expect(canvasSizeStyle(true, undefined)).toEqual({ height: undefined, minHeight: 0 })
  })

  it('兩種模式的輸出互斥 —— 對調條件就會紅', () => {
    const fixed = canvasSizeStyle(false, 800)
    const min = canvasSizeStyle(true, 800)
    expect(fixed.height).toBe('800px')
    expect(min.height).toBeUndefined()
    expect(fixed.minHeight).toBe(0)
    expect(min.minHeight).toBe('800px')
  })
})

describe('比例表一致性', () => {
  // 有人把新模式加進 MIN_HEIGHT_ASPECTS 卻忘了在 ASPECT_VALUE 補值時，
  // ratio 會是 undefined、effect 提早 return、最小高度靜默失效 ——
  // 不報錯、不當機，就是不生效。這個測試就是為了抓那個。
  it('每個最小高度模式都有對應的比例值', () => {
    for (const a of MIN_HEIGHT_ASPECTS) {
      expect(ASPECT_VALUE[a]).toBeTypeOf('number')
    }
  })
})
