import { domToBlob } from 'modern-screenshot'
import type { CardSettings, TweetData } from '../types'

/**
 * 對預覽節點本身光柵化。
 * 預覽即輸出 —— 不存在第二套渲染路徑，因此不可能出現「下載的圖跟預覽不一樣」。
 */
export async function exportPng(node: HTMLElement, settings: CardSettings): Promise<Blob> {
  // 資產已由 asset-proxy 全部轉為 data URL，光柵化過程不應再發出任何網路請求
  const blob = await domToBlob(node, {
    scale: settings.scale,
    type: 'image/png',
  })
  if (!blob) throw new Error('光柵化失敗')
  return blob
}

export function buildFilename(tweet: TweetData): string {
  const safe = tweet.author.handle.replace(/[^\w-]/g, '_')
  return `x-${safe}-${tweet.id}.png`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
