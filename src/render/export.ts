import { domToCanvas } from 'modern-screenshot'
import type { Post } from '../types'
import { ASPECT_VALUE } from './card.css'

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
 * 不丟例外，只是靜靜產出一張全白的圖。auto 仍可能因極長推文撞到上限，
 * 所以寧可整體縮一點也不要無聲失敗。
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
 * 這張卡片實際會輸出的像素尺寸。
 *
 * 正常情況寬度等於 EXPORT_WIDTH。只有在畫布高到讓總像素數撞上
 * MAX_EXPORT_PIXELS 時，exportScale 會整體縮小以避開 iOS Safari 的全白畫布，
 * 輸出寬度才會低於 1080 —— 那是正確的取捨（無聲全白更糟），但使用者看不
 * 出來，所以要有辦法問。
 *
 * 這裡刻意吃「理想的分數版高度」（693.333…）而不是光柵化時實際用的整數高度，
 * 9:16 才會得到剛好的 1920 而不是 1918。
 */
export function exportPixelSize(
  layoutWidth: number,
  layoutHeight: number,
): [number, number] {
  if (layoutWidth <= 0 || layoutHeight <= 0) return [0, 0]
  const k = exportScale(layoutWidth, layoutHeight)
  return [Math.round(layoutWidth * k), Math.round(layoutHeight * k)]
}

/** 這張卡片實際會輸出的像素寬度。 */
export function exportWidth(layoutWidth: number, layoutHeight: number): number {
  return exportPixelSize(layoutWidth, layoutHeight)[0]
}

/**
 * 這張卡片撞到 MAX_EXPORT_PIXELS、輸出寬度會低於 EXPORT_WIDTH 嗎。
 *
 * 抽成純函式而非留在 Panel 的 JSX 三元運算式裡，理由跟 card.css.ts 的
 * canvasSizeStyle 一樣：happy-dom 沒有版面引擎，量不到真實幾何，但「給定一組
 * 尺寸該不該顯示提示」是純邏輯，與環境無關，值得被單獨斷言 —— 不然比較運算子
 * 寫反、門檻寫錯都只能靠「渲染輸出沒回歸」去間接發現。
 */
export function exportWidthBelowTarget(layoutWidth: number, layoutHeight: number): boolean {
  return exportWidth(layoutWidth, layoutHeight) < EXPORT_WIDTH
}

/**
 * offsetHeight 只能回傳整數 CSS px；358px 寬的 9:16 畫布實際高度是
 * 636.444…px，若直接拿 offsetHeight=636 匯出，最後會變成 1080×1919。
 * 固定比例改用寬度與比例重算可保證原生尺寸；auto 才沿用實際內容高度。
 */
export function exportLayoutHeight(
  layoutWidth: number,
  measuredHeight: number,
  aspect: string | undefined,
): number {
  const ratio = aspect ? ASPECT_VALUE[aspect] : undefined
  return ratio && layoutWidth > 0 ? layoutWidth / ratio : measuredHeight
}

/**
 * 交給光柵化器的版面高度必須是整數 CSS px —— 這是圖片底部那條白線的成因。
 *
 * 瀏覽器會把 SVG 圖片的**內在尺寸四捨五入成整數 CSS px**。modern-screenshot
 * 把卡片包成一張 390×693.333… 的 SVG，Chrome 量到的內在高度是 693，最後
 * 0.333px 的內容在畫進 <img> 的當下就被裁掉了；接著它把這張圖拉伸填滿
 * 1080×1920 的 canvas，比例仍算自 693.333，於是只蓋到第 1918.96 列，
 * 第 1919 列（最後一列）整條 alpha = 0。PNG 自己看不出來，一旦分享出去被
 * 轉成 JPEG 或貼在白底上，那條全透明的列就現形成一條白線。
 *
 * 只有「小數部分小於 0.5、會被捨去」的高度會中招，所以它跟裝置寬度有關：
 * 390px 寬（693.333→693）與 430px 寬（764.444→764）會出現，393px 寬
 * （698.667→699）與 360px 寬（640）不會 —— 回報起來像個時有時無的幽靈。
 * 實測（headless Chromium，量匯出 PNG 最後一列的 alpha）確認了這條因果。
 *
 * 往上取整而不是四捨五入：只要 SVG 表面比內容大，內容就不可能被裁掉，
 * 多出來的不到一列會在下面 cropTo 裁掉。
 */
