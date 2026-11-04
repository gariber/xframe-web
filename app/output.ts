import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * 叫出 iOS 的分享選單（存到相簿、IG 限動、傳給朋友都從這裡走）。
 *
 * 分享選單只吃檔案網址，所以先寫進 Cache 目錄；那裡系統會自己清，不必善後。
 */
export async function shareOutput(blob: Blob, filename: string): Promise<'shared' | 'cancelled'> {
  const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache })
  try {
    await Share.share({ files: [uri] })
    return 'shared'
  } catch (e) {
    // 使用者把分享選單關掉時，外掛是用拋錯回報的——那不是失敗。
    if (/cancel/i.test(String(e))) return 'cancelled'
    throw e
  }
}
