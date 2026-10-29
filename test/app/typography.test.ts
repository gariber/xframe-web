import { describe, it, expect } from 'vitest'
import { APP_FONT_STACK, APP_TYPE, MINCHO_STACK, SANS_STACK } from '../../app/typography'

describe('APP_TYPE', () => {
  it('APP_TYPE.mincho uses MINCHO_STACK', () => {
    expect(APP_FONT_STACK.mincho).toBe(MINCHO_STACK)
    expect(APP_FONT_STACK.sans).toBe(SANS_STACK)
    expect(MINCHO_STACK).toBe('"Hiragino Mincho ProN", "Songti TC", serif')
    expect(SANS_STACK).toBe('"PingFang TC", system-ui, sans-serif')
  })

  it('both fonts use the picked D 雜誌 tuning', () => {
    for (const t of [APP_TYPE.sans, APP_TYPE.mincho]) {
      expect(t).toMatchObject({ lineHeight: 1.9, letterSpacingEm: 0.06, bodyWeight: 300, nameWeight: 600 })
    }
  })
})