export function rasterLayoutHeight(layoutHeight: number): number {
  return Math.max(1, Math.ceil(layoutHeight))
}

/**
 * 裁成目標尺寸。
 *
 * modern-screenshot 的 canvas 尺寸是 `floor(邊長 × scale)`，兩軸共用一個
 * scale，所以把高度往上取整之後畫布會多出一列（9:16 是 1921、4:5 是 1351）。
 * 多的那一列是背景漸層的延伸，裁掉看不出來；留著卻會讓輸出不再是平台的
 * 原生尺寸，害平台再壓縮一次。
 *
 * 尺寸已經吻合時原樣回傳，不白白多配一張畫布。
 */
export function cropTo(canvas: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (canvas.width === width && canvas.height === height) return canvas
  const out = canvas.ownerDocument.createElement('canvas')
  out.width = width
  out.height = height
  // 原尺寸貼上，超出目的畫布的部分自然被裁掉 —— 不縮放，像素一一對應。
  out.getContext('2d')?.drawImage(canvas, 0, 0)
  return out
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('光柵化失敗'))), 'image/png')
  })
}

/**
 * 一次算好光柵化要用的全部尺寸。
 *
 * 靜圖與影片共用同一份，這樣影片的底板跟「存成圖片」的結果會是逐像素一致的
 * —— 兩邊各算一次的話，差一個像素也不會有人發現，直到有人把兩個檔案疊起來
 * 看為止。
 */
export type ExportGeometry = {
  layoutWidth: number
  /** 理想的分數高度，用來算原生輸出尺寸 */
  layoutHeight: number
  /** 真正交給光柵化器的整數高度（見 rasterLayoutHeight） */
  rasterHeight: number
  scale: number
  outWidth: number
  outHeight: number
}

export function exportGeometry(node: HTMLElement): ExportGeometry {
  const layoutWidth = node.offsetWidth
  const layoutHeight = exportLayoutHeight(layoutWidth, node.offsetHeight, node.dataset.aspect)
  const [outWidth, outHeight] = exportPixelSize(layoutWidth, layoutHeight)
  return {
    layoutWidth,
    layoutHeight,
    rasterHeight: rasterLayoutHeight(layoutHeight),
    scale: exportScale(layoutWidth, layoutHeight),
    outWidth,
    outHeight,
  }
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
  const geom = exportGeometry(node)
  const canvas = await domToCanvas(node, {
    scale: geom.scale,
    font: false,
    width: geom.layoutWidth,
    // 見 rasterLayoutHeight：分數高度會讓 SVG 內在尺寸四捨五入時裁掉內容，
    // 在圖的最下緣留一條全透明的列。
    height: geom.rasterHeight,
  })
  // min 是保險：光柵化結果一定不小於目標，但浮點若讓它少一個像素，寧可原樣
  // 輸出也不要把裁切放大成一條真的空白邊。
  return canvasToPng(cropTo(
    canvas,
    Math.min(geom.outWidth, canvas.width),
    Math.min(geom.outHeight, canvas.height),
  ))
}

/** 將字串中的非法檔名字元替換為底線 */
function sanitizeFilenameComponent(s: string): string {
  return s.replace(/[^\w-]/g, '_')
}

export function buildFilename(post: Post): string {
  const safeHandle = sanitizeFilenameComponent(post.author.handle)
  const safeId = sanitizeFilenameComponent(post.id)
  return `${post.platform}-${safeHandle}-${safeId}.png`
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
