import type { Composition, VideoExportOptions } from './video'
import { createCompositor } from './video'

/**
 * 輸出的位元率。
 *
 * 1080×1920 / 30fps 大約六千二百萬像素每秒，乘上 0.1 得到 6 Mbps —— 那是社群
 * 平台自己重壓之前，肉眼看不出差別的分水嶺。再高只是讓檔案變大、上傳變慢，
 * 平台照樣會壓回去。
 */
export function bitrateFor(width: number, height: number, fps = 30): number {
  const target = Math.round(width * height * fps * 0.1)
  return Math.min(12_000_000, Math.max(2_000_000, target))
}

/**
 * 快路：用 WebCodecs 重新編碼，不綁牆上的時鐘。
 *
 * ## 為什麼一定要重新編碼
 *
 * 卡片要畫在影片周圍，那是逐幀的合成。沒有哪個容器格式能把「一支影片」和
 * 「一張卡片」疊在一起還讓所有播放器都認得 —— 分享出去的必須是一支普通的
 * MP4。所以問題從來不是「能不能不重編」，而是「重編要不要跟著真實時間跑」。
 *
 * MediaRecorder 那條路是跟著跑的：它從 canvas 的即時串流錄，一分鐘的影片就
 * 錄一分鐘。這裡改成自己解碼、自己合成、自己編碼，跑多快只看硬體 ——
 * iPhone 的 H.264 是硬體編解碼，通常遠快於即時。
 *
 * ## 音訊原封不動搬過去
 *
 * 聲音沒有被我們動到任何一個取樣，所以不必解碼再編碼：直接把來源的封包
 * 搬進新容器。省掉一整條音訊管線，也沒有二次壓縮的損失。
 *
 * ## 影音同時餵
 *
 * 兩條迴圈並行跑而不是先跑完影片再跑音訊。`add()` 會在該等的時候擋住
 * （背壓），並行餵才交錯得出正常的 MP4，也不必把整條音軌先囤在記憶體裡。
 */
export type FastExportOptions = VideoExportOptions & {
  /**
   * 測試用的接縫。
   *
   * 沒有專利編解碼器的環境（例如開源建置的 Chromium）跑不動 avc，整條管線
   * 就只會停在「這個瀏覽器編不出 H.264」那一行 —— 合成、封裝、音訊搬運全部
   * 驗不到。換成 vp9 與 webm 來源，測的是同一條程式路徑。
   *
   * 產品裡永遠用預設值：MP4 容器裡裝 VP9 的檔案 iOS 相簿與 IG 都不收，
   * 那種「看起來成功了」的失敗比直接走退路更糟。
   *
   * 只換編碼、不換容器 —— 拆檔那一段走的仍是正式的 MP4 路徑。
   */
  codec?: 'avc' | 'vp9'
}

export async function exportVideoFast(
  composition: Composition,
  source: Blob,
  options: FastExportOptions,
): Promise<Blob> {
  // 動態載入：mediabunny 打包後約 100KB（gzip），比整個 app 還大。只想存圖的
  // 人不該為了一個他不會按的按鈕付這個流量。
  const mb = await import('mediabunny')

  const codec = options.codec ?? 'avc'
  const input = new mb.Input({
    source: new mb.BlobSource(source),
    formats: [new mb.Mp4InputFormat()],
  })
  const videoTrack = await input.getPrimaryVideoTrack()
  if (videoTrack === null) throw new Error('來源沒有影片軌')
  /*
   * 不先問 canDecode()。
   *
   * 它問的是「由檔案裡的參數推出來的那串編碼字串，解碼器認不認」，而那串字串
   * 可能只是寫檔的人填得馬虎 —— 實測遇過 vpcC 的 level 欄位是 0（無效值），
   * 瀏覽器明明解得開那支影片，預檢卻說不行。誤判的代價是使用者被丟回即時錄製
   * 慢慢等。
   *
   * 直接試。解不開就丟例外，exportVideo 那邊的退路會接住 —— 安全網本來就在，
   * 多一道會誤判的預檢不會讓它更安全。
   */

  const compositor = createCompositor(composition, options.focusY)
  const { width, height } = compositor.canvas
  if (!await mb.canEncodeVideo(codec, { width, height })) {
    throw new Error(`這個瀏覽器編不出 ${codec}`)
  }

  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target })
  const videoSource = new mb.CanvasSource(compositor.canvas, {
    codec,
    bitrate: bitrateFor(width, height),
  })
  output.addVideoTrack(videoSource)

  const audioTrack = await input.getPrimaryAudioTrack()
  const audioConfig = audioTrack === null ? null : await audioTrack.getDecoderConfig()
  const audioSource = audioTrack !== null && audioTrack.codec !== null && audioConfig !== null
    ? new mb.EncodedAudioPacketSource(audioTrack.codec)
    : null
  if (audioSource !== null) output.addAudioTrack(audioSource)

  await output.start()
  // 走到這裡才算確定跑得起來：拆得開、解得開、編得出來、容器也開好了。
  options.onMode?.('fast')

  const stop = () => { throw new Error('已取消') }
  const duration = await videoTrack.computeDuration()

  const pumpVideo = async () => {
    const sink = new mb.VideoSampleSink(videoTrack)
    for await (const sample of sink.samples()) {
      if (options.signal?.aborted) { sample.close(); stop() }
      try {
        compositor.draw(
          { width: sample.displayWidth, height: sample.displayHeight },
          (ctx, dx, dy, dW, dH) => sample.draw(ctx, dx, dy, dW, dH),
        )
        await videoSource.add(sample.timestamp, sample.duration)
      } finally {
        // VideoFrame 佔的是解碼器的緩衝區，不關會很快把它耗光而整個停住
        sample.close()
      }
      if (duration > 0) options.onProgress?.(Math.min(1, sample.timestamp / duration))
    }
  }

  const pumpAudio = async () => {
    if (audioSource === null || audioTrack === null || audioConfig === null) return
    const sink = new mb.EncodedPacketSink(audioTrack)
    for await (const packet of sink.packets()) {
      if (options.signal?.aborted) stop()
      await audioSource.add(packet, { decoderConfig: audioConfig as AudioDecoderConfig })
    }
  }

  try {
    await Promise.all([pumpVideo(), pumpAudio()])
    await output.finalize()
  } catch (e) {
    if (output.state === 'started' || output.state === 'pending') await output.cancel()
    throw e
  }

  if (target.buffer === null) throw new Error('編碼沒有產出資料')
  options.onProgress?.(1)
  return new Blob([target.buffer], { type: 'video/mp4' })
}
