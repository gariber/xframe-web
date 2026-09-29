import { domToCanvas } from 'modern-screenshot'
import { cropTo, exportGeometry } from './export'

/**
 * 錄製的容器由前往後試。能拿到 MP4 就不要 WebM —— iOS 的相簿存不進 WebM，
 * Instagram 與 Threads 也不收，而那正是這張卡片要去的地方。
 *
 * 在 iPhone（iOS 27 / WebKit）上實測第一個就通過，產出的是 MP4 + H.264 + AAC。
 */
const CONTAINERS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export const VIDEO_FPS = 30

/**
 * 這個瀏覽器錄得出來的最佳容器；`''` 代表一個都不支援，交給瀏覽器自己決定。
 *
 * 「能不能錄」是 canRecordVideo 的事，不放在這裡 —— 兩件事混在一起的話，
 * 注入的測試替身會被那個檢查架空，這個函式就等於沒被測到。
 */
export function pickContainer(
  supported: (type: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
): string {
  for (const type of CONTAINERS) {
    try {
      if (supported(type)) return type
    } catch {
      // isTypeSupported 在某些實作上會對怪字串丟例外，當作不支援
    }
  }
  return ''
}

/** 這個瀏覽器能不能錄影片。介面拿它決定要不要顯示「存成影片」。 */
export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

/**
 * `object-fit: cover` + `object-position: 50% Y%` 的幾何。
 *
 * 卡片上的圖就是這樣擺的，影片必須用同一套算法填進同一個框，否則同一則貼文
 * 存成圖片跟存成影片會裁在不同的地方 —— 那種差異使用者看得出來，卻說不上來
 * 哪裡怪。
 */
export function coverRect(
  box: { x: number; y: number; width: number; height: number },
  source: { width: number; height: number },
  focusY: number,
): { x: number; y: number; width: number; height: number } {
  if (source.width <= 0 || source.height <= 0) return box
  const scale = Math.max(box.width / source.width, box.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) * (focusY / 100),
    width,
    height,
  }
}

/** 遮罩裡真正有東西的範圍。整張全透明時回 null —— 那代表卡片上根本沒有影片框。 */
export function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export type VideoExportOptions = {
  /** 與卡片設定同一個值；決定裁切保留原片縱向的哪個位置 */
  focusY: number
  signal?: AbortSignal
  /** 0 到 1。錄製是即時的，使用者需要知道還要多久。 */
  onProgress?: (fraction: number) => void
}

/**
 * 把卡片與影片合成成一支可以分享的影片。
 *
 * ## 為什麼不是「每一幀都重畫一次卡片」
 *
 * 卡片是 DOM，光柵化一次要走 DOM → SVG → <img> → canvas 一整趟，一幀上百
 * 毫秒。三十秒的影片有九百幀，那樣要跑好幾十分鐘。所以卡片只光柵化一次當底板，
 * 每一幀只有兩件事：畫底板、把影片那一格畫上去。
 *
 * ## 影片框的位置怎麼來的
 *
 * 不用 offsetLeft 去算。面板在內容放不下時會整個 `transform: scale()`，統計列
 * 也有自己的縮放，這些 transform 不會反映在 offset 上 —— 用算的會在「長貼文
 * 加影片」這個組合下悄悄偏掉，而那正是最常見的組合之一。
 *
 * 改成再光柵化一次，但這一次把**除了影片封面以外的所有東西**都設成
 * `visibility: hidden`。剩下的那張圖畫在哪裡、圓角多大、邊緣怎麼反鋸齒，
 * 全部是瀏覽器自己算的，跟我們對版面的理解無關。它的 alpha 就是遮罩。
 *
 * ## 顆粒層
 *
 * 卡片的顆粒層是疊在所有東西之上的，包含圖片。影片畫上去之後那一格就沒有
 * 顆粒了。在會動的畫面上看不出來，而要保住它得為此每一幀多做一次全畫面的
 * overlay 混色 —— 不值得。
 */
