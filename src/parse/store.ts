/**
 * 讀 X 頁面內嵌的 client store。
 *
 * X 的 SSR 會把整個 GraphQL 結果序列化成一份 JS 物件字面值塞進 `<script>`：
 *
 *   "VHdlZXQ6MjA5..."：$R[19]={__id:"VHdlZXQ6MjA5...",__typename:"Tweet",
 *     rest_id:"2097043464538264003",
 *     core:$R[20]={__ref:"client:VHdlZXQ6MjA5...:core"}, …}
 *
 * 節點以 `__id` 命名，彼此用 `__ref` / `__refs` 連結，`$R[n]=` 是序列化器自己的
 * 反向參照編號（同一個物件第二次出現時只寫 `$R[n]`）。這個模組只做三件事：
 * 依 `__id` 找出節點、在節點裡讀欄位、跟著參照走到下一個節點。
 *
 * 為什麼值得讀它：它是這份頁面上唯一**沒有被截斷、也沒有被在地化**的資料來源。
 * `og:description` 被截在 300 字，`<title>` 連結尾引號都會掉，操作列的數字是
 * 縮寫，aria-label 會隨語系改變——store 裡則是原始的 `full_text`、
 * `created_at_ms` 與精確整數。
 *
 * 為什麼它不是**主要**來源：它是 X 內部的序列化格式，沒有任何相容性承諾，形狀
 * 說變就變。DOM 那條路有好幾個彼此獨立的表面可以交叉驗證（permalink、作者
 * 連結、og:description、可見正文），錯了會 fail closed；store 只有一份資料，
 * 讀錯了沒有第二個聲音會反對。所以它的定位是**第二來源**：DOM 拿得出東西時
 * 以 DOM 為準，DOM 整條斷掉時才由它接手。
 */

/** 這個模組不解析 JS，只做括號配對，所以模板字串裡的 `${}` 不在支援範圍內。 */
function skipString(source: string, start: number): number {
  const quote = source[start]
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === quote) return i
  }
  return -1
}

/**
 * 從指定的 `{` 讀出配對到的整個物件字面值。
 *
 * 必須認得字串：內文裡的 `}`（例如某人推文寫 `function(){}`）不能當成結構的
 * 一部分，否則節點會在半途被截斷。
 */
function objectAt(source: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(source, i)
      if (end < 0) return null
      i = end
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return null
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const UNQUOTED_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * JS 字串字面值轉回文字。
 *
 * store 裡的內文是字面值，不是 JSON：`\n`、`\'`、`\uXXXX` 都可能出現（實測
 * `full_text:"We\'ve investigated…"`）。照字面取用會在卡片上印出反斜線。
 *
 * 認不得的逸出序列一律只丟掉反斜線——這正是 JS 自己的規則（`\q` 就是 `q`）。
 */
const SHORT_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
}

export function decodeJsString(raw: string): string {
  if (!raw.includes('\\')) return raw
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = raw[++i]
    if (next === undefined) break
    if (next === 'u' && raw[i + 1] === '{') {
      const close = raw.indexOf('}', i + 2)
      const code = close < 0 ? NaN : Number.parseInt(raw.slice(i + 2, close), 16)
      if (Number.isFinite(code) && code <= 0x10ffff) {
        out += String.fromCodePoint(code)
        i = close
      }
      continue
    }
    if (next === 'u' || next === 'x') {
      const width = next === 'u' ? 4 : 2
      const hex = raw.slice(i + 1, i + 1 + width)
      if (hex.length === width && /^[0-9a-fA-F]+$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16))
        i += width
      } else {
        // 位數不足的 \u / \x 在 JS 裡是語法錯誤。這裡沿用「認不得就只丟掉
        // 反斜線」的規則，剩下的字元照原樣輸出，而不是靜靜地吃掉它們。
        out += next
      }
      continue
    }
    // 行接續：反斜線加換行在 JS 裡什麼都不產生。
    if (next === '\n') continue
    out += SHORT_ESCAPES[next] ?? next
  }
  return out
}

/**
 * 找出節點**自己**這一層某個欄位的值從哪裡開始，回傳值的起始位置。
 *
 * 兩件事都不能省。一是欄位名前面必須是 `{` 或 `,`：少了這個錨點，找 `text`
 * 會命中 `full_text`、找 `count` 會命中 `favorite_count`——讀到的是別的欄位，
 * 而且完全不會報錯。二是只認最外層：節點裡巢狀著別的物件（`{__ref:…}`、
 * 甚至完整的子節點），扁平地搜尋會讀到子物件的同名欄位。
 */
