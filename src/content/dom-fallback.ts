import type { Post } from '../types'
import { tokenize } from '../parse/tokenize'
import { findPermalink, findTweetRoots } from './permalink'

/**
 * 從已登入頁面的 live DOM 讀取推文。
 *
 * 這是給鎖推帳號用的降級路徑。正常路徑是不帶 cookie 抓取公開頁面解析
 * schema.org microdata，但鎖推內容對未登入請求本來就不可見，X 回傳的頁面裡
 * 根本沒有那則推文。使用者的瀏覽器看得到，是因為它是登入狀態且獲得核准。
 *
 * ⚠️ 本檔案與 permalink.ts 是全系統僅有的兩個依賴 X 頁面結構的模組。X 改版時
 * 只有這兩個檔案需要修。刻意不把選擇器擴散到別處。
 *
 * 以下選擇器皆於 2026-08-01 對登入狀態的 x.com 實測確認，不是憑推測撰寫：
 *   [data-testid="tweetText"]  → '看完 poi s03'
 *   [data-testid="User-Name"]  → '止痛藥水\n@0x001A'（名稱與帳號同元素，換行分隔）
 *   time[datetime]             → '2026-07-31T21:54:11.000Z'（ISO 8601，同 microdata）
 *   img[src*="profile_images"] → '…/78IKI5Gj_x96.jpg'
 */

const SEL = {
  text: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  time: 'time[datetime]',
  avatar: 'img[src*="profile_images"]',
} as const

/**
 * 從 User-Name 的多行文字拆出名稱與帳號。
 *
 * 實測格式為 `名稱\n@帳號`，但時間軸檢視會多帶時間（`名稱\n@帳號\n·\n5 小時`），
 * 已驗證帳號也可能插入額外節點。因此不靠行號取值，改用語意判斷：
 * 帳號是第一個以 @ 開頭的行，名稱是第一個不以 @ 開頭、也不是分隔符的行。
 */
export function parseUserName(raw: string): { name: string; handle: string } | null {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const handleLine = lines.find((l) => l.startsWith('@'))
  const nameLine = lines.find((l) => !l.startsWith('@') && l !== '·')
  if (!handleLine || !nameLine) return null
  return { name: nameLine, handle: handleLine.slice(1) }
}

/** 找出頁面上對應該永久連結的推文節點。 */
function findArticle(permalink: string): Element | null {
  return findTweetRoots(document).find((el) => findPermalink(el) === permalink) ?? null
}

/**
 * 讀取指定推文。拿不到必填欄位（名稱／帳號／內文）時回傳 null，由呼叫端
 * 決定如何降級 —— 絕不產出殘缺資料。
 */
export function extractFromDom(permalink: string): Post | null {
  const article = findArticle(permalink)
  if (!article) return null

  const rawText = article.querySelector<HTMLElement>(SEL.text)?.innerText ?? ''
  const userNameRaw = article.querySelector<HTMLElement>(SEL.userName)?.innerText ?? ''
  const who = parseUserName(userNameRaw)
  if (!who || !rawText.trim()) return null

  const id = permalink.match(/\/status\/(\d+)/)?.[1] ?? ''

  return {
    id,
    url: permalink,
    platform: 'x',
    author: {
      name: who.name,
      handle: who.handle,
      handleDisplay: '@' + who.handle,
      avatarUrl: article.querySelector<HTMLImageElement>(SEL.avatar)?.src ?? '',
    },
    rawText,
    text: tokenize(rawText),
    createdAt: article.querySelector(SEL.time)?.getAttribute('datetime') ?? '',
    // 互動數一律 null。X 只渲染非零的數字且不帶標籤 —— 實測某則有 2 回覆、
    // 0 轉推、0 讚的推文，整個 [role="group"] 的文字就只有 '2'，無從判斷它
    // 屬於哪一項。猜錯（把回覆數當成讚數）比顯示「—」糟得多。
    metrics: [
      { kind: 'views', value: null },
      { kind: 'replies', value: null },
      { kind: 'reposts', value: null },
      { kind: 'likes', value: null },
    ],
    // 圖片同理不處理：時間軸的圖片節點與引用推文的難以可靠區分，而歸屬錯誤
    // 會把別人的圖畫進卡片。降級路徑寧可少給，不可給錯。
    media: [],
    source: 'dom',
    // 從已登入頁面的 live DOM 讀到什麼就是什麼，沒有第二份來源會截斷它，
    // 定義上就是完整內文。
    textComplete: true,
  }
}
