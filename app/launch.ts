import { App as CapApp } from '@capacitor/app'
import { extractShareUrl } from './adapters'

/**
 * 分享延伸功能把使用者分享的東西包成 `xframe://card?url=<原始字串>` 叫醒主 app。
 * 原始字串可能是乾淨網址，也可能是「內文＋網址」，交給 extractShareUrl 去挑。
 */
export function parseLaunchUrl(href: string): string | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== 'xframe:' || u.hostname !== 'card') return null
  const shared = u.searchParams.get('url')
  return shared ? extractShareUrl(shared) : null
}

/** @capacitor/app 用到的那兩個方法；測試換成假的。 */
export type LaunchApi = {
  getLaunchUrl: () => Promise<{ url: string } | undefined>
  addListener: (event: 'appUrlOpen', cb: (e: { url: string }) => void) => Promise<{ remove: () => Promise<void> }>
}

const DEDUPE_MS = 2000

/**
 * 冷啟動（app 原本沒開）讀 getLaunchUrl，熱啟動（app 在背景）聽 appUrlOpen。
 *
 * 冷啟動時 iOS 有時兩條路都會報同一個網址，同一網址 2 秒內只算一次——否則同一則
 * 貼文會被抓兩次，第二次還會把使用者剛點的氛圍洗掉。
 */
export async function listenForShares(
  onUrl: (url: string) => void,
  api: LaunchApi = CapApp as unknown as LaunchApi,
  now: () => number = Date.now,
): Promise<void> {
  let last: { url: string; at: number } | null = null
  const handle = (href: string | undefined) => {
    const url = href ? parseLaunchUrl(href) : null
    if (!url) return
    const at = now()
    if (last && last.url === url && at - last.at < DEDUPE_MS) return
    last = { url, at }
    onUrl(url)
  }
  await api.addListener('appUrlOpen', (e) => handle(e.url))
  handle((await api.getLaunchUrl())?.url)
}
