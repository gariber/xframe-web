import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'
import { MIN_HEIGHT_ASPECTS } from '../../src/render/card.css'
import type { CardSettings } from '../../src/types'

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

  // 原本這裡斷言 root.style.background.length > 20，驗證 Card 把 generate()
  // 產生的漸層字串接上根節點的 style.background。已移除：happy-dom 15.11.7
  // 的 CSSStyleDeclaration 對多層（逗號分隔）background shorthand 會整筆丟棄
  // 寫入——不論用 `el.style.background = ...`、`el.style.setProperty(...)`
  // 還是 `el.style.cssText = ...` 賦值，讀回的 style.background／cssText／
  // getAttribute('style') 全部是空字串或 null，唯一能讀回的路徑是繞過 CSSOM
  // 改用 el.setAttribute('style', ...) 直接寫入屬性字串，但 Preact 對 style
  // 物件 prop 本來就是逐一 key 呼叫 dom.style[key] = value，不會走那條路徑，
  // 所以沒有不更動任何程式碼就能觀察到的方法。也試過用 jsdom 環境替代
  // happy-dom 跑這個檔案，但本專案未安裝 jsdom（package-lock 只把它列為
  // vitest 的 optional peer dependency，node_modules 底下沒有實體），依規定
  // 不得為了這一個斷言新增依賴。真實瀏覽器裡這個 shorthand 完全正常運作。
  // 背景生成本身（決定性、五種 kind、40 組 preset、grain data URI）已由
  // test/render/backgrounds.test.ts 完整涵蓋；這裡失去的只是「Card 把產生
  // 的值接進 style prop」這一行 wiring 事實的直接斷言，不是背景邏輯本身。

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

  it('null 統計顯示為 —，0 統計正常顯示數字（spec §5：null 與 0 意義不同）', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.stats = { ...t.stats, replies: null, reposts: 0 }
    const stats = mount(t).querySelector('[data-part="stats"]') as HTMLElement
    // 改用圖示的 aria-label 定位。那是圖示真正的無障礙名稱（螢幕閱讀器唯一
    // 讀得到的東西），不是為了測試才加的鉤子 —— 換掉顯示文字不該讓這個
    // 契約的測試失效。
    const valueOf = (label: string) =>
      stats.querySelector(`svg[aria-label="${label}"]`)!.parentElement!.textContent
    expect(valueOf('回覆')).toBe('—')
    expect(valueOf('轉推')).toBe('0')
  })

  it('四項統計皆以圖示呈現，且圖示有無障礙名稱', () => {
    const stats = mount().querySelector('[data-part="stats"]') as HTMLElement
    const labels = [...stats.querySelectorAll('svg[aria-label]')].map((s) => s.getAttribute('aria-label'))
    expect(labels).toEqual(['瀏覽', '回覆', '轉推', '讚'])
  })

  it('統計列不再出現中文標籤文字', () => {
    const stats = mount().querySelector('[data-part="stats"]') as HTMLElement
    for (const word of ['回覆', '轉推', '讚', '瀏覽']) {
      expect(stats.textContent).not.toContain(word)
    }
  })
})

