import { describe, it, expect } from 'vitest'
import { MOODS, applyMood, reshufflePaper } from '../../app/moods'
import { HUMOR_PAPERS } from '../../app/papers-humor'
import { APP_DEFAULT_SETTINGS } from '../../app/settings'
import { APP_FONT_STACK } from '../../app/typography'
import { ALL_PAPERS, findPaper } from '../../src/render/papers'

const mood = (id: string) => MOODS.find((m) => m.id === id)!

describe('moods', () => {
  it('applyMood sets mood font and a paper from its pool', () => {
    for (const m of MOODS) {
      const s = applyMood(APP_DEFAULT_SETTINGS, m, () => 0.5)
      expect(s.fontFamily).toBe(APP_FONT_STACK[m.font])
      expect(m.paperIds).toContain(s.bgId)
      expect(s.panelColor).toBe(findPaper(s.bgId).panel)
      expect(s.textColor).toBe(findPaper(s.bgId).ink)
    }
    expect(mood('literary').font).toBe('mincho')
  })

  it('reshufflePaper never repeats the current paper', () => {
    for (const m of MOODS) {
      let s = applyMood(APP_DEFAULT_SETTINGS, m, () => 0)
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const next = reshufflePaper(s, m, () => r)
        expect(next.bgId).not.toBe(s.bgId)
        expect(m.paperIds).toContain(next.bgId)
        s = next
      }
    }
  })

  it('every mood paper id resolves to a paper', () => {
    for (const m of MOODS) {
      for (const id of m.paperIds) expect(findPaper(id).id).toBe(id)
    }
  })

  it('applyMood keeps 9:16 and wholeMedia', () => {
    for (const m of MOODS) {
      const s = applyMood(APP_DEFAULT_SETTINGS, m)
      expect(s.aspect).toBe('9:16')
      expect(s.wholeMedia).toBe(true)
    }
  })

  it('humor mood uses the four picked papers, kept out of the web picker', () => {
    expect(HUMOR_PAPERS.map((p) => p.name)).toEqual(['波卡圓點', '糖果條紋', '彩色紙屑', '貼紙拼貼'])
    expect(mood('humor').paperIds).toEqual(HUMOR_PAPERS.map((p) => p.id))
    for (const p of HUMOR_PAPERS) expect(ALL_PAPERS).not.toContain(p)
  })
})
