export type ShareNavigator = {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported'

function currentNavigator(): ShareNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator
}

/**
 * 型別取自 blob 自己，不是寫死的。
 *
 * 影片的容器由 MediaRecorder 決定（iPhone 上是 MP4，退到 WebM 的環境也有），
 * 寫死 image/png 的話分享出去的檔案會帶著錯的型別 —— 接收端依型別決定怎麼處理，
 * 型別錯了症狀不是「壞掉」而是「存進去打不開」。
 */
export function createShareFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || 'application/octet-stream' })
}

/** 以實際的 File 做能力偵測，不能用觸控裝置或 user-agent 猜測。 */
export function canShareFile(
  file: File,
  nav: ShareNavigator | undefined = currentNavigator(),
): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * 分享一個檔案；使用者關閉原生分享表屬於正常取消，不應顯示紅色錯誤。
 * 不支援檔案分享時回傳 unsupported，讓介面保留下載／長按備援。
 */
export async function shareFile(
  file: File,
  nav: ShareNavigator | undefined = currentNavigator(),
): Promise<ShareResult> {
  if (!canShareFile(file, nav)) return 'unsupported'
  try {
    await nav!.share!({ files: [file] })
    return 'shared'
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
      return 'cancelled'
    }
    throw error
  }
}
