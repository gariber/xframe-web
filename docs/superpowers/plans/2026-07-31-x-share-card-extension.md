# X 推文分享圖產生器 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一個 Chrome MV3 擴充功能，讓使用者在 X 上點一則推文的內嵌按鈕，開側邊編輯器，把推文渲染成帶程式生成背景的分享圖並匯出 PNG。

**Architecture:** 內容腳本只負責找出推文永久連結；service worker 以 `credentials: 'omit'` 抓取該頁 HTML，取得 X 的 schema.org microdata；純函式解析成 `TweetData`；Preact 編輯器在 Shadow DOM 中即時渲染卡片；`modern-screenshot` 對預覽節點本身光柵化成 PNG。預覽節點即匯出來源，不存在兩套渲染。

**Tech Stack:** TypeScript（strict）、Vite、@crxjs/vite-plugin、Preact、modern-screenshot、Vitest + happy-dom

**Spec:** `docs/superpowers/specs/2026-07-31-x-share-card-extension-design.md`

---

## Global Constraints

每個 task 的要求都隱含包含本節。

- Manifest V3。`permissions` 只能是 `["storage"]`。
- `host_permissions` 只能是這四項，一字不差：`*://x.com/*`、`*://twitter.com/*`、`*://pbs.twimg.com/*`、`*://abs.twimg.com/*`
- **禁止** `<all_urls>`、`tabs`、`webRequest`、`cookies` 權限。
- 所有對 x.com 的請求**必須**帶 `credentials: 'omit'`。這是整個擷取策略的前提，不是最佳化選項。
- 禁止接入任何分析、遙測、錯誤回報服務。零外部網路請求（除 x.com / pbs.twimg.com / abs.twimg.com）。
- 禁止打包任何桌布或背景圖片檔。背景一律程式生成。
- TypeScript `strict: true`。
- 每個 task 結束時 commit。

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `manifest.config.ts` | manifest 定義，權限的單一真實來源 |
| `src/types.ts` | `TweetData`、`Segment`、`Stats`、`CardSettings` 型別 |
| `src/parse/microdata.ts` | HTML 字串 → `TweetData`。純函式，無 `chrome.*`、無網路 |
| `src/parse/tokenize.ts` | 純文字 → `Segment[]` |
| `src/background/index.ts` | service worker 訊息路由 |
| `src/background/fetch-tweet.ts` | 不帶 cookie 抓取推文頁 HTML |
| `src/background/asset-proxy.ts` | 網址升級 + 抓圖轉 base64 |
| `src/content/permalink.ts` | 系統唯一的 live DOM 依賴：找出 `/status/` 連結 |
| `src/content/detector.ts` | MutationObserver 注入按鈕 |
| `src/content/index.ts` | 內容腳本進入點，掛載 Shadow DOM |
| `src/render/backgrounds.ts` | 背景生成引擎，純函式 |
| `src/render/Card.tsx` | 卡片模板。預覽與匯出共用 |
| `src/render/export.ts` | 節點 → PNG Blob |
| `src/editor/store.ts` | `CardSettings` 狀態 + `chrome.storage` 持久化 |
| `src/editor/Panel.tsx` | 側邊欄 UI |
| `test/fixtures/*.html` | 存檔的真實 X 推文頁 |

---

