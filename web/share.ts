export type ShareNavigator = {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

export type ShareImageResult = 'shared' | 'cancelled' | 'unsupported'

function currentNavigator(): ShareNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator
}

export function createPngFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: 'image/png' })
}

/** 以實際 PNG File 做能力偵測，不能用觸控裝置或 user-agent 猜測。 */
export function canShareImageFile(
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
 * 分享 PNG；使用者關閉原生分享表屬於正常取消，不應顯示紅色錯誤。
 * 不支援檔案分享時回傳 unsupported，讓介面保留下載／長按備援。
 */
export async function shareImageFile(
  file: File,
  nav: ShareNavigator | undefined = currentNavigator(),
): Promise<ShareImageResult> {
  if (!canShareImageFile(file, nav)) return 'unsupported'
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
