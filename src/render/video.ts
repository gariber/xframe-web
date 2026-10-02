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

export type Rect = { x: number; y: number; width: number; height: number }

/** 卡片光柵化之後的三樣東西：底板、遮罩、遮罩的範圍。兩條匯出路線共用。 */
export type Composition = {
  plate: HTMLCanvasElement
  mask: HTMLCanvasElement
  box: Rect
}

/**
 * 把卡片光柵化成底板與遮罩。
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
 */
export async function prepareComposition(
  node: HTMLElement,
  signal?: AbortSignal,
): Promise<Composition> {
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

  const plate = await raster(false)
  const mask = await raster(true)
  if (signal?.aborted) throw new Error('已取消')

  const maskCtx = mask.getContext('2d')
  if (maskCtx === null) throw new Error('取不到繪圖環境')
  const box = opaqueBounds(maskCtx.getImageData(0, 0, mask.width, mask.height).data, mask.width, mask.height)
  if (box === null) throw new Error('卡片上找不到影片框')
  return { plate, mask, box }
}

export type Compositor = {
  /** 每一幀畫完之後的成果。錄製與編碼都吃這一張。 */
  canvas: HTMLCanvasElement
  /**
   * 畫一格。`paint` 只負責把來源畫進給定的矩形 —— 兩條路線的來源型別不同
   * （一邊是 <video>，一邊是 WebCodecs 的 VideoSample），但擺法必須一模一樣，
   * 所以擺法在這裡、畫法交給呼叫端。
   */
  draw(
    source: { width: number; height: number },
    paint: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dW: number, dH: number) => void,
  ): void
}

/**
 * 每一幀只有兩件事：畫底板、把影片那一格畫上去。
 *
 * 卡片不會每幀重畫 —— 它是 DOM，光柵化一次要走 DOM → SVG → <img> → canvas
 * 一整趟，一幀上百毫秒，三十秒的影片有九百幀。
 *
 * 代價是顆粒層在影片那一格上沒有了（它原本疊在所有東西之上）。在會動的畫面
 * 上看不出來，而要保住它得每一幀多做一次全畫面的 overlay 混色。
 */
export function createCompositor({ plate, mask, box }: Composition, focusY: number): Compositor {
  const canvas = document.createElement('canvas')
  canvas.width = plate.width
  canvas.height = plate.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('取不到繪圖環境')

  const patch = document.createElement('canvas')
  patch.width = box.width
  patch.height = box.height
  const patchCtx = patch.getContext('2d')
  if (patchCtx === null) throw new Error('取不到繪圖環境')

  // 底板整張只畫這一次。影片框之外的每一個像素從頭到尾都不會變。
  ctx.drawImage(plate, 0, 0)

  return {
    canvas,
    draw(source, paint) {
      const fit = coverRect(box, source, focusY)
      patchCtx.clearRect(0, 0, box.width, box.height)
      patchCtx.globalCompositeOperation = 'source-over'
      paint(patchCtx, fit.x - box.x, fit.y - box.y, fit.width, fit.height)
      // 只留遮罩有東西的地方，圓角與反鋸齒因此跟靜圖完全一致
      patchCtx.globalCompositeOperation = 'destination-in'
      patchCtx.drawImage(mask, -box.x, -box.y)
      /*
       * 只重畫影片框那一塊，不重畫整張。逐幀的成本是整支匯出的天花板 ——
       * 合成再慢，編碼器也只能等它。框通常只有畫面的三成，這裡省下的是另外
       * 那七成的像素搬運。
       *
       * 先把底板那一塊蓋回去再疊 patch：圓角的反鋸齒讓 patch 的邊緣是半透明
       * 的，底下必須是底板原本的樣子，不能是上一幀留下的影像。
       */
      ctx.clearRect(box.x, box.y, box.width, box.height)
      ctx.drawImage(plate, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height)
      ctx.drawImage(patch, box.x, box.y)
    },
  }
}

/** 走哪條路。慢路綁著真實時間，介面得據此換掉提示文字。 */
export type VideoExportMode = 'fast' | 'realtime'

export type VideoExportOptions = {
  /** 與卡片設定同一個值；決定裁切保留原片縱向的哪個位置 */
  focusY: number
  signal?: AbortSignal
  /** 0 到 1。 */
  onProgress?: (fraction: number) => void
  /**
   * 走哪條路定案時通知一次。退回慢路時附上原因 —— 使用者有權知道自己為什麼
   * 在等，而這也是唯一能從真實裝置上問出「快路為什麼跑不動」的管道：
   * 它失敗的理由只存在於那台機器上。
   */
  onMode?: (mode: VideoExportMode, reason?: string) => void
}

