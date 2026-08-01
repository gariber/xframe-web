# XFrame 行動網頁版 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一個公開網址的網頁版 XFrame，在 iPhone Safari 與桌面瀏覽器上貼入推文網址即可自動抓取、調整外觀、存成圖片，並可加入 iOS 主畫面。

**Architecture:** 沿用擴充功能既有的解析與渲染模組，只替換抓取層 —— 頁面直接跨來源 `fetch` x.com（瀏覽器預設不帶跨來源 cookie，未驗證請求的前提自動成立），取代 service worker 訊息傳遞。新增行動版單欄外殼與一個「最小高度」語意的 9:16 比例模式。

**Tech Stack:** TypeScript（strict）、Vite、Preact、modern-screenshot、Vitest + happy-dom

**Spec:** `docs/superpowers/specs/2026-08-01-mobile-web-design.md`

## Global Constraints

- TypeScript `strict: true`。無新增執行期依賴。
- 不得修改 `manifest.config.ts` 的 `permissions` 或 `host_permissions`；擴充功能的建置與 214+ 既有測試必須維持通過。
- **環境問題在環境修，不在產品程式碼修。** happy-dom 無版面引擎（`getBoundingClientRect()` 恆回傳 0），比例與版面相關的斷言只能驗「我們設了什麼樣式」，實際幾何須在真瀏覽器量測。
- 不得打包任何背景圖片檔；背景一律程式生成。
- 不做 service worker / 離線快取。
- 網頁版**沒有 DOM 降級路徑**；鎖推推文須明確導向 Chrome 擴充功能。
- 所有對 x.com 的請求不得帶 cookie（瀏覽器 `fetch` 預設即是，**不得**改成 `credentials: 'include'`）。

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `src/types.ts` | 於 `aspect` union 加入 `'9:16'` |
| `src/render/card.css.ts` | `ASPECT_VALUE` 加入 `'9:16'`；新增 `MIN_HEIGHT_ASPECTS` |
| `src/render/Card.tsx` | 9:16 走 `minHeight` 而非 `height` |
| `src/background/fetch-tweet.ts` | `FetchErrorKind` 加入 `'cors'` |
| `src/editor/Panel.tsx` | `ERROR_TEXT` 補 `cors` 文案 |
| `web/fetch.ts` | 抓取轉接層：直接 fetch + 錯誤分類 + 資產轉 data URL |
| `web/Sheet.tsx` | 可收合分區元件 |
| `web/App.tsx` | 行動版外殼：網址輸入、狀態機、版面、存圖 |
| `web/main.tsx` | 進入點 |
| `web/index.html` | HTML 外殼、PWA meta |
| `web/manifest.webmanifest` | PWA manifest |
| `vite.web.config.ts` | 網頁版建置設定 |
| `docs/DEPLOY.md` | GitHub Pages 部署與捷徑建置說明 |

---

## Task 1: 9:16 最小高度模式

**Files:**
- Modify: `src/types.ts`、`src/render/card.css.ts`、`src/render/Card.tsx`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Produces: `CardSettings['aspect']` 多一個 `'9:16'`；`MIN_HEIGHT_ASPECTS: ReadonlySet<string>`

**背景：** 現有固定比例（`1:1`/`4:5`/`16:9`）鎖死高度、超出即裁切淡出。`9:16` 語意不同 —— 只保證**最小**高度，內容更長就繼續變高、不裁切。畫布目前硬寫 `minHeight: 0`，此模式需覆寫該值。因為不鎖死高度，`fitFontSize` 與 `maxCharsFor` 對此模式不套用縮小係數，行為與 `auto` 相同。

- [ ] **Step 1: 寫失敗測試**

在 `test/render/Card.test.tsx` 末尾追加：

```tsx
describe('9:16 最小高度模式', () => {
  const at = (aspect: CardSettings['aspect']) =>
    (mount(undefined, { ...DEFAULT_SETTINGS, aspect }).querySelector('[data-part="canvas"]') as HTMLElement).style

  it('9:16 設定 minHeight 而非 height（內容更長時可繼續變高）', () => {
    const s = at('9:16')
    expect(s.height).toBe('')
    expect(s.minHeight).not.toBe('0px')
    expect(s.minHeight).toMatch(/px$/)
  })

  it('固定比例仍鎖死 height 且 minHeight 為 0', () => {
    const s = at('16:9')
    expect(s.height).toMatch(/px$/)
    expect(s.minHeight).toBe('0px')
  })

  it('auto 既不設 height 也不設最小高度', () => {
    const s = at('auto')
    expect(s.height).toBe('')
    expect(s.minHeight).toBe('0px')
  })

  it('9:16 不套用縮字係數（不鎖高度就沒有塞不下的問題）', () => {
    const raw = '中'.repeat(60)
    const withText = (aspect: CardSettings['aspect']) => {
      const base = parseTweet(fx('plain'), '2083053369351090254')!
      const t = { ...base, rawText: raw, text: [{ type: 'text' as const, value: raw }] }
      const el = mount(t, { ...DEFAULT_SETTINGS, aspect })
      return parseFloat((el.querySelector('[data-part="body"]') as HTMLElement).style.fontSize)
    }
    expect(withText('9:16')).toBe(withText('auto'))
    expect(withText('16:9')).toBeLessThan(withText('auto'))
  })

  it('9:16 不截斷內文（不裁切就不需要漸層淡出）', () => {
    const base = parseTweet(fx('plain'), '2083053369351090254')!
    const raw = 'a'.repeat(700)
    const t = { ...base, rawText: raw, text: [{ type: 'text' as const, value: raw }] }
    const body = mount(t, { ...DEFAULT_SETTINGS, aspect: '9:16' }).querySelector('[data-part="body"]') as HTMLElement
    expect(body.style.overflow).not.toBe('hidden')
  })
})
```

