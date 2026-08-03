# 階段 1：抽象化與內文完整性 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把只認得 X 的資料模型與渲染路徑抽象成平台無關的形狀，並移除排版造成的內文截斷 —— 不新增任何平台。

**Architecture:** `TweetData` 改名並泛化為 `Post`，固定五欄的 `Stats` 改為由 adapter 決定內容與順序的 `Metric[]`，擷取邏輯收攏進 `Adapter` 介面（本階段只有 `x` 一份）。`Card.tsx` 拆成平台無關的 `CardShell`（畫布／背景／量測）與 `TextLayout`（面板內容）。所有比例改為最小高度，畫布跟著內容長高，排版不再吞字。

**Tech Stack:** TypeScript、Preact、Vite、Vitest（happy-dom）、`modern-screenshot`、`@crxjs/vite-plugin`

## Global Constraints

- 設計文件：`docs/superpowers/specs/2026-08-03-four-platform-design.md`。有衝突以該文件為準。
- **本階段不新增平台。** 只有 `x` 一份 adapter。不要建立 `threads` / `weibo` / `xhs` 的檔案或型別成員。
- **不得以微博／小紅書為理由做抽象。** 每一項通用化都必須能只用 X 與 Threads 說明白。特別是**不要加 `title?` 欄位**，那是階段 3 的東西。
- **除了「內文完整性」明列的改動之外，行為零改變。** 既有 286 個測試是護欄，不得為了讓重構通過而放寬斷言。若某個測試因為重構而失效，要問的是「這個行為還該不該存在」，而不是「怎麼把它改綠」。
- 註解寫「為什麼」，不寫「做什麼」。這個 codebase 的既有註解記錄了大量實測數據與踩過的坑（`Card.tsx` 的 `aspect-ratio` 打架紀錄、`card.css.ts` 的 `:scope` 支援問題），刪除程式碼時**連同它的實測筆記一起刪，不要留下描述已不存在行為的孤兒註解**。
- 每個 task 結束時 `npx tsc --noEmit` 必須乾淨。
- 工作分支 `feat/mvp`。每個 task 一個 commit。

**執行環境**：`npm` 不在預設 PATH 上。每個 shell 指令前先跑
`export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"`，否則會得到
`no such file or directory: npm`。

---

## 檔案結構

| 檔案 | 責任 | 本階段變動 |
| --- | --- | --- |
| `src/types.ts` | 全系統型別 | `TweetData`→`Post`、`Stats`→`Metric[]`、加 `platform` / `textComplete` / `handleDisplay` |
| `src/render/card.css.ts` | 尺寸決策的純函式 | 刪 `isOverflowing` / `panelFitScale` / `MIN_HEIGHT_ASPECTS`；`canvasSizeStyle` 簡化 |
| `src/render/Card.tsx` | 卡片渲染 | 刪截斷路徑；Task 8 拆成 `CardShell` + `TextLayout` |
| `src/render/CardShell.tsx` | **新增**：畫布、背景、比例量測 | Task 8 建立 |
| `src/render/TextLayout.tsx` | **新增**：面板內容（作者列／內文／圖／引用／統計） | Task 8 建立 |
| `src/render/metrics.ts` | **新增**：`MetricKind` → 圖示與標籤 | Task 3 建立 |
| `src/render/export.ts` | 光柵化與檔名 | 加 `exportWidth()`；`buildFilename` 用 `platform` |
| `src/parse/microdata.ts` | X 的 HTML → `Post` | `parseStats`→`parseMetrics`；產出 `textComplete` / `handleDisplay` |
| `src/platforms/types.ts` | **新增**：`Adapter` 介面 | Task 7 建立 |
| `src/platforms/x.ts` | **新增**：X adapter | Task 7 建立 |
| `src/platforms/index.ts` | **新增**：adapter 註冊表 | Task 7 建立 |

---

## 測試慣例（先讀，本計畫的測試碼都照這個寫）

這個 codebase 的測試**解析真實 fixture**，不手工建構物件。照著做，不要引進新風格。

`test/render/Card.test.tsx` 既有的 helper（檔案第 9、11 行）：

```tsx
const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8')

function mount(tweet = parseTweet(fx('plain'), '2083053369351090254')!, settings = DEFAULT_SETTINGS) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card tweet={tweet} settings={settings} />, host)
  return host
}
```

- 用 Preact 的 `render`，不是 testing-library。`mount()` 回傳 host 元素，
  斷言走 `el.textContent` / `el.querySelector(...)`。
- `test/parse/microdata.test.ts` 有同名的 `fx`，推文 ID 直接寫字面值
  `'2083053369351090254'`（plain fixture）。沒有 `loadFixture` 或 `PLAIN_ID` 這種東西。
- `test/render/export.test.ts` 在模組層 `const tweet = parseTweet(...)`。
- 四種 fixture：`plain` / `media` / `quoted` / `quoted-with-media`。

**手工建構 `stats` 的地方只有四處**（Task 3 要改的就是這四處，不是散落各檔）：

| 位置 | 內容 |
| --- | --- |
| `src/content/dom-fallback.ts:78` | 全 null 的 `Stats` |
| `src/editor/manual.ts:51` | 全 null 的 `Stats` |
| `test/web/fetch.test.ts:68` | 全 null 的 `Stats` |
| `test/render/Card.test.tsx:316` | `{ ...t, stats: { ...t.stats, views } }` |

---

## Task 1: 所有比例改最小高度，移除版面截斷

**Files:**
- Modify: `src/render/card.css.ts`
- Modify: `src/render/Card.tsx`
- Test: `test/render/card.css.test.ts`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Produces: `canvasSizeStyle(minHeightPx: number | undefined): { minHeight: string | number }` —— 單一參數，取代原本的 `(isMinHeight, fixedHeight)` 兩參數版本。
- 移除且**不得**被後續 task 引用：`MIN_HEIGHT_ASPECTS`、`isOverflowing`、`panelFitScale`、`MIN_PANEL_SCALE`。

- [ ] **Step 1: 先寫會失敗的完整性測試**

加到 `test/render/Card.test.tsx` 尾端。這個測試是本階段最重要的驗收條件。

```tsx
describe('內文完整性', () => {
  // 640 是舊的 1:1 字數上限，760 是 4:5、900 是 auto/9:16。
  // 取 1200 字確保四種比例在舊行為下全部會截斷。
  const LONG = '長'.repeat(1200)

  const longTweet = () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    return { ...t, rawText: LONG, text: [{ type: 'text' as const, value: LONG }] }
  }

  it.each(['auto', '1:1', '4:5', '9:16'] as const)(
    '%s 比例下內文一字不少',
    (aspect) => {
      const el = mount(longTweet(), { ...DEFAULT_SETTINGS, aspect })
      expect(el.querySelector('[data-part="body"]')?.textContent).toBe(LONG)
    },
  )

  it('內文不再被鎖高度或套淡出遮罩', () => {
    const el = mount(longTweet(), { ...DEFAULT_SETTINGS, aspect: '1:1' })
    const body = el.querySelector('[data-part="body"]') as HTMLElement
    expect(body.style.maxHeight).toBe('')
    expect(body.style.maskImage).toBe('')
  })

  it('畫布不再套溢出淡出遮罩', () => {
    const el = mount(longTweet(), { ...DEFAULT_SETTINGS, aspect: '4:5' })
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    expect(canvas.style.maskImage).toBe('')
  })

  it('面板不再被縮放 —— 畫布長高取代縮小', () => {
    const el = mount(longTweet(), { ...DEFAULT_SETTINGS, aspect: '1:1' })
    const panel = el.querySelector('[data-part="panel"]') as HTMLElement
    expect(panel.style.transform).toBe('')
  })
})
```

