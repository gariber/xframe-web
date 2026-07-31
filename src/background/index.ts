import { fetchTweetHtml, TweetFetchError, type FetchErrorKind } from './fetch-tweet'
import { hydrateAssets } from './asset-proxy'
import type { TweetData } from '../types'

export type Request =
  | { type: 'fetch-tweet-html'; url: string }
  | { type: 'hydrate-assets'; tweet: TweetData }

export type Response =
  // 兩個成功變體都帶 `type`（沿用請求的 type 值）作為判別欄位，否則
  // `if (res.ok)` 只會窄化成兩者的聯集，`.html` 與 `.tweet` 都不可存取——
  // 呼叫端就只能靠 `any` 硬讀欄位，改個欄位名字型別檢查也抓不到。
  | { ok: true; type: 'fetch-tweet-html'; html: string }
  | { ok: true; type: 'hydrate-assets'; tweet: TweetData }
  | { ok: false; kind: FetchErrorKind | 'unknown-request'; message: string }

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (req.type === 'fetch-tweet-html') {
        sendResponse({ ok: true, type: 'fetch-tweet-html', html: await fetchTweetHtml(req.url) })
      } else if (req.type === 'hydrate-assets') {
        sendResponse({ ok: true, type: 'hydrate-assets', tweet: await hydrateAssets(req.tweet) })
      } else {
        sendResponse({
          ok: false,
          kind: 'unknown-request',
          message: `unknown request type: ${(req as { type?: string }).type}`,
        })
      }
    } catch (e) {
      const kind = e instanceof TweetFetchError ? e.kind : 'network'
      sendResponse({ ok: false, kind, message: String(e) })
    }
  })()
  return true // 保持訊息通道開啟以供非同步回應
})