檔案頂端若尚未匯入 `CardSettings` 型別，加上：

```tsx
import type { CardSettings } from '../../src/types'
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/render/Card.test.tsx -t "9:16"`
Expected: FAIL —— `'9:16'` 不是合法的 aspect 值（型別錯誤），或 minHeight 為 `0px`

- [ ] **Step 3: 擴充型別**

`src/types.ts` 把 aspect 那行改為：

```ts
  aspect: 'auto' | '1:1' | '4:5' | '16:9' | '9:16'
```

- [ ] **Step 4: 擴充比例表**

`src/render/card.css.ts` 的 `ASPECT_VALUE` 加入一項，並新增一組常數：

```ts
export const ASPECT_VALUE: Record<string, number | undefined> = {
  auto: undefined,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

/**
 * 這些比例只保證「最小高度」，不鎖死高度 —— 內容更長時畫布繼續變高，不裁切。
 * 與其餘固定比例的差別在此：那些是「就是這麼高，多的切掉」，這個是
 * 「至少這麼高，不夠再長」。短推文也能填滿直式畫面（限時動態），長推文不被切。
 */
export const MIN_HEIGHT_ASPECTS: ReadonlySet<string> = new Set(['9:16'])
```

- [ ] **Step 5: 讓 Card 依模式決定用 height 還是 minHeight**

`src/render/Card.tsx`：

頂端 import 改為（加入 `MIN_HEIGHT_ASPECTS`）：

```tsx
import { ASPECT_VALUE, MIN_HEIGHT_ASPECTS, accentFrom } from './card.css'
```

`ASPECT_SHRINK` 與 `ASPECT_MAX_CHARS` 各補一項 —— 9:16 不鎖高度，所以與 auto 同值：

```ts
const ASPECT_SHRINK: Record<CardSettings['aspect'], number> = {
  auto: 1,
  '1:1': 0.85,
  '4:5': 0.92,
  '16:9': 0.6,
  // 不鎖死高度，內容長就讓畫布變高，沒有塞不下的問題
  '9:16': 1,
}

const ASPECT_MAX_CHARS: Record<CardSettings['aspect'], number> = {
  auto: 900,
  '1:1': 640,
  '4:5': 760,
  '16:9': 300,
  '9:16': 900,
}
```

在 `Card` 元件內，`const ratio = ASPECT_VALUE[s.aspect]` 之後加一行：

```tsx
  const isMinHeight = MIN_HEIGHT_ASPECTS.has(s.aspect)
```

畫布 style 中的 `height` 與 `minHeight` 兩行改為：

```tsx
        // 最小高度模式不鎖死 height，只給下限，內容更長時畫布自然變高
        height: !isMinHeight && fixedHeight !== undefined ? `${fixedHeight}px` : undefined,
        minHeight: isMinHeight && fixedHeight !== undefined ? `${fixedHeight}px` : 0,
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run test/render/Card.test.tsx`
Expected: PASS

- [ ] **Step 7: 跑全部測試與型別檢查**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 全數通過。`ASPECT_SHRINK`／`ASPECT_MAX_CHARS` 是 `Record<CardSettings['aspect'], number>`，漏補任一項 TypeScript 會直接報錯。

- [ ] **Step 8: 在真瀏覽器驗證（happy-dom 測不到幾何）**

啟動預覽頁：

```bash
npx vite --config vite.preview.config.ts --port 5199
```

在 `dev/main.tsx` 的比例下拉加入一項 `<option value="9:16">9:16</option>`，然後於瀏覽器（視窗設為 1280×800，確認 `innerWidth` 非 0）Console 執行：

```js
const sel = document.querySelector('select[value], select');
// 切到 9:16 後量測
const c = document.querySelector('[data-part="canvas"]');
const r = c.getBoundingClientRect();
JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3) })
```

