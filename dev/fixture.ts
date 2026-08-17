import type { Post } from '../src/types'
import { parseTweet } from '../src/parse/microdata'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/*
 * 抓不到圖時的佔位圖。
 *
 * 開發環境常常連不到 pbs.twimg.com（離線、或網路受限的建置沙箱），而媒體排版
 * 正是最需要「眼睛看」的一塊——沒有圖就只能對著沒有圖片的卡片猜。佔位圖用
 * 真實的長寬比，讓比例相關的版面問題重現得出來。
 *
 * 只在 dev/ 裡，不會進到任何產品建置。
 */
function placeholder(w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#3a4a63"/>
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#8fa6c9" stroke-width="2"/>
    <text x="50%" y="50%" fill="#cddcf2" font-family="sans-serif" font-size="${Math.round(Math.min(w, h) / 8)}"
      text-anchor="middle" dominant-baseline="middle">${w}×${h}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/*
 * 開發頁的媒體一律有圖可看。
 *
 * 兩件事都會讓開發時看不到圖：抓不到 pbs.twimg.com（離線或受限網路），以及
 * fixture 的 media 解析結果為空。媒體排版正是最需要用眼睛看的一塊，看不到圖
 * 就只能對著沒有圖的卡片猜，所以兩種情況都補上佔位圖。
 *
 * 只在 dev/ 裡，不會進到任何產品建置。
 */
async function hydrateMedia(media: Post['media']): Promise<Post['media']> {
  const list = media.length
    ? media
    : [{ url: '', alt: '開發用佔位圖', width: 670, height: 1200 } as Post['media'][number]]
  return Promise.all(
    list.map(async (m) => {
      const url = m.url ? upgradeMediaUrl(m.url) : ''
      // 直式 670×1200，取自實測用的那則推文，是最難排的那種高圖
      return { ...m, url, dataUrl: (url ? await toDataUrl(url) : undefined) ?? placeholder(670, 1200) }
    }),
  )
}

/*
 * 開發頁直接以瀏覽器 fetch 取得資產並轉 data URL，不經 service worker。
 *
 * 加逾時：封鎖或受限的網路下，對 pbs.twimg.com 的請求可能要很久才失敗，
 * 整個開發頁就一直停在「載入中…」。排版工作不該為了一張抓不到的圖乾等——
 * 兩秒沒回來就放棄，交給佔位圖。
 */
const ASSET_TIMEOUT_MS = 2000

async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ASSET_TIMEOUT_MS) })
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => resolve(undefined as never)
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

async function hydrate<T extends Omit<Post, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl: await toDataUrl(avatarUrl) },
    media: await hydrateMedia(t.media),
  }
}

export const FIXTURES = {
  plain: '2083053369351090254',
  quoted: '2082883636177916306',
  media: '2083061426923475451',
  'quoted-with-media': '2082981910209540352',
} as const

// `root: 'dev'` 讓 `/test/fixtures/*.html` 這種絕對路徑無法穩定對應到專案根目錄的
// test/ 目錄（依賴 dev server 的靜態檔案解析，跨平台/跨設定容易失敗）。改用
// import.meta.glob 直接把 fixture HTML 內嵌進打包結果，不依賴執行期路徑解析。
const FIXTURE_HTML = import.meta.glob<string>('../test/fixtures/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function fixtureHtml(name: keyof typeof FIXTURES): string {
  const html = FIXTURE_HTML[`../test/fixtures/${name}.html`]
  if (!html) throw new Error(`fixture ${name} 找不到（../test/fixtures/${name}.html）`)
  return html
}

export async function loadFixture(name: keyof typeof FIXTURES): Promise<Post> {
  const html = fixtureHtml(name)
  const tweet = parseTweet(html, FIXTURES[name])
  if (!tweet) throw new Error(`fixture ${name} 解析失敗`)
  const outer = await hydrate(tweet)
  return tweet.quoted ? { ...outer, quoted: await hydrate(tweet.quoted) } : outer
}