## Task 1: 專案骨架與權限守則

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.config.ts`
- Create: `src/content/index.ts`, `src/background/index.ts`
- Test: `test/manifest.test.ts`

**Interfaces:**
- Consumes: 無（第一個 task）
- Produces: `manifest.config.ts` 預設匯出 `ManifestV3Export` 物件；`npm test` 跑 Vitest；`npm run build` 產出 `dist/`

- [ ] **Step 1: 建立 package.json**

```json
{
  "name": "xframe",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "preact": "^10.24.0",
    "modern-screenshot": "^4.5.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.278",
    "happy-dom": "^15.7.4",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 建立 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "test", "manifest.config.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: 建立 manifest.config.ts**

```ts
import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'XFrame',
  version: '0.1.0',
  description: '把 X 推文變成漂亮的分享圖',
  permissions: ['storage'],
  host_permissions: [
    '*://x.com/*',
    '*://twitter.com/*',
    '*://pbs.twimg.com/*',
    '*://abs.twimg.com/*',
  ],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['*://x.com/*', '*://twitter.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
})
```

- [ ] **Step 4: 建立 vite.config.ts**

```ts
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
  test: { environment: 'happy-dom', globals: true },
})
```

- [ ] **Step 5: 建立最小進入點**

`src/content/index.ts`：

```ts
console.debug('[XFrame] content script loaded')
```

`src/background/index.ts`：

```ts
console.debug('[XFrame] service worker loaded')
```

- [ ] **Step 6: 寫失敗測試 — 權限守則**

`test/manifest.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import manifest from '../manifest.config'

describe('manifest 權限守則', () => {
  it('permissions 只有 storage', () => {
    expect(manifest.permissions).toEqual(['storage'])
  })

  it('host_permissions 恰為四項且一字不差', () => {
    expect(manifest.host_permissions).toEqual([
      '*://x.com/*',
      '*://twitter.com/*',
      '*://pbs.twimg.com/*',
      '*://abs.twimg.com/*',
    ])
  })

  it('絕不出現高風險權限', () => {
    const all = JSON.stringify(manifest)
    for (const banned of ['<all_urls>', '"tabs"', 'webRequest', '"cookies"']) {
      expect(all).not.toContain(banned)
    }
  })

  it('是 manifest v3', () => {
    expect(manifest.manifest_version).toBe(3)
  })
})
```

- [ ] **Step 7: 安裝依賴並跑測試確認失敗**

```bash
npm install
```

Run: `npm test`
Expected: 測試檔找不到模組或斷言失敗（若前面步驟未完成）。若四項全過即代表骨架正確。

- [ ] **Step 8: 跑建置確認產出**

Run: `npm run build`
Expected: 成功，產生 `dist/manifest.json`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 專案骨架與 manifest 權限守則測試"
```

---

## Task 2: 型別定義與測試 fixtures

**Files:**
- Create: `src/types.ts`
- Create: `scripts/capture-fixtures.sh`
- Create: `test/fixtures/*.html`（由腳本產生）
- Test: `test/fixtures.test.ts`

**Interfaces:**
- Consumes: Task 1 的建置環境
- Produces: `TweetData`、`Segment`、`Stats`、`CardSettings` 型別；`test/fixtures/` 下四份真實 HTML

- [ ] **Step 1: 建立 src/types.ts**

```ts
export type Segment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'link'; value: string; href: string }

export type Stats = {
  replies: number | null
  reposts: number | null
  quotes: number | null
  likes: number | null
  views: number | null
}

export type Author = {
  name: string
  handle: string
  avatarUrl: string
  avatarDataUrl?: string
}

export type Media = {
  url: string
  dataUrl?: string
  alt: string
}

export type TweetData = {
  id: string
  url: string
  author: Author
  rawText: string
  text: Segment[]
  createdAt: string
  stats: Stats
  media: Media[]
  quoted?: Omit<TweetData, 'quoted'>
}

export type BgKind = 'mesh' | 'aurora' | 'wave' | 'split' | 'grid'

export type CardSettings = {
  background: { kind: BgKind; palette: string; seed: number }
  padding: number
  fontSize: number
  panelColor: string
  panelOpacity: number
  fontFamily: string
  textColor: string
  show: { avatar: boolean; stats: boolean; timestamp: boolean; media: boolean }
  aspect: 'auto' | '1:1' | '4:5' | '16:9'
  scale: 2 | 3
}
```

- [ ] **Step 2: 建立 fixture 擷取腳本**

`scripts/capture-fixtures.sh`：

```bash
#!/usr/bin/env bash
# 抓取真實 X 推文頁作為測試 fixture。
# 必須不帶 cookie —— 這正是擴充功能實際發出的請求。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test/fixtures

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

capture () {
  local name="$1" url="$2"
  echo "抓取 ${name} ← ${url}"
  curl -sS --compressed -A "$UA" "$url" -o "test/fixtures/${name}.html"
  echo "  $(wc -c < "test/fixtures/${name}.html") bytes"
}

capture plain  'https://x.com/thsottiaux/status/2083053369351090254'
capture quoted 'https://x.com/thsottiaux/status/2082883636177916306'
capture media  'https://x.com/Guanksy/status/2083061426923475451'
capture quoted-with-media 'https://x.com/thsottiaux/status/2082981910209540352'
```

- [ ] **Step 3: 執行腳本**

```bash
chmod +x scripts/capture-fixtures.sh && ./scripts/capture-fixtures.sh
```

Expected: `test/fixtures/` 下產生四個 `.html`，每個大於 100000 bytes

- [ ] **Step 4: 寫測試確認 fixtures 含 microdata**

`test/fixtures.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

const NAMES = ['plain', 'quoted', 'media', 'quoted-with-media']

describe('fixtures', () => {
  it.each(NAMES)('%s 存在且含 microdata article', (name) => {
    const path = `test/fixtures/${name}.html`
    expect(existsSync(path)).toBe(true)
    const html = readFileSync(path, 'utf8')
    expect(html.length).toBeGreaterThan(100_000)
    expect(html).toContain('itemtype="https://schema.org/SocialMediaPosting"')
    expect(html).toContain('data-tweet-id')
  })

  it('quoted fixture 含引用推文', () => {
    const html = readFileSync('test/fixtures/quoted.html', 'utf8')
    expect(html).toContain('itemprop="citation"')
  })

  it('media fixture 含推文圖片', () => {
    const html = readFileSync('test/fixtures/media.html', 'utf8')
    expect(html).toContain('pbs.twimg.com/media/')
  })
})
```

- [ ] **Step 5: 跑測試**

Run: `npm test`
Expected: PASS

> 若某則推文已被刪除導致 fixture 抓取失敗，換一則同類型的推文並更新腳本中的 URL。fixture 的價值在於結構，不在於特定內容。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 型別定義與真實 X 頁面測試 fixtures"
```

---

## Task 3: microdata 解析器 — 基本欄位與互動數

**Files:**
- Create: `src/parse/microdata.ts`
- Test: `test/parse/microdata.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `TweetData`、`Stats`、`Author`
- Produces:
  - `parseTweet(html: string, tweetId: string): TweetData | null`
  - `extractTweetId(url: string): string | null`

**背景（已實測驗證）：** 外層推文的 `text` / `author` / `interactionStatistic` 都能用 `:scope >` 精準取得，作者的 Follows 統計不會混入。引用推文是 `article[itemprop="citation"]`，但**不是**直接子節點。

- [ ] **Step 1: 寫失敗測試**

`test/parse/microdata.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTweet, extractTweetId } from '../../src/parse/microdata'

const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8')

describe('extractTweetId', () => {
  it('從永久連結取出 ID', () => {
    expect(extractTweetId('https://x.com/thsottiaux/status/2083053369351090254'))
      .toBe('2083053369351090254')
  })
  it('容忍尾綴路徑', () => {
    expect(extractTweetId('https://x.com/a/status/123/photo/1')).toBe('123')
  })
  it('非推文網址回傳 null', () => {
    expect(extractTweetId('https://x.com/thsottiaux')).toBeNull()
  })
})

describe('parseTweet 基本欄位', () => {
  const t = parseTweet(fx('plain'), '2083053369351090254')!

  it('解析成功', () => expect(t).not.toBeNull())
  it('id', () => expect(t.id).toBe('2083053369351090254'))
  it('url', () => expect(t.url).toContain('/status/2083053369351090254'))
  it('作者名稱', () => expect(t.author.name).toBe('Tibo'))
  it('作者帳號不含 @', () => expect(t.author.handle).toBe('thsottiaux'))
  it('頭像網址', () => expect(t.author.avatarUrl).toContain('pbs.twimg.com/profile_images/'))
  it('內文', () => expect(t.rawText).toContain('There will be signs'))
  it('建立時間為 ISO 8601', () =>
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/))
})

describe('parseTweet 互動數', () => {
  const t = parseTweet(fx('plain'), '2083053369351090254')!

  it('五個欄位皆為數字', () => {
    for (const k of ['replies', 'reposts', 'quotes', 'likes', 'views'] as const) {
      expect(typeof t.stats[k]).toBe('number')
    }
  })
  it('讚數為正整數', () => expect(t.stats.likes!).toBeGreaterThan(0))
  it('瀏覽數大於讚數', () => expect(t.stats.views!).toBeGreaterThan(t.stats.likes!))
  it('不把作者的追蹤者數誤當成推文統計', () => {
    // 作者有 37 萬追蹤者；推文的任何統計都不應等於該值
    const followers = 378_000
    for (const v of Object.values(t.stats)) {
      expect(Math.abs((v ?? 0) - followers)).toBeGreaterThan(5_000)
    }
  })
})

describe('parseTweet 失敗路徑', () => {
  it('找不到指定 ID 時回傳 null', () => {
    expect(parseTweet(fx('plain'), '9999999999999999999')).toBeNull()
  })
  it('空字串回傳 null', () => {
    expect(parseTweet('', '123')).toBeNull()
  })
  it('無 microdata 的 HTML 回傳 null', () => {
    expect(parseTweet('<html><body><p>hi</p></body></html>', '123')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/parse/microdata.test.ts`
Expected: FAIL — `Cannot find module '../../src/parse/microdata'`

- [ ] **Step 3: 實作 microdata.ts**

```ts
import type { TweetData, Stats, Author } from '../types'

const INTERACTION: Record<string, keyof Stats> = {
  'https://schema.org/ReplyAction': 'replies',
  'https://schema.org/ShareAction': 'reposts',
  'https://schema.org/InteractAction': 'quotes',
  'https://schema.org/LikeAction': 'likes',
  'https://schema.org/ViewAction': 'views',
}

/** 從推文永久連結取出數字 ID。 */
export function extractTweetId(url: string): string | null {
  return url.match(/\/status\/(\d+)/)?.[1] ?? null
}

/** 取得直接子層的 microdata 屬性值。用 `:scope >` 避免抓到引用推文的欄位。 */
function metaOf(root: Element, prop: string): string | null {
  const el = root.querySelector(`:scope > [itemprop="${prop}"]`)
  return el?.getAttribute('content') ?? null
}

function parseAuthor(article: Element): Author | null {
  const a = article.querySelector(':scope > [itemprop="author"]')
  if (!a) return null
  const name = metaOf(a, 'name')
  const handle = metaOf(a, 'alternateName')
  if (!name || !handle) return null
  return { name, handle, avatarUrl: metaOf(a, 'image') ?? '' }
}

function parseStats(article: Element): Stats {
  const stats: Stats = {
    replies: null, reposts: null, quotes: null, likes: null, views: null,
  }
  // `:scope >` 至關重要：作者的追蹤者統計巢狀在 author 之下，不可混入
  for (const block of article.querySelectorAll(':scope > [itemprop="interactionStatistic"]')) {
    const type = block.querySelector('[itemprop="interactionType"]')?.getAttribute('content')
    const count = block.querySelector('[itemprop="userInteractionCount"]')?.getAttribute('content')
    const key = type ? INTERACTION[type] : undefined
    if (key && count !== null && count !== undefined && count !== '') {
      const n = Number(count)
      if (Number.isFinite(n)) stats[key] = n
    }
  }
  return stats
}

/** 解析單一 article 節點。不含引用推文與圖片，由 Task 4 補上。 */
export function parseArticle(article: Element): Omit<TweetData, 'quoted' | 'media' | 'text'> | null {
  const author = parseAuthor(article)
  const rawText = metaOf(article, 'text')
  const id = metaOf(article, 'identifier') ?? article.getAttribute('data-tweet-id')
  if (!author || rawText === null || !id) return null

  return {
    id,
    url: metaOf(article, 'url') ?? `https://x.com/${author.handle}/status/${id}`,
    author,
    rawText,
    createdAt: metaOf(article, 'dateCreated') ?? metaOf(article, 'datePublished') ?? '',
    stats: parseStats(article),
  }
}

export function parseTweet(html: string, tweetId: string): TweetData | null {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = doc.querySelector(
    `article[data-tweet-id="${CSS.escape(tweetId)}"][itemtype="https://schema.org/SocialMediaPosting"]`,
  )
  if (!article) return null

  const base = parseArticle(article)
  if (!base) return null

  return { ...base, text: [], media: [] }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/parse/microdata.test.ts`
Expected: PASS（全部 16 項）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: microdata 解析器基本欄位與互動數"
```

---

## Task 4: 解析器 — 圖片與引用推文

**Files:**
- Modify: `src/parse/microdata.ts`
- Modify: `test/parse/microdata.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `parseArticle`、`parseTweet`
- Produces: `parseTweet` 回傳值的 `media: Media[]` 與 `quoted?: Omit<TweetData,'quoted'>` 欄位已填

**背景（已實測驗證）：** 引用推文的圖片會被外層的 `querySelectorAll('img')` 一併抓到。用 `img.closest('article') === article` 過濾即可正確歸屬 —— 圖片最近的 article 祖先若是引用推文，就屬於引用推文。

- [ ] **Step 1: 追加失敗測試**

在 `test/parse/microdata.test.ts` 末尾追加：

```ts
describe('parseTweet 圖片', () => {
  it('抓到推文自己的圖片', () => {
    const t = parseTweet(fx('media'), '2083061426923475451')!
    expect(t.media.length).toBeGreaterThan(0)
    expect(t.media[0].url).toContain('pbs.twimg.com/media/')
  })

  it('純文字推文的 media 為空陣列', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.media).toEqual([])
  })

  it('不把引用推文的圖片算成外層推文的圖片', () => {
    const t = parseTweet(fx('quoted-with-media'), '2082981910209540352')!
    const quotedUrls = new Set(t.quoted?.media.map((m) => m.url) ?? [])
    for (const m of t.media) expect(quotedUrls.has(m.url)).toBe(false)
  })
})

