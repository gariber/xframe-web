import { domToBlob } from 'modern-screenshot'
import type { CardSettings, TweetData } from '../types'

/**
 * 對預覽節點本身光柵化。
 * 預覽即輸出 —— 不存在第二套渲染路徑，因此不可能出現「下載的圖跟預覽不一樣」。
 */
export async function exportPng(node: HTMLElement, settings: CardSettings): Promise<Blob> {
  // 資產已由 asset-proxy 全部轉為 data URL，光柵化過程不應再發出任何網路請求。
  // modern-screenshot 的 `font` 選項預設開啟，會走訪 document.styleSheets 找
  // @import 的字型並抓取——卡片只用系統字型堆疊，不會有東西比對到，但仍要
  // 明確關閉，讓上面這句註解為真，也省下這趟無意義的走訪。
  // 明確傳入 offsetWidth/offsetHeight 而不讓它自己量。modern-screenshot 的
  // resolveBoundingBox 只在沒收到尺寸時才呼叫 getBoundingClientRect()，而那個
  // 會被祖先的 transform 影響。行動網頁版把卡片包在一層 scale() 裡讓整張塞進
  // 預覽框，若不明確給值，匯出的圖會跟著縮成預覽大小（實測 0.23 倍）——
  // 而且不會報錯，只會默默產出一張又小又糊的圖。
  // offsetWidth/offsetHeight 是版面尺寸，不受 transform 影響；擴充功能沒有
  // 縮放祖先，傳這兩個值對它而言等同原本行為。
  const blob = await domToBlob(node, {
    scale: settings.scale,
    type: 'image/png',
    font: false,
    width: node.offsetWidth,
    height: node.offsetHeight,
  })
  if (!blob) throw new Error('光柵化失敗')
  return blob
}

/** 將字串中的非法檔名字元替換為底線 */
function sanitizeFilenameComponent(s: string): string {
  return s.replace(/[^\w-]/g, '_')
}

export function buildFilename(tweet: TweetData): string {
  const safeHandle = sanitizeFilenameComponent(tweet.author.handle)
  const safeId = sanitizeFilenameComponent(tweet.id)
  return `x-${safeHandle}-${safeId}.png`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延遲撤銷 URL 以確保瀏覽器完成下載讀取。
  // 立即撤銷可能導致下載被截斷或取消，因為某些瀏覽器尚未讀取完整 blob。
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
