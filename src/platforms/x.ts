import type { Adapter } from './types'
import type { Post } from '../types'
import { extractTweetId, parseTweet } from '../parse/microdata'
import { fetchTweetHtml, TweetFetchError } from '../background/fetch-tweet'
import { findPermalink, findTweetRoots } from '../content/permalink'

export const X_HOSTS = ['x.com', 'twitter.com'] as const

export const xAdapter: Adapter = {
  platform: 'x',
  hosts: X_HOSTS,

  findPermalinks(root: ParentNode) {
    const out: { url: string; anchor: Element }[] = []
    for (const el of findTweetRoots(root)) {
      const url = findPermalink(el)
      // 找不到連結就不回報，避免呼叫端注入一個按了沒反應的按鈕
      if (url) out.push({ url, anchor: el })
    }
    return out
  },

  async acquire(url: string): Promise<Post> {
    const id = extractTweetId(url)
    if (!id) throw new TweetFetchError('badurl', `不是推文連結：${url}`)
    const html = await fetchTweetHtml(url)
    const post = parseTweet(html, id)
    // 抓得到頁面卻解析不到 —— 鎖定帳號，或 X 改了結構化資料的形狀。
    // 兩者的處置相同：交給呼叫端決定要不要退回 DOM 讀取。
    if (!post) throw new TweetFetchError('not-found', `解析不到貼文：${url}`)
    return post
  },
}
