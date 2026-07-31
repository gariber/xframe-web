import type { TweetData } from '../src/types'
import { parseTweet } from '../src/parse/microdata'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/** 開發頁直接以瀏覽器 fetch 取得資產並轉 data URL，不經 service worker。 */
async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url)
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

async function hydrate<T extends Omit<TweetData, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl: await toDataUrl(avatarUrl) },
    media: await Promise.all(
      t.media.map(async (m) => {
        const url = upgradeMediaUrl(m.url)
        return { ...m, url, dataUrl: await toDataUrl(url) }
      }),
    ),
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

export async function loadFixture(name: keyof typeof FIXTURES): Promise<TweetData> {
  const html = fixtureHtml(name)
  const tweet = parseTweet(html, FIXTURES[name])
  if (!tweet) throw new Error(`fixture ${name} 解析失敗`)
  const outer = await hydrate(tweet)
  return tweet.quoted ? { ...outer, quoted: await hydrate(tweet.quoted) } : outer
}
