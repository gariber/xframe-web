import type { MediaKind, MediaVideo, MetricKind } from '../types'
import {
  findTweetObjects,
  intField as storeInt,
  intsField,
  objectField,
  objectsField,
  openStore,
  refField,
  refsField,
  storeSources,
  stringField,
  type Store,
} from './store'
import { pickVideoVariant } from './media'

export type EmbeddedCounts = Partial<Record<MetricKind, number>>

/**
 * X 頁面內嵌的互動計數。
 *
 * 為什麼需要這條路：可見操作列印的是**縮寫**（`2.2K`、`17K`、`1.8M`），而且
 * 那顆轉推按鈕只印純轉推數。X 自己的介面顯示的卻是「轉推 ＋ 引用」——實測
 * 兩則推文都對得上：817+953=1770、213+554=767，與使用者在 x.com 上看到的
 * 1756 / 763（稍早的快照）一致。只讀操作列的話，卡片上的轉推數會比使用者
 * 在 X 上看到的少掉整整一個引用數，而其他四項都對，看起來就像隨機壞掉一項。
 *
 * 引用數在未登入頁面的 DOM 裡**完全沒有**——沒有「查看引用」連結、也沒有
 * 任何節點帶著這個數字。唯一的來源是頁面內嵌的 client store。
 *
 * 計數這一段用的是扁平的正規表示式，不走 store.ts 的節點圖：它要的是**整頁
 * 每一則**貼文的計數（主貼文與引用貼文都要），一次掃過去比逐則查圖便宜，而且
 * `retweet_count:817` 這種整數欄位不需要字串字面值解碼。同一份 store 的其餘
 * 內容（內文、作者、時間、圖片）則由本檔下半部的 parseEmbeddedPost 經
 * store.ts 讀取。
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
      const bookmarks = intField(body, 'bookmark_count')
      if (replies !== null) counts.replies = replies
      if (likes !== null) counts.likes = likes
      if (bookmarks !== null) counts.bookmarks = bookmarks
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

  /*
   * 內嵌樹版：計數不再是獨立節點，而是掛在貼文物件底下的 `counts` 與 `views`。
   * 上面那個正規化版本在這種頁面上一筆都收不到，於是四項統計整個退回操作列的
   * 縮寫，轉推數也少掉引用數——安靜地退化，卡片看起來照樣正常。
   */
  for (const [id, body] of findTweetObjects(storeSources(doc))) {
    const tweet = objectField(body, 'result') ?? body
    const counts = objectField(tweet, 'counts')
    const views = objectField(tweet, 'views')
    const parsed: EmbeddedCounts = {}
    if (counts !== null) {
      const replies = storeInt(counts, 'reply_count')
      const likes = storeInt(counts, 'favorite_count')
      const bookmarks = storeInt(counts, 'bookmark_count')
      const reposts = storeInt(counts, 'retweet_count')
      if (replies !== null) parsed.replies = replies
      if (likes !== null) parsed.likes = likes
      if (bookmarks !== null) parsed.bookmarks = bookmarks
      // 轉推 ＋ 引用，理由同上面那一段。
      if (reposts !== null) parsed.reposts = reposts + (storeInt(counts, 'quote_count') ?? 0)
    }
    const viewCount = views === null ? null : storeInt(views, 'count')
    if (viewCount !== null) parsed.views = viewCount
    if (Object.keys(parsed).length > 0) found.set(id, { ...found.get(id), ...parsed })
  }

  return found
}

export type EmbeddedAuthor = { name: string; handle: string; avatarUrl: string }
export type EmbeddedMedia = { url: string; alt: string; kind: MediaKind; video?: MediaVideo }

export type EmbeddedPost = {
  id: string
  rawText: string
  /** store 的內文有沒有被截斷。長貼文的全文在 note_tweet，不在 full_text。 */
  textComplete: boolean
  createdAt: string
  author: EmbeddedAuthor
  media: EmbeddedMedia[]
  quotedId: string | null
  /** 這則貼文回覆的那一則的 ID，不是回覆就是 null。 */
  replyToId: string | null
}

/** `Tweet:{id}` 的 base64 —— store 的節點鍵。 */
function tweetNodeId(tweetId: string): string | null {
  try {
    return btoa(`Tweet:${tweetId}`)
  } catch {
    return null
  }
}

/** 走一步 `__ref`：讀出參照，再把被參照的節點取出來。 */
function follow(store: Store, body: string, field: string): string | null {
  const ref = refField(body, field)
  return ref === null ? null : store.node(ref)
}

/**
 * 長貼文的全文。
 *
 * `details.full_text` 是舊的 280 字欄位，超過的部分被切掉；完整內容在
 * `note_tweet` 底下（NoteTweetData → NoteTweetResults → NoteTweet.text）。
 * 三層都得走到才算數，中途斷掉就誠實回報「內文不完整」，不要拿截斷的
 * full_text 假裝是全文。
 */
