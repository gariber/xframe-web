import { fetchTweetHtml, TweetFetchError } from './fetch-tweet'
import { hydrateAssets } from './asset-proxy'
import type { TweetData } from '../types'

export type Request =
  | { type: 'fetch-tweet-html'; url: string }
  | { type: 'hydrate-assets'; tweet: TweetData }

export type Response =
  | { ok: true; html: string }
  | { ok: true; tweet: TweetData }
  | { ok: false; kind: string; message: string }

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (req.type === 'fetch-tweet-html') {
        sendResponse({ ok: true, html: await fetchTweetHtml(req.url) })
      } else if (req.type === 'hydrate-assets') {
        sendResponse({ ok: true, tweet: await hydrateAssets(req.tweet) })
      }
    } catch (e) {
      const kind = e instanceof TweetFetchError ? e.kind : 'network'
      sendResponse({ ok: false, kind, message: String(e) })
    }
  })()
  return true // 保持訊息通道開啟以供非同步回應
})