describe('createdAt 無法解析時的降級（Fix 5）', () => {
  it('無法解析的 createdAt 不顯示 NaN，改為空字串', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.createdAt = 'not-a-real-date'
    const el = mount(t)
    expect(el.textContent).not.toContain('NaN')
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
  it('四個顯示項預設開啟', () => {
    expect(Object.values(DEFAULT_SETTINGS.show).every(Boolean)).toBe(true)
  })
})

// happy-dom 沒有真正的排版引擎——document.createElement('div').getBoundingClientRect()
// 在任何情況下都回傳全 0（已用一個獨立的最小重現案例確認過，見本次修正紀錄），
// 所以「用固定寬度掛載卡片並量測實際渲染出的框高寬比」在這個測試環境裡做不到：
// 量到的永遠是 0/0，不會因為 aspect 設定不同而變化，斷言會恆真或恆假，量不出
// 真的有沒有守住比例。改為對「我們設定了什麼樣式」做斷言——這是 fix 實際落地
// 的地方，也是唯一在這個環境裡可觀察、且會在 revert 後失敗的東西。無法涵蓋的
// 是：這些樣式疊加後，瀏覽器實際渲染出來的框是否真的沒有被撐開——這需要真瀏覽
// 器或視覺回歸測試；本次已在 dev preview 手動驗證過（見
// final-fixwave-report.md 的「Aspect ratio second pass」一節），不在本檔案
// 自動化測試的涵蓋範圍內。
describe('固定比例模式的版面收斂（Fix 1）', () => {
  it.each(['auto', '1:1', '4:5', '9:16'] as const)(
    'canvas 節點不再設定 CSS 的 aspect-ratio（改用下面量測出來的定值 height，見 Fix 1 第二輪）',
    (aspect) => {
      const s = { ...DEFAULT_SETTINGS, aspect }
      const el = mount(undefined, s)
      const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
      expect(canvas.style.aspectRatio).toBe('')
    },
  )

  it('canvas 節點設定 minHeight:0 與 overflow:hidden，避免 Chrome 的 min-height:auto 把比例撐開', () => {
    const el = mount()
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    expect(canvas.style.minHeight).toBe('0px')
    expect(canvas.style.overflow).toBe('hidden')
  })

  it('固定比例模式下，同一段文字的字級比 auto 模式更小（可用高度被鎖死，須提早縮字）', () => {
    const base = parseTweet(fx('plain'), '2083053369351090254')!
    const raw = '中'.repeat(60)
    const t = { ...base, rawText: raw, text: [{ type: 'text' as const, value: raw }] }
    const fontSizeOf = (aspect: (typeof DEFAULT_SETTINGS)['aspect']) => {
      const el = mount(t, { ...DEFAULT_SETTINGS, aspect })
      return parseFloat((el.querySelector('[data-part="body"]') as HTMLElement).style.fontSize)
    }
    const autoSize = fontSizeOf('auto')
    for (const aspect of ['1:1', '4:5'] as const) {
      expect(fontSizeOf(aspect)).toBeLessThan(autoSize)
    }
  })

  it('固定比例模式下，同一段文字比 auto 模式更早被截斷', () => {
    const base = parseTweet(fx('plain'), '2083053369351090254')!
    // 700 刻意落在 auto 的 900 與 1:1 的 640 之間，才問得出「固定比例更早截斷」
    const raw = 'a'.repeat(700)
    const t = { ...base, rawText: raw, text: [{ type: 'text' as const, value: raw }] }
    const bodyOf = (aspect: (typeof DEFAULT_SETTINGS)['aspect']) =>
      mount(t, { ...DEFAULT_SETTINGS, aspect }).querySelector('[data-part="body"]') as HTMLElement

    expect(bodyOf('auto').style.overflow).not.toBe('hidden')
    expect(bodyOf('1:1').style.overflow).toBe('hidden')
  })
})

// 第二輪修正：真瀏覽器實測（1280×800 viewport，dev preview，見
// final-fixwave-report.md 的「Aspect ratio second pass」）發現 aspect-ratio
// 本身在「畫布是 flex 容器、面板是內容驅動高度的 flex item」這個組合下不保證
// 贏過內容的 min-content 貢獻——16:9 量到撐高 14%，即使 minHeight:0 與
// overflow:hidden 都已經套用在 canvas 節點上。改成量測目前寬度、直接算出定值
// px 高度指定給 height，讓比例由「這是一個具體長度」保證成立，不再參與那場
// CSS 規格對 flex + aspect-ratio 互動語意仍不完全明確的自動定size演算法。
//
// 這條路徑同樣受 happy-dom 沒有排版引擎所限：量到的寬度恆為 0，算出的 height
// 恆為 '0px'。下面的斷言證明的是「非 auto aspect 真的觸發了量測並把結果寫進
// height」這條程式路徑本身有跑到、且 auto 模式完全不會走這條路徑——不是「量到
// 的數字對不對」，那需要真瀏覽器，已經在 dev preview 手動驗證過。
describe('固定比例模式改用量測寬度算出的定值 height（Fix 1 第二輪）', () => {
  // useLayoutEffect 裡的 setFixedHeight 觸發的是「下一輪」render，Preact 預設
  // 用 Promise.resolve().then() 排程（stock preact 沒有 debounceRendering，
  // 見 node_modules/preact/src/component.js），不是跟初次 render 同步寫進
  // DOM。mount() 本身是同步函式，呼叫完的當下這個第二輪 render 通常還沒被
  // flush，所以這裡要多等一輪微工作佇列（microtask）才看得到 height 被寫入。
  const flush = () => Promise.resolve()

  it.each(['1:1', '4:5'] as const)(
    'aspect=%s 時，canvas 節點的 height 由 useLayoutEffect 寫入（happy-dom 下量到的寬度為 0，故為 0px）',
    async (aspect) => {
      const s = { ...DEFAULT_SETTINGS, aspect }
      const el = mount(undefined, s)
      await flush()
      const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
      expect(canvas.style.height).toBe('0px')
    },
  )

  it('auto 模式下 canvas 節點不會被設定 height（維持內容驅動的高度）', async () => {
    const el = mount()
    await flush()
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    expect(canvas.style.height).toBe('')
  })

  it('canvas 節點設定 box-sizing:border-box，讓定值 height 與量測到的 border-box 寬度是同一套座標系', () => {
    const el = mount(undefined, { ...DEFAULT_SETTINGS, aspect: '1:1' })
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    expect(canvas.style.boxSizing).toBe('border-box')
  })
})

describe('身分遮蔽（隱私）', () => {
  const masked = { ...DEFAULT_SETTINGS, maskIdentity: true }

  it('遮蔽時卡片上不出現真實名稱與帳號', () => {
    const el = mount(undefined, masked)
    expect(el.textContent).not.toContain('Tibo')
    expect(el.textContent).not.toContain('thsottiaux')
  })

  it('遮蔽時不渲染任何頭像圖片，改用色塊', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.author.avatarDataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const el = mount(t, masked)
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('[data-part="monogram"]')).not.toBeNull()
  })

  it('首字母色塊不洩漏姓名首字', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    t.author.avatarDataUrl = undefined
    const el = mount(t, masked)
    expect(el.querySelector('[data-part="monogram"]')?.textContent).not.toBe('T')
  })

  it('引用推文的作者一併遮蔽', () => {
    const t = parseTweet(fx('quoted'), '2082883636177916306')!
    const el = mount(t, masked)
    expect(el.textContent).not.toContain(t.quoted!.author.handle)
    expect(el.textContent).not.toContain(t.quoted!.author.name)
  })

  it('關閉遮蔽時正常顯示真實身分', () => {
    const el = mount(undefined, { ...DEFAULT_SETTINGS, maskIdentity: false })
    expect(el.textContent).toContain('Tibo')
    expect(el.textContent).toContain('thsottiaux')
  })

  it('遮蔽不影響內文', () => {
    const el = mount(undefined, masked)
    expect(el.textContent).toContain('There will be signs')
  })

  it('預設不遮蔽', () => {
    expect(DEFAULT_SETTINGS.maskIdentity).toBe(false)
  })
})