function fieldAt(body: string, field: string): number {
  const head = new RegExp(`^\\s*(?:"${escapeRegExp(field)}"|${escapeRegExp(field)})\\s*:\\s*`)
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(body, i)
      if (end < 0) return -1
      i = end
      continue
    }
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      continue
    } else if (ch !== ',') continue
    if (depth !== 1) continue
    const match = body.slice(i + 1).match(head)
    if (match) return i + 1 + match[0].length
  }
  return -1
}

export function stringField(body: string, field: string): string | null {
  const at = fieldAt(body, field)
  if (at < 0 || body[at] !== '"') return null
  const end = skipString(body, at)
  return end < 0 ? null : decodeJsString(body.slice(at + 1, end))
}

/** 整數欄位。序列化器有時寫成數字、有時寫成字串（瀏覽數就是 `count:"1777903"`）。 */
export function intField(body: string, field: string): number | null {
  const at = fieldAt(body, field)
  if (at < 0) return null
  const match = body.slice(at).match(/^"?(\d+)"?(?=[,}])/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/** 整數陣列欄位，例如 `display_text_range:$R[60]=[0,279]`。 */
export function intsField(body: string, field: string): number[] | null {
  const at = fieldAt(body, field)
  if (at < 0) return null
  const match = body.slice(at).match(/^(?:\$R\[\d+\]=)?\[([\d,\s]*)\]/)
  if (!match) return null
  return match[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value))
}

/** 單一參照：`field:$R[n]={__ref:"…"}`。 */
export function refField(body: string, field: string): string | null {
  const at = fieldAt(body, field)
  if (at < 0) return null
  return body.slice(at).match(/^(?:\$R\[\d+\]=)?\{__ref:"([^"]*)"\}/)?.[1] ?? null
}

/** 參照陣列：`field:$R[n]={__refs:$R[m]=["…","…"]}`。 */
export function refsField(body: string, field: string): string[] {
  const at = fieldAt(body, field)
  if (at < 0) return []
  const match = body.slice(at).match(/^(?:\$R\[\d+\]=)?\{__refs:(?:\$R\[\d+\]=)?\[([^\]]*)\]/)
  if (!match) return []
  return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
}

export type Store = {
  /** 依 `__id` 取出節點的物件字面值；找不到或對不上就回 null。 */
  node(id: string): string | null
}

/**
 * 只掃 `<script>` 的內容，不掃整份 HTML。
 *
 * 這些鍵字串本身夠特別，掃全文也幾乎不會誤中，但推文內文是使用者可以自由輸入
 * 的——有人把一段長得像 store 的文字打進推文裡，就能替自己的推文偽造內容與
 * 數據。內文在 DOM 裡永遠是文字節點，不會變成 script 的內容，所以限制搜尋
 * 範圍就從根本上排除了這件事。
 */
export function openStore(doc: Document): Store {
  const sources = [...doc.querySelectorAll('script')]
    .map((script) => script.textContent ?? '')
    .filter((source) => source.includes('__id:'))
  const cache = new Map<string, string | null>()

  return {
    node(id: string): string | null {
      const cached = cache.get(id)
      if (cached !== undefined) return cached
      const found = findNode(sources, id)
      cache.set(id, found)
      return found
    },
  }
}

function findNode(sources: readonly string[], id: string): string | null {
  // 鍵可能有引號，也可能沒有——base64 帶 `=` 或 `:` 時才一定被引起來。
  const key = escapeRegExp(id)
  const pattern = new RegExp(
    UNQUOTED_KEY.test(id) ? `(?:"${key}"|\\b${key})\\s*:\\s*(?:\\$R\\[\\d+\\]\\s*=\\s*)?\\{` : `"${key}"\\s*:\\s*(?:\\$R\\[\\d+\\]\\s*=\\s*)?\\{`,
    'g',
  )
  const marker = `__id:"${id}"`
  for (const source of sources) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const body = objectAt(source, match.index + match[0].length - 1)
      // 節點必須自報同一個 `__id`。少了這道檢查，一段剛好長得像鍵的文字
      // 就能冒充節點——而 `{__ref:"…"}` 之類的佔位節點也會被當成本體。
      if (body !== null && body.includes(marker)) return body
    }
  }
  return null
}