Expected: 短推文時 `ratio ≈ 0.563`（9/16）；換到內容較長的 `quoted` fixture 時 `ratio < 0.563`（變更高），且**內容沒有被裁切**。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 9:16 最小高度比例模式"
```

---

## Task 2: 網頁版抓取轉接層

**Files:**
- Create: `web/fetch.ts`
- Modify: `src/background/fetch-tweet.ts`（`FetchErrorKind` 加入 `'cors'`）、`src/editor/Panel.tsx`（`ERROR_TEXT` 補一行）
- Test: `test/web/fetch.test.ts`

**Interfaces:**
- Consumes: `TweetFetchError`、`FetchErrorKind`（`src/background/fetch-tweet.ts`）、`upgradeAvatarUrl`、`upgradeMediaUrl`（`src/background/asset-proxy.ts`）、`TweetData`
- Produces:
  - `fetchTweetHtml(url: string): Promise<string>`
  - `hydrateAssets(tweet: TweetData): Promise<TweetData>`

**背景：** 擴充功能透過 service worker 抓取；網頁版直接在頁面 fetch。瀏覽器對跨來源請求預設不送 cookie（`credentials` 預設 `same-origin`），所以未驗證請求的架構前提自動成立 —— **不可**改成 `include`。

新增 `'cors'` 錯誤種類：這是本架構最可能失效之處（X 若關閉跨來源存取），出事時錯誤訊息必須一眼看得出原因，而不是含糊的網路錯誤。

- [ ] **Step 1: 寫失敗測試**

`test/web/fetch.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTweetHtml, hydrateAssets } from '../../web/fetch'
import { TweetFetchError } from '../../src/background/fetch-tweet'
import type { TweetData } from '../../src/types'

const URL_ = 'https://x.com/a/status/123'

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchTweetHtml', () => {
  it('成功時回傳 HTML 內容', async () => {
    stubFetch(async () => new Response('<html>ok</html>', { status: 200 }))
    expect(await fetchTweetHtml(URL_)).toBe('<html>ok</html>')
  })

  it('不得帶 cookie —— 未驗證請求是整個架構的前提', async () => {
    let seen: RequestInit | undefined
    stubFetch(async (_i, init) => { seen = init; return new Response('x', { status: 200 }) })
    await fetchTweetHtml(URL_)
    expect(seen?.credentials).not.toBe('include')
  })

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'network'],
  ])('HTTP %i 對應 kind=%s', async (status, kind) => {
    stubFetch(async () => new Response('', { status }))
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind })
  })

  it('TypeError（跨來源被擋的典型症狀）歸類為 cors，不是含糊的網路錯誤', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'cors' })
  })

  it('非 TypeError 的例外歸類為 network', async () => {
    stubFetch(async () => { throw new Error('boom') })
    await expect(fetchTweetHtml(URL_)).rejects.toMatchObject({ kind: 'network' })
  })

  it('拋出的是 TweetFetchError', async () => {
    stubFetch(async () => new Response('', { status: 404 }))
    await expect(fetchTweetHtml(URL_)).rejects.toBeInstanceOf(TweetFetchError)
  })
})

const tweet = (over: Partial<TweetData> = {}): TweetData => ({
  id: '1', url: URL_, source: 'microdata',
  author: { name: 'A', handle: 'a', avatarUrl: 'https://pbs.twimg.com/profile_images/1/x_normal.jpg' },
  rawText: 'hi', text: [{ type: 'text', value: 'hi' }], createdAt: '',
  stats: { replies: null, reposts: null, quotes: null, likes: null, views: null },
  media: [], ...over,
})

