export type FetchErrorKind = 'not-found' | 'rate-limited' | 'network' | 'cors' | 'badurl'

export class TweetFetchError extends Error {
  constructor(public kind: FetchErrorKind, message: string) {
    super(message)
    this.name = 'TweetFetchError'
  }
}

/**
 * X 的未登入 SSR 頁面會依 `Accept-Language` 在地化，而且**連解析用的錨點一起在地化**：
 *
 *   en/zh  `<title>` = `{名稱} on X: "{內文}" / X`，操作列 aria-label = Reply/Repost/Like
 *   ja     `<title>` = `Xユーザーの{名稱}さん: 「{內文}」`，aria-label = 返信/リポスト/いいね
 *   ko/fr/de/es/pt/id/th 各有各的樣板
 *
 * 新版 SSR 已移除 `itemprop="text"` 與 `interactionStatistic`，內文與互動數只剩
 * 這兩個錨點可用，所以瀏覽器語言不是 en/zh 的使用者會整個解析失敗、無聲退化成
 * DOM 路徑（作者被遮蔽、圖片與互動數全空）。
 *
 * 固定送英文比在程式裡維護十幾種語言的字串表可靠得多：解析結果不再隨使用者的
 * 瀏覽器設定飄移。這只影響我們自己這個抓取請求，不影響使用者眼前的頁面。
 * `Accept-Language` 是 CORS-safelisted request header，fetch() 可以直接指定。
 */
export const SSR_LANGUAGE = 'en-US,en;q=0.9'

/**
 * 抓取推文頁 HTML。
 *
 * `credentials: 'omit'` 不是最佳化，是整個擷取策略的前提：未登入時 X 才會回傳
 * 含 schema.org microdata 的伺服器渲染頁面。帶上 cookie 會拿到 React SPA 外殼。
 */
export async function fetchTweetHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'omit',
      headers: { 'Accept-Language': SSR_LANGUAGE },
    })
  } catch (e) {
    throw new TweetFetchError('network', String(e))
  }
  if (res.status === 404) throw new TweetFetchError('not-found', '推文不存在')
  if (res.status === 429) throw new TweetFetchError('rate-limited', 'X 限制了請求')
  if (!res.ok) throw new TweetFetchError('network', `HTTP ${res.status}`)
  return res.text()
}
