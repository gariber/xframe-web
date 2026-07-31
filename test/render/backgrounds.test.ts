import { describe, it, expect } from 'vitest'
import { generate, PALETTES, PRESETS, GRAIN_DATA_URI, randomPreset } from '../../src/render/backgrounds'
import type { BgKind } from '../../src/types'

const KINDS: BgKind[] = ['mesh', 'aurora', 'wave', 'split', 'grid']

describe('調色盤', () => {
  it('恰有八組', () => expect(Object.keys(PALETTES)).toHaveLength(8))
  it('每組四色且為 hex', () => {
    for (const colors of Object.values(PALETTES)) {
      expect(colors).toHaveLength(4)
      for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('generate', () => {
  it.each(KINDS)('%s 產出非空 CSS', (kind) => {
    const css = generate(kind, 'sunset', 1)
    expect(css.length).toBeGreaterThan(20)
    expect(css).not.toContain('undefined')
    expect(css).not.toContain('NaN')
  })

  it('同 seed 輸出穩定', () => {
    expect(generate('mesh', 'ocean', 42)).toBe(generate('mesh', 'ocean', 42))
  })

  it('不同 seed 輸出不同', () => {
    expect(generate('mesh', 'ocean', 1)).not.toBe(generate('mesh', 'ocean', 2))
  })

  it('不同調色盤輸出不同', () => {
    expect(generate('mesh', 'ocean', 1)).not.toBe(generate('mesh', 'sunset', 1))
  })

  it('未知調色盤退回預設而不拋錯', () => {
    expect(() => generate('mesh', 'nope', 1)).not.toThrow()
  })
})

describe('預設組合', () => {
  it('恰有 40 組（5 類型 × 8 調色盤）', () => expect(PRESETS).toHaveLength(40))
  it('每組都能產出 CSS', () => {
    for (const p of PRESETS) expect(generate(p.kind, p.palette, p.seed).length).toBeGreaterThan(20)
  })
  it('組合不重複', () => {
    const keys = PRESETS.map((p) => `${p.kind}:${p.palette}`)
    expect(new Set(keys).size).toBe(40)
  })
})

describe('顆粒層', () => {
  it('是 SVG data URI 且含 feTurbulence', () => {
    expect(GRAIN_DATA_URI).toMatch(/^url\("data:image\/svg\+xml/)
    expect(decodeURIComponent(GRAIN_DATA_URI)).toContain('feTurbulence')
  })
})

describe('randomPreset', () => {
  it('回傳合法組合', () => {
    const p = randomPreset()
    expect(KINDS).toContain(p.kind)
    expect(Object.keys(PALETTES)).toContain(p.palette)
    expect(Number.isInteger(p.seed)).toBe(true)
  })
})