describe('parseTweet 引用推文', () => {
  const t = parseTweet(fx('quoted'), '2082883636177916306')!

  it('有 quoted 欄位', () => expect(t.quoted).toBeDefined())
  it('引用推文的作者不同於外層', () =>
    expect(t.quoted!.author.handle).not.toBe(t.author.handle))
  it('引用推文有內文', () =>
    expect(t.quoted!.rawText.length).toBeGreaterThan(0))
  it('引用推文不再遞迴巢狀', () =>
    expect((t.quoted as Record<string, unknown>).quoted).toBeUndefined())

  it('純文字推文沒有 quoted', () => {
    const p = parseTweet(fx('plain'), '2083053369351090254')!
    expect(p.quoted).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/parse/microdata.test.ts`
Expected: FAIL — media 為空陣列、`t.quoted` 為 undefined

- [ ] **Step 3: 加入圖片解析**

先把 `src/parse/microdata.ts` 頂端的 import 改為（`Media` 併入，import 必須留在檔案最上方）：

```ts
import type { TweetData, Stats, Author, Media } from '../types'
```

再於 `parseStats` 之後插入：

```ts
/**
 * 取得屬於此 article 的圖片。
 * `img.closest('article') === article` 是正確歸屬的關鍵：若圖片位於巢狀的
 * 引用推文內，其最近的 article 祖先會是引用推文而非外層推文。
 */
function parseMedia(article: Element): Media[] {
  return [...article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')]
    .filter((img) => img.closest('article') === article)
    .map((img) => ({
      url: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
    }))
    .filter((m) => m.url !== '')
}
```

- [ ] **Step 4: 改寫 parseTweet 串接圖片與引用推文**

把 `src/parse/microdata.ts` 的 `parseTweet` 換成：

```ts
export function parseTweet(html: string, tweetId: string): TweetData | null {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = doc.querySelector(
    `article[data-tweet-id="${CSS.escape(tweetId)}"][itemtype="https://schema.org/SocialMediaPosting"]`,
  )
  if (!article) return null

  const base = parseArticle(article)
  if (!base) return null

  // 引用推文不是直接子節點，須以後代選擇器尋找
  const citeEl = article.querySelector('article[itemprop="citation"]')
  let quoted: Omit<TweetData, 'quoted'> | undefined
  if (citeEl) {
    const cbase = parseArticle(citeEl)
    if (cbase) {
      quoted = { ...cbase, text: [], media: parseMedia(citeEl) }
    }
  }

  return {
    ...base,
    text: [],
    media: parseMedia(article),
    ...(quoted ? { quoted } : {}),
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run test/parse/microdata.test.ts`
Expected: PASS（全部 25 項）

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 解析引用推文與圖片，正確歸屬巢狀圖片"
```

---

## Task 5: 文字分段 tokenizer

**Files:**
- Create: `src/parse/tokenize.ts`
- Modify: `src/parse/microdata.ts`（串接）
- Test: `test/parse/tokenize.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `Segment`
- Produces: `tokenize(raw: string): Segment[]`；`parseTweet` 回傳值的 `text` 欄位已填

- [ ] **Step 1: 寫失敗測試**

`test/parse/tokenize.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/parse/tokenize'

describe('tokenize', () => {
  it('純文字回傳單一 text 分段', () => {
    expect(tokenize('hello world')).toEqual([{ type: 'text', value: 'hello world' }])
  })

  it('空字串回傳空陣列', () => {
    expect(tokenize('')).toEqual([])
  })

  it('辨識 hashtag', () => {
    expect(tokenize('go #ai now')).toEqual([
      { type: 'text', value: 'go ' },
      { type: 'hashtag', value: '#ai' },
      { type: 'text', value: ' now' },
    ])
  })

  it('辨識中文 hashtag', () => {
    expect(tokenize('看 #人工智慧 嗎')).toEqual([
      { type: 'text', value: '看 ' },
      { type: 'hashtag', value: '#人工智慧' },
      { type: 'text', value: ' 嗎' },
    ])
  })

  it('辨識 mention', () => {
    expect(tokenize('hi @openai !')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@openai' },
      { type: 'text', value: ' !' },
    ])
  })

  it('辨識連結並保留 href', () => {
    const out = tokenize('see https://x.com/a here')
    expect(out[1]).toEqual({
      type: 'link', value: 'https://x.com/a', href: 'https://x.com/a',
    })
  })

  it('連結結尾的標點不併入網址', () => {
    const out = tokenize('go https://x.com/a.')
    expect(out[1]).toMatchObject({ type: 'link', value: 'https://x.com/a' })
    expect(out[2]).toEqual({ type: 'text', value: '.' })
  })

  it('保留換行', () => {
    expect(tokenize('a\n\nb')).toEqual([{ type: 'text', value: 'a\n\nb' }])
  })

  it('emoji 留在 text 分段內', () => {
    expect(tokenize('yes 🎉')).toEqual([{ type: 'text', value: 'yes 🎉' }])
  })

  it('多個 token 混合', () => {
    const out = tokenize('@a #b https://c.com d')
    expect(out.map((s) => s.type)).toEqual(['mention', 'text', 'hashtag', 'text', 'link', 'text'])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/parse/tokenize.test.ts`
Expected: FAIL — `Cannot find module '../../src/parse/tokenize'`

- [ ] **Step 3: 實作 tokenize.ts**

```ts
import type { Segment } from '../types'

// 連結結尾常見的標點不應併入網址
const TRAILING = /[.,;:!?)\]}'"，。！？；：）】」』]+$/

const PATTERN = /(https?:\/\/[^\s]+)|(#[\p{L}\p{N}_]+)|(@\w{1,15})/gu

export function tokenize(raw: string): Segment[] {
  if (!raw) return []

  const out: Segment[] = []
  let cursor = 0

  const pushText = (value: string) => {
    if (value) out.push({ type: 'text', value })
  }

  for (const m of raw.matchAll(PATTERN)) {
    const start = m.index!
    pushText(raw.slice(cursor, start))

    const [full, link, hashtag, mention] = m

    if (link) {
      const trailing = link.match(TRAILING)?.[0] ?? ''
      const clean = trailing ? link.slice(0, -trailing.length) : link
      out.push({ type: 'link', value: clean, href: clean })
      if (trailing) pushText(trailing)
    } else if (hashtag) {
      out.push({ type: 'hashtag', value: hashtag })
    } else if (mention) {
      out.push({ type: 'mention', value: mention })
    }

    cursor = start + full.length
  }

  pushText(raw.slice(cursor))
  return out
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/parse/tokenize.test.ts`
Expected: PASS（全部 10 項）

- [ ] **Step 5: 在 microdata.ts 串接 tokenize**

在 `src/parse/microdata.ts` 頂端加入 import：

```ts
import { tokenize } from './tokenize'
```

把 `parseTweet` 中兩處 `text: []` 分別改為：

```ts
// 引用推文
quoted = { ...cbase, text: tokenize(cbase.rawText), media: parseMedia(citeEl) }
```

```ts
// 外層推文
return {
  ...base,
  text: tokenize(base.rawText),
  media: parseMedia(article),
  ...(quoted ? { quoted } : {}),
}
```

- [ ] **Step 6: 追加串接測試**

在 `test/parse/microdata.test.ts` 末尾追加：

```ts
describe('parseTweet 文字分段', () => {
  it('text 已分段且非空', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.text.length).toBeGreaterThan(0)
    expect(t.text.map((s) => ('value' in s ? s.value : '')).join('')).toBe(t.rawText)
  })
})
```

- [ ] **Step 7: 跑全部測試**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 文字分段 tokenizer，支援中文 hashtag 與連結尾標點"
```

---

## Task 6: 背景生成引擎

**Files:**
- Create: `src/render/backgrounds.ts`
- Test: `test/render/backgrounds.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `BgKind`
- Produces:
  - `PALETTES: Record<string, readonly [string, string, string, string]>`
  - `generate(kind: BgKind, palette: string, seed: number): string`（回傳 CSS `background` 值）
  - `PRESETS: { kind: BgKind; palette: string; seed: number }[]`（40 組）
  - `GRAIN_DATA_URI: string`
  - `randomPreset(): { kind: BgKind; palette: string; seed: number }`

- [ ] **Step 1: 寫失敗測試**

`test/render/backgrounds.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { generate, PALETTES, PRESETS, GRAIN_DATA_URI, randomPreset } from '../../src/render/backgrounds'
import type { BgKind } from '../../src/types'

const KINDS: BgKind[] = ['mesh', 'aurora', 'wave', 'split', 'grid']

describe('調色盤', () => {
  it('恰有八組', () => expect(Object.keys(PALETTES)).toHaveLength(8))
  it('每組四色且為 hex', () => {
    for (const colors of Object.values(PALETTES)) {
      expect(colors).toHaveLength(4)
      for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('generate', () => {
  it.each(KINDS)('%s 產出非空 CSS', (kind) => {
    const css = generate(kind, 'sunset', 1)
    expect(css.length).toBeGreaterThan(20)
    expect(css).not.toContain('undefined')
    expect(css).not.toContain('NaN')
  })

  it('同 seed 輸出穩定', () => {
    expect(generate('mesh', 'ocean', 42)).toBe(generate('mesh', 'ocean', 42))
  })

  it('不同 seed 輸出不同', () => {
    expect(generate('mesh', 'ocean', 1)).not.toBe(generate('mesh', 'ocean', 2))
  })

  it('不同調色盤輸出不同', () => {
    expect(generate('mesh', 'ocean', 1)).not.toBe(generate('mesh', 'sunset', 1))
  })

  it('未知調色盤退回預設而不拋錯', () => {
    expect(() => generate('mesh', 'nope', 1)).not.toThrow()
  })
})

describe('預設組合', () => {
  it('恰有 40 組（5 類型 × 8 調色盤）', () => expect(PRESETS).toHaveLength(40))
  it('每組都能產出 CSS', () => {
    for (const p of PRESETS) expect(generate(p.kind, p.palette, p.seed).length).toBeGreaterThan(20)
  })
  it('組合不重複', () => {
    const keys = PRESETS.map((p) => `${p.kind}:${p.palette}`)
    expect(new Set(keys).size).toBe(40)
  })
})

describe('顆粒層', () => {
  it('是 SVG data URI 且含 feTurbulence', () => {
    expect(GRAIN_DATA_URI).toMatch(/^url\("data:image\/svg\+xml/)
    expect(decodeURIComponent(GRAIN_DATA_URI)).toContain('feTurbulence')
  })
})

describe('randomPreset', () => {
  it('回傳合法組合', () => {
    const p = randomPreset()
    expect(KINDS).toContain(p.kind)
    expect(Object.keys(PALETTES)).toContain(p.palette)
    expect(Number.isInteger(p.seed)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/render/backgrounds.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/backgrounds'`

- [ ] **Step 3: 實作 backgrounds.ts**

```ts
import type { BgKind } from '../types'

type Quad = readonly [string, string, string, string]

/** 每組四色：前三色為主色，第四色為底色。 */
export const PALETTES: Record<string, Quad> = {
  sunset:   ['#ff7a45', '#ff3d71', '#ffb347', '#2b0f14'],
  ocean:    ['#0ea5e9', '#06b6d4', '#3b82f6', '#04182b'],
  violet:   ['#8b5cf6', '#d946ef', '#6366f1', '#150b2e'],
  forest:   ['#10b981', '#84cc16', '#14b8a6', '#04231a'],
  candy:    ['#f472b6', '#fb923c', '#facc15', '#2a0f1e'],
  midnight: ['#4c1d95', '#1d4ed8', '#0891b2', '#080b1f'],
  sand:     ['#d4a373', '#e9c46a', '#f4a261', '#3b2416'],
  mono:     ['#71717a', '#a1a1aa', '#3f3f46', '#0c0c0e'],
}

const DEFAULT_PALETTE = 'sunset'

/** 線性同餘產生器。同 seed 必得同序列，確保使用者收藏的背景不會變樣。 */
function rng(seed: number): () => number {
  let x = (Math.abs(Math.trunc(seed)) % 233280) + 1
  return () => {
    x = (x * 9301 + 49297) % 233280
    return x / 233280
  }
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function paletteOf(name: string): Quad {
  return PALETTES[name] ?? PALETTES[DEFAULT_PALETTE]
}

function mesh(c: Quad, seed: number): string {
  const r = rng(seed)
  const layers: string[] = []
  for (let i = 0; i < 4; i++) {
    const x = (12 + r() * 76).toFixed(0)
    const y = (12 + r() * 76).toFixed(0)
    const spread = (45 + r() * 20).toFixed(0)
    const col = c[i % 3]
    layers.push(
      `radial-gradient(circle at ${x}% ${y}%, ${rgba(col, 0.95)} 0%, ${rgba(col, 0)} ${spread}%)`,
    )
  }
  layers.push(`linear-gradient(140deg, ${c[3]}, ${rgba(c[2], 0.6)})`)
  return layers.join(',')
}

function aurora(c: Quad, seed: number): string {
  const r = rng(seed)
  const x1 = (20 + r() * 60).toFixed(0)
  const x2 = (20 + r() * 60).toFixed(0)
  return [
    `radial-gradient(ellipse 70% 45% at ${x1}% 20%, ${rgba(c[0], 0.85)} 0%, transparent 70%)`,
    `radial-gradient(ellipse 80% 40% at ${x2}% 78%, ${rgba(c[1], 0.75)} 0%, transparent 72%)`,
    `radial-gradient(circle at 50% 50%, ${rgba(c[2], 0.45)} 0%, transparent 60%)`,
    c[3],
  ].join(',')
}

function wave(c: Quad, seed: number): string {
  const r = rng(seed)
  const lift = 70 + r() * 15
  return [
    `radial-gradient(ellipse 120% 60% at 50% 115%, ${c[0]} 0%, transparent 60%)`,
    `radial-gradient(ellipse 120% 55% at 50% 95%, ${c[1]} 0%, transparent 60%)`,
    `radial-gradient(ellipse 120% 50% at 50% ${lift.toFixed(0)}%, ${c[2]} 0%, transparent 60%)`,
    c[3],
  ].join(',')
}

function split(c: Quad, seed: number): string {
  const angle = (160 + rng(seed)() * 60).toFixed(0)
  return `linear-gradient(${angle}deg, ${c[0]} 0%, ${c[0]} 48%, ${c[1]} 48%, ${c[1]} 100%)`
}

function grid(c: Quad, seed: number): string {
  const gap = (16 + rng(seed)() * 14).toFixed(0)
  return [
    `repeating-linear-gradient(0deg, ${rgba(c[0], 0.5)} 0 1px, transparent 1px ${gap}px)`,
    `repeating-linear-gradient(90deg, ${rgba(c[0], 0.5)} 0 1px, transparent 1px ${gap}px)`,
    `linear-gradient(160deg, ${c[1]}, ${c[3]})`,
  ].join(',')
}

const GENERATORS: Record<BgKind, (c: Quad, seed: number) => string> = {
  mesh, aurora, wave, split, grid,
}

export function generate(kind: BgKind, palette: string, seed: number): string {
  return GENERATORS[kind](paletteOf(palette), seed)
}

/**
 * 顆粒層。疊在漸層之上以 overlay 混合，是讓程式漸層擺脫廉價感的關鍵，不可省略。
 */
export const GRAIN_DATA_URI =
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3"/></filter>` +
    `<rect width="140" height="140" filter="url(#n)" opacity=".5"/></svg>`,
  )}")`

export const KINDS: BgKind[] = ['mesh', 'aurora', 'wave', 'split', 'grid']

export const PRESETS = KINDS.flatMap((kind) =>
  Object.keys(PALETTES).map((palette, i) => ({ kind, palette, seed: i + kind.length * 7 })),
)

export function randomPreset() {
  const names = Object.keys(PALETTES)
  return {
    kind: KINDS[Math.floor(Math.random() * KINDS.length)],
    palette: names[Math.floor(Math.random() * names.length)],
    seed: Math.floor(Math.random() * 9999),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/render/backgrounds.test.ts`
Expected: PASS（全部 15 項）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 背景生成引擎，5 類型 × 8 調色盤 + 顆粒層"
```

---

## Task 7: 資產代理與網址升級

**Files:**
- Create: `src/background/asset-proxy.ts`
- Create: `src/background/fetch-tweet.ts`
- Modify: `src/background/index.ts`
- Test: `test/background/asset-proxy.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `TweetData`
- Produces:
  - `upgradeAvatarUrl(url: string): string`
  - `upgradeMediaUrl(url: string): string`
  - `toDataUrl(url: string): Promise<string>`
  - `hydrateAssets(tweet: TweetData): Promise<TweetData>`
  - `fetchTweetHtml(url: string): Promise<string>`（失敗時拋 `TweetFetchError`）
  - `class TweetFetchError extends Error { kind: 'not-found' | 'rate-limited' | 'network' }`

**背景（已實測驗證）：** 頭像 `_normal.jpg` → `_400x400.jpg` 回傳 `200 image/jpeg`；圖片 `name=medium` → `name=large` 回傳 `200 image/webp`。

- [ ] **Step 1: 寫失敗測試**

`test/background/asset-proxy.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../../src/background/asset-proxy'

describe('upgradeAvatarUrl', () => {
  it('_normal.jpg 升級為 _400x400.jpg', () => {
    expect(upgradeAvatarUrl('https://pbs.twimg.com/profile_images/123/abc_normal.jpg'))
      .toBe('https://pbs.twimg.com/profile_images/123/abc_400x400.jpg')
  })
  it('支援 png 與 webp', () => {
    expect(upgradeAvatarUrl('https://p/a_normal.png')).toBe('https://p/a_400x400.png')
    expect(upgradeAvatarUrl('https://p/a_normal.webp')).toBe('https://p/a_400x400.webp')
  })
  it('已是大圖則原樣返回', () => {
    const u = 'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg'
    expect(upgradeAvatarUrl(u)).toBe(u)
  })
  it('空字串原樣返回', () => expect(upgradeAvatarUrl('')).toBe(''))
})

describe('upgradeMediaUrl', () => {
  it('name=medium 升級為 name=large', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp&name=medium'))
      .toBe('https://pbs.twimg.com/media/ABC?format=webp&name=large')
  })
  it('name=small 也升級', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=jpg&name=small'))
      .toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=large')
  })
  it('無 name 參數則附加', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp'))
      .toBe('https://pbs.twimg.com/media/ABC?format=webp&name=large')
  })
  it('保留 format 參數', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp&name=medium'))
      .toContain('format=webp')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/background/asset-proxy.test.ts`
Expected: FAIL — `Cannot find module '../../src/background/asset-proxy'`

- [ ] **Step 3: 實作 asset-proxy.ts**

```ts
import type { TweetData } from '../types'

export function upgradeAvatarUrl(url: string): string {
  if (!url) return url
  return url.replace(/_normal\.(jpg|jpeg|png|webp)(\?|$)/i, '_400x400.$1$2')
}

export function upgradeMediaUrl(url: string): string {
  if (!url) return url
  if (/[?&]name=/.test(url)) return url.replace(/([?&]name=)\w+/, '$1large')
  return url + (url.includes('?') ? '&' : '?') + 'name=large'
}

/** Service worker 沒有 FileReader，須手動將位元組轉 base64。 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** 抓圖並轉成 data URL。存在的唯一理由是繞開 canvas 跨域污染。 */
export async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error(`asset fetch failed: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const mime = res.headers.get('content-type') ?? 'image/jpeg'
  return `data:${mime};base64,${bytesToBase64(buf)}`
}

/** 盡力而為：單一資產失敗不影響其餘欄位，由 UI 各自降級。 */
async function settle(url: string): Promise<string | undefined> {
  try {
    return await toDataUrl(url)
  } catch {
    return undefined
  }
}

async function hydrateOne<T extends Omit<TweetData, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  const [avatarDataUrl, ...mediaData] = await Promise.all([
    avatarUrl ? settle(avatarUrl) : Promise.resolve(undefined),
    ...t.media.map((m) => settle(upgradeMediaUrl(m.url))),
  ])
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl },
    media: t.media.map((m, i) => ({
      ...m,
      url: upgradeMediaUrl(m.url),
      dataUrl: mediaData[i],
    })),
  }
}

export async function hydrateAssets(tweet: TweetData): Promise<TweetData> {
  const outer = await hydrateOne(tweet)
  if (!tweet.quoted) return outer
  return { ...outer, quoted: await hydrateOne(tweet.quoted) }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/background/asset-proxy.test.ts`
Expected: PASS（全部 8 項）

- [ ] **Step 5: 實作 fetch-tweet.ts**

```ts
export type FetchErrorKind = 'not-found' | 'rate-limited' | 'network'

export class TweetFetchError extends Error {
  constructor(public kind: FetchErrorKind, message: string) {
    super(message)
    this.name = 'TweetFetchError'
  }
}

/**
 * 抓取推文頁 HTML。
 *
 * `credentials: 'omit'` 不是最佳化，是整個擷取策略的前提：未登入時 X 才會回傳
 * 含 schema.org microdata 的伺服器渲染頁面。帶上 cookie 會拿到 React SPA 外殼。
 */
export async function fetchTweetHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { credentials: 'omit' })
  } catch (e) {
    throw new TweetFetchError('network', String(e))
  }
  if (res.status === 404) throw new TweetFetchError('not-found', '推文不存在')
  if (res.status === 429) throw new TweetFetchError('rate-limited', 'X 限制了請求')
  if (!res.ok) throw new TweetFetchError('network', `HTTP ${res.status}`)
  return res.text()
}
```

- [ ] **Step 6: 實作 service worker 訊息路由**

`src/background/index.ts`：

```ts
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
      } else {
        // 每條路徑都必須回應。回傳 true 等於宣告「我會非同步回應」，
        // 若某條路徑沒呼叫 sendResponse，呼叫端會永遠掛住且無錯誤可查。
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
```

- [ ] **Step 7: 跑全部測試與型別檢查**

Run: `npm test && npx tsc --noEmit`
Expected: PASS，無型別錯誤

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: service worker 資產代理與推文抓取"
```

---

## Task 8: 卡片模板

**Files:**
- Create: `src/render/Card.tsx`
- Create: `src/render/card.css.ts`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Consumes: `TweetData`、`CardSettings`、`generate`、`GRAIN_DATA_URI`
- Produces: `<Card tweet={TweetData} settings={CardSettings} />`；`DEFAULT_SETTINGS: CardSettings`

- [ ] **Step 1: 寫失敗測試**

`test/render/Card.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'

const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8')

function mount(tweet = parseTweet(fx('plain'), '2083053369351090254')!, settings = DEFAULT_SETTINGS) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card tweet={tweet} settings={settings} />, host)
  return host
}

describe('Card', () => {
  it('顯示作者名稱與帳號', () => {
    const el = mount()
    expect(el.textContent).toContain('Tibo')
    expect(el.textContent).toContain('@thsottiaux')
  })

  it('顯示推文內文', () => {
    expect(mount().textContent).toContain('There will be signs')
  })

  it('顯示互動數', () => {
    expect(mount().querySelector('[data-part="stats"]')).not.toBeNull()
  })

  it('關閉統計時不渲染統計區', () => {
    const s = { ...DEFAULT_SETTINGS, show: { ...DEFAULT_SETTINGS.show, stats: false } }
    expect(mount(undefined, s).querySelector('[data-part="stats"]')).toBeNull()
  })

  it('無頭像時退化為首字母色塊', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.author.avatarDataUrl = undefined
    t.author.avatarUrl = ''
    const el = mount(t)
    expect(el.querySelector('[data-part="monogram"]')?.textContent).toBe('T')
  })

  it('引用推文渲染為巢狀區塊', () => {
    const t = parseTweet(fx('quoted'), '2082883636177916306')!
    expect(mount(t).querySelector('[data-part="quoted"]')).not.toBeNull()
  })

  it('無引用推文時不渲染巢狀區塊', () => {
    expect(mount().querySelector('[data-part="quoted"]')).toBeNull()
  })

  it('背景套用到根節點', () => {
    const root = mount().querySelector('[data-part="canvas"]') as HTMLElement
    expect(root.style.background.length).toBeGreaterThan(20)
  })

  it('hashtag 使用強調色 class', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.text = [{ type: 'text', value: 'a ' }, { type: 'hashtag', value: '#ai' }]
    expect(mount(t).querySelector('[data-seg="hashtag"]')?.textContent).toBe('#ai')
  })

  it('無 dataUrl 的圖片不渲染（避免污染 canvas）', () => {
    const t = parseTweet(fx('media'), '2083061426923475451')!
    t.media = t.media.map((m) => ({ ...m, dataUrl: undefined }))
    expect(mount(t).querySelector('[data-part="media"]')).toBeNull()
  })

  it('無 avatarDataUrl 時不用原始網址，改用首字母色塊', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.author.avatarDataUrl = undefined
    const el = mount(t)
    expect(el.querySelector('[data-part="monogram"]')).not.toBeNull()
    expect(el.querySelector('img')).toBeNull()
  })
})

describe('長文自動縮字級', () => {
  const base = parseTweet(fx('plain'), '2083053369351090254')!
  const withText = (raw: string) => ({ ...base, rawText: raw, text: [{ type: 'text' as const, value: raw }] })
  const sizeOf = (raw: string) => {
    const el = mount(withText(raw))
    return parseFloat((el.querySelector('[data-part="body"]') as HTMLElement).style.fontSize)
  }

  it('短文使用設定的字級', () => {
    expect(sizeOf('短'.repeat(20))).toBe(DEFAULT_SETTINGS.fontSize)
  })

  it('長文字級變小', () => {
    expect(sizeOf('a'.repeat(300))).toBeLessThan(DEFAULT_SETTINGS.fontSize)
  })

  it('中文以兩倍寬度計算，較早縮字級', () => {
    expect(sizeOf('中'.repeat(80))).toBeLessThan(sizeOf('a'.repeat(80)))
  })

  it('字級不低於 11', () => {
    expect(sizeOf('中'.repeat(2000))).toBeGreaterThanOrEqual(11)
  })

  it('超長文截斷並加遮罩淡出', () => {
    const el = mount(withText('a'.repeat(1200)))
    const body = el.querySelector('[data-part="body"]') as HTMLElement
    expect(body.style.overflow).toBe('hidden')
    expect(body.style.getPropertyValue('-webkit-mask-image') || body.style.maskImage).toContain('gradient')
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('比例預設 auto', () => expect(DEFAULT_SETTINGS.aspect).toBe('auto'))
  it('倍率預設 2', () => expect(DEFAULT_SETTINGS.scale).toBe(2))
  it('四個顯示項預設開啟', () => {
    expect(Object.values(DEFAULT_SETTINGS.show).every(Boolean)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/render/Card.test.tsx`
Expected: FAIL — `Cannot find module '../../src/render/Card'`

- [ ] **Step 3: 建立樣式常數**

`src/render/card.css.ts`：

```ts
export const ASPECT_RATIO: Record<string, string | undefined> = {
  auto: undefined,
  '1:1': '1 / 1',
  '4:5': '4 / 5',
  '16:9': '16 / 9',
}

/** 由文字色推導強調色：同色相、提高彩度。避免使用者要調四個顏色。 */
export function accentFrom(textColor: string): string {
  return textColor === '#ffffff' ? '#7cc4ff' : '#1d6fd0'
}
```

- [ ] **Step 4: 實作 Card.tsx**

```tsx
import type { TweetData, CardSettings, Segment, Media } from '../types'
import { generate, GRAIN_DATA_URI } from './backgrounds'
import { ASPECT_RATIO, accentFrom } from './card.css'

export const DEFAULT_SETTINGS: CardSettings = {
  background: { kind: 'mesh', palette: 'sunset', seed: 1 },
  padding: 72,
  fontSize: 20,
  panelColor: '#1c1816',
  panelOpacity: 0.5,
  fontFamily: '-apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif',
  textColor: '#ffffff',
  show: { avatar: true, stats: true, timestamp: true, media: true },
  aspect: 'auto',
  scale: 2,
}

function fmt(n: number | null): string {
  if (n === null) return '—'
  if (n >= 10_000) return (n / 10_000).toFixed(1).replace(/\.0$/, '') + '萬'
  return String(n)
}

function relTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function Text({ segments, accent }: { segments: Segment[]; accent: string }) {
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.value}</span>
        ) : (
          <span key={i} data-seg={s.type} style={{ color: accent }}>
            {s.value}
          </span>
        ),
      )}
    </>
  )
}

function Avatar({ author, size }: { author: TweetData['author']; size: number }) {
  // 只用 data URL。退回原始跨域網址會污染 canvas 導致匯出整個失敗，
  // 寧可退化成首字母色塊也不能讓匯出爆掉。
  const src = author.avatarDataUrl
  const style = { width: size, height: size, borderRadius: size * 0.28, flex: '0 0 auto' }
  if (src) return <img src={src} alt="" style={{ ...style, objectFit: 'cover' }} />
  return (
    <div
      data-part="monogram"
      style={{
        ...style,
        background: 'linear-gradient(140deg,#5b7cfa,#2a3a6b)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.44,
      }}
    >
      {author.name.trim().charAt(0).toUpperCase()}
    </div>
  )
}

function MediaGrid({ media }: { media: Media[] }) {
  // 同 Avatar：抓取失敗（無 dataUrl）的圖位直接隱藏，不可退回跨域網址
  const usable = media.filter((m) => m.dataUrl)
  if (usable.length === 0) return null
  return (
    <div
      data-part="media"
      style={{
        display: 'grid',
        gridTemplateColumns: usable.length > 1 ? '1fr 1fr' : '1fr',
        gap: 6,
        marginTop: 12,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {usable.slice(0, 4).map((m, i) => (
        <img key={i} src={m.dataUrl} alt={m.alt} style={{ width: '100%', display: 'block' }} />
      ))}
    </div>
  )
}

/**
 * 推文過長時自動縮字級。
 * 以字元數估算：中日韓文字寬度約為拉丁字母兩倍，故加權計算。
 */
function fitFontSize(base: number, raw: string): number {
  const cjk = (raw.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length
  const weighted = raw.length + cjk
  if (weighted <= 140) return base
  if (weighted <= 240) return Math.max(13, base * 0.85)
  if (weighted <= 380) return Math.max(12, base * 0.7)
  return Math.max(11, base * 0.58)
}

const MAX_CHARS = 900

export function Card({ tweet, settings }: { tweet: TweetData; settings: CardSettings }) {
  const s = settings
  const accent = accentFrom(s.textColor)
  const panelBg = s.panelColor + Math.round(s.panelOpacity * 255).toString(16).padStart(2, '0')
  const fontSize = fitFontSize(s.fontSize, tweet.rawText)
  const truncated = tweet.rawText.length > MAX_CHARS

  return (
    <div
      data-part="canvas"
      style={{
        position: 'relative',
        padding: s.padding,
        background: generate(s.background.kind, s.background.palette, s.background.seed),
        aspectRatio: ASPECT_RATIO[s.aspect],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: s.fontFamily,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN_DATA_URI,
          mixBlendMode: 'overlay',
          opacity: 0.3,
          pointerEvents: 'none',
        }}
      />
      <div
        data-part="panel"
        style={{
          position: 'relative',
          width: '100%',
          background: panelBg,
          backdropFilter: 'blur(28px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 18,
          padding: '20px 24px',
          color: s.textColor,
          boxShadow: '0 24px 60px rgba(0,0,0,.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {s.show.avatar && <Avatar author={tweet.author} size={44} />}
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: s.fontSize * 0.9 }}>{tweet.author.name}</div>
            <div style={{ opacity: 0.55, fontSize: s.fontSize * 0.8 }}>@{tweet.author.handle}</div>
          </div>
          {s.show.timestamp && (
            <div style={{ marginLeft: 'auto', opacity: 0.45, fontSize: s.fontSize * 0.75 }}>
              {relTime(tweet.createdAt)}
            </div>
          )}
        </div>

        <div
          data-part="body"
          style={{
            fontSize,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            position: 'relative',
            maxHeight: truncated ? '46em' : undefined,
            overflow: truncated ? 'hidden' : undefined,
            // 截斷處以漸層淡出，避免文字被硬切
            maskImage: truncated
              ? 'linear-gradient(180deg, #000 0%, #000 88%, transparent 100%)'
              : undefined,
            WebkitMaskImage: truncated
              ? 'linear-gradient(180deg, #000 0%, #000 88%, transparent 100%)'
              : undefined,
          }}
        >
          <Text segments={tweet.text} accent={accent} />
        </div>

        {s.show.media && <MediaGrid media={tweet.media} />}

        {tweet.quoted && (
          <div
            data-part="quoted"
            style={{
              marginTop: 14,
              padding: '12px 14px',
              border: '1px solid rgba(255,255,255,.16)',
              borderRadius: 12,
              fontSize: s.fontSize * 0.85,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Avatar author={tweet.quoted.author} size={22} />
              <span style={{ fontWeight: 600 }}>{tweet.quoted.author.name}</span>
              <span style={{ opacity: 0.5 }}>@{tweet.quoted.author.handle}</span>
            </div>
            <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              <Text segments={tweet.quoted.text} accent={accent} />
            </div>
            {s.show.media && <MediaGrid media={tweet.quoted.media} />}
          </div>
        )}

        {s.show.stats && (
          <div
            data-part="stats"
            style={{
              display: 'flex',
              gap: 14,
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,.1)',
              opacity: 0.55,
              fontSize: s.fontSize * 0.72,
            }}
          >
            <span>{fmt(tweet.stats.replies)} 回覆</span>
            <span>{fmt(tweet.stats.reposts)} 轉推</span>
            <span>{fmt(tweet.stats.likes)} 讚</span>
            <span>{fmt(tweet.stats.views)} 瀏覽</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run test/render/Card.test.tsx`
Expected: PASS（全部 12 項）

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 卡片模板，支援引用推文、圖片、頭像降級"
```

---

## Task 9: PNG 匯出

**Files:**
- Create: `src/render/export.ts`
- Test: `test/render/export.test.ts`

**Interfaces:**
- Consumes: `CardSettings`
- Produces:
  - `exportPng(node: HTMLElement, settings: CardSettings): Promise<Blob>`
  - `buildFilename(tweet: TweetData): string`
  - `downloadBlob(blob: Blob, filename: string): void`

- [ ] **Step 1: 寫失敗測試**

`test/render/export.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildFilename } from '../../src/render/export'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'

const tweet = parseTweet(readFileSync('test/fixtures/plain.html', 'utf8'), '2083053369351090254')!

describe('buildFilename', () => {
  it('包含帳號與推文 ID', () => {
    const name = buildFilename(tweet)
    expect(name).toContain('thsottiaux')
    expect(name).toContain('2083053369351090254')
  })
  it('副檔名為 png', () => expect(buildFilename(tweet)).toMatch(/\.png$/))
  it('不含檔名不合法字元', () => {
    expect(buildFilename(tweet)).not.toMatch(/[\/\\:*?"<>|]/)
  })
  it('handle 含特殊字元時仍安全', () => {
    const t = { ...tweet, author: { ...tweet.author, handle: 'a/b:c' } }
    expect(buildFilename(t)).not.toMatch(/[\/\\:*?"<>|]/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/render/export.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/export'`

- [ ] **Step 3: 實作 export.ts**

```ts
import { domToBlob } from 'modern-screenshot'
import type { CardSettings, TweetData } from '../types'

/**
 * 對預覽節點本身光柵化。
 * 預覽即輸出 —— 不存在第二套渲染路徑，因此不可能出現「下載的圖跟預覽不一樣」。
 */
export async function exportPng(node: HTMLElement, settings: CardSettings): Promise<Blob> {
  // 資產已由 asset-proxy 全部轉為 data URL，光柵化過程不應再發出任何網路請求
  const blob = await domToBlob(node, {
    scale: settings.scale,
    type: 'image/png',
  })
  if (!blob) throw new Error('光柵化失敗')
  return blob
}

/** 兩個欄位都來自頁面內容，都必須清理 —— id 讀自 <meta itemprop="identifier">，非受信任來源 */
const safePart = (s: string) => s.replace(/[^\w-]/g, '_')

export function buildFilename(tweet: TweetData): string {
  return `x-${safePart(tweet.author.handle)}-${safePart(tweet.id)}.png`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 不可同步撤銷：部分瀏覽器尚未讀完 blob，下載會被截斷或取消
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/render/export.test.ts`
Expected: PASS（全部 4 項）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PNG 匯出與檔名生成"
```

---

## Task 10: 內容腳本 — 永久連結與按鈕注入

**Files:**
- Create: `src/content/permalink.ts`
- Create: `src/content/detector.ts`
- Test: `test/content/permalink.test.ts`

**Interfaces:**
- Consumes: 無（純 DOM）
- Produces:
  - `findPermalink(el: Element): string | null`
  - `findTweetRoots(root: ParentNode): HTMLElement[]`
  - `startDetector(onClick: (permalink: string) => void): () => void`（回傳停止函式）

**注意：** 這是系統唯一的 live DOM 依賴。X 頁面的 CSS 選擇器只能出現在本檔案。

- [ ] **Step 1: 寫失敗測試**

`test/content/permalink.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { findPermalink, findTweetRoots } from '../../src/content/permalink'

beforeEach(() => { document.body.innerHTML = '' })

function make(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe('findPermalink', () => {
  it('從相對路徑連結取得絕對網址', () => {
    const el = make('<article><a href="/tibo/status/123">t</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/tibo/status/123')
  })

  it('已是絕對網址則保留', () => {
    const el = make('<article><a href="https://x.com/a/status/9">t</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/a/status/9')
  })

  it('忽略 /photo/ 等尾綴，取正規化網址', () => {
    const el = make('<article><a href="/a/status/55/photo/1">t</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/a/status/55')
  })

  it('忽略 /quotes、/likes 等分析頁連結', () => {
    const el = make('<article><a href="/a/status/77/quotes">q</a></article>')
    expect(findPermalink(el)).toBe('https://x.com/a/status/77')
  })

  it('無 status 連結回傳 null', () => {
    const el = make('<article><a href="/tibo">t</a></article>')
    expect(findPermalink(el)).toBeNull()
  })

  it('取第一個 status 連結，不受引用推文干擾', () => {
    const el = make(
      '<article><a href="/outer/status/1">a</a><article><a href="/inner/status/2">b</a></article></article>',
    )
    expect(findPermalink(el)).toBe('https://x.com/outer/status/1')
  })
})

describe('findTweetRoots', () => {
  it('找出所有 article 節點', () => {
    make('<div><article><a href="/a/status/1">x</a></article><article><a href="/b/status/2">y</a></article></div>')
    expect(findTweetRoots(document)).toHaveLength(2)
  })

  it('排除沒有 status 連結的 article', () => {
    make('<div><article><a href="/a/status/1">x</a></article><article><p>no link</p></article></div>')
    expect(findTweetRoots(document)).toHaveLength(1)
  })

  it('巢狀 article 不重複計算，只取最外層', () => {
    make('<div><article><a href="/a/status/1">x</a><article><a href="/b/status/2">y</a></article></article></div>')
    expect(findTweetRoots(document)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/content/permalink.test.ts`
Expected: FAIL — `Cannot find module '../../src/content/permalink'`

- [ ] **Step 3: 實作 permalink.ts**

```ts
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/content/permalink.test.ts`
Expected: PASS（全部 9 項）

- [ ] **Step 5: 實作 detector.ts**

```ts
import { findPermalink, findTweetRoots } from './permalink'

const MARK = 'data-xframe-injected'
const BUTTON_CLASS = 'xframe-trigger'

function makeButton(permalink: string, onClick: (p: string) => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = BUTTON_CLASS
  btn.type = 'button'
  btn.title = '生成分享圖'
  btn.textContent = '◪'
  btn.setAttribute('aria-label', '生成分享圖')
  Object.assign(btn.style, {
    position: 'absolute', top: '8px', right: '8px', zIndex: '9999',
    width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer',
    border: '1px solid rgba(127,127,127,.35)', background: 'rgba(20,20,20,.55)',
    color: '#fff', fontSize: '13px', lineHeight: '1', backdropFilter: 'blur(8px)',
  } satisfies Partial<CSSStyleDeclaration>)
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick(permalink)
  })
  return btn
}

function inject(root: ParentNode, onClick: (p: string) => void): void {
  for (const el of findTweetRoots(root)) {
    if (el.hasAttribute(MARK)) continue
    const permalink = findPermalink(el)
    if (!permalink) continue // 找不到連結就不注入，避免按了沒反應的按鈕
    el.setAttribute(MARK, '')
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
    el.appendChild(makeButton(permalink, onClick))
  }
}

/** 開始監看 timeline 並注入按鈕。回傳停止函式。 */
export function startDetector(onClick: (permalink: string) => void): () => void {
  inject(document, onClick)

  let queued = false
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      inject(document, onClick)
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
```

- [ ] **Step 6: 跑全部測試與型別檢查**

Run: `npm test && npx tsc --noEmit`
Expected: PASS，無型別錯誤

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 內容腳本永久連結偵測與按鈕注入"
```

---

## Task 11: 編輯器面板與端到端串接

**Files:**
- Create: `src/editor/store.ts`
- Create: `src/editor/Panel.tsx`
- Modify: `src/content/index.ts`
- Test: `test/editor/store.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`、`Card`、`exportPng`、`buildFilename`、`downloadBlob`、`startDetector`、`parseTweet`、`extractTweetId`、background 的 `Request`/`Response`
- Produces: `loadSettings()`、`saveSettings()`、掛載於 Shadow DOM 的完整編輯器

- [ ] **Step 1: 寫失敗測試**

`test/editor/store.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadSettings, saveSettings, mergeSettings } from '../../src/editor/store'
import { DEFAULT_SETTINGS } from '../../src/render/Card'

const store: Record<string, unknown> = {}
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string) => ({ [k]: store[k] }),
        set: async (obj: Record<string, unknown>) => { Object.assign(store, obj) },
      },
    },
  })
})

describe('mergeSettings', () => {
  it('空值回傳預設', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })
  it('部分覆寫保留其餘預設', () => {
    const merged = mergeSettings({ fontSize: 30 })
    expect(merged.fontSize).toBe(30)
    expect(merged.padding).toBe(DEFAULT_SETTINGS.padding)
  })
  it('巢狀 show 物件正確合併', () => {
    const merged = mergeSettings({ show: { stats: false } as never })
    expect(merged.show.stats).toBe(false)
    expect(merged.show.avatar).toBe(true)
  })
  it('捨棄未知欄位', () => {
    const merged = mergeSettings({ bogus: 1 } as never)
    expect('bogus' in merged).toBe(false)
  })
})

describe('持久化', () => {
  it('未存過時回傳預設', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
  it('存檔後可讀回', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, fontSize: 26 })
    expect((await loadSettings()).fontSize).toBe(26)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run test/editor/store.test.ts`
Expected: FAIL — `Cannot find module '../../src/editor/store'`

- [ ] **Step 3: 實作 store.ts**

```ts
import type { CardSettings } from '../types'
import { DEFAULT_SETTINGS } from '../render/Card'

const KEY = 'xframe.settings'

/** 只採用已知欄位，避免舊版殘留資料污染型別。 */
export function mergeSettings(raw: Partial<CardSettings> | undefined): CardSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const out: CardSettings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof CardSettings)[]) {
    const v = raw[key]
    if (v === undefined) continue
    if (key === 'show' || key === 'background') {
      Object.assign(out[key], v)
    } else {
      out[key] = v as never
    }
  }
  return out
}

export async function loadSettings(): Promise<CardSettings> {
  const got = await chrome.storage.local.get(KEY)
  return mergeSettings(got?.[KEY] as Partial<CardSettings> | undefined)
}

export async function saveSettings(settings: CardSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings })
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run test/editor/store.test.ts`
Expected: PASS（全部 6 項）

- [ ] **Step 5: 實作 Panel.tsx**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, TweetData } from '../types'
import { Card, DEFAULT_SETTINGS } from '../render/Card'
import { PRESETS, generate, randomPreset } from '../render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../render/export'
import { loadSettings, saveSettings } from './store'
import { parseTweet, extractTweetId } from '../parse/microdata'

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: TweetData }
  | { phase: 'error'; message: string }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  parse: '無法讀取這則推文',
}

async function loadTweet(permalink: string): Promise<TweetData> {
  const id = extractTweetId(permalink)
  if (!id) throw new Error('parse')
  const res = await chrome.runtime.sendMessage({ type: 'fetch-tweet-html', url: permalink })
  if (!res?.ok) throw new Error(res?.kind ?? 'network')
  const tweet = parseTweet(res.html, id)
  if (!tweet) throw new Error('parse')
  const hydrated = await chrome.runtime.sendMessage({ type: 'hydrate-assets', tweet })
  return hydrated?.ok ? hydrated.tweet : tweet
}

export function Panel({ permalink, onClose }: { permalink: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ phase: 'loading' })
  const [settings, setSettings] = useState<CardSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadSettings().then(setSettings) }, [])

  useEffect(() => {
    let cancelled = false
    setStatus({ phase: 'loading' })
    loadTweet(permalink)
      .then((tweet) => { if (!cancelled) setStatus({ phase: 'ready', tweet }) })
      .catch((e) => {
        if (!cancelled) setStatus({ phase: 'error', message: ERROR_TEXT[e.message] ?? ERROR_TEXT.network })
      })
    return () => { cancelled = true }
  }, [permalink])

  const patch = (p: Partial<CardSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    void saveSettings(next)
  }

  const doExport = async () => {
    const node = cardRef.current?.firstElementChild as HTMLElement | null
    if (!node || status.phase !== 'ready') return
    setBusy(true)
    try {
      downloadBlob(await exportPng(node, settings), buildFilename(status.tweet))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="xf-panel">
      <header class="xf-head">
        <strong>XFrame</strong>
        <button type="button" onClick={onClose} aria-label="關閉">✕</button>
      </header>

      <div class="xf-preview" ref={cardRef}>
        {status.phase === 'loading' && <div class="xf-msg">讀取推文中…</div>}
        {status.phase === 'error' && <div class="xf-msg">{status.message}</div>}
        {status.phase === 'ready' && <Card tweet={status.tweet} settings={settings} />}
      </div>

      <button class="xf-export" type="button" disabled={status.phase !== 'ready' || busy} onClick={doExport}>
        {busy ? '產生中…' : '下載 PNG'}
      </button>

      <section class="xf-group">
        <h3>畫布與排版</h3>
        <label>留白 <b>{settings.padding}</b>
          <input type="range" min={24} max={160} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} />
        </label>
        <label>文字尺寸 <b>{settings.fontSize}</b>
          <input type="range" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} />
        </label>
        <label>底板透明度 <b>{Math.round(settings.panelOpacity * 100)}%</b>
          <input type="range" min={0} max={100} value={settings.panelOpacity * 100}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} />
        </label>
        <label>底板顏色
          <input type="color" value={settings.panelColor}
            onInput={(e) => patch({ panelColor: e.currentTarget.value })} />
        </label>
        <label>文字顏色
          <input type="color" value={settings.textColor}
            onInput={(e) => patch({ textColor: e.currentTarget.value })} />
        </label>
        <label>比例
          <select value={settings.aspect}
            onChange={(e) => patch({ aspect: e.currentTarget.value as CardSettings['aspect'] })}>
            <option value="auto">自動高度</option>
            <option value="1:1">1:1 方形</option>
            <option value="4:5">4:5 直式</option>
            <option value="16:9">16:9 橫式</option>
          </select>
        </label>
        <label>倍率
          <select value={String(settings.scale)}
            onChange={(e) => patch({ scale: +e.currentTarget.value as 2 | 3 })}>
            <option value="2">2x</option>
            <option value="3">3x</option>
          </select>
        </label>
      </section>

      <section class="xf-group">
        <h3>背景紙張</h3>
        <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成一張</button>
        <div class="xf-swatches">
          {PRESETS.map((p) => (
            <button key={`${p.kind}-${p.palette}`} type="button" class="xf-sw"
              aria-label={`${p.kind} ${p.palette}`}
              aria-pressed={settings.background.kind === p.kind && settings.background.palette === p.palette}
              style={{ background: generate(p.kind, p.palette, p.seed) }}
              onClick={() => patch({ background: { ...p } })} />
          ))}
        </div>
      </section>

      <section class="xf-group">
        <h3>顯示項目</h3>
        {(['avatar', 'stats', 'timestamp', 'media'] as const).map((k) => (
          <label key={k}>
            <input type="checkbox" checked={settings.show[k]}
              onChange={(e) => patch({ show: { ...settings.show, [k]: e.currentTarget.checked } })} />
            {{ avatar: '頭像', stats: '互動統計', timestamp: '時間', media: '推文圖片' }[k]}
          </label>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 6: 串接內容腳本進入點**

> 本步驟 import 的 `panel.css` 於 Step 7 建立。兩步都完成後建置才會通過，中間不必嘗試 build。

`src/content/index.ts`：

```ts
import { render } from 'preact'
import { startDetector } from './detector'
import { Panel } from '../editor/Panel'
import panelCss from '../editor/panel.css?inline'

const HOST_ID = 'xframe-host'

function ensureHost(): ShadowRoot {
  let host = document.getElementById(HOST_ID)
  if (!host) {
    host = document.createElement('div')
    host.id = HOST_ID
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = panelCss
    shadow.appendChild(style)
    shadow.appendChild(document.createElement('div'))
  }
  return host.shadowRoot!
}

function open(permalink: string): void {
  const shadow = ensureHost()
  const mount = shadow.lastElementChild as HTMLElement
  render(<Panel permalink={permalink} onClose={() => render(null, mount)} />, mount)
}

startDetector(open)
```

> 將 `src/content/index.ts` 改名為 `src/content/index.tsx`，並同步更新 `manifest.config.ts` 的 `content_scripts[0].js` 為 `src/content/index.tsx`。

- [ ] **Step 7: 建立面板樣式**

`src/editor/panel.css`：

```css
:host { all: initial; }
.xf-panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: 420px; overflow-y: auto;
  z-index: 2147483647; background: #faf7f2; color: #16130f; padding: 16px;
  font: 14px/1.5 -apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
  box-shadow: -8px 0 32px rgba(0,0,0,.18);
}
.xf-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.xf-head button { border: none; background: none; cursor: pointer; font-size: 16px; }
.xf-preview { border: 1px solid #e2ddd4; border-radius: 12px; overflow: hidden; margin-bottom: 12px; }
.xf-msg { padding: 48px 16px; text-align: center; color: #7a736a; }
.xf-export {
  width: 100%; padding: 12px; margin-bottom: 16px; border: none; border-radius: 10px;
  background: #16130f; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer;
}
.xf-export:disabled { opacity: .45; cursor: default; }
.xf-group { border: 1px solid #e2ddd4; border-radius: 12px; padding: 12px; margin-bottom: 12px; background: #fff; }
.xf-group h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: #7a736a; }
.xf-group label { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.xf-group label b { margin-left: auto; font-variant-numeric: tabular-nums; }
.xf-group input[type="range"] { flex: 1 1 120px; }
.xf-swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; margin-top: 10px; }
.xf-sw { aspect-ratio: 3/4; border-radius: 6px; border: 1px solid #d9d3c9; cursor: pointer; padding: 0; }
.xf-sw[aria-pressed="true"] { outline: 2px solid #16130f; outline-offset: 1px; }
```

- [ ] **Step 8: 跑全部測試、型別檢查與建置**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 全數 PASS，產出 `dist/`

- [ ] **Step 9: 手動驗收**

1. Chrome 開 `chrome://extensions`，開啟開發人員模式，「載入未封裝項目」選 `dist/`
2. 開啟 `https://x.com`，確認每則推文右上出現 `◪` 按鈕
3. 點按鈕 → 面板出現「讀取推文中…」→ 約 1.5 秒後顯示卡片
4. 逐項確認：
   - [ ] 作者、內文、互動數正確
   - [ ] 頭像清晰（400x400 而非模糊小圖）
   - [ ] 拉動留白 / 文字尺寸 / 透明度，預覽即時更新
   - [ ] 點不同背景縮圖，預覽即時更新
   - [ ] 「隨機生成一張」每次都不同
   - [ ] 中文推文換行正確、emoji 未變豆腐字
   - [ ] 含圖片的推文，圖片有出現
   - [ ] 含引用推文的，巢狀區塊有出現且圖片歸屬正確
   - [ ] 下載 PNG，開啟後與預覽一致、毛玻璃有渲染
   - [ ] 重新整理頁面後設定被記住
   - [ ] 開啟一則已刪除的推文，顯示「這則推文已不存在」

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: 編輯器面板與端到端串接"
```

---

## Task 12: 開發預覽頁

**Files:**
- Create: `dev/index.html`
- Create: `dev/main.tsx`
- Create: `dev/fixture.ts`
- Modify: `vite.config.ts`（加入 dev 模式的 rollup 進入點）
- Modify: `package.json`（加入 `dev:preview` script）

**Interfaces:**
- Consumes: `Card`、`DEFAULT_SETTINGS`、`parseTweet`、`Panel` 的控制項
- Produces: `npm run dev:preview` 啟動一個純網頁，可在無擴充功能環境下驗證渲染與匯出

**存在理由：** 擴充功能必須載入真 Chrome 才能測，開發過程中無法自動驗證渲染層。本頁把 `Card` 與控制項當普通網頁跑，讓渲染、中文換行、引用推文、PNG 匯出都能在開發時驗證，也用於產生商店截圖。不打包進擴充功能。

- [ ] **Step 1: 建立 fixture 載入模組**

`dev/fixture.ts`：

```ts
import type { TweetData } from '../src/types'
import { parseTweet } from '../src/parse/microdata'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../src/background/asset-proxy'

/** 開發頁直接以瀏覽器 fetch 取得資產並轉 data URL，不經 service worker。 */
async function toDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => resolve(undefined as never)
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

async function hydrate<T extends Omit<TweetData, 'quoted'>>(t: T): Promise<T> {
  const avatarUrl = upgradeAvatarUrl(t.author.avatarUrl)
  return {
    ...t,
    author: { ...t.author, avatarUrl, avatarDataUrl: await toDataUrl(avatarUrl) },
    media: await Promise.all(
      t.media.map(async (m) => {
        const url = upgradeMediaUrl(m.url)
        return { ...m, url, dataUrl: await toDataUrl(url) }
      }),
    ),
  }
}

export const FIXTURES = {
  plain: '2083053369351090254',
  quoted: '2082883636177916306',
  media: '2083061426923475451',
  'quoted-with-media': '2082981910209540352',
} as const

export async function loadFixture(name: keyof typeof FIXTURES): Promise<TweetData> {
  const html = await (await fetch(`/test/fixtures/${name}.html`)).text()
  const tweet = parseTweet(html, FIXTURES[name])
  if (!tweet) throw new Error(`fixture ${name} 解析失敗`)
  const outer = await hydrate(tweet)
  return tweet.quoted ? { ...outer, quoted: await hydrate(tweet.quoted) } : outer
}
```

- [ ] **Step 2: 建立預覽頁 HTML**

`dev/index.html`：

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>XFrame 開發預覽</title>
    <style>
      body { margin: 0; font: 14px/1.5 -apple-system, "PingFang TC", system-ui, sans-serif; background: #f3efe8; }
      #app { display: grid; grid-template-columns: 1fr 420px; min-height: 100vh; }
      .stage { padding: 32px; overflow: auto; }
      .stage > * { max-width: 720px; margin: 0 auto; box-shadow: 0 12px 40px rgba(0,0,0,.15); }
      .picker { display: flex; gap: 8px; max-width: 720px; margin: 0 auto 16px; }
      .picker button { padding: 6px 12px; border-radius: 8px; border: 1px solid #d9d3c9; background: #fff; cursor: pointer; }
      .picker button[aria-pressed="true"] { background: #16130f; color: #fff; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 建立預覽頁進入點**

`dev/main.tsx`：

```tsx
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { TweetData, CardSettings } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../src/render/export'
import { loadFixture, FIXTURES } from './fixture'

type Name = keyof typeof FIXTURES

function App() {
  const [name, setName] = useState<Name>('plain')
  const [tweet, setTweet] = useState<TweetData | null>(null)
  const [settings, setSettings] = useState<CardSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    setTweet(null)
    loadFixture(name).then(setTweet)
  }, [name])

  const patch = (p: Partial<CardSettings>) => setSettings({ ...settings, ...p })

  const doExport = async () => {
    const node = document.querySelector('[data-part="canvas"]') as HTMLElement | null
    if (!node || !tweet) return
    downloadBlob(await exportPng(node, settings), buildFilename(tweet))
  }

  return (
    <>
      <div class="stage">
        <div class="picker">
          {(Object.keys(FIXTURES) as Name[]).map((n) => (
            <button key={n} type="button" aria-pressed={n === name} onClick={() => setName(n)}>{n}</button>
          ))}
        </div>
        {tweet ? <Card tweet={tweet} settings={settings} /> : <p style="text-align:center">載入中…</p>}
      </div>
      <div class="xf-panel" style="padding:16px;background:#faf7f2;overflow:auto">
        <button type="button" onClick={doExport} style="width:100%;padding:12px;margin-bottom:16px">下載 PNG</button>
        <label>留白 {settings.padding}
          <input type="range" min={24} max={160} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} />
        </label>
        <label>文字尺寸 {settings.fontSize}
          <input type="range" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} />
        </label>
        <label>底板透明度 {Math.round(settings.panelOpacity * 100)}%
          <input type="range" min={0} max={100} value={settings.panelOpacity * 100}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} />
        </label>
        <label>比例
          <select value={settings.aspect}
            onChange={(e) => patch({ aspect: e.currentTarget.value as CardSettings['aspect'] })}>
            <option value="auto">自動高度</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
            <option value="16:9">16:9</option>
          </select>
        </label>
        <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成</button>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-top:10px">
          {PRESETS.map((p) => (
            <button key={`${p.kind}-${p.palette}`} type="button"
              aria-label={`${p.kind} ${p.palette}`}
              style={{ aspectRatio: '3/4', borderRadius: 6, border: '1px solid #d9d3c9', cursor: 'pointer', padding: 0, background: generate(p.kind, p.palette, p.seed) }}
              onClick={() => patch({ background: { ...p } })} />
          ))}
        </div>
      </div>
    </>
  )
}

render(<App />, document.getElementById('app')!)
```

- [ ] **Step 4: 加入 npm script**

在 `package.json` 的 `scripts` 加入：

```json
"dev:preview": "vite --config vite.preview.config.ts"
```

- [ ] **Step 5: 建立預覽頁專用 vite 設定**

`vite.preview.config.ts`（獨立設定，避免 CRXJS 外掛干擾一般網頁模式）：

```ts
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  root: 'dev',
  publicDir: false,
  plugins: [preact()],
  server: {
    port: 5199,
    fs: { allow: ['..'] },
  },
})
```

安裝所需依賴：

```bash
npm i -D @preact/preset-vite
```

> `dev/fixture.ts` 以 `/test/fixtures/*.html` 路徑取得 fixture。因為 `root: 'dev'`，需在 `vite.preview.config.ts` 加入靜態對應：於 `server` 同層加上
> ```ts
> resolve: { alias: { '/test': new URL('./test', import.meta.url).pathname } },
> ```
> 若仍取不到，改為在 `dev/fixture.ts` 使用 `import.meta.glob('../test/fixtures/*.html', { query: '?raw', import: 'default', eager: true })` 直接內嵌。以能跑通為準。

- [ ] **Step 6: 驗證預覽頁**

Run: `npm run dev:preview`
Expected: 服務啟動於 `http://localhost:5199`

在瀏覽器開啟並確認：

- [ ] 四個 fixture 按鈕都能切換且卡片正確渲染
- [ ] 頭像清晰、非破圖
- [ ] `quoted` fixture 顯示巢狀引用區塊
- [ ] `media` fixture 顯示推文圖片
- [ ] `quoted-with-media` 的圖片歸屬正確（不重複出現在外層）
- [ ] 拉動滑桿預覽即時更新
- [ ] 點背景縮圖預覽即時更新
- [ ] 下載 PNG 成功，且與預覽一致

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 開發預覽頁，可在無擴充功能環境驗證渲染與匯出"
```

---

## Task 13: 上架素材

**Files:**
- Create: `PRIVACY.md`
- Create: `store/description.md`
- Create: `store/screenshots/`（1280×800 PNG）
- Create: `README.md`

**Interfaces:**
- Consumes: Task 11 的可運作擴充功能
- Produces: Chrome Web Store 提交所需的完整素材

- [ ] **Step 1: 撰寫隱私權政策**

`PRIVACY.md`：

```markdown
# 隱私權政策

最後更新：2026-07-31

XFrame 不蒐集、不儲存、不傳輸任何使用者資料。

## 資料處理

所有處理皆在你的瀏覽器本機完成。擴充功能不含任何分析、遙測或錯誤回報服務。

## 網路請求

XFrame 僅對以下網域發出請求：

- `x.com` / `twitter.com` — 讀取你所選推文的公開內容
- `pbs.twimg.com` / `abs.twimg.com` — 讀取該推文的頭像與圖片

對 x.com 的請求皆以未驗證方式發出（不帶 cookie），因此不涉及你的帳號。

## 本機儲存

擴充功能使用 `chrome.storage.local` 僅儲存你的外觀偏好設定（顏色、尺寸、背景選擇）。此資料不離開你的裝置。

## 權限說明

- `storage` — 記住你的外觀偏好
- `x.com` / `twitter.com` 存取權 — 在推文旁顯示按鈕、讀取所選推文內容
- `pbs.twimg.com` / `abs.twimg.com` 存取權 — 讀取頭像與圖片以嵌入產出的圖片

## 聯絡方式

問題請至專案 issue 頁回報。
```

- [ ] **Step 2: 撰寫商店說明**

`store/description.md`：

```markdown
把 X 推文變成漂亮的分享圖。

在任一則推文旁點一下，即可將它渲染成帶精緻背景的圖片，適合分享到 Instagram、簡報或部落格。

■ 40 種內建背景
五種風格 × 八組配色，全部由程式即時生成 —— 不打包任何圖片檔，擴充功能維持輕巧。另有「隨機生成」，變體無上限。

■ 完整掌控外觀
留白、文字尺寸、底板顏色與透明度、文字顏色皆可調整。可選擇是否顯示頭像、互動數、時間、圖片。

■ 支援引用推文
被引用的推文會一併渲染為巢狀卡片。

■ 多種輸出比例
自動高度、1:1、4:5、16:9，並可選 2x 或 3x 輸出。

■ 不蒐集任何資料
沒有帳號、沒有分析、沒有追蹤。所有處理都在你的瀏覽器內完成。
```

- [ ] **Step 3: 產生商店截圖**

用 Task 12 的開發預覽頁（`npm run dev:preview`）拍攝，視窗設為 1280×800。存入 `store/screenshots/`：

1. `01-editor.png` — 編輯器開啟，顯示卡片預覽與側邊控制項
2. `02-backgrounds.png` — 背景選擇區展開，40 張縮圖可見
3. `03-quoted.png` — 含引用推文的卡片
4. `04-result.png` — 匯出的成品圖

- [ ] **Step 4: 撰寫 README**

`README.md`：

```markdown
# XFrame

把 X 推文變成漂亮的分享圖的 Chrome 擴充功能。

## 開發

```bash
npm install
npm run dev      # 開發模式
npm test         # 跑測試
npm run build    # 產出 dist/
```

載入 `dist/` 到 `chrome://extensions`（開發人員模式 → 載入未封裝項目）。

## 架構

擷取推文不靠抓取 React DOM，而是以未驗證請求取得 X 的伺服器渲染頁面，
解析其中的 schema.org microdata。詳見 `docs/superpowers/specs/`。

## 測試

```bash
./scripts/capture-fixtures.sh   # 更新測試 fixture（推文被刪除時需要）
npm test
```
```

- [ ] **Step 5: 最終驗證**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 全數 PASS

確認提交前檢查表：

- [ ] `dist/manifest.json` 的 `permissions` 僅有 `storage`
- [ ] `dist/manifest.json` 無 `<all_urls>`
- [ ] `dist/` 內無任何 `.jpg` / `.png` 背景圖片
- [ ] 四張商店截圖皆為 1280×800

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: 隱私權政策、商店說明與 README"
```

---

## 附錄：實測資料速查

以下數值於 2026-07-31 對 x.com 實測確認，供實作時對照。

| 項目 | 值 |
|---|---|
| 推文節點 | `article[data-tweet-id][itemtype="https://schema.org/SocialMediaPosting"]` |
| 內文 | `:scope > meta[itemprop="text"]` 的 `content` |
| 作者名 | `:scope > [itemprop="author"] > meta[itemprop="name"]` |
| 作者帳號 | `:scope > [itemprop="author"] > meta[itemprop="alternateName"]`（不含 `@`） |
| 頭像 | `:scope > [itemprop="author"] > meta[itemprop="image"]` |
| 時間 | `:scope > meta[itemprop="dateCreated"]`，ISO 8601 |
| 互動數 | `:scope > [itemprop="interactionStatistic"]`，五種 `interactionType` |
| 引用推文 | `article[itemprop="citation"]`，**非直接子節點** |
| 推文圖片 | `img[src*="pbs.twimg.com/media/"]`，須以 `closest('article') === article` 歸屬 |
| 頭像放大 | `_normal.jpg` → `_400x400.jpg`（回 200 image/jpeg） |
| 圖片放大 | `name=medium` → `name=large`（回 200 image/webp） |
| 推文不存在 | HTTP 404，無 article 節點 |
| 單次請求耗時 | 約 1.5 秒，HTML 約 177 KB |
