import type { Adapter } from '../src/platforms'
import { xAdapter } from '../src/platforms/x'
import { threadsAdapter } from '../src/platforms/threads'

/**
 * app 的 adapter 註冊表。
 *
 * 跟 src/platforms/index.ts 的 ADAPTERS 分開：網頁版與擴充功能這次維持只認 X，
 * Threads 只在 app 裡開放（app 的 fetch 走原生，抓得到 Threads）。
 */
export const APP_ADAPTERS: readonly Adapter[] = [xAdapter, threadsAdapter]

function bareHost(url: URL): string {
  return url.hostname.replace(/^www\.|^mobile\./, '')
}

export function appAdapterFor(url: string): Adapter | undefined {
  try {
    const host = bareHost(new URL(url))
    return APP_ADAPTERS.find((a) => a.hosts.includes(host))
  } catch {
    return undefined
  }
}

/** 分享時平台自己加的追蹤參數；其餘參數保留。 */
const TRACKING = new Set(['s', 't', 'xmt', 'igshid', 'ref_src', 'ref_url'])

const URL_RE = /https?:\/\/[^\s<>"'，。！？；：、）」』】]+/g

/**
 * 從分享進來的文字裡抽出第一個 app 認得的貼文網址。
 *
 * X 與 Threads 的分享選單給的不一定是乾淨網址：可能帶追蹤參數，也可能是
 * 「內文＋網址」混在一起的純文字。
 */
export function extractShareUrl(shared: string): string | null {
  for (const raw of shared.match(URL_RE) ?? []) {
    let url: URL
    try {
      url = new URL(raw.replace(/[.,;:!?)\]}]+$/, ''))
    } catch {
      continue
    }
    if (!appAdapterFor(url.href)) continue
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.has(key) || key.startsWith('utm_')) url.searchParams.delete(key)
    }
    url.hash = ''
    return url.href.replace(/\?$/, '')
  }
  return null
}
