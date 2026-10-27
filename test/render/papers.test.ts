import { describe, it, expect } from 'vitest'
import { ALL_PAPERS, DEFAULT_PAPER, LIBRARY, PAPERS, findPaper, randomPaper } from '../../src/render/papers'
import { DEFAULT_STYLE, FONTS, STYLE_PRESETS, fontIdOf, matchesPreset } from '../../src/render/styles'
import { DEFAULT_SETTINGS } from '../../src/render/Card'

/*
 * 紙張與樣式跟 ThreadsFrame 同一套。數量、名稱、預設都是從那邊照抄的 ——
 * 兩個產品掛同一個品牌，同一張紙在兩邊長得不一樣，使用者會以為其中一邊壞了。
 */
describe('背景紙張', () => {
  it('十四款內建，紙庫二十六張，跟 ThreadsFrame 一樣', () => {
    expect(PAPERS).toHaveLength(14)
    expect(LIBRARY).toHaveLength(26)
  })

  it('id 不重複 —— 存檔只記 id', () => {
    expect(new Set(ALL_PAPERS.map((p) => p.id)).size).toBe(ALL_PAPERS.length)
  })

  it('每一張都畫得出來，而且每張都帶著自己的底板色與文字色', () => {
    for (const p of ALL_PAPERS) {
      expect(p.css(360, 640).length, p.id).toBeGreaterThan(3)
      expect(p.panel).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.ink).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('預設是純黑，跟 ThreadsFrame 一樣', () => {
    expect(DEFAULT_PAPER.id).toBe('noir')
    expect(DEFAULT_PAPER.name).toBe('純黑')
  })

  it('認不得的 id 退回預設，不會畫出一張空白', () => {
    expect(findPaper('mesh').id).toBe('noir')
  })

  it('方格與光暈的尺寸跟著畫布走 —— 縮圖跟卡片是同一個構圖', () => {
    const graph = findPaper('graph')
    expect(graph.css(90, 120)).not.toBe(graph.css(360, 480))
  })

  it('隨機不會抽到現在這一張', () => {
    for (let i = 0; i < 50; i++) expect(randomPaper('noir', () => i / 50).id).not.toBe('noir')
  })
})

describe('樣式預設', () => {
  it('八組，名稱跟 ThreadsFrame 一樣', () => {
    expect(STYLE_PRESETS.map((p) => p.name))
      .toEqual(['純淨白', '夜間', '雜誌感', '便條紙', '大字報', '柔霧', '夕燒玻璃', '極光玻璃'])
  })

  it('用到的紙都存在', () => {
    for (const p of STYLE_PRESETS) expect(findPaper(p.style.bgId).id).toBe(p.style.bgId)
  })

  it('留白、圓角、模糊從 1080 寬的成品 px 換成版面 px（÷3）', () => {
    const clean = STYLE_PRESETS.find((p) => p.id === 'clean')!.style
    expect([clean.padding, clean.radius, clean.blur]).toEqual([21, 9, 13])
  })

  it('字級保留各組之間的相對大小 —— 大字報比純淨白大', () => {
    const size = (id: string) => STYLE_PRESETS.find((p) => p.id === id)!.style.fontSize
    expect(size('clean')).toBe(20)
    expect(size('poster')).toBeGreaterThan(size('clean'))
  })

  it('套用之後樣式列標得出是哪一組；顯示項目與隱私不受影響', () => {
    const haze = STYLE_PRESETS.find((p) => p.id === 'haze')!
    const applied = { ...DEFAULT_SETTINGS, maskIdentity: true, ...haze.style }
    expect(matchesPreset(applied, haze)).toBe(true)
    expect(applied.maskIdentity).toBe(true)
    expect(matchesPreset({ ...applied, radius: applied.radius + 1 }, haze)).toBe(false)
  })
})

describe('預設樣式', () => {
  it('純黑紙、同色系實心底板、不開毛玻璃 —— ThreadsFrame 的預設', () => {
    expect(DEFAULT_STYLE).toMatchObject({ bgId: 'noir', panelColor: '#191919', textColor: '#f4f1ec', panelOpacity: 1, glass: false })
    expect(DEFAULT_SETTINGS.bgId).toBe('noir')
  })

  it('字體是 ThreadsFrame 那四種系統字型，舊的字體堆疊算黑體', () => {
    expect(FONTS.map((f) => f.name)).toEqual(['黑體', '襯線', '圓體', '等寬'])
    expect(fontIdOf(FONTS[1].stack)).toBe('serif')
    expect(fontIdOf('-apple-system, sans-serif')).toBe('sans')
  })
})