function noteText(store: Store, tweet: string): { text: string | null; expected: boolean } {
  const note = follow(store, tweet, 'note_tweet')
  if (note === null) return { text: null, expected: refField(tweet, 'note_tweet') !== null }
  const results = follow(store, note, 'note_tweet_results')
  const result = results === null ? null : follow(store, results, 'result')
  return { text: result === null ? null : stringField(result, 'text'), expected: true }
}

/**
 * `display_text_range` 標出 full_text 裡真正要顯示的區間：前面切掉回覆對象的
 * @提及，後面切掉 X 自己接上去的 t.co 附件連結。單位是**碼位**不是 UTF-16
 * 單元，所以要先展開成碼位陣列再切，否則有 emoji 的貼文會被切在代理對中間。
 */
function displayText(body: string, fullText: string): string {
  const range = intsField(body, 'display_text_range')
  if (range === null || range.length !== 2) return fullText
  const [start, end] = range
  if (start < 0 || end < start) return fullText
  const points = [...fullText]
  return end > points.length ? fullText : points.slice(start, end).join('')
}

function authorOf(store: Store, tweet: string): EmbeddedAuthor | null {
  const core = follow(store, tweet, 'core')
  const results = core === null ? null : follow(store, core, 'user_results')
  const user = results === null ? null : follow(store, results, 'result')
  if (user === null) return null

  const userCore = follow(store, user, 'core')
  const name = userCore === null ? null : stringField(userCore, 'name')
  const handle = userCore === null ? null : stringField(userCore, 'screen_name')
  if (!name || !handle) return null

  const avatar = follow(store, user, 'avatar')
  return {
    name,
    handle,
    avatarUrl: (avatar === null ? null : stringField(avatar, 'image_url')) ?? '',
  }
}

/**
 * store 的 `type` 對到卡片的媒體種類。
 *
 * 這裡曾經只收 `photo`，理由寫的是「影片與 GIF 沒有可用的畫格」—— 那句話是
 * 錯的：影片項目的 `media_url_https` 指向 X 自己產的封面畫格（放在
 * pbs.twimg.com/amplify_video_thumb/），跟照片同一個主機、同一條 hydrate
 * 路徑。濾掉的結果是一則純影片的推文整張卡片連一張圖都沒有，不會報錯，
 * 就是靜靜地少了東西。
 */
const STORE_MEDIA_KIND: Record<string, MediaKind | undefined> = {
  photo: 'photo',
  video: 'video',
  animated_gif: 'gif',
}

/**
 * 讀巢狀結構的兩種方式。
 *
 * 兩種 store 形狀的差別全部集中在這裡：正規化節點圖把每個子物件拆成獨立節點、
 * 用 `__ref` 指過去；巢狀物件樹就地展開。上層的解析邏輯因此只寫一次。
 */
type Nested = {
  object(parent: string, field: string): string | null
  list(parent: string, field: string): string[]
}

const byRef = (store: Store): Nested => ({
  object: (parent, field) => {
    const ref = refField(parent, field)
    return ref === null ? null : store.node(ref)
  },
  list: (parent, field) => refsField(parent, field)
    .map((ref) => store.node(ref))
    .filter((node): node is string => node !== null),
})

const inline: Nested = { object: objectField, list: objectsField }

/** 這則媒體的影片，取不到就沒有 —— 有些貼文只給得到封面。 */
function videoOf(node: string, nested: Nested): MediaVideo | undefined {
  const info = nested.object(node, 'video_info')
  if (info === null) return undefined
  // storeInt 而不是這個檔案裡的 intField：後者的前綴是 `(?:^|,)`，讀不到
  // 物件開頭那一個欄位（`{bitrate:256000,…}` 前面是 `{` 不是逗號），而型別
  // 一模一樣，寫錯了編譯器不會吭聲，只會讓長度永遠是 0。
  const url = pickVideoVariant(nested.list(info, 'variants').map((v) => ({
    url: stringField(v, 'url') ?? '',
    bitrate: storeInt(v, 'bitrate'),
    contentType: stringField(v, 'content_type') ?? '',
  })))
  return url === null ? undefined : { url, durationMs: storeInt(info, 'duration_millis') ?? 0 }
}

function embeddedMedia(node: string, nested: Nested): EmbeddedMedia | null {
  const kind = STORE_MEDIA_KIND[stringField(node, 'type') ?? '']
  const url = stringField(node, 'media_url_https') ?? ''
  if (kind === undefined || url === '') return null
  const media: EmbeddedMedia = { url, alt: stringField(node, 'ext_alt_text') ?? '', kind }
  const video = kind === 'photo' ? undefined : videoOf(node, nested)
  return video === undefined ? media : { ...media, video }
}

function mediaOf(store: Store, tweet: string): EmbeddedMedia[] {
  const nested = byRef(store)
  return refsField(tweet, 'media_entities2')
    .map((ref) => store.node(ref))
    .filter((node): node is string => node !== null)
    .map((node) => embeddedMedia(node, nested))
    .filter((media): media is EmbeddedMedia => media !== null)
}

/**
 * 回覆對象的 ID。
 *
 * 和引用一樣，`reply_to_results` 的參照沒有編碼：`TweetResults:{id}`。X 的
 * 詳情頁會把這一則的完整內容也放進同一份 store，所以拿到 ID 之後不必再抓一次。
 */
