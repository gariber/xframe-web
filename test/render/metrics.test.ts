import { describe, it, expect } from 'vitest'
import { METRIC_META } from '../../src/render/metrics'
import type { MetricKind } from '../../src/types'

describe('METRIC_META', () => {
  // 少一個 kind 的圖示，卡片上那格會是空白 —— 不報錯、不當機，就是沒東西。
  // 這個測試在新增 MetricKind 卻忘了補圖示時會紅。
  const KINDS: MetricKind[] = ['views', 'replies', 'reposts', 'likes']

  it.each(KINDS)('%s 有圖示與標籤', (kind) => {
    expect(METRIC_META[kind].icon).toMatch(/^M/)
    expect(METRIC_META[kind].label.length).toBeGreaterThan(0)
  })

  it('沒有多餘的項目 —— 每個 meta 都對應一個實際使用的 kind', () => {
    expect(Object.keys(METRIC_META).sort()).toEqual([...KINDS].sort())
  })
})