describe('互動數格式（國際單位，不用中文）', () => {
  const withStats = (views: number) => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    return { ...t, stats: { ...t.stats, views } }
  }
  const statsText = (views: number) =>
    (mount(withStats(views)).querySelector('[data-part="stats"]') as HTMLElement).textContent!

  it('184000 顯示為 184K，不用「萬」', () => {
    expect(statsText(184_000)).toContain('184K')
  })

  it('1500000 顯示為 1.5M', () => {
    expect(statsText(1_500_000)).toContain('1.5M')
  })

  it('整數不留多餘小數位', () => {
    expect(statsText(2_000)).toContain('2K')
    expect(statsText(2_000)).not.toContain('2.0K')
  })

  it('千位以下維持原樣', () => {
    expect(statsText(999)).toContain('999')
  })

  it('統計列完全不含中文字元', () => {
    expect(statsText(184_000)).not.toMatch(/[一-鿿]/)
  })

  it('每組數字設 nowrap，窄卡片上不會從數字與單位之間斷行', () => {
    const stats = mount().querySelector('[data-part="stats"]') as HTMLElement
    const groups = [...stats.querySelectorAll('span')].filter((s) => s.querySelector('svg'))
    expect(groups.length).toBe(4)
    for (const g of groups) expect((g as HTMLElement).style.whiteSpace).toBe('nowrap')
  })
})