- [ ] **Step 2: 跑測試確認它失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/Card.test.tsx -t '內文完整性'
```

Expected: FAIL。四個比例的 `body.textContent` 都會短於 `LONG`（被 `maxHeight: '46em'` 與字數上限截掉），且 `maxHeight` 是 `46em` 而非空字串。

- [ ] **Step 3: 簡化 `card.css.ts`**

刪掉 `MIN_HEIGHT_ASPECTS`、`isOverflowing`、`MIN_PANEL_SCALE`、`panelFitScale`
四個匯出及其上方的整段註解（那些註解描述的是即將不存在的固定高度模式）。
`ASPECT_VALUE` 與 `accentFrom` 原樣保留。

`canvasSizeStyle` 換成：

```ts
/**
 * 畫布的高度樣式。
 *
 * 所有比例都是「最小高度」而非「固定高度」：內容比該比例所需更長時，畫布
 * 繼續往下長，不裁切、不縮放。這是刻意用比例的精確性換內文的完整性 ——
 * 一張比例不準但完整的圖，比一張比例準卻少了三成內文的圖有用。
 *
 * 抽成純函式而非留在 JSX 的三元運算式裡，是為了讓這個決策本身可測：
 * 渲染後的樣式在 happy-dom 讀不到（沒有版面引擎），但「給定量測值，應該
 * 產生什麼樣式」是純邏輯，與環境無關。
 *
 * `minHeight: 0` 而非 `undefined` 是為了明確覆寫掉可能存在的繼承值，
 * 而不是讓它落回瀏覽器預設。
 */
export function canvasSizeStyle(
  minHeightPx: number | undefined,
): { minHeight: string | number } {
  return { minHeight: minHeightPx !== undefined ? `${minHeightPx}px` : 0 }
}
```

- [ ] **Step 4: 改寫 `card.css.test.ts`**

刪掉 `isOverflowing`、`panelFitScale`、`比例表一致性` 三個 `describe` 區塊
（`MIN_HEIGHT_ASPECTS` 已不存在，一致性測試失去對象）。import 只留下用得到的。

`canvasSizeStyle` 的 describe 換成：

```ts
import { describe, it, expect } from 'vitest'
import { canvasSizeStyle, ASPECT_VALUE } from '../../src/render/card.css'

describe('canvasSizeStyle', () => {
  it('量測到高度時設為最小高度', () => {
    expect(canvasSizeStyle(405)).toEqual({ minHeight: '405px' })
  })

  it('尚未量測到寬度時不設下限（auto 與初次渲染）', () => {
    expect(canvasSizeStyle(undefined)).toEqual({ minHeight: 0 })
  })

  it('永遠不產生固定 height —— 畫布只有下限，沒有上限', () => {
    expect(canvasSizeStyle(800)).not.toHaveProperty('height')
  })
})

describe('ASPECT_VALUE', () => {
  it('auto 沒有比例值，其餘三種都有', () => {
    expect(ASPECT_VALUE.auto).toBeUndefined()
    for (const a of ['1:1', '4:5', '9:16']) {
      expect(ASPECT_VALUE[a]).toBeTypeOf('number')
    }
  })
})
```

- [ ] **Step 5: 移除 `Card.tsx` 的截斷路徑**

依序刪除：

1. `ASPECT_MAX_CHARS` 常數與 `maxCharsFor()` 函式，含其上方註解。
2. `OVERFLOW_FADE_MASK` 常數與其上方註解。
3. 元件內的 `const truncated = ...` 一行。
4. `overflowing`、`panelScale` 兩個 `useState`，以及 `isMinHeight` 區域變數。
5. `useLayoutEffect` 內 `measure()` 裡計算 `available` / `panelH` / `k` 並呼叫
   `panelFitScale` / `isOverflowing` 的那幾行。
6. `panelRef` 若在移除後不再被讀取，連同 `<div ref={panelRef}>` 的 ref 屬性一併刪除。
7. `import` 中已刪除的名稱。

`ASPECT_SHRINK` **保留**，但把它的註解換成（它的角色變了，舊註解會誤導）：

```ts
/**
 * 中等長度貼文的字級微調。
 *
 * 畫布改成最小高度後，這個係數不再負責「把內容擠進固定高度」—— 塞不下時
 * 畫布會自己長高，完整性由那個機制保證。它現在只做一件事：讓中等長度的
 * 貼文盡量仍然落在使用者選的那個精確比例上，而不是動輒長成 1:1.4。
 *
 * 4:5 是三種比例裡最高的（height = width × 1.25），1:1 較矮，同一份內容
 * 在兩者可用的高度差很多，所以係數分開給。這是手動調校的經驗值。
 */
```

`measure()` 精簡為：

```ts
    const measure = () => {
      // offsetWidth 而非 getBoundingClientRect().width：後者會被祖先的 transform
      // 縮放。行動網頁版把卡片包在 .preview-fit 的 scale() 裡塞進預覽框，量到的
      // 是縮放後的寬度，算出的高度就跟著縮。offsetWidth 是版面寬度，同樣是
      // border-box，不受任何 transform 影響。
      setMinHeight(el.offsetWidth / ratio)
    }
```

`fixedHeight` 狀態改名為 `minHeight`（語意已變，名字要跟上）。

畫布的 style 中：

- `...canvasSizeStyle(isMinHeight, fixedHeight)` → `...canvasSizeStyle(minHeight)`
- `alignItems: overflowing ? 'flex-start' : 'center'` → `alignItems: 'center'`
  （不再有裁切，靠頂沒有意義了）
- 刪除 `maskImage` / `WebkitMaskImage` 兩行

面板的 style 中刪除 `...(panelScale < 1 ? { transform: ... } : {})` 整段。

內文 `data-part="body"` 的 style 中刪除 `maxHeight`、`overflow`、`maskImage`、
`WebkitMaskImage` 四個屬性，只留 `fontSize` / `lineHeight` / `whiteSpace` / `position`。

- [ ] **Step 6: 跑完整測試**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit
```

Expected: 新的完整性測試 PASS。此外必定會遇到兩類問題：

1. **`test/render/Card.test.tsx:6` import 了 `MIN_HEIGHT_ASPECTS`**（該 task 已刪除
   它）。移除該 import，並處理用到它的測試 —— 那些測試斷言的是「9:16 是最小高度
   模式而其他不是」，那個區別已經不存在，整個刪除。
2. **專門斷言截斷行為的測試會失敗。** 那是預期的，行為是刻意改變的。逐一開啟判斷：
   斷言「超過 N 字會被截斷」或「溢出時套 mask」的，整個刪除；只是順帶讀到
   `maxHeight` 的，改成新的預期值。

**不要**放寬與截斷無關的斷言來讓測試變綠。`tsc` 必須完全乾淨。

- [ ] **Step 7: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
feat: 所有比例改最小高度，卡片不再因排版截掉內文

1:1 與 4:5 從「剛好是這個比例」改為「至少是這個比例」，內容長就往下長。
9:16 本來就是這個行為，這是推廣不是新機制。用比例的精確性換內文的完整性 ——
一張比例不準但完整的圖，比一張比例準卻少三成內文的圖有用。

刪除整條截斷路徑：ASPECT_MAX_CHARS / maxCharsFor()（640/760/900 字上限）、
truncated 判斷與內文 maxHeight:'46em'、內文漸層淡出、panelFitScale()、
isOverflowing()、MIN_PANEL_SCALE、畫布 OVERFLOW_FADE_MASK，以及全面最小高度
後恆為真的 MIN_HEIGHT_ASPECTS。canvasSizeStyle 從兩參數簡化為一參數。

順帶修掉 truncated 用 rawText.length（未加權）而 fitFontSize 對中日韓加權，
兩者對「多長」定義不一致的問題；刪掉前者後只剩一套定義。

ASPECT_SHRINK 保留但角色改變：不再負責把內容擠進固定高度（畫布會自己長高），
只讓中等長度的貼文盡量仍落在精確比例上。註解已同步更新。

驗收：新增四種比例下 1200 字推文的內文與 rawText 完全相等的測試。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 匯出寬度低於 1080 時明講

**Files:**
- Modify: `src/render/export.ts`
- Modify: `src/editor/Panel.tsx`
- Test: `test/render/export.test.ts`

**Interfaces:**
- Consumes: `exportScale(layoutWidth, layoutHeight)`、`EXPORT_WIDTH`、`MAX_EXPORT_PIXELS`（皆為既有匯出）
- Produces: `exportWidth(layoutWidth: number, layoutHeight: number): number` —— 這張圖實際會輸出的像素寬度。

**背景**：`MAX_EXPORT_PIXELS`（1600 萬）擋的是 iOS Safari 超過該像素數會給出
全白畫布而不丟例外的行為。Task 1 移除字數上限後畫布高度不再有上限，這條防線
會真的被觸發 —— 1080 寬對應的高度上限是 14,814px。超過後 `exportScale` 會整體
縮小，輸出圖悄悄變成不到 1080 寬。縮小行為是對的（無聲全白更糟），但不能默默發生。