/**
 * 把卡片與影片合成成一支可以分享的影片。
 *
 * 先試快路（WebCodecs，快於即時），不行才退回即時錄製。
 *
 * 之所以是「試試看」而不是「事先判斷」：能不能編碼問得到（VideoEncoder 有
 * isConfigSupported），但能不能解碼、這支特定的檔案拆不拆得開、記憶體夠不夠，
 * 都只有真的跑一次才知道。退路本來就在，讓它接手比多寫一套猜測可靠。
 */
export async function exportVideo(
  node: HTMLElement,
  source: Blob,
  options: VideoExportOptions,
): Promise<Blob> {
  const composition = await prepareComposition(node, options.signal)
  let fastFailure: string | undefined
  try {
    // 動態載入把 mediabunny 那一包留在主程式之外，同時也切斷這兩個模組的循環相依
    const { exportVideoFast } = await import('./video-fast')
    // onMode 由快路自己在確定跑得起來之後才回報，不在這裡搶先講 —— 先講的話
    // 介面會閃一下「轉檔中」再跳成「錄製中」。
    return await exportVideoFast(composition, source, options)
  } catch (error) {
    // 使用者自己按停止的，不要再用慢路跑一次
    if (options.signal?.aborted) throw error
    fastFailure = error instanceof Error ? error.message : String(error)
  }
  options.onMode?.('realtime', fastFailure)
  const url = URL.createObjectURL(source)
  try {
    return await recordVideo(composition, url, options)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 退路：即時錄製。
 *
 * 靠 MediaRecorder 從 canvas 的串流錄下來，所以它綁著牆上的時鐘 —— 一分鐘的
 * 影片就要錄一分鐘，而且畫面不能離開。快路（WebCodecs）跑不起來時才走這裡：
 * 慢，但它在 iPhone 上實測過，什麼都不需要多載。
 */
export async function recordVideo(
  composition: Composition,
  videoUrl: string,
  options: VideoExportOptions,
): Promise<Blob> {
  if (!canRecordVideo()) throw new Error('這個瀏覽器不能錄影片')
  const container = pickContainer()

  const video = document.createElement('video')
  video.src = videoUrl
  video.playsInline = true
  video.preload = 'auto'
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('影片解不開'))
  })

  const compositor = createCompositor(composition, options.focusY)
  const frame = compositor.canvas
  const draw = () => compositor.draw(
    { width: video.videoWidth, height: video.videoHeight },
    (ctx, dx, dy, dW, dH) => ctx.drawImage(video, dx, dy, dW, dH),
  )

  draw()
  const stream = frame.captureStream(VIDEO_FPS)
  const audio = attachAudio(video, stream)
  const recorder = container === ''
    ? new MediaRecorder(stream)
    : new MediaRecorder(stream, { mimeType: container })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  let settle: (blob: Blob) => void = () => {}
  const done = new Promise<Blob>((resolve, reject) => {
    settle = resolve
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || container }))
    recorder.onerror = () => reject(new Error('錄製失敗'))
  })

  let raf = 0
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    video.pause()
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      // 已經停了或狀態不對。下面的保險會把手上的片段交出去，不會卡住。
    }
    // onstop 沒來的話，拿已經收到的片段收工。錄到這裡該有的畫面都有了，
    // 少掉最後一點點，遠好過讓使用者看著一個不會動的 100%。
    setTimeout(() => settle(new Blob(chunks, { type: recorder.mimeType || container })), 3000)
  }

  /*
   * 結束條件不只一個，因為 `ended` 事件靠不住。
   *
   * 實際回報過：進度走到 100% 之後整個卡住 —— 影片明明播完了，事件卻沒來，
   * 而當時唯一的出口就是那個事件。媒體元素的事件在各家瀏覽器上本來就會漏，
   * 把它當成唯一的終點是個結構上的錯。
   *
   * 所以三條路並行：事件、播放位置走到底、以及一個以真實時間計的看門狗。
   * 寧可早收一兩幀，也不要停在一個不會動的進度條上。
   */
  const startedAt = performance.now()
  const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  const watchdogMs = (total > 0 ? total * 1500 : 120_000) + 8_000
  const tick = () => {
    draw()
    if (total > 0) options.onProgress?.(Math.min(1, video.currentTime / total))
    const reachedEnd = video.ended || (total > 0 && video.currentTime >= total - 0.05)
    if (reachedEnd || performance.now() - startedAt > watchdogMs) { stop(); return }
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
    // 等它真的恢復。iOS 上 AudioContext 若停在 suspended，接在它後面的
    // <video> 播放時鐘可能跟著停住 —— 那正是「卡在 100%」的嫌疑之一。
    void ctx.resume().catch(() => { /* 恢復不了就當沒有聲音，影片照錄 */ })
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