describe('hydrateAssets', () => {
  it('頭像升級尺寸後轉為 data URL', async () => {
    stubFetch(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { 'content-type': 'image/jpeg' },
    }))
    const t = await hydrateAssets(tweet())
    expect(t.author.avatarUrl).toContain('_400x400')
    expect(t.author.avatarDataUrl).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('單一資產失敗不影響其餘欄位', async () => {
    stubFetch(async () => { throw new TypeError('blocked') })
    const t = await hydrateAssets(tweet())
    expect(t.author.avatarDataUrl).toBeUndefined()
    expect(t.rawText).toBe('hi')
  })

  it('引用推文的資產一併處理', async () => {
    stubFetch(async () => new Response(new Uint8Array([1]), {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    const q = { ...tweet(), author: { name: 'B', handle: 'b', avatarUrl: 'https://p/b_normal.png' } }
    const t = await hydrateAssets(tweet({ quoted: q }))
    expect(t.quoted!.author.avatarDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/web/fetch.test.ts`
Expected: FAIL —— `Cannot find module '../../web/fetch'`

- [ ] **Step 3: 擴充錯誤種類**

`src/background/fetch-tweet.ts` 第一行改為：

```ts
export type FetchErrorKind = 'not-found' | 'rate-limited' | 'network' | 'cors'
```

`src/editor/Panel.tsx` 的 `ERROR_TEXT` 加入一行（擴充功能有 host 權限不會遇到，但保持同一套詞彙）：

```ts
  cors: '瀏覽器擋下了這個請求',
```

- [ ] **Step 4: 實作 web/fetch.ts**

```ts
import type { TweetData } from '../src/types'
import { TweetFetchError } from '../src/background/fetch-tweet'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/**
 * 抓取推文頁 HTML。
 *
 * 與擴充功能版的差別：這裡在頁面本身跨來源 fetch，不經 service worker。
 * 瀏覽器對跨來源請求的 `credentials` 預設是 `same-origin`，也就是不送 cookie ——
 * 「未驗證請求才拿得到 microdata」這個架構前提因此自動成立。不可改成 'include'。
 */
export async function fetchTweetHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    // 跨來源被擋在瀏覽器裡的典型症狀就是 TypeError: Failed to fetch。
    // 這是本架構最可能失效之處（X 若關閉跨來源存取），必須與一般網路錯誤區分，
    // 否則使用者只會看到「網路錯誤」，查不出真正原因。
    const kind = e instanceof TypeError ? 'cors' : 'network'
    throw new TweetFetchError(kind, String(e))
  }
  if (res.status === 404) throw new TweetFetchError('not-found', '推文不存在')
  if (res.status === 429) throw new TweetFetchError('rate-limited', 'X 限制了請求')
  if (!res.ok) throw new TweetFetchError('network', `HTTP ${res.status}`)
  return res.text()
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** 抓圖轉 data URL。理由同擴充功能版：跨來源圖片會污染 canvas，匯出會整個失敗。 */
async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = new Uint8Array(await res.arrayBuffer())
    const mime = res.headers.get('content-type') ?? 'image/jpeg'
    return `data:${mime};base64,${bytesToBase64(buf)}`
  } catch {
    return undefined
  }
}

async function hydrateOne<T extends Omit<TweetData, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  const [avatarDataUrl, ...mediaData] = await Promise.all([
    avatarUrl ? toDataUrl(avatarUrl) : Promise.resolve(undefined),
    ...t.media.map((m) => toDataUrl(upgradeMediaUrl(m.url))),
  ])
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl },
    media: t.media.map((m, i) => ({ ...m, url: upgradeMediaUrl(m.url), dataUrl: mediaData[i] })),
  }
}

export async function hydrateAssets(tweet: TweetData): Promise<TweetData> {
  const outer = await hydrateOne(tweet)
  if (!tweet.quoted) return outer
  return { ...outer, quoted: await hydrateOne(tweet.quoted) }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run test/web/fetch.test.ts`
Expected: PASS（全部 12 項）

- [ ] **Step 6: 跑全部測試與型別檢查**

Run: `npm test && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 網頁版抓取轉接層，跨來源被擋單獨分類"
```

---

## Task 3: 可收合分區元件

**Files:**
- Create: `web/Sheet.tsx`
- Test: `test/web/Sheet.test.tsx`

**Interfaces:**
- Produces: `<Sheet title={string} defaultOpen?={boolean}>{children}</Sheet>`

**背景：** 手機畫面小，四個設定分區預設全部收合，使用者只展開當下要調的那個。用原生 `<details>`／`<summary>`：不需要 JS 狀態、鍵盤與螢幕閱讀器行為由瀏覽器提供、預設就可展開收合。

- [ ] **Step 1: 寫失敗測試**

`test/web/Sheet.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { Sheet } from '../../web/Sheet'

function mount(node: ComponentChild) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(node as never, host)
  return host
}

describe('Sheet', () => {
  it('顯示標題', () => {
    expect(mount(<Sheet title="背景紙張">內容</Sheet>).textContent).toContain('背景紙張')
  })

  it('渲染子內容', () => {
    expect(mount(<Sheet title="t"><span data-x="1">內容</span></Sheet>).querySelector('[data-x]')).not.toBeNull()
  })

  it('預設收合', () => {
    const d = mount(<Sheet title="t">x</Sheet>).querySelector('details')!
    expect(d.hasAttribute('open')).toBe(false)
  })

  it('defaultOpen 時展開', () => {
    const d = mount(<Sheet title="t" defaultOpen>x</Sheet>).querySelector('details')!
    expect(d.hasAttribute('open')).toBe(true)
  })

  it('用原生 details/summary，展開收合與無障礙由瀏覽器負責', () => {
    const el = mount(<Sheet title="t">x</Sheet>)
    expect(el.querySelector('details > summary')).not.toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/web/Sheet.test.tsx`
Expected: FAIL —— `Cannot find module '../../web/Sheet'`

- [ ] **Step 3: 實作 Sheet.tsx**

```tsx
import type { ComponentChildren } from 'preact'

/**
 * 可收合的設定分區。
 *
 * 用原生 <details>/<summary> 而非自刻狀態：展開收合、鍵盤操作、螢幕閱讀器的
 * expanded 狀態全部由瀏覽器提供，不需要維護 aria 屬性，也不會有狀態與 DOM
 * 不同步的問題。
 */
export function Sheet({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ComponentChildren
}) {
  return (
    <details class="sheet" open={defaultOpen}>
      <summary class="sheet-head">{title}</summary>
      <div class="sheet-body">{children}</div>
    </details>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/web/Sheet.test.tsx`
Expected: PASS（全部 5 項）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 可收合設定分區元件"
```

---

## Task 4: 行動版外殼

**Files:**
- Create: `web/App.tsx`、`web/main.tsx`、`web/index.html`、`web/style.css`
- Create: `vite.web.config.ts`
- Modify: `package.json`（加入 `dev:web` 與 `build:web`）

**Interfaces:**
- Consumes: `fetchTweetHtml`、`hydrateAssets`（`web/fetch.ts`）、`Sheet`（`web/Sheet.tsx`）、`parseTweet`、`extractTweetId`、`Card`、`DEFAULT_SETTINGS`、`PRESETS`、`generate`、`randomPreset`、`exportPng`、`buildFilename`、`downloadBlob`
- Produces: 可執行的網頁版

**背景：** 手機是單欄，不是把桌面版縮小。存圖用 iOS 原生手勢 —— 匯出的 PNG 顯示成 `<img>`，長按選「加入照片」；桌面另給下載按鈕。設定存 `localStorage`（不是 `chrome.storage`，網頁版沒有那個 API）。

- [ ] **Step 1: 建立樣式**

`web/style.css`：

```css
:root {
  --ink: #16130f; --ink-soft: #7a736a; --line: #e2ddd4;
  --ground: #f3efe8; --card: #fff; --accent: #16130f;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #f2ece6; --ink-soft: #a89b91; --line: #362b24; --ground: #17120f; --card: #211a16; --accent: #f2ece6; }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang TC", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  /* iOS 主畫面模式下避開瀏海與底部指示條 */
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
.wrap { max-width: 44rem; margin: 0 auto; padding: 1rem 1rem 3rem; }
h1 { font-size: 1.1rem; margin: 0 0 1rem; }
.preview { border-radius: 14px; overflow: hidden; margin-bottom: 1rem; background: var(--card); }
.msg { padding: 3rem 1rem; text-align: center; color: var(--ink-soft); }
.msg button { margin-top: .75rem; }
.urlbar { display: flex; gap: .5rem; margin-bottom: .75rem; }
.urlbar input {
  flex: 1; min-width: 0; font: inherit; padding: .7rem .8rem;
  border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink);
}
button {
  font: inherit; padding: .7rem 1rem; border-radius: 10px; border: 1px solid var(--line);
  background: var(--card); color: var(--ink); cursor: pointer;
}
button.primary { background: var(--accent); color: var(--ground); border-color: var(--accent); font-weight: 600; }
button:disabled { opacity: .45; }
.export-btn { width: 100%; margin-bottom: 1rem; }
.result { margin-bottom: 1rem; }
.result img { width: 100%; display: block; border-radius: 12px; }
.result p { font-size: .85rem; color: var(--ink-soft); margin: .5rem 0 0; }
.sheet { border: 1px solid var(--line); border-radius: 12px; background: var(--card); margin-bottom: .6rem; }
.sheet-head { padding: .8rem 1rem; font-weight: 600; cursor: pointer; list-style: none; }
.sheet-head::-webkit-details-marker { display: none; }
.sheet-head::after { content: '＋'; float: right; color: var(--ink-soft); }
.sheet[open] .sheet-head::after { content: '−'; }
.sheet-body { padding: 0 1rem 1rem; }
.sheet-body label { display: flex; align-items: center; gap: .6rem; margin-bottom: .7rem; font-size: .9rem; }
.sheet-body input[type="range"] { flex: 1; min-width: 0; }
/* 40 張色票在手機上改橫向捲動，否則佔滿整個畫面 */
.swatches { display: flex; gap: .4rem; overflow-x: auto; padding-bottom: .4rem; -webkit-overflow-scrolling: touch; }
.swatches button { flex: 0 0 auto; width: 44px; height: 58px; border-radius: 8px; padding: 0; }
.swatches button[aria-pressed="true"] { outline: 2px solid var(--ink); outline-offset: 1px; }
.err { color: #b3341c; font-size: .9rem; }
```

- [ ] **Step 2: 建立 HTML 外殼**

`web/index.html`：

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>XFrame — 把 X 推文變成分享圖</title>
    <link rel="manifest" href="./manifest.webmanifest" />
    <meta name="theme-color" content="#f3efe8" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="XFrame" />
    <link rel="apple-touch-icon" href="./icons/icon180.png" />
    <link rel="icon" href="./icons/icon128.png" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 建立進入點**

`web/main.tsx`：

```tsx
import { render } from 'preact'
import { App } from './App'
import './style.css'

render(<App />, document.getElementById('app')!)
```

- [ ] **Step 4: 實作 App.tsx**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, TweetData } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../src/render/export'
import { parseTweet, extractTweetId } from '../src/parse/microdata'
import { fetchTweetHtml, hydrateAssets } from './fetch'
import { Sheet } from './Sheet'

const STORAGE_KEY = 'xframe.web.settings'

/** 網頁版預設直式，適合限時動態；不鎖死高度，長推文會繼續變高。 */
const WEB_DEFAULTS: CardSettings = { ...DEFAULT_SETTINGS, aspect: '9:16' }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  cors: 'X 已變更存取政策，網頁版暫時無法使用 —— 請改用 Chrome 擴充功能',
  parse: '無法讀取這則推文。若是鎖推帳號，網頁版取不到內容，請用 Chrome 擴充功能',
  badurl: '這看起來不是推文網址',
  export: '產生圖片失敗，請重試',
}

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: TweetData }
  | { phase: 'error'; message: string }

function loadSettings(): CardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...WEB_DEFAULTS }
    const saved = JSON.parse(raw) as Partial<CardSettings>
    const out: CardSettings = { ...WEB_DEFAULTS, show: { ...WEB_DEFAULTS.show }, background: { ...WEB_DEFAULTS.background } }
    for (const k of Object.keys(WEB_DEFAULTS) as (keyof CardSettings)[]) {
      const v = saved[k]
      if (v === undefined) continue
      if (k === 'show' || k === 'background') Object.assign(out[k], v)
      else out[k] = v as never
    }
    return out
  } catch {
    return { ...WEB_DEFAULTS }
  }
}

async function loadTweet(url: string): Promise<TweetData> {
  const id = extractTweetId(url)
  if (!id) throw new Error('badurl')
  const html = await fetchTweetHtml(url)
  const tweet = parseTweet(html, id)
  if (!tweet) throw new Error('parse')
  return hydrateAssets(tweet)
}

export function App() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [settings, setSettings] = useState<CardSettings>(loadSettings)
  const [busy, setBusy] = useState(false)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  // 桌面下載需要原始 blob；只留 objectURL 是拿不回 blob 的
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // 支援 ?u= 帶入，讓捷徑或書籤可以直接開啟並自動抓取
  useEffect(() => {
    const u = new URLSearchParams(location.search).get('u')
    if (u) { setUrl(u); void go(u) }
  }, [])

  const patch = (p: Partial<CardSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* 隱私瀏覽模式可能不給寫 */ }
  }

  async function go(target = url) {
    setStatus({ phase: 'loading' })
    setPngUrl(null)
    setPngBlob(null)
    try {
      setStatus({ phase: 'ready', tweet: await loadTweet(target.trim()) })
    } catch (e) {
      const key = e instanceof Error ? (e as { kind?: string }).kind ?? e.message : 'network'
      setStatus({ phase: 'error', message: ERROR_TEXT[key] ?? ERROR_TEXT.network })
    }
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setUrl(t); void go(t) }
    } catch {
      // Safari 可能拒絕或使用者取消 —— 退回讓他自己貼進輸入框，不顯示錯誤
    }
  }

  async function doExport() {
    const node = cardRef.current?.firstElementChild as HTMLElement | null
    if (!node || status.phase !== 'ready') return
    setBusy(true)
    setExportErr(null)
    try {
      const blob = await exportPng(node, settings)
      setPngBlob(blob)
      setPngUrl(URL.createObjectURL(blob))
    } catch {
      setExportErr(ERROR_TEXT.export)
    } finally {
      setBusy(false)
    }
  }

  const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  return (
    <div class="wrap">
      <h1>XFrame</h1>

      <div class="urlbar">
        <input
          type="url" inputMode="url" placeholder="貼上推文網址" value={url}
          onInput={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void go() }}
        />
        <button type="button" onClick={paste}>貼上</button>
      </div>
      <button class="primary export-btn" type="button" disabled={!url.trim() || status.phase === 'loading'} onClick={() => void go()}>
        {status.phase === 'loading' ? '讀取中…' : '產生卡片'}
      </button>

      <div class="preview" ref={cardRef}>
        {status.phase === 'idle' && <div class="msg">貼上一則推文的網址，就會出現卡片。</div>}
        {status.phase === 'loading' && <div class="msg">讀取推文中…</div>}
        {status.phase === 'error' && (
          <div class="msg">
            <div class="err">{status.message}</div>
            <button type="button" onClick={() => void go()}>重試</button>
          </div>
        )}
        {status.phase === 'ready' && <Card tweet={status.tweet} settings={settings} />}
      </div>

      {status.phase === 'ready' && (
        <button class="primary export-btn" type="button" disabled={busy} onClick={() => void doExport()}>
          {busy ? '產生中…' : '存成圖片'}
        </button>
      )}
      {exportErr && <div class="err">{exportErr}</div>}

      {pngUrl && status.phase === 'ready' && (
        <div class="result">
          <img src={pngUrl} alt="產生的分享圖" />
          {isTouch ? (
            <p>長按上面的圖片 → 「加入照片」即可存檔。</p>
          ) : (
            <button type="button" disabled={!pngBlob}
              onClick={() => pngBlob && downloadBlob(pngBlob, buildFilename(status.tweet))}>下載</button>
          )}
        </div>
      )}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <Sheet title="背景紙張">
          <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成一張</button>
          <div class="swatches">
            {PRESETS.map((p) => (
              <button
                key={`${p.kind}-${p.palette}`} type="button" aria-label={`${p.kind} ${p.palette}`}
                aria-pressed={settings.background.kind === p.kind && settings.background.palette === p.palette}
                style={{ background: generate(p.kind, p.palette, p.seed) }}
                onClick={() => patch({ background: { ...p } })}
              />
            ))}
          </div>
        </Sheet>

        <Sheet title="畫布與排版">
          <label>留白<input type="range" min={16} max={120} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} /></label>
          <label>文字尺寸<input type="range" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} /></label>
          <label>底板透明度<input type="range" min={0} max={100} value={settings.panelOpacity * 100}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} /></label>
          <label>底板顏色<input type="color" value={settings.panelColor}
            onInput={(e) => patch({ panelColor: e.currentTarget.value })} /></label>
          <label>文字顏色<input type="color" value={settings.textColor}
            onInput={(e) => patch({ textColor: e.currentTarget.value })} /></label>
          <label>比例
            <select value={settings.aspect} onChange={(e) => patch({ aspect: e.currentTarget.value as CardSettings['aspect'] })}>
              <option value="9:16">9:16 直式（不限長度）</option>
              <option value="auto">自動高度</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:5">4:5 直式</option>
              <option value="16:9">16:9 橫式</option>
            </select>
          </label>
          <label>時間格式
            <select value={settings.timeFormat} onChange={(e) => patch({ timeFormat: e.currentTarget.value as CardSettings['timeFormat'] })}>
              <option value="relative">相對（6h）</option>
              <option value="absolute">絕對（2026-08-01 05:54）</option>
            </select>
          </label>
          <label>倍率
            <select value={String(settings.scale)} onChange={(e) => patch({ scale: +e.currentTarget.value as 2 | 3 })}>
              <option value="2">2x</option>
              <option value="3">3x</option>
            </select>
          </label>
        </Sheet>

        <Sheet title="顯示項目">
          {(['avatar', 'stats', 'timestamp', 'media'] as const).map((k) => (
            <label key={k}>
              <input type="checkbox" checked={settings.show[k]}
                onChange={(e) => patch({ show: { ...settings.show, [k]: e.currentTarget.checked } })} />
              {{ avatar: '頭像', stats: '互動統計', timestamp: '時間', media: '推文圖片' }[k]}
            </label>
          ))}
        </Sheet>

        <Sheet title="隱私">
          <label>
            <input type="checkbox" checked={settings.maskIdentity}
              onChange={(e) => patch({ maskIdentity: e.currentTarget.checked })} />
            遮蔽作者身分
          </label>
          <p style={{ fontSize: '.82rem', color: 'var(--ink-soft)', margin: 0 }}>
            名稱、帳號、頭像會一起蓋掉。內文若含可識別線索不在處理範圍。
          </p>
        </Sheet>
      </fieldset>
    </div>
  )
}
```

- [ ] **Step 5: 建立網頁版 vite 設定**

`vite.web.config.ts`：

```ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  root: 'web',
  // GitHub Pages 會放在 /<repo>/ 子路徑底下，用相對路徑才不會 404
  base: './',
  plugins: [preact()],
  build: { outDir: '../dist-web', emptyOutDir: true },
  server: { port: 5200 },
})
```

- [ ] **Step 6: 加入 npm scripts**

`package.json` 的 `scripts` 加入：

```json
"dev:web": "vite --config vite.web.config.ts",
"build:web": "tsc --noEmit && vite build --config vite.web.config.ts"
```

- [ ] **Step 7: 驗證建置與型別**

Run: `npm run build:web && npm test && npx tsc --noEmit`
Expected: 產出 `dist-web/`；既有測試全數通過

- [ ] **Step 8: 在真瀏覽器驗證**

```bash
npm run dev:web
```

開 `http://localhost:5200`，用開發者工具切到 iPhone 尺寸（390×844），確認：

