import { describe, it, expect } from 'vitest'
import { APP_DEFAULT_SETTINGS, appSettings } from '../../app/settings'
import { DEFAULT_SETTINGS } from '../../src/render/Card'

describe('appSettings', () => {
  it('固定 9:16、媒體整支呈現', () => {
    const s = appSettings({ ...DEFAULT_SETTINGS, aspect: '1:1', wholeMedia: false })
    expect(s.aspect).toBe('9:16')
    expect(s.wholeMedia).toBe(true)
  })

  it('其他設定照原本的', () => {
    const s = appSettings({ ...DEFAULT_SETTINGS, padding: 33, bgId: 'x' })
    expect(s.padding).toBe(33)
    expect(s.bgId).toBe('x')
  })

  it('app 預設就是鎖定後的網頁預設', () => {
    expect(APP_DEFAULT_SETTINGS).toEqual(appSettings(DEFAULT_SETTINGS))
  })
})