- [ ] **Step 1: 寫失敗的測試**

加到 `test/render/export.test.ts`：

```ts
import { exportWidth, EXPORT_WIDTH, MAX_EXPORT_PIXELS } from '../../src/render/export'

describe('exportWidth', () => {
  it('一般尺寸輸出剛好是 EXPORT_WIDTH', () => {
    expect(exportWidth(540, 675)).toBe(EXPORT_WIDTH)
  })

  it('撞到像素上限時低於 EXPORT_WIDTH', () => {
    // 1080 寬時高度上限是 MAX_EXPORT_PIXELS / 1080 ≈ 14814px。
    // 用版面 540 寬、高度為該上限兩倍的卡片，必定超過。
    const layoutHeight = (MAX_EXPORT_PIXELS / EXPORT_WIDTH) * 2 * (540 / EXPORT_WIDTH)
    expect(exportWidth(540, layoutHeight)).toBeLessThan(EXPORT_WIDTH)
  })

  it('量不到尺寸時回傳 0 而非 NaN', () => {
    expect(exportWidth(0, 500)).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/export.test.ts -t exportWidth
```

Expected: FAIL — `exportWidth is not a function`。

- [ ] **Step 3: 實作**

加到 `src/render/export.ts`，`exportScale` 之後：

```ts
/**
 * 這張卡片實際會輸出的像素寬度。
 *
 * 正常情況等於 EXPORT_WIDTH。只有在畫布高到讓總像素數撞上 MAX_EXPORT_PIXELS
 * 時，exportScale 會整體縮小以避開 iOS Safari 的全白畫布，輸出寬度才會低於
 * 1080 —— 那是正確的取捨（無聲全白更糟），但使用者看不出來，所以要有辦法問。
 */
export function exportWidth(layoutWidth: number, layoutHeight: number): number {
  if (layoutWidth <= 0 || layoutHeight <= 0) return 0
  return Math.round(exportScale(layoutWidth, layoutHeight) * layoutWidth)
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/export.test.ts
```

Expected: PASS。

- [ ] **Step 5: 在 Panel 顯示提示**

開啟 `src/editor/Panel.tsx`，找到匯出按鈕所在的區塊。取得預覽節點的
`offsetWidth` / `offsetHeight`（Panel 已持有該 ref 用於匯出，沿用同一個），
在寬度不足時於按鈕下方顯示一行說明。沿用該檔案既有的提示樣式類別 ——
開啟檔案確認實際名稱，**不要新建樣式**：

```tsx
{previewNode && exportWidth(previewNode.offsetWidth, previewNode.offsetHeight) < EXPORT_WIDTH && (
  <p data-part="export-width-notice">
    這則貼文很長，圖片高度已達上限，輸出寬度會低於 {EXPORT_WIDTH}px。
  </p>
)}
```

- [ ] **Step 6: 全測試 + 型別檢查**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit
```

Expected: 全綠。

- [ ] **Step 7: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
feat: 匯出寬度低於 1080 時在 UI 明講

MAX_EXPORT_PIXELS 擋的是 iOS Safari 超過 1600 萬像素給出全白畫布而不丟例外
的行為。移除字數上限後畫布高度不再有上限，這條防線會真的被觸發 —— 1080 寬
對應的高度上限是 14,814px，超過後輸出圖會悄悄變成不到 1080 寬。

不改變縮小行為（無聲全白更糟），只是不讓它默默發生：新增 exportWidth()
回傳實際輸出寬度，Panel 在低於 EXPORT_WIDTH 時顯示說明。

這條路徑在真實使用中極少觸發，沒有測試等於沒人會發現它壞了，所以補上。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `Stats` 改為有序的 `Metric[]`

**Files:**
- Modify: `src/types.ts`
- Create: `src/render/metrics.ts`
- Modify: `src/parse/microdata.ts`
- Modify: `src/render/Card.tsx`
- Test: `test/render/metrics.test.ts` (create)
- Test: `test/parse/microdata.test.ts`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Produces:
  - `type MetricKind = 'views' | 'replies' | 'reposts' | 'likes'`
  - `type Metric = { kind: MetricKind; value: number | null }`
  - `TweetData.metrics: Metric[]`（取代 `stats: Stats`；`Stats` 型別刪除）
  - `METRIC_META: Record<MetricKind, { icon: string; label: string }>`（`src/render/metrics.ts`）
  - `X_METRIC_ORDER: readonly MetricKind[]`（`src/parse/microdata.ts`）

**為什麼**：`Stats` 是寫死的五欄結構，Card 的統計列也把 X 的圖示與標籤硬編在裡面。
Threads 有 `shares` 而 X 沒有、X 有 `views` 而 Threads 沒有 —— 兩個平台就已經互不
重疊，不需要等到微博小紅書才需要這個抽象。

**關於 `quotes`**：現行 `Stats` 有 `quotes` 欄位，`INTERACTION` 也解析它，
但 `Card.tsx` 的統計列**從來沒有渲染過它**。本 task 直接移除 —— 保留一個解析了
卻永遠不顯示的欄位只會讓人以為它有用。日後要顯示引用數，加回 `MetricKind`、
`METRIC_META` 與 `X_METRIC_ORDER` 三處即可。

- [ ] **Step 1: 寫失敗的測試**

建立 `test/render/metrics.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { METRIC_META } from '../../src/render/metrics'
import type { MetricKind } from '../../src/types'