function replyToIdOf(tweet: string): string | null {
  return refField(tweet, 'reply_to_results')?.match(/^TweetResults:(\d+)$/)?.[1] ?? null
}

/** `quoted_tweet_results` 的參照沒有編碼：`TweetResults:2090675027670978569`。 */
function quotedIdOf(tweet: string): string | null {
  return refField(tweet, 'quoted_tweet_results')?.match(/^TweetResults:(\d+)$/)?.[1] ?? null
}

/**
 * 從內嵌 store 讀出一則貼文。
 *
 * 這是 DOM 整條路都走不通時的**第二來源**（見 store.ts 開頭）。它的優點是
 * 內文沒有被截斷、時間是精確的毫秒、作者不受在地化影響；缺點是只有一份資料，
 * 沒有第二個表面可以交叉驗證。所以只有一道自我檢查：節點的 `rest_id` 必須
 * 等於我們要的貼文 ID——確保拿到的是這一則，不是同一頁上的別人。作者名稱或
 * 帳號缺一不可，缺了就整筆放棄，不輸出半成品。
 */
/**
 * 2026-09 底起 X 的內嵌 store 換成一棵普通的巢狀物件樹（見 findTweetObjects）。
 * 欄位名稱一模一樣，只是從「跟著 __ref 走」變成「就地展開」，所以這一份和上面
 * 那份是同一套讀法的兩種走位，不是兩套邏輯。
 */
function inlinePost(doc: Document, tweetId: string): EmbeddedPost | null {
  const found = findTweetObjects(storeSources(doc)).get(tweetId)
  if (found === undefined) return null
  // TweetResults 外殼把本體包在 result 底下；殘根沒有 result，那種情況下外殼
  // 自己就是我們能拿到的全部，但它沒有內容，下面的檢查會把它擋掉。
  const tweet = objectField(found, 'result') ?? found
  if (stringField(tweet, 'rest_id') !== tweetId) return null

  const user = objectField(objectField(tweet, 'core') ?? '', 'user_results')
  const profile = user === null ? null : objectField(user, 'result')
  const core = profile === null ? null : objectField(profile, 'core')
  const name = core === null ? null : stringField(core, 'name')
  const handle = core === null ? null : stringField(core, 'screen_name')
  if (!name || !handle || profile === null) return null
  const avatar = objectField(profile, 'avatar')

  const details = objectField(tweet, 'details')
  const fullText = details === null ? null : stringField(details, 'full_text')
  const noteResults = objectField(objectField(tweet, 'note_tweet') ?? '', 'note_tweet_results')
  const noteResult = noteResults === null ? null : objectField(noteResults, 'result')
  const noteText = noteResult === null ? null : stringField(noteResult, 'text')
  const expectsNote = objectField(tweet, 'note_tweet') !== null

  const rawText = noteText
    ?? (details === null || fullText === null ? null : displayText(details, fullText))
  if (rawText === null) return null

  const createdAtMs = details === null ? null : storeInt(details, 'created_at_ms')
  const restIdOf = (field: string) => {
    const node = objectField(tweet, field)
    return node === null ? null : stringField(node, 'rest_id')
  }
  return {
    id: tweetId,
    rawText,
    textComplete: noteText !== null || !expectsNote,
    createdAt: createdAtMs === null ? '' : new Date(createdAtMs).toISOString(),
    author: {
      name,
      handle,
      avatarUrl: (avatar === null ? null : stringField(avatar, 'image_url')) ?? '',
    },
    media: objectsField(tweet, 'media_entities2')
      .map((item) => embeddedMedia(item, inline))
      .filter((item): item is EmbeddedMedia => item !== null),
    quotedId: restIdOf('quoted_tweet_results'),
    replyToId: restIdOf('reply_to_results'),
  }
}

export function parseEmbeddedPost(doc: Document, tweetId: string): EmbeddedPost | null {
  if (!/^\d+$/.test(tweetId)) return null
  return normalizedPost(doc, tweetId) ?? inlinePost(doc, tweetId)
}

function normalizedPost(doc: Document, tweetId: string): EmbeddedPost | null {
  const nodeId = tweetNodeId(tweetId)
  if (nodeId === null) return null

  const store = openStore(doc)
  const tweet = store.node(nodeId)
  if (tweet === null || stringField(tweet, 'rest_id') !== tweetId) return null

  const author = authorOf(store, tweet)
  if (author === null) return null

  const details = follow(store, tweet, 'details')
  const fullText = details === null ? null : stringField(details, 'full_text')
  const note = noteText(store, tweet)
  const rawText = note.text ?? (details === null || fullText === null ? null : displayText(details, fullText))
  if (rawText === null) return null

  const createdAtMs = details === null ? null : storeInt(details, 'created_at_ms')
  return {
    id: tweetId,
    rawText,
    textComplete: note.text !== null || !note.expected,
    createdAt: createdAtMs === null ? '' : new Date(createdAtMs).toISOString(),
    author,
    media: mediaOf(store, tweet),
    quotedId: quotedIdOf(tweet),
    replyToId: replyToIdOf(tweet),
  }
}
