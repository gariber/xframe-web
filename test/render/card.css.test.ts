import { describe, it, expect } from 'vitest'
import {
  canvasPaddingY,
  canvasPaddingYStyle,
  canvasSizeStyle,
  fitPanelScale,
  statsFitScale,
  cardScale,
  mediaBoxHeight,
  MEDIA_SHARE_MAX,
  MEDIA_SHARE_MIN,
  CARD_ALPHA,
  STAT_ICON_EM,
  STORY_SAFE_PADDING_RATIO,
  ASPECT_VALUE,
} from '../../src/render/card.css'

describe('cardScale', () => {
  it('每一項都是基準字級的倍數，與 ThreadsFrame 的係數一致', () => {
    expect(cardScale(20, false)).toEqual({
      logo: 19,
      logoGap: 24,
      avatar: 52,
      avatarGap: 12,
      headGap: 18,
      name: 18,
      handle: 16,
      time: 16,
      stat: 16,
      brand: 12.4,
      gap: 12,
      timeGap: 14,
      ruleGap: 10,
      brandGap: 10,
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

  it('品牌與上一列之間留得比分隔線間距不少', () => {
    const s = cardScale(20, false)
    /*
     * 它是整張卡片的收尾，貼著統計列會讀成統計列的一部分。固定比例下整個頁尾
     * 會被釘在面板底部，站得住主要靠那個定位，所以這裡只要求「不比 ruleGap 小」，
     * 不再要求撐開一大塊——那會在矮比例裡吃掉圖片的高度。
     */
    expect(s.brandGap).toBeGreaterThanOrEqual(s.ruleGap)
  })

  it('標誌下方的留白比其他區塊間距都大，標誌才不會壓在作者列上', () => {
    const s = cardScale(20, false)
    expect(s.logoGap).toBeGreaterThan(s.headGap)
    expect(s.logoGap).toBeGreaterThan(s.gap)
    // 但也不該奢侈到吃掉圖片與頁尾的高度：曾經是 2.0em，在矮比例下整張卡鬆散。
    expect(s.logoGap).toBeLessThan(s.avatar)
  })
})

describe('mediaBoxHeight', () => {
  it('取可用高度的固定份額', () => {
    expect(mediaBoxHeight(600)).toBeCloseTo(600 * 0.45)
  })

  it('回傳 px 數值而非百分比——面板高度不確定時百分比會退回原圖自然高度', () => {
    expect(typeof mediaBoxHeight(600)).toBe('number')
  })

  it('量測無效時回 0，不會把原圖的自然高度當成版面高度', () => {
    expect(mediaBoxHeight(0)).toBe(0)
    expect(mediaBoxHeight(-10)).toBe(0)
  })

  /*
   * 固定份額對橫幅照片剛好，對直式影片是災難：9:16 的卡片在 390px 寬下圖框是
   * 322×257，一支 9:16 的直式影片用 cover 填滿寬度之後是 322×572 —— 只有 45%
   * 的高度看得到，中間一條橫帶，而且「圖片位置」只能在那條帶子裡上下移動。
   * 實際被回報過。
   *
   * 下面這組數字就是那張卡片的真實量測值。
   */
  describe('圖框跟著媒體自己的比例', () => {
    const AVAILABLE = 571   // 9:16 / 390px 寬 / 扣掉限動安全區之後的可用高度
    const BOX_WIDTH = 322   // 面板內容寬度

    it('橫幅媒體完整顯示 —— 框的比例就等於媒體的比例，cover 不裁任何東西', () => {
      const h = mediaBoxHeight(AVAILABLE, BOX_WIDTH, 16 / 9)
      expect(h).toBeCloseTo(BOX_WIDTH / (16 / 9), 5)
      expect(BOX_WIDTH / h).toBeCloseTo(16 / 9, 5)
    })

    it('方形媒體也完整顯示', () => {
      expect(mediaBoxHeight(AVAILABLE, BOX_WIDTH, 1)).toBeCloseTo(BOX_WIDTH, 5)
    })

    it('直式影片看得到的範圍明顯變多 —— 原本只有 45%', () => {
      const fullHeight = BOX_WIDTH / (9 / 16)
      const before = mediaBoxHeight(AVAILABLE) / fullHeight
      const after = mediaBoxHeight(AVAILABLE, BOX_WIDTH, 9 / 16) / fullHeight
      expect(before).toBeCloseTo(0.45, 2)
      expect(after).toBeGreaterThan(before * 1.25)
    })

    /*
     * 上限不只是「別讓圖太大」，它在保護文字：圖框每多一分，面板就少一分給
     * 內文，而字級撞到下限之後就只能整張縮。實測一張「長內文＋父貼文＋直式
     * 影片」的 9:16 卡片，上限 0.68 時內文掉到 5.8px（已經是下限），0.6 時
     * 回到 7.0px；而真正常見的「短內文＋直式影片」從 16.1px 回到 19.5px。
     */
    it('方形媒體剛好還在上限內 —— 上限訂在這裡才不會讓它平白被裁', () => {
      expect(BOX_WIDTH).toBeLessThanOrEqual(AVAILABLE * MEDIA_SHARE_MAX)
    })

    it('再直的媒體也不會把文字擠光', () => {
      expect(mediaBoxHeight(AVAILABLE, BOX_WIDTH, 1 / 10)).toBeCloseTo(AVAILABLE * MEDIA_SHARE_MAX, 5)
    })

    it('再扁的媒體也還看得出是一張圖', () => {
      expect(mediaBoxHeight(AVAILABLE, BOX_WIDTH, 10)).toBeCloseTo(AVAILABLE * MEDIA_SHARE_MIN, 5)
    })

    it('量不到比例時退回原本的固定份額 —— 還沒載入、或多張圖的格狀排版', () => {
      expect(mediaBoxHeight(AVAILABLE, BOX_WIDTH, 0)).toBeCloseTo(AVAILABLE * 0.45, 5)
      expect(mediaBoxHeight(AVAILABLE, 0, 9 / 16)).toBeCloseTo(AVAILABLE * 0.45, 5)
    })
  })
})

describe('CARD_ALPHA', () => {
  it('維持時間與統計同層、品牌最輕、分隔線又比品牌更輕的層次', () => {
    expect(CARD_ALPHA.time).toBe(CARD_ALPHA.stats)
    expect(CARD_ALPHA.brand).toBeLessThan(CARD_ALPHA.stats)
    expect(CARD_ALPHA.divider).toBeLessThan(CARD_ALPHA.brand)
    // 對話串連接線要看得見（比分隔線重），但不能跟內容爭注意力（比統計輕）。
    expect(CARD_ALPHA.thread).toBeGreaterThan(CARD_ALPHA.divider)
    expect(CARD_ALPHA.thread).toBeLessThan(CARD_ALPHA.stats)
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