describe('發文時間格式', () => {
  const at = (iso: string, timeFormat: 'relative' | 'absolute') => {
    const t = { ...parseTweet(fx('plain'), '2083053369351090254')!, createdAt: iso }
    return (mount(t, { ...DEFAULT_SETTINGS, timeFormat }).querySelector('[data-part="time"]') as HTMLElement)
      .textContent
  }

  it('absolute 顯示完整年月日與時分', () => {
    // 以本地時區呈現，故只斷言格式而非固定字串
    expect(at('2026-07-31T21:54:11.000Z', 'absolute')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('relative 仍是短格式', () => {
    expect(at(new Date(Date.now() - 3 * 3600_000).toISOString(), 'relative')).toBe('3h')
  })

  it('預設為 relative', () => {
    expect(DEFAULT_SETTINGS.timeFormat).toBe('relative')
  })

  it('absolute 遇到無法解析的時間時整個節點不渲染，不留空白列也不顯示 NaN', () => {
    const t = { ...parseTweet(fx('plain'), '2083053369351090254')!, createdAt: 'not-a-date' }
    const el = mount(t, { ...DEFAULT_SETTINGS, timeFormat: 'absolute' })
    expect(el.querySelector('[data-part="time"]')).toBeNull()
    expect(el.textContent).not.toContain('NaN')
  })

  it('absolute 時，時間移出標頭改放內文下方（與統計列同一資訊層）', () => {
    const t = { ...parseTweet(fx('plain'), '2083053369351090254')!, createdAt: '2026-07-31T21:54:11.000Z' }
    const el = mount(t, { ...DEFAULT_SETTINGS, timeFormat: 'absolute' })
    const time = el.querySelector('[data-part="time"]')!
    const stats = el.querySelector('[data-part="stats"]')!
    // 時間節點在統計列之前，且不在標頭（頭像所在的那一列）裡
    expect(time.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 標頭是頭像所在的那一列；時間不該在裡面
    const header = el.querySelector('[data-part="monogram"], img')!.parentElement!
    expect(header.contains(time)).toBe(false)
  })

  it('relative 時，時間仍在標頭右上角', () => {
    const el = mount(undefined, { ...DEFAULT_SETTINGS, timeFormat: 'relative' })
    const time = el.querySelector('[data-part="time"]') as HTMLElement
    expect(time.style.marginLeft).toBe('auto')
  })

  it('關閉「時間」顯示項時，absolute 也不渲染', () => {
    const t = { ...parseTweet(fx('plain'), '2083053369351090254')!, createdAt: '2026-07-31T21:54:11.000Z' }
    const s = { ...DEFAULT_SETTINGS, timeFormat: 'absolute' as const, show: { ...DEFAULT_SETTINGS.show, timestamp: false } }
    expect(mount(t, s).querySelector('[data-part="time"]')).toBeNull()
  })

  it('時間節點設 nowrap，絕對時間不會斷行擠壓作者名', () => {
    const t = { ...parseTweet(fx('plain'), '2083053369351090254')!, createdAt: '2026-07-31T21:54:11.000Z' }
    const el = mount(t, { ...DEFAULT_SETTINGS, timeFormat: 'absolute' })
    expect((el.querySelector('[data-part="time"]') as HTMLElement).style.whiteSpace).toBe('nowrap')
  })
})

// 幾何無法在此驗證：happy-dom 沒有版面引擎，且 useLayoutEffect 裡的
// setState 在測試同步讀取樣式時尚未 flush，所以 height 與 minHeight
// 對所有模式都是相同的空值，彼此無法區分。真正的幾何行為已在真瀏覽器
// 驗證（720 寬：9:16 短文 1280 高、長文長到 1820 且與 auto 一致、不裁切）。
// 這裡守的是「哪個模式走哪條分支」這個決策本身。
describe('9:16 最小高度模式', () => {
  it('9:16 被歸類為最小高度模式', () => {
    expect(MIN_HEIGHT_ASPECTS.has('9:16')).toBe(true)
  })

  it('固定比例不是最小高度模式', () => {
    for (const a of ['1:1', '4:5']) {
      expect(MIN_HEIGHT_ASPECTS.has(a)).toBe(false)
    }
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
    expect(withText('1:1')).toBeLessThan(withText('auto'))
  })

  it('9:16 不截斷內文（不裁切就不需要漸層淡出）', () => {
    const base = parseTweet(fx('plain'), '2083053369351090254')!
    const raw = 'a'.repeat(700)
    const t = { ...base, rawText: raw, text: [{ type: 'text' as const, value: raw }] }
    const body = mount(t, { ...DEFAULT_SETTINGS, aspect: '9:16' }).querySelector('[data-part="body"]') as HTMLElement
    expect(body.style.overflow).not.toBe('hidden')
  })
})
