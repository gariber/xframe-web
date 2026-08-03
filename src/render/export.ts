import { domToBlob } from 'modern-screenshot'
import type { TweetData } from '../types'

/**
 * 輸出圖片的固定寬度。
 *
 * 以前是讓使用者選 2x/3x，乘上卡片的版面寬度 —— 那等於把輸出解析度綁在裝置的
 * 畫面寬度上：手機上卡片只有 358px，2x 只得到 716px 的圖，而同一個設定在桌面
 * 擴充功能上是 1440px。使用者無從得知自己拿到的是哪一種，「倍率」這個控制項
 * 因此沒有意義。改成固定寬度後，任何裝置匯出的都是同一個尺寸。
 *
 * 選 1080 是因為它就是各平台的原生尺寸：Instagram 貼文 1080×1080、直式
 * 1080×1350（正好是這裡的 1:1 與 4:5），9:16 得到 1080×1920。再高只是讓平台
 * 多壓縮一次，不會更清楚。
 */
export const EXPORT_WIDTH = 1080

/**
 * canvas 的像素數上限。iOS Safari 超過約 1600 萬像素會直接給出空白畫布 ——
 * 不丟例外，只是靜靜產出一張全白的圖。自動高度與 9:16 都不限制長度，極長的
 * 推文有可能撞到，所以寧可整體縮一點也不要無聲失敗。
 */
export const MAX_EXPORT_PIXELS = 16_000_000

/**
 * 由卡片的版面尺寸算出光柵化倍率，讓輸出寬度固定為 EXPORT_WIDTH。
 *
 * 這裡是倍率而不是直接指定寬高，因為 modern-screenshot 的 scale 是把整個
 * foreignObject 以該倍率光柵化 —— 文字仍是向量描邊後才轉點陣，不是把小圖
 * 放大，所以放大倍率不會糊。
 */
export function exportScale(layoutWidth: number, layoutHeight: number): number {
  if (layoutWidth <= 0 || layoutHeight <= 0) return 1
  const k = EXPORT_WIDTH / layoutWidth
  const pixels = layoutWidth * k * layoutHeight * k
  if (pixels <= MAX_EXPORT_PIXELS) return k
  return k * Math.sqrt(MAX_EXPORT_PIXELS / pixels)
}

/**
 * 對預覽節點本身光柵化。
 * 預覽即輸出 —— 不存在第二套渲染路徑，因此不可能出現「下載的圖跟預覽不一樣」。
 */
export async function exportPng(node: HTMLElement): Promise<Blob> {
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
    scale: exportScale(node.offsetWidth, node.offsetHeight),
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
