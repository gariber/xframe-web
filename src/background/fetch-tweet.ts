export type FetchErrorKind = 'not-found' | 'rate-limited' | 'network' | 'cors' | 'badurl'

export class TweetFetchError extends Error {
  constructor(public kind: FetchErrorKind, message: string) {
    super(message)
    this.name = 'TweetFetchError'
  }
}

/**
 * 抓取推文頁 HTML。
 *
 * `credentials: 'omit'` 不是最佳化，是整個擷取策略的前提：未登入時 X 才會回傳
 * 含 schema.org microdata 的伺服器渲染頁面。帶上 cookie 會拿到 React SPA 外殼。
 */
export async function fetchTweetHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { credentials: 'omit' })
  } catch (e) {
    throw new TweetFetchError('network', String(e))
  }
  if (res.status === 404) throw new TweetFetchError('not-found', '推文不存在')
  if (res.status === 429) throw new TweetFetchError('rate-limited', 'X 限制了請求')
  if (!res.ok) throw new TweetFetchError('network', `HTTP ${res.status}`)
  return res.text()
}
