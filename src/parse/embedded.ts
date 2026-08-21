import type { MetricKind } from '../types'

export type EmbeddedCounts = Partial<Record<MetricKind, number>>

/**
 * X 頁面內嵌的互動計數。
 *
 * 為什麼需要這條路：可見操作列印的是**縮寫**（`2.2K`、`17K`、`1.8M`），而且
 * 那顆轉推按鈕只印純轉推數。X 自己的介面顯示的卻是「轉推 ＋ 引用」——實測
 * 兩則推文都對得上：817+953=1770、213+554=767，與使用者在 x.com 上看到的
 * 1756 / 763（稍早的快照）一致。只讀操作列的話，卡片上的轉推數會比使用者
 * 在 X 上看到的少掉整整一個引用數，而其他三項都對，看起來就像隨機壞掉一項。
 *
 * 引用數在未登入頁面的 DOM 裡**完全沒有**——沒有「查看引用」連結、也沒有
 * 任何節點帶著這個數字。唯一的來源是頁面內嵌的 client store。
 *
 * 這裡刻意只讀整數。同一份 store 也有 `full_text`、`created_at_ms` 之類，
 * 但那些是 JS 字串字面值（含 `\n`、`\'`、`\uXXXX` 逸出），而且長推文的內文
 * 還被拆進另一個 `note_tweet` 節點——要正確取用得自己寫一套字面值解碼，那比
 * 現在用可見文字取全文更容易出錯。整數沒有這個問題：`retweet_count:817`
 * 只可能是它字面上的意思。
 */

/** `"client:{base64}:counts":$R[n]={...}`。中間那段 `:$R[n]=` 不含大括號。 */
const COUNTS_BLOCK = /"client:([A-Za-z0-9+/=]+):counts"[^{}]*\{([^{}]*)\}/g
const VIEWS_BLOCK = /"client:([A-Za-z0-9+/=]+):views"[^{}]*\{([^{}]*)\}/g

/**
 * store 的鍵是 `Tweet:{id}` 的 base64。反解而不是自己編碼推文 ID 去比對：
 * 反解時只要解不出 `Tweet:數字` 就跳過，X 哪天換了鍵的格式，結果是安靜地
 * 少一份資料來源（退回 DOM），而不是比對到別的東西。
 */
function tweetIdFromKey(key: string): string | null {
  let decoded: string
  try {
    decoded = atob(key)
  } catch {
    return null
  }
  return decoded.match(/^Tweet:(\d+)$/)?.[1] ?? null
}

/**
 * 逗號分隔的物件字面值裡取一個整數欄位。
 *
 * 前面的 `(?:^|,)` 不能省：`count` 是 `favorite_count`、`retweet_count` 的
 * 後綴，不錨定的話瀏覽數會讀到按讚數。
 */
function intField(body: string, field: string): number | null {
  const match = body.match(new RegExp(`(?:^|,)${field}:"?(\\d+)"?(?:,|$)`))
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function collect(
  source: string,
  pattern: RegExp,
  read: (body: string) => EmbeddedCounts,
  into: Map<string, EmbeddedCounts>,
): void {
  pattern.lastIndex = 0
  for (const match of source.matchAll(pattern)) {
    const id = tweetIdFromKey(match[1])
    if (!id) continue
    const parsed = read(match[2])
    if (Object.keys(parsed).length === 0) continue
    into.set(id, { ...into.get(id), ...parsed })
  }
}

/**
 * 讀出頁面上每一則推文的互動計數，以推文 ID 為鍵。
 *
 * 只掃 `<script>` 的內容，不掃整份 HTML。這些鍵字串本身夠特別，掃全文也幾乎
 * 不會誤中，但推文內文是使用者可以自由輸入的——有人把一段長得像 store 的
 * 文字打進推文裡，就能替自己的推文偽造數據。內文在 DOM 裡是文字節點，永遠
 * 不會變成 script 的內容，所以限制搜尋範圍就從根本上排除了這件事。
 */
export function parseEmbeddedCounts(doc: Document): Map<string, EmbeddedCounts> {
  const found = new Map<string, EmbeddedCounts>()
  for (const script of doc.querySelectorAll('script')) {
    const source = script.textContent ?? ''
    if (!source.includes(':counts"') && !source.includes(':views"')) continue

    collect(source, COUNTS_BLOCK, (body) => {
      const counts: EmbeddedCounts = {}
      const replies = intField(body, 'reply_count')
      const likes = intField(body, 'favorite_count')
      const reposts = intField(body, 'retweet_count')
      if (replies !== null) counts.replies = replies
      if (likes !== null) counts.likes = likes
      /*
       * 轉推 ＋ 引用。X 的介面把兩者合在同一個數字裡，卡片要顯示的是使用者
       * 在 X 上看到的那個數，不是 API 欄位本身的意思。引用數缺席時只算轉推——
       * 那是 X 舊頁面的形狀，補 0 比整項變成 null 誠實。
       */
      if (reposts !== null) counts.reposts = reposts + (intField(body, 'quote_count') ?? 0)
      return counts
    }, found)

    collect(source, VIEWS_BLOCK, (body) => {
      const views = intField(body, 'count')
      return views === null ? {} : { views }
    }, found)
  }
  return found
}
