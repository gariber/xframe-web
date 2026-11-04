import { describe, it, expect } from 'vitest'
import { MEDIA_SHARE_MAX, wholeTileWidth } from '../../src/render/card.css'

describe('wholeTileWidth（app：單張媒體照 Threads 那樣，直式就縮窄靠左）', () => {
  it('直式影片：寬度由高度上限推回，比面板窄', () => {
    // 可用高度 528、9:16 影片 → 高度上限 528×0.6，寬度再乘回比例
    expect(wholeTileWidth(528, 9 / 16)).toBeCloseTo(528 * MEDIA_SHARE_MAX * 9 / 16)
  })

  it('橫式或方形：不設上限，照常滿寬', () => {
    expect(wholeTileWidth(528, 16 / 9)).toBeUndefined()
    expect(wholeTileWidth(528, 1)).toBeUndefined()
  })

  it('量不到比例或高度：不設上限', () => {
    expect(wholeTileWidth(528, 0)).toBeUndefined()
    expect(wholeTileWidth(0, 9 / 16)).toBeUndefined()
  })
})