describe('METRIC_META', () => {
  // 少一個 kind 的圖示，卡片上那格會是空白 —— 不報錯、不當機，就是沒東西。
  // 這個測試在新增 MetricKind 卻忘了補圖示時會紅。
  const KINDS: MetricKind[] = ['views', 'replies', 'reposts', 'likes']

  it.each(KINDS)('%s 有圖示與標籤', (kind) => {
    expect(METRIC_META[kind].icon).toMatch(/^M/)
    expect(METRIC_META[kind].label.length).toBeGreaterThan(0)
  })

  it('沒有多餘的項目 —— 每個 meta 都對應一個實際使用的 kind', () => {
    expect(Object.keys(METRIC_META).sort()).toEqual([...KINDS].sort())
  })
})
```

加到 `test/parse/microdata.test.ts`：

```ts
describe('parseTweet metrics', () => {
  it('依 X 的顯示順序產出，不是解析順序', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.metrics.map((m) => m.kind)).toEqual(['views', 'replies', 'reposts', 'likes'])
  })

  it('缺漏的欄位是 null 而非 0 —— 呼叫端要分得出「沒有這個數字」和「數字是零」', () => {
    const t = parseTweet('<article data-tweet-id="1" itemtype="https://schema.org/SocialMediaPosting">' +
      '<meta itemprop="identifier" content="1">' +
      '<meta itemprop="text" content="hi">' +
      '<div itemprop="author"><meta itemprop="name" content="A"><meta itemprop="alternateName" content="a"></div>' +
      '</article>', '1')!
    expect(t.metrics.every((m) => m.value === null)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/metrics.test.ts test/parse/microdata.test.ts
```

Expected: FAIL — 找不到模組 `src/render/metrics`，且 `t.metrics` 是 undefined。

- [ ] **Step 3: 改型別**

`src/types.ts`：刪除 `Stats` 型別，加入

```ts
/**
 * 互動數的種類。
 *
 * 不是所有平台都有全部種類，也不是每個平台的順序都一樣 —— X 有瀏覽數而
 * Threads 沒有，Threads 有分享數而 X 沒有。因此卡片上放哪幾個、什麼順序，
 * 由各平台的 adapter 決定，這裡只定義有哪些可能。
 */
export type MetricKind = 'views' | 'replies' | 'reposts' | 'likes'

/** `value` 為 null 代表來源沒有提供這個數字，與「數字是零」不同。 */
export type Metric = { kind: MetricKind; value: number | null }
```

`TweetData` 中 `stats: Stats` 換成 `metrics: Metric[]`，並加註解：

```ts
  /** 有序：卡片依此順序渲染統計列。由 adapter 決定內容與順序。 */
  metrics: Metric[]
```

- [ ] **Step 4: 建立 `src/render/metrics.ts`**

把 `Card.tsx` 現有的 `ICON` 常數整個搬過來（連同它上方那段關於「用 inline SVG
而非 emoji」的註解 —— 那是實測筆記，不可遺失），加上標籤：

```ts
import type { MetricKind } from '../types'

/**
 * 互動數的圖示與標籤。
 *
 * 用 inline SVG 而非 emoji：emoji 在不同系統上字形差異極大，而且光柵化時得靠
 * 系統 emoji 字型，很容易變豆腐字或尺寸跑掉。SVG path 是純向量、跟著
 * currentColor 走，匯出結果在任何機器上都一致。
 *
 * 標籤只出現在 aria-label，不顯示在卡片上 —— 卡片上其餘元素都沒有語言相依的
 * 字串，加上中文標籤會在英文貼文上顯得突兀。
 *
 * Record 而非 Partial<Record>：新增 MetricKind 卻忘了補這裡時，那一格在卡片上
 * 會是空白 —— 不報錯、不當機，就是沒東西。用完整的 Record 讓 tsc 在建置期抓到。
 */
export const METRIC_META: Record<MetricKind, { icon: string; label: string }> = {
  views: {
    icon: 'M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
    label: '瀏覽',
  },
  replies: {
    icon: 'M12 3c-5 0-9 3.3-9 7.4 0 2.3 1.3 4.4 3.3 5.7L5.6 20a.4.4 0 0 0 .6.45l4-2.3c.6.1 1.2.15 1.8.15 5 0 9-3.3 9-7.4S17 3 12 3Z',
    label: '回覆',
  },
  reposts: {
    icon: 'M7 7h9.2l-2.1-2.1 1.4-1.4L19.5 8l-4 4-1.4-1.4L16.2 9H5V7h2Zm10 10H7.8l2.1 2.1-1.4 1.4L4.5 16l4-4 1.4 1.4L7.8 15H19v2h-2Z',
    label: '轉推',
  },
  likes: {
    icon: 'M12 20.7 10.5 19.3C5.4 14.7 2 11.7 2 8.1 2 5.4 4.2 3.2 6.9 3.2c1.5 0 3 .7 4 1.9l1.1 1.3 1.1-1.3c1-1.2 2.5-1.9 4-1.9 2.7 0 4.9 2.2 4.9 4.9 0 3.6-3.4 6.6-8.5 11.2L12 20.7Z',
    label: '讚',
  },
}
```

- [ ] **Step 5: 改 `microdata.ts`**

`INTERACTION` 改為映射到 `MetricKind`，並刪除 `quotes` 那一行
（`https://schema.org/InteractAction`）：

```ts
const INTERACTION: Record<string, MetricKind> = {
  'https://schema.org/ReplyAction': 'replies',
  'https://schema.org/ShareAction': 'reposts',
  'https://schema.org/LikeAction': 'likes',
  'https://schema.org/ViewAction': 'views',
}

/**
 * X 的卡片統計列順序。與 x.com 網頁本身的排列一致。
 *
 * schema.org 還提供 InteractAction（引用數），但卡片從未顯示它，因此不解析 ——
 * 解析了卻永遠不顯示的欄位只會讓人以為它有用。要加回來的話，MetricKind、
 * METRIC_META、INTERACTION、這個陣列四處一起補。
 */
const X_METRIC_ORDER: readonly MetricKind[] = ['views', 'replies', 'reposts', 'likes']
```

`parseStats` 改名為 `parseMetrics` 並改寫：

```ts
function parseMetrics(article: Element): Metric[] {
  const found = new Map<MetricKind, number>()
  // 直接子層過濾至關重要：作者的追蹤者統計巢狀在 author 節點之下，不可混入
  for (const block of directChildren(article, 'interactionStatistic')) {
    const type = block.querySelector('[itemprop="interactionType"]')?.getAttribute('content')
    const count = block.querySelector('[itemprop="userInteractionCount"]')?.getAttribute('content')
    const kind = type ? INTERACTION[type] : undefined
    if (kind && count) {
      const n = Number(count)
      if (Number.isFinite(n)) found.set(kind, n)
    }
  }
  // 依固定順序輸出，而非依 DOM 中出現的順序 —— 後者會讓卡片的統計列順序
  // 隨 X 的標記變動而改變。
  return X_METRIC_ORDER.map((kind) => ({ kind, value: found.get(kind) ?? null }))
}
```

`parseArticle` 中 `stats: parseStats(article)` 改為 `metrics: parseMetrics(article)`。
import 加入 `Metric`、`MetricKind`，移除 `Stats`。

- [ ] **Step 6: 改 `Card.tsx` 的統計列**

刪除 `ICON` 常數（已搬到 `metrics.ts`）。`Stat` 元件改為吃 `Metric`：

```tsx
function Stat({ metric }: { metric: Metric }) {
  const meta = METRIC_META[metric.kind]
  return (
    // nowrap：數字與圖示是一個語意單位，窄卡片上不該被拆到兩行
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap' }}>
      {/* 圖示尺寸綁 1em，跟著統計列的字級走，使用者拉「文字尺寸」時不會脫節 */}
      <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" role="img" aria-label={meta.label}
           style={{ fill: 'currentColor', flex: '0 0 auto' }}>
        <path d={meta.icon} />
      </svg>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(metric.value)}</span>
    </span>
  )
}
```

統計列的內容改為依陣列渲染，中點分隔插在項目之間：

```tsx
            {tweet.metrics.map((m, i) => (
              <Fragment key={m.kind}>
                {i > 0 && <Sep />}
                <Stat metric={m} />
              </Fragment>
            ))}
```

`Fragment` 從 `preact` import。`fmt`、`Sep` 原樣保留。

- [ ] **Step 7: 修四處手工建構的 `stats`**

見「測試慣例」的表格 —— 只有這四處，其餘測試都是解析真實 fixture，不受影響。

`src/content/dom-fallback.ts:78`、`src/editor/manual.ts:51`、`test/web/fetch.test.ts:68`
的全 null `Stats` 改為：

```ts
metrics: [
  { kind: 'views', value: null },
  { kind: 'replies', value: null },
  { kind: 'reposts', value: null },
  { kind: 'likes', value: null },
],
```

`test/render/Card.test.tsx:316` 的 `{ ...t, stats: { ...t.stats, views } }` 改為
覆寫陣列中 `views` 那一項：

```ts
    return { ...t, metrics: t.metrics.map((m) => (m.kind === 'views' ? { ...m, value: views } : m)) }
```

其餘斷言統計列內容的測試若讀 `tweet.stats.*`，改讀對應的 `metrics` 項目。

- [ ] **Step 8: 全測試 + 型別檢查**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit
```

Expected: 全綠。卡片的視覺輸出必須與 Task 2 結束時完全相同 —— 這個 task 只換
資料結構，不改一個像素。

- [ ] **Step 9: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
refactor: 固定五欄的 Stats 改為有序的 Metric[]

Stats 是寫死的五欄結構，Card 的統計列也把 X 的圖示與標籤硬編在裡面。
Threads 有 shares 而 X 沒有、X 有 views 而 Threads 沒有 —— 兩個平台就已經
互不重疊，不必等到更多平台才需要這個抽象。

卡片上放哪幾個、什麼順序，改由 adapter 決定（X 的順序抽成 X_METRIC_ORDER，
與 x.com 網頁本身一致）。圖示與標籤搬進 src/render/metrics.ts 的 METRIC_META，
型別是完整的 Record 而非 Partial —— 新增 MetricKind 卻忘了補圖示時，那一格
在卡片上會是空白而不報錯，用 Record 讓 tsc 在建置期抓到。

順帶移除 quotes：Stats 有這個欄位、INTERACTION 也解析它，但統計列從來沒有
渲染過。解析了卻永遠不顯示的欄位只會讓人以為它有用。要加回來的話 MetricKind、
METRIC_META、INTERACTION、X_METRIC_ORDER 四處一起補。

視覺輸出零改變，只換資料結構。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `textComplete`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/parse/microdata.ts`
- Modify: `src/content/dom-fallback.ts`
- Modify: `src/editor/manual.ts`
- Modify: `src/render/Card.tsx`
- Test: `test/parse/microdata.test.ts`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Consumes: `fullTextFromTitle(title, authorName, metaText): string`（既有）
- Produces:
  - `TweetData.textComplete: boolean`
  - `fullTextFromTitle` 改回傳 `{ text: string; fromTitle: boolean }`

**為什麼**：Task 1 移除版面截斷後，卡片上唯一還可能少字的原因是**來源截斷** ——
全文根本沒拿到。使用者必須分得出「這則貼文就這麼長」和「後面還有但我們拿不到」，
否則會一直調比例想把字找回來，而那永遠不會發生。

X 的引用推文是四個平台裡唯一無解的情境：一份 HTML 只有一個 `<title>`，它描述
主推文，引用推文超過 200 字就是補不回來（`microdata.ts` 既有註解已說明）。

- [ ] **Step 1: 寫失敗的測試**

加到 `test/parse/microdata.test.ts`：

```ts
describe('textComplete', () => {
  it('主推文從 title 補回全文時標記為完整', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.textComplete).toBe(true)
  })

  it('短的引用推文標記為完整', () => {
    const t = parseTweet(fx('quoted'), '2082883636177916306')!
    expect(t.quoted!.rawText.length).toBeLessThan(190)
    expect(t.quoted!.textComplete).toBe(true)
  })
})

describe('fullTextFromTitle', () => {
  it('title 是 meta 的延長時採用它，並標記來源', () => {
    const meta = '前半段'
    const title = 'A on X: "前半段後半段" / X'
    expect(fullTextFromTitle(title, 'A', meta)).toEqual({ text: '前半段後半段', fromTitle: true })
  })

  it('title 格式不符時退回 meta，不標記', () => {
    expect(fullTextFromTitle('完全不同的標題', 'A', '內文')).toEqual({ text: '內文', fromTitle: false })
  })
})
```

若 `quoted` fixture 的引用推文實際長度不小於 190，把第二個測試改為斷言
`textComplete === false` 並在測試名稱寫明原因 —— **不要為了讓測試通過而改 fixture**，
fixture 是真實抓下來的推文頁，改了就失去對照價值。

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/parse/microdata.test.ts -t 'textComplete|fullTextFromTitle'
```

Expected: FAIL —— `textComplete` 是 undefined，`fullTextFromTitle` 回傳字串而非物件。

- [ ] **Step 3: 加型別**

`src/types.ts` 的 `TweetData` 加入：

```ts
  /**
   * 內文是否完整。
   *
   * `false` 代表**來源就沒給全文**，不是排版放不下 —— 排版永遠不截字（見
   * card.css.ts 的 canvasSizeStyle）。這個區別要傳到 UI：來源截斷換什麼比例
   * 都救不回來，不告訴使用者的話他會一直調比例。
   *
   * 因為 quoted 的型別是 Omit<TweetData, 'quoted'>，引用推文自動帶有自己的
   * 這個旗標 —— 正好對上「主推文完整、引用推文截斷」這個 X 實際會出現的組合。
   */
  textComplete: boolean
```

- [ ] **Step 4: 改 `microdata.ts`**

`fullTextFromTitle` 改回傳物件：

```ts
export function fullTextFromTitle(
  title: string,
  authorName: string,
  metaText: string,
): { text: string; fromTitle: boolean } {
  const prefix = `${authorName} on X: "`
  if (!title.startsWith(prefix) || !title.endsWith(TITLE_SUFFIX)) {
    return { text: metaText, fromTitle: false }
  }
  const candidate = stripTrailingLink(title.slice(prefix.length, -TITLE_SUFFIX.length))
  return candidate.startsWith(metaText)
    ? { text: candidate, fromTitle: true }
    : { text: metaText, fromTitle: false }
}
```

加入截斷判斷：

```ts
/**
 * meta itemprop="text" 被視為可能截斷的長度下界。
 *
 * X 截在約 200 字，但不是精確值 —— 實測有 199 與 277 兩種。取 190 作為下界，
 * 寧可把剛好夠長的完整推文誤標為不確定，也不要把截斷的推文標成完整：前者
 * 只是多一行提示，後者是騙人。
 *
 * 主推文幾乎總能從 title 補回全文（實測 22 則全通過），所以這條路實際上
 * 只服務引用推文 —— 那是唯一沒有第二份來源可以驗證的地方。
 */
const META_TRUNCATION_FLOOR = 190

function looksComplete(text: string, fromTitle: boolean): boolean {
  return fromTitle || text.length < META_TRUNCATION_FLOOR
}
```

`parseArticle` 的回傳型別加上 `textComplete`，但它在該層無從判斷（拿不到 title），
所以由呼叫端補。最簡單的做法是 `parseArticle` 不產出這個欄位，改在兩個呼叫點各自補上。

主推文：

```ts
  const { text: fullText, fromTitle } = fullTextFromTitle(
    doc.querySelector('title')?.textContent ?? '',
    base.author.name,
    base.rawText,
  )
```

回傳物件中加入 `textComplete: looksComplete(fullText, fromTitle)`。

引用推文：

```ts
      quoted = {
        ...cbase,
        text: tokenize(cbase.rawText),
        media: parseMedia(citeEl),
        // 一份文件只有一個 <title>，而它描述的是主推文。引用推文沒有第二份
        // 來源可以驗證，只能靠長度判斷 —— 這是這個資料來源的極限。
        textComplete: looksComplete(cbase.rawText, false),
      }
```

- [ ] **Step 5: 補齊其餘產生 `TweetData` 的地方**

`src/content/dom-fallback.ts`：從已登入頁面的 DOM 讀取，看到的就是完整內文，
設 `textComplete: true`。

`src/editor/manual.ts`：使用者自己打的字，定義上完整，設 `textComplete: true`。

兩處都加一行註解說明為何是 true。

- [ ] **Step 6: Card 顯示來源截斷**

`Card.tsx` 內文區塊之後、圖片之前，加入：

```tsx
        {!tweet.textComplete && (
          <div
            data-part="incomplete"
            style={{
              marginTop: 8,
              opacity: 0.5,
              fontSize: s.fontSize * 0.72,
            }}
          >
            內文未完整取得
          </div>
        )}
```

引用推文區塊內，`<Text>` 之後同樣加一份（用 `tweet.quoted.textComplete`）。

- [ ] **Step 7: Card 的測試**

加到 `test/render/Card.test.tsx`：

```tsx
describe('來源截斷', () => {
  const plain = () => parseTweet(fx('plain'), '2083053369351090254')!

  it('來源截斷時顯示提示', () => {
    const el = mount({ ...plain(), textComplete: false })
    expect(el.querySelector('[data-part="incomplete"]')).not.toBeNull()
  })

  it('內文完整時不顯示提示', () => {
    const el = mount({ ...plain(), textComplete: true })
    expect(el.querySelector('[data-part="incomplete"]')).toBeNull()
  })
})
```

`mount()` 的預設參數是解析 `plain` fixture 的結果，`parseTweet` 改完後就會帶
`textComplete`，其餘測試不必動。

- [ ] **Step 8: 全測試 + 型別檢查**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit
```

Expected: 全綠。

- [ ] **Step 9: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
feat: 標記來源截斷的內文

移除版面截斷後，卡片上唯一還可能少字的原因是來源本身沒給全文。使用者必須
分得出「這則貼文就這麼長」和「後面還有但我們拿不到」—— 否則會一直調比例想
把字找回來，而那永遠不會發生。

fullTextFromTitle 改回傳 { text, fromTitle }，讓呼叫端知道全文是不是真的補回來了。
判斷條件是 fromTitle || length < 190：X 截在約 200 字但不精確（實測有 199 與
277 兩種），取 190 作下界 —— 寧可把剛好夠長的完整推文誤標為不確定，也不要把
截斷的推文標成完整，前者只是多一行提示，後者是騙人。

主推文幾乎總能從 title 補回全文（實測 22 則全通過），所以長度判斷實際上只服務
引用推文 —— 一份文件只有一個 <title>，它描述主推文，引用推文沒有第二份來源
可以驗證。那是四個平台裡唯一無解的情境。

dom-fallback 與 manual 兩條路徑的內文定義上就完整，直接設 true。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `handleDisplay`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/parse/microdata.ts`
- Modify: `src/content/dom-fallback.ts`
- Modify: `src/editor/manual.ts`
- Modify: `src/render/Card.tsx`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Produces: `Author.handleDisplay: string` —— 已含平台慣用前綴的顯示字串。

**為什麼**：`Card.tsx` 現在把 `@` 前綴寫死。Threads 的 handle 規則與 X 不同，
不該由渲染層假設所有平台都用 `@`。前綴是平台知識，屬於 adapter。

- [ ] **Step 1: 寫失敗的測試**

```tsx
it('作者帳號用 handleDisplay 原樣輸出，不由卡片加前綴', () => {
  const t = parseTweet(fx('plain'), '2083053369351090254')!
  const el = mount({ ...t, author: { ...t.author, handleDisplay: '＠自訂前綴' } })
  expect(el.textContent).toContain('＠自訂前綴')
  // 卡片若仍自己加 @，會變成 '@＠自訂前綴'
  expect(el.textContent).not.toContain('@＠自訂前綴')
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/Card.test.tsx -t handleDisplay
```

Expected: FAIL —— 卡片輸出的是 `@` + `handle`，不含 `handleDisplay`。

- [ ] **Step 3: 加型別**

`src/types.ts` 的 `Author`：

```ts
export type Author = {
  name: string
  handle: string
  /**
   * 卡片上顯示的帳號字串，已含平台慣用前綴。
   *
   * 前綴是平台知識，不是渲染知識：X 用 `@`，Threads 的規則不同。由 adapter
   * 產生，Card 原樣輸出，渲染層不對任何平台的命名慣例做假設。
   *
   * `handle` 保留原始值（不含前綴），檔名與比對邏輯用它。
   */
  handleDisplay: string
  avatarUrl: string
  avatarDataUrl?: string
}
```

- [ ] **Step 4: 產生端補上**

`microdata.ts` 的 `parseAuthor` 回傳值加 `handleDisplay: '@' + handle`。
`dom-fallback.ts` 與 `manual.ts` 建構 `Author` 的地方同樣補上。

- [ ] **Step 5: Card 改用它**

`Card.tsx` 中：

```tsx
            <div style={{ opacity: 0.55, fontSize: s.fontSize * 0.8 }}>{author.handleDisplay}</div>
```

引用推文區塊的 `<span style={{ opacity: 0.5 }}>@{quotedAuthor!.handle}</span>`
改為 `{quotedAuthor!.handleDisplay}`。

`MASKED_AUTHOR` 加 `handleDisplay: '@' + MASKED_HANDLE`，並加註解：

```ts
/**
 * 遮蔽後仍保留平台前綴：遮的是身分，不是「這是哪個平台」。X 的遮蔽結果
 * 應該仍然看得出是一則 X 貼文。
 */
```

- [ ] **Step 6: 全測試 + 型別檢查**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit
```

Expected: 全綠。卡片輸出與前一個 task 完全相同。

- [ ] **Step 7: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
refactor: 帳號前綴改由 adapter 決定

Card 把 @ 前綴寫死，等於假設所有平台都用 X 的命名慣例。Threads 的規則不同。
前綴是平台知識，不是渲染知識。

Author 新增 handleDisplay（已含前綴的顯示字串），Card 原樣輸出。handle 保留
原始值不含前綴，檔名與比對邏輯用它。遮蔽時仍保留前綴 —— 遮的是身分，不是
「這是哪個平台」。

視覺輸出零改變。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `TweetData` → `Post`，加入 `platform`

**Files:**
- Modify: 全部引用 `TweetData` 的檔案（見下方清單）
- Modify: `src/render/export.ts`
- Test: `test/render/export.test.ts`

**Interfaces:**
- Produces:
  - `type Platform = 'x'`（本階段只有一個成員；階段 2、3 再擴充）
  - `type Post`（原 `TweetData`），含 `platform: Platform`
  - `type PostSource = 'fetch' | 'dom' | 'manual'`（原 `TweetSource` 的 `'microdata'` → `'fetch'`）
  - `buildFilename(post: Post): string` —— 前綴改用 `post.platform`

**要改的檔案**（依 `grep -rn TweetData` 的結果）：
`src/types.ts`、`src/render/Card.tsx`、`src/parse/microdata.ts`、`src/render/export.ts`、
`src/editor/Panel.tsx`、`src/editor/manual.ts`、`src/content/dom-fallback.ts`、
`src/background/index.ts`、`src/background/asset-proxy.ts`、`web/App.tsx`、
`web/fetch.ts`、`dev/fixture.ts`、`dev/main.tsx`，以及對應的測試檔。

- [ ] **Step 1: 寫失敗的測試**

`test/render/export.test.ts` 的模組層已有
`const tweet = parseTweet(readFileSync('test/fixtures/plain.html', 'utf8'), '2083053369351090254')!`
（本 task 會把它改名為 `post`）。沿用它：

```ts
describe('buildFilename', () => {
  it('前綴用 platform 而非寫死的 x', () => {
    expect(buildFilename({ ...post, platform: 'x', author: { ...post.author, handle: 'jack' }, id: '20' }))
      .toBe('x-jack-20.png')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/export.test.ts -t buildFilename
```

Expected: FAIL —— `platform` 不在型別上（`tsc` 會擋），或執行時檔名仍是寫死的 `x-` 前綴
而測試物件的 `platform` 被忽略。

- [ ] **Step 3: 改型別**

`src/types.ts`：

```ts
/**
 * 目前只有 X。階段 2 加 'threads'，階段 3 加 'weibo' | 'xhs'。
 * 現在就定義這個型別而不是等到有第二個平台，是因為 Post.platform 需要它 ——
 * 而 platform 本身在單一平台時就有用：它決定匯出的檔名前綴。
 */
export type Platform = 'x'

/**
 * 這則貼文的資料從哪裡來。
 *
 * `fetch` 是正常路徑：不帶 cookie 抓取公開頁面解析結構化資料。
 * `dom` 表示公開抓取拿不到內容 —— 最常見的原因是鎖定帳號，其內容對未登入
 * 請求本來就不可見 —— 改從使用者眼前這個已登入頁面讀取。
 * `manual` 是使用者自己輸入的。
 *
 * 這個區別會一路影響 UI：來源為 `dom` 時要顯示傳播範圍的提醒，且身分遮蔽
 * 預設開啟。
 */
export type PostSource = 'fetch' | 'dom' | 'manual'
```

`TweetData` 改名為 `Post`，加入 `platform: Platform`，`source` 型別改為 `PostSource`。
`quoted` 的型別跟著變成 `Omit<Post, 'quoted'>`。

**保留一個過渡別名**讓改動可分批進行，本 task 結束前刪除：
`export type TweetData = Post`。最後一步移除它並確認 `tsc` 乾淨。

- [ ] **Step 4: 全域改名**

逐檔把 `TweetData` 換成 `Post`、`TweetSource` 換成 `PostSource`、
`'microdata'` 換成 `'fetch'`、`'dom-fallback'` 換成 `'dom'`。
變數名 `tweet` 在 `Card.tsx` 的 props 上也改為 `post`（連同測試）。

`src/render/export.ts` 的 `buildFilename`：

```ts
export function buildFilename(post: Post): string {
  const safeHandle = sanitizeFilenameComponent(post.author.handle)
  const safeId = sanitizeFilenameComponent(post.id)
  return `${post.platform}-${safeHandle}-${safeId}.png`
}
```

- [ ] **Step 5: 刪除過渡別名並驗證**

移除 `export type TweetData = Post`，然後：

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx tsc --noEmit && grep -rn "TweetData\|TweetSource\|'microdata'\|'dom-fallback'" src web dev test --include="*.ts" --include="*.tsx"
```

Expected: `tsc` 乾淨，`grep` 無輸出。

- [ ] **Step 6: 全測試**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run
```

Expected: 全綠。

- [ ] **Step 7: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
refactor: TweetData 改名為 Post 並加入 platform

型別名稱寫死「推文」，而卡片已經要承接不只一個平台的貼文。連帶把
TweetSource 的 'microdata' / 'dom-fallback' 改為 'fetch' / 'dom' —— 前者是
X 特有的實作細節（schema.org microdata），後者描述的是資料從哪裡來這件事
本身，換平台仍然成立。

Platform 目前只有 'x' 一個成員。現在就定義而不是等到有第二個平台，是因為
它在單一平台時就有用：匯出檔名的前綴改用 post.platform，不再寫死 'x-'。

視覺輸出與檔名皆零改變。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `Adapter` 介面與 `x` adapter

**Files:**
- Create: `src/platforms/types.ts`
- Create: `src/platforms/x.ts`
- Create: `src/platforms/index.ts`
- Modify: `src/content/index.tsx`
- Modify: `src/content/permalink.ts`
- Modify: `src/background/index.ts`
- Test: `test/platforms/x.test.ts` (create)

**Interfaces:**
- Consumes: `parseTweet(html, id)`、`extractTweetId(url)`（`src/parse/microdata.ts`）、
  `fetchTweetHtml(url)`（`src/background/fetch-tweet.ts`）、`hydrateAssets(post)`（`src/background/asset-proxy.ts`）
- Produces:
  - `type Adapter`（見下）
  - `const xAdapter: Adapter`
  - `function adapterFor(url: string): Adapter | undefined`
  - `const ADAPTERS: readonly Adapter[]`

**為什麼**：X 的免 cookie 抓取與 Threads 的經代理擷取已經是兩種不同的機制，
不需要等到微博小紅書才需要這個介面。本階段只註冊一份實作，介面的正確性
在階段 2 接上 Threads 時才會真正被驗證 —— 這是刻意的順序：先讓既有平台跑在
新介面上（行為不變、測試全綠），再用第二個平台去壓測介面。

- [ ] **Step 1: 寫失敗的測試**

建立 `test/platforms/x.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { adapterFor, ADAPTERS } from '../../src/platforms'
import { xAdapter } from '../../src/platforms/x'

describe('adapterFor', () => {
  it('認得 x.com 與 twitter.com 的貼文連結', () => {
    expect(adapterFor('https://x.com/jack/status/20')).toBe(xAdapter)
    expect(adapterFor('https://twitter.com/jack/status/20')).toBe(xAdapter)
  })

  it('不認得其他網域', () => {
    expect(adapterFor('https://example.com/jack/status/20')).toBeUndefined()
    expect(adapterFor('https://www.threads.com/@a/post/B')).toBeUndefined()
  })

  it('網址不合法時不丟例外', () => {
    expect(adapterFor('not a url')).toBeUndefined()
  })
})

describe('ADAPTERS', () => {
  it('本階段只有 x 一份', () => {
    expect(ADAPTERS.map((a) => a.platform)).toEqual(['x'])
  })

  it('每份 adapter 的 hosts 都不為空 —— 空清單會讓 adapterFor 永遠比對不到', () => {
    for (const a of ADAPTERS) expect(a.hosts.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/platforms/x.test.ts
```

Expected: FAIL —— 找不到模組 `src/platforms`。

- [ ] **Step 3: 建立 `src/platforms/types.ts`**

```ts
import type { Platform, Post } from '../types'

/**
 * 一個平台要能被做成卡片，需要提供的全部東西。
 *
 * 這是全系統唯一與平台相關的地方 —— 渲染、匯出、設定都不知道有哪些平台
 * 存在。新增平台的成本因此是「寫一份 Adapter 並註冊」，而不是在十幾個
 * switch 裡各加一個 case。
 */
export type Adapter = {
  platform: Platform

  /**
   * 這個平台的網域。同時是 adapterFor 的比對依據與 manifest host_permissions
   * 的來源 —— 兩者共用同一份清單，不會出現「程式碼認得但權限沒開」的落差。
   */
  hosts: readonly string[]

  /**
   * 在頁面上找出可產卡的貼文，以及按鈕該注入在哪裡。
   * content script 專用；行動網頁不呼叫這個。
   */
  findPermalinks(root: ParentNode): { url: string; anchor: Element }[]

  /**
   * 取得貼文。實作可以是免 cookie 抓取、經代理、或讀當前 DOM ——
   * 呼叫端不需要知道是哪一種。
   */
  acquire(url: string): Promise<Post>
}
```

- [ ] **Step 4: 建立 `src/platforms/x.ts`**

把既有的抓取流程包成 adapter。**不要改寫 `parseTweet` / `fetchTweetHtml` /
`findPermalinks` 的內部邏輯**，這個 task 只是把它們接到新介面上：

```ts
import type { Adapter } from './types'
import type { Post } from '../types'
import { extractTweetId, parseTweet } from '../parse/microdata'
import { fetchTweetHtml, TweetFetchError } from '../background/fetch-tweet'
import { findPermalinks } from '../content/permalink'

export const X_HOSTS = ['x.com', 'twitter.com'] as const

export const xAdapter: Adapter = {
  platform: 'x',
  hosts: X_HOSTS,
  findPermalinks,
  async acquire(url: string): Promise<Post> {
    const id = extractTweetId(url)
    if (!id) throw new TweetFetchError('badurl', `不是推文連結：${url}`)
    const html = await fetchTweetHtml(url)
    const post = parseTweet(html, id)
    // 抓得到頁面卻解析不到 —— 鎖定帳號，或 X 改了結構化資料的形狀。
    // 兩者的處置相同：交給呼叫端決定要不要退回 DOM 讀取。
    if (!post) throw new TweetFetchError('not-found', `解析不到貼文：${url}`)
    return post
  },
}
```

`findPermalinks` 若在 `src/content/permalink.ts` 的匯出名稱不同，用實際名稱，
必要時在該檔案加一層薄封裝以符合 `Adapter` 的簽章 —— **不要改動它的偵測邏輯**，
那是全系統唯一的 live DOM 依賴。

- [ ] **Step 5: 建立 `src/platforms/index.ts`**

```ts
import type { Adapter } from './types'
import { xAdapter } from './x'

export type { Adapter } from './types'

/** 註冊表。新增平台 = 在這裡多一個項目。 */
export const ADAPTERS: readonly Adapter[] = [xAdapter]

/**
 * 由網址找出負責的 adapter。
 *
 * 比對 hostname 而非用 includes 掃字串：後者會讓
 * `https://evil.com/?x=x.com/a/status/1` 這種網址比對成功。
 */
export function adapterFor(url: string): Adapter | undefined {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return undefined
  }
  const bare = host.replace(/^www\.|^mobile\./, '')
  return ADAPTERS.find((a) => a.hosts.includes(bare))
}
```

- [ ] **Step 6: 讓 content script 與 background 改走註冊表**

`src/content/index.tsx`：把直接呼叫 `findPermalinks` 的地方改為
`for (const a of ADAPTERS) a.findPermalinks(document)`。

`src/background/index.ts`：把「取 id → 抓 HTML → parse」那段換成
`adapterFor(url)?.acquire(url)`，找不到 adapter 時回既有的 `badurl` 錯誤。
`hydrateAssets` 仍在 adapter 之外呼叫 —— 資產處理對所有平台相同，不屬於 adapter。

- [ ] **Step 7: 全測試 + 型別檢查**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit
```

Expected: 全綠。既有的 background / content 測試不應需要修改 —— 若需要，
先確認是介面接錯而不是行為變了。

- [ ] **Step 8: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
refactor: 擷取邏輯收攏進 Adapter 介面

X 的免 cookie 抓取與 Threads 的經代理擷取已經是兩種不同的機制，不必等到更多
平台才需要這個介面。

src/platforms/ 成為全系統唯一與平台相關的地方 —— 渲染、匯出、設定都不知道
有哪些平台存在。新增平台的成本因此是「寫一份 Adapter 並註冊」，而不是在十幾
個 switch 裡各加一個 case。

hosts 同時是 adapterFor 的比對依據與 manifest host_permissions 的來源，兩者
共用同一份清單，不會出現「程式碼認得但權限沒開」的落差。adapterFor 比對
hostname 而非掃字串，否則 https://evil.com/?x=x.com/a/status/1 會比對成功。

本階段只註冊一份實作。介面的正確性要到階段 2 接上 Threads 才會真正被驗證，
這是刻意的順序：先讓既有平台跑在新介面上（行為不變、測試全綠），再用第二個
平台去壓測介面。

parseTweet / fetchTweetHtml / permalink 偵測的內部邏輯一行未動。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 拆出 `CardShell` 與 `TextLayout`

**Files:**
- Create: `src/render/CardShell.tsx`
- Create: `src/render/TextLayout.tsx`
- Modify: `src/render/Card.tsx`
- Test: `test/render/Card.test.tsx`

**Interfaces:**
- Produces:
  - `CardShell({ settings, children }): JSX.Element` —— 畫布、背景、顆粒疊層、比例量測
  - `TextLayout({ post, settings }): JSX.Element` —— 面板內容
  - `Card({ post, settings })` 維持現有簽章，內部組合上面兩者

**為什麼**：`Card.tsx` 在 Task 1 之後仍有 400 行，同時負責「畫布多高」與
「面板裡放什麼」兩件事。前者是全 codebase 最難的部分（`aspect-ratio` 與量測
互相打架的紀錄、`offsetWidth` 而非 `getBoundingClientRect` 的理由都在那裡），
後者是會隨平台增加而變動的部分。把難的那半隔離起來，階段 2 加版型時才不會
每次都要重讀量測邏輯。

**只有一種版型是刻意的。** `MediaLayout` 是階段 2 的東西，本 task 不要建立它。

- [ ] **Step 1: 寫失敗的測試**

沿用 `mount()` 的 host 模式，但直接渲染被測元件。加到 `test/render/Card.test.tsx`：

```tsx
import { CardShell } from '../../src/render/CardShell'
import { TextLayout } from '../../src/render/TextLayout'

/** 與 mount() 同樣的 host 模式，但渲染任意 VNode 而非固定的 Card */
function mountNode(vnode: preact.VNode) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(vnode, host)
  return host
}

describe('CardShell', () => {
  it('渲染畫布，內容由 children 決定', () => {
    const el = mountNode(
      <CardShell settings={DEFAULT_SETTINGS}><div data-part="probe" /></CardShell>,
    )
    expect(el.querySelector('[data-part="canvas"]')).not.toBeNull()
    expect(el.querySelector('[data-part="probe"]')).not.toBeNull()
  })

  // 這個約束是拆分的重點：外殼一旦知道貼文的存在，加版型時就又得動它。
  it('不知道貼文的存在 —— 沒有 post prop 也能渲染', () => {
    const el = mountNode(<CardShell settings={DEFAULT_SETTINGS}><span /></CardShell>)
    expect(el.querySelector('[data-part="canvas"]')).not.toBeNull()
  })
})

describe('TextLayout', () => {
  it('渲染面板與內文，不渲染畫布', () => {
    const post = parseTweet(fx('plain'), '2083053369351090254')!
    const el = mountNode(<TextLayout post={post} settings={DEFAULT_SETTINGS} />)
    expect(el.querySelector('[data-part="panel"]')).not.toBeNull()
    expect(el.querySelector('[data-part="body"]')).not.toBeNull()
    expect(el.querySelector('[data-part="canvas"]')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run test/render/Card.test.tsx -t 'CardShell|TextLayout'
```

Expected: FAIL —— 找不到模組。

- [ ] **Step 3: 建立 `CardShell.tsx`**

從 `Card.tsx` 搬移：`ASPECT_SHRINK`（連同 Task 1 更新過的註解）、`canvasRef`、
`minHeight` 狀態、整個 `useLayoutEffect` 量測區塊、外層畫布 `<div data-part="canvas">`
與其內的顆粒疊層 `<div aria-hidden="true">`。**所有註解一併搬移，一個字都不要刪** ——
那些是實測筆記，不是說明文字。

```tsx
export function CardShell({
  settings,
  children,
}: {
  settings: CardSettings
  children: preact.ComponentChildren
}) {
  // …（搬移過來的 ref、狀態、useLayoutEffect）
  return (
    <div ref={canvasRef} data-part="canvas" style={{ /* 搬移過來的樣式 */ }}>
      <div aria-hidden="true" style={{ /* 顆粒疊層 */ }} />
      {children}
    </div>
  )
}
```

`ASPECT_SHRINK` 被 `fitFontSize` 使用，而 `fitFontSize` 屬於版型。把
`ASPECT_SHRINK` 與 `fitFontSize` 一起放進 `TextLayout.tsx` ——
它們是「文字要多大」的問題，不是「畫布多高」的問題。

- [ ] **Step 4: 建立 `TextLayout.tsx`**

從 `Card.tsx` 搬移：`fmt`、`trimZero`、`absTime`、`relTime`、`Stat`、`Sep`、
`Text`、`Avatar`、`MediaGrid`、`MASKED_NAME`、`MASKED_HANDLE`、`MASKED_AUTHOR`、
`fitFontSize`、`ASPECT_SHRINK`，以及面板 `<div data-part="panel">` 及其全部內容。

`MASKED_NAME` / `MASKED_HANDLE` 若被其他模組 import，從 `TextLayout.tsx` 重新匯出，
或移到 `src/types.ts` —— 開啟引用處確認後擇一，**不要兩邊各留一份**。

- [ ] **Step 5: `Card.tsx` 只剩組合**

```tsx
import { CardShell } from './CardShell'
import { TextLayout } from './TextLayout'
import type { Post, CardSettings } from '../types'

export { DEFAULT_SETTINGS } from './defaults'

/**
 * 卡片 = 外殼 + 版型。
 *
 * 這個分工的理由：外殼裡的比例量測是全 codebase 最難的部分（CSS aspect-ratio
 * 與量測互相打架、transform 祖先讓 getBoundingClientRect 失準，兩者都是實測
 * 踩出來的），而版型是會隨平台增加而變動的部分。把難的那半隔離起來，加新版型
 * 時不必每次重讀量測邏輯。
 */
export function Card({ post, settings }: { post: Post; settings: CardSettings }) {
  return (
    <CardShell settings={settings}>
      <TextLayout post={post} settings={settings} />
    </CardShell>
  )
}
```

`DEFAULT_SETTINGS` 目前定義在 `Card.tsx`，而 `store.ts` 從 `../render/Card` import 它。
搬到新檔 `src/render/defaults.ts` 並由 `Card.tsx` 重新匯出，避免 `Card.tsx`
為了一個常數而被所有人 import。更新 `store.ts` 的 import 指向 `../render/defaults`。

- [ ] **Step 6: 全測試 + 型別檢查 + 建置**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 全綠，建置成功。`npm run build` 這一步在本 task 特別重要 ——
檔案拆分會改變 import 圖，`test/manifest.dist.test.ts` 與 `test/icons.dist.test.ts`
檢查的是建置產物。

- [ ] **Step 7: 目視驗收**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npm run dev:preview
```

開 <http://localhost:5199>，逐項確認：四種比例都能切換、長推文不再被截斷且畫布
往下長、引用推文正常、統計列四個數字與圖示都在、匯出的 PNG 與預覽一致。
**這一步不能省** —— 拆分元件最容易壞的是版面，而版面在 happy-dom 裡測不到。

- [ ] **Step 8: Commit**

```bash
cd /Users/gariberzyo/projects/xframe && git add -A && git commit -m "$(cat <<'EOF'
refactor: Card 拆成 CardShell 與 TextLayout

Card.tsx 同時負責「畫布多高」與「面板裡放什麼」兩件事。前者是全 codebase 最難
的部分（CSS aspect-ratio 與量測互相打架、transform 祖先讓
getBoundingClientRect 失準，兩者都是實測踩出來的），後者是會隨平台增加而變動
的部分。把難的那半隔離起來，加新版型時不必每次重讀量測邏輯。

CardShell 不知道貼文的存在，只吃 settings 與 children —— 這個約束由測試守住。
fitFontSize 與 ASPECT_SHRINK 歸 TextLayout：它們回答的是「文字要多大」，
不是「畫布多高」。

DEFAULT_SETTINGS 移到 src/render/defaults.ts，store.ts 不必為了一個常數而
import 整個 Card。

只有一種版型是刻意的，MediaLayout 是階段 2 的東西。

搬移過程中所有註解一字未刪 —— 那些是實測筆記，不是說明文字。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 完成後的驗收

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Users/gariberzyo/projects/xframe && npx vitest run && npx tsc --noEmit && npm run build
```

全部通過後，逐項確認：

- [ ] 四種比例下 1200 字的推文，內文一字不少
- [ ] `src/` 底下 `grep -rn "TweetData\|Stats\b"` 無結果
- [ ] `src/render/` 底下沒有任何平台名稱字串（`x.com` / `twitter` / `推文`）
- [ ] `src/platforms/` 是唯一提到 X 的地方（`parse/microdata.ts` 除外，它本來就是 X 的解析器）
- [ ] `npm run dev:preview` 的輸出與階段 1 開始前肉眼無差異，除了長推文不再被截斷

## 不在本階段

- `title?` 欄位（階段 3，小紅書筆記標題）
- `MediaLayout`（階段 2）
- `MetricKind` 的 `shares`（階段 2）、`bookmarks`（階段 3）
- `Platform` 的其餘成員
- 任何 adapter 的第二份實作