- [ ] 貼上 `https://x.com/thsottiaux/status/2083053369351090254` 按「產生卡片」→ 卡片出現
- [ ] 四個分區預設收合，點擊可展開
- [ ] 色票橫向捲動，不佔滿畫面
- [ ] 預設比例是 9:16，卡片為直式
- [ ] 「存成圖片」後下方出現圖片
- [ ] Console 無錯誤

若抓取失敗且錯誤顯示為 cors 文案，記錄實際的 Console 訊息 —— 那代表本機瀏覽器擋下了跨來源請求，需回報而非繞過。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 行動網頁版外殼"
```

---

## Task 5: PWA 與圖示

**Files:**
- Create: `web/manifest.webmanifest`
- Create: `web/public/icons/`（由腳本產生）
- Modify: `scripts/make-icons.py`（加產 180 與 512）

**Interfaces:**
- Consumes: Task 4 的 `web/index.html`（已含 manifest 與 apple-touch-icon 連結）

- [ ] **Step 1: 讓圖示腳本多產兩個尺寸並輸出到網頁版**

`scripts/make-icons.py` 的 `SIZES` 改為：

```python
SIZES = [16, 32, 48, 128, 180, 512]
```

在 `main()` 的迴圈之後加入（同一份圖同時給網頁版用）：

```python
    web = pathlib.Path(__file__).resolve().parent.parent / "web" / "public" / "icons"
    web.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        build(s).save(web / f"icon{s}.png", "PNG", optimize=True)
    print(f"→ 同步至 {web}")