export async function exportVideo(
  node: HTMLElement,
  videoUrl: string,
  options: VideoExportOptions,
): Promise<Blob> {
  if (!canRecordVideo()) throw new Error('這個瀏覽器不能錄影片')
  const container = pickContainer()

  const geom = exportGeometry(node)
  const raster = async (maskOnly: boolean) => {
    const canvas = await domToCanvas(node, {
      scale: geom.scale,
      font: false,
      width: geom.layoutWidth,
      height: geom.rasterHeight,
      onCloneEachNode: (cloned: Node) => {
        const el = cloned as HTMLElement
        if (!el.style) return
        // 靜圖上的播放鍵是用來說「這是影片」的。影片自己會動，不需要它。
        if (el.dataset?.part === 'media-badge') el.style.display = 'none'
        if (!maskOnly) return
        el.style.visibility = el.dataset?.part === 'media-image' && el.dataset?.owner === 'main'
          ? 'visible'
          : 'hidden'
      },
    })
    return cropTo(
      canvas,
      Math.min(geom.outWidth, canvas.width),
      Math.min(geom.outHeight, canvas.height),
    )
  }

  const [plate, maskPlate] = [await raster(false), await raster(true)]
  if (options.signal?.aborted) throw new Error('已取消')

  const maskCtx = maskPlate.getContext('2d')
  if (maskCtx === null) throw new Error('取不到繪圖環境')
  const box = opaqueBounds(
    maskCtx.getImageData(0, 0, maskPlate.width, maskPlate.height).data,
    maskPlate.width,
    maskPlate.height,
  )
  if (box === null) throw new Error('卡片上找不到影片框')

  const video = document.createElement('video')
  video.src = videoUrl
  video.playsInline = true
  video.preload = 'auto'
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('影片解不開'))
  })

  const frame = document.createElement('canvas')
  frame.width = plate.width
  frame.height = plate.height
  const ctx = frame.getContext('2d')
  const patch = document.createElement('canvas')
  patch.width = box.width
  patch.height = box.height
  const patchCtx = patch.getContext('2d')
  if (ctx === null || patchCtx === null) throw new Error('取不到繪圖環境')

  const draw = () => {
    const fit = coverRect(box, { width: video.videoWidth, height: video.videoHeight }, options.focusY)
    patchCtx.clearRect(0, 0, patch.width, patch.height)
    patchCtx.globalCompositeOperation = 'source-over'
    patchCtx.drawImage(video, fit.x - box.x, fit.y - box.y, fit.width, fit.height)
    // 只留遮罩有東西的地方，圓角與反鋸齒因此跟靜圖完全一致
    patchCtx.globalCompositeOperation = 'destination-in'
    patchCtx.drawImage(maskPlate, -box.x, -box.y)
    ctx.drawImage(plate, 0, 0)
    ctx.drawImage(patch, box.x, box.y)
  }

  draw()
  const stream = frame.captureStream(VIDEO_FPS)
  const audio = attachAudio(video, stream)
  const recorder = container === ''
    ? new MediaRecorder(stream)
    : new MediaRecorder(stream, { mimeType: container })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || container }))
    recorder.onerror = () => reject(new Error('錄製失敗'))
  })

  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    video.pause()
    if (recorder.state !== 'inactive') recorder.stop()
  }
  const tick = () => {
    draw()
    if (video.duration > 0) options.onProgress?.(Math.min(1, video.currentTime / video.duration))
    raf = requestAnimationFrame(tick)
  }

  recorder.start()
  video.onended = stop
  options.signal?.addEventListener('abort', stop, { once: true })
  await video.play()
  raf = requestAnimationFrame(tick)

  try {
    return await done
  } finally {
    cancelAnimationFrame(raf)
    audio?.close().catch(() => { /* 關不掉就算了，分頁關掉時會一起收 */ })
  }
}

/**
 * 把影片的原聲接進錄製用的串流。
 *
 * 刻意不連到 ctx.destination：接上去使用者在匯出過程中會聽到聲音，而他按的是
 * 「存成影片」不是「播放」。接不上時回 null，影片照錄，只是沒有聲音 —— 為了
 * 音訊讓整個匯出失敗是不對的取捨。
 */
function attachAudio(video: HTMLVideoElement, stream: MediaStream): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()
    void ctx.resume()
    const dest = ctx.createMediaStreamDestination()
    ctx.createMediaElementSource(video).connect(dest)
    const track = dest.stream.getAudioTracks()[0]
    if (track) stream.addTrack(track)
    return ctx
  } catch {
    return null
  }
}

export function buildVideoFilename(pngName: string, mimeType: string): string {
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
  return pngName.replace(/\.png$/, '') + '.' + ext
}
