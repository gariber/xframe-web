/**
 * 系統唯一的 live DOM 依賴。
 * X 頁面的 CSS 選擇器只能出現在本檔案 —— X 改版時的修改面積僅限於此。
 */

const STATUS_LINK = 'a[href*="/status/"]'
const TWEET_ROOT = 'article'

/** 從推文節點找出正規化的永久連結。 */
export function findPermalink(el: Element): string | null {
  for (const a of el.querySelectorAll<HTMLAnchorElement>(STATUS_LINK)) {
    // 只採用屬於此節點的連結，不取巢狀引用推文的
    if (a.closest(TWEET_ROOT) !== el) continue
    const href = a.getAttribute('href') ?? ''
    const m = href.match(/^(?:https?:\/\/(?:x|twitter)\.com)?(\/[^/]+\/status\/\d+)/)
    if (m) return `https://x.com${m[1]}`
  }
  return null
}

/** 找出頁面上所有最外層的推文節點。 */
export function findTweetRoots(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TWEET_ROOT)].filter((el) => {
    if (el.parentElement?.closest(TWEET_ROOT)) return false // 巢狀引用推文
    return findPermalink(el) !== null
  })
}
