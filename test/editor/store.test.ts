import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadSettings, saveSettings, mergeSettings } from '../../src/editor/store'
import { DEFAULT_SETTINGS } from '../../src/render/Card'

const store: Record<string, unknown> = {}
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => ({ [k]: store[k] }),
        set: async (obj: Record<string, unknown>) => { Object.assign(store, obj) },
      },
    },
  })
})

describe('mergeSettings', () => {
  it('空值回傳預設', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })
  it('部分覆寫保留其餘預設', () => {
    const merged = mergeSettings({ fontSize: 30 })
    expect(merged.fontSize).toBe(30)
    expect(merged.padding).toBe(DEFAULT_SETTINGS.padding)
  })
  it('巢狀 show 物件正確合併', () => {
    const merged = mergeSettings({ show: { stats: false } as never })
    expect(merged.show.stats).toBe(false)
    expect(merged.show.avatar).toBe(true)
  })
  it('捨棄未知欄位', () => {
    const merged = mergeSettings({ bogus: 1 } as never)
    expect('bogus' in merged).toBe(false)
  })
})

describe('mergeSettings 不可變性', () => {
  it('不可修改共用的 DEFAULT_SETTINGS 單例（否則之後所有預設值都會被污染）', () => {
    const before = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    mergeSettings({ show: { stats: false } as never })
    mergeSettings({ background: { kind: 'grid', palette: 'ocean', seed: 9 } as never })
    expect(DEFAULT_SETTINGS).toEqual(before)
  })
})

describe('持久化', () => {
  it('未存過時回傳預設', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
  it('存檔後可讀回', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, fontSize: 26 })
    expect((await loadSettings()).fontSize).toBe(26)
  })
})
