import type { TweetData } from '../types'
import { tokenize } from '../parse/tokenize'

export type ManualInput = {
  name: string
  handle: string
  text: string
}

/**
 * 手動輸入模式產生的推文 id。
 *
 * 刻意用一個明顯不是真實推文 ID 的值：真實 ID 是純數字雪花碼，任何看起來
 * 像數字的假值都可能被誤認成真的。buildFilename 會清理 id，所以這個值不會
 * 造成檔名問題。
 */
export const MANUAL_ID = 'manual'

/**
 * 把手動輸入的三個欄位組成 TweetData。
 *
 * 這是 spec §4.0 所列殘餘風險的唯一緩解手段：若 X 停止對未登入請求提供
 * schema.org microdata，解析會全面失敗，屆時使用者仍可自行輸入內容出圖。
 *
 * 拿不到的欄位一律退回既有的降級機制，不編造佔位值：
 * 沒有頭像 → Avatar 的首字母色塊；沒有時間 → relTime 對空字串回傳空字串；
 * 四項互動數皆為 null → fmt 渲染成「—」，與「真的是 0」語意上仍可區分。
 *
 * 必填欄位不齊時回傳 null，呼叫端不得產出殘缺圖。
 */
export function buildManualTweet(input: ManualInput): TweetData | null {
  const name = input.name.trim()
  // 使用者很可能連 @ 一起貼上；handle 在整個系統裡一律不含 @（microdata 的
  // alternateName 也是不含 @ 的），這裡統一掉，否則卡片會顯示成「@@foo」。
  const handle = input.handle.trim().replace(/^@+/, '')
  const text = input.text

  if (!name || !handle || !text.trim()) return null

  return {
    id: MANUAL_ID,
    url: '',
    author: { name, handle, avatarUrl: '' },
    // 使用者自己打的內容，不是從任何頁面讀來的。歸在 microdata 是因為它不該
    // 觸發鎖推提醒 —— 那個提醒的意義是「這內容原本不公開」，手動輸入沒有
    // 這個性質。
    source: 'microdata',
    rawText: text,
    text: tokenize(text),
    createdAt: '',
    metrics: [
      { kind: 'views', value: null },
      { kind: 'replies', value: null },
      { kind: 'reposts', value: null },
      { kind: 'likes', value: null },
    ],
    media: [],
    // 使用者自己打的字，沒有「來源截斷」這回事，定義上就是完整內文。
    textComplete: true,
  }
}