```

- [ ] **Step 2: 產生圖示**

Run: `python3 scripts/make-icons.py`
Expected: 列出六個尺寸，並顯示同步路徑

- [ ] **Step 3: 建立 PWA manifest**

`web/manifest.webmanifest`：

```json
{
  "name": "XFrame — 把 X 推文變成分享圖",
  "short_name": "XFrame",
  "description": "貼上推文網址，產生帶漸層背景的分享圖。不蒐集任何資料。",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f3efe8",
  "theme_color": "#f3efe8",
  "lang": "zh-Hant",
  "icons": [
    { "src": "./icons/icon128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "./icons/icon180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "./icons/icon512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 4: 驗證建置有帶上圖示與 manifest**

Run: `npm run build:web && find dist-web -name "*.png" -o -name "*.webmanifest"`
Expected: 列出六個 png 與 manifest.webmanifest

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest 與多尺寸圖示"
```

---

## Task 6: 部署與捷徑說明

**Files:**
- Create: `docs/DEPLOY.md`

- [ ] **Step 1: 撰寫部署文件**

`docs/DEPLOY.md`：

````markdown
# 部署到 GitHub Pages

全程在瀏覽器完成，不需要 git 或指令列。

## 一、產出檔案

在專案目錄執行：

```bash
npm run build:web
```

會產生 `dist-web/` 資料夾。要上傳的就是**這個資料夾裡面的內容**（不是資料夾本身）。

## 二、建立 GitHub 帳號與 repo

1. 到 <https://github.com/signup> 註冊（免費）
2. 登入後點右上角 **+** → **New repository**
3. Repository name 填 `xframe-web`
4. 選 **Public**（GitHub Pages 免費版需要公開）
5. 點 **Create repository**

## 三、上傳檔案

1. 在新建的 repo 頁面點 **uploading an existing file**
2. 把 `dist-web/` **裡面的所有檔案與資料夾**拖進去
3. 下方點 **Commit changes**

## 四、開啟 Pages

1. repo 頁面點 **Settings**
2. 左側選 **Pages**
3. Source 選 **Deploy from a branch**
4. Branch 選 **main**、資料夾選 **/ (root)**，按 **Save**
5. 等一到兩分鐘，頁面上方會出現網址：`https://<你的帳號>.github.io/xframe-web/`

## 五、加到 iPhone 主畫面

1. iPhone Safari 開啟上面那個網址
2. 點下方分享按鈕 → **加入主畫面**
3. 之後從主畫面開啟就是全螢幕，沒有網址列

## 更新網站

重新 `npm run build:web`，回到 repo 點 **Add file → Upload files**，
把新的 `dist-web/` 內容拖進去覆蓋，Commit 即可。

---

# 捷徑版本

因為網頁支援 `?u=` 參數，捷徑不需要自己抓任何東西 —— 只要把分享的網址接上去開啟。

## 建立步驟

1. iPhone 開啟「捷徑」app，點右上 **+**
2. 點捷徑名稱 → **詳細資訊** → 開啟 **在分享工作表中顯示**
3. 分享工作表類型只勾 **URL**
4. 加入動作 **文字**，內容填：

   ```
   https://<你的帳號>.github.io/xframe-web/?u=
   ```

5. 加入動作 **URL 編碼**，輸入選「捷徑輸入」
6. 加入動作 **合併文字**，把第 4 步的文字與第 5 步的結果接起來（分隔符號選「無」）
7. 加入動作 **打開 URL**，輸入選上一步的結果
8. 命名為 `XFrame`，儲存

## 使用

在 X app 或 Safari 上分享一則推文 → 選 **XFrame** → Safari 開啟並自動產生卡片。
````

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: GitHub Pages 部署與捷徑建置說明"
```
