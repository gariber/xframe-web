import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import { parseTweet } from '../../src/parse/microdata'
import { readFileSync } from 'node:fs'
import type { CardSettings } from '../../src/types'

const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8')

function mount(tweet = parseTweet(fx('plain'), '2083053369351090254')!, settings = DEFAULT_SETTINGS) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card post={tweet} settings={settings} />, host)
  return host
}

describe('Card', () => {
  it('顯示作者名稱與帳號', () => {
    const el = mount()
    expect(el.textContent).toContain('Tibo')
    expect(el.textContent).toContain('@thsottiaux')
  })

  it('作者帳號用 handleDisplay 原樣輸出，不由卡片加前綴', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    const el = mount({ ...t, author: { ...t.author, handleDisplay: '＠自訂前綴' } })
    expect(el.textContent).toContain('＠自訂前綴')
    // 卡片若仍自己加 @，會變成 '@＠自訂前綴'
    expect(el.textContent).not.toContain('@＠自訂前綴')
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

  it('引用推文的帳號同樣用 handleDisplay，不由卡片加前綴', () => {
    // 外層與引用推文是 Card 裡兩處各自寫死 @ 的地方，只改一處等於沒改完。
    // 用全形＠當標記：卡片若仍自己補半形 @，會變成 '@＠引用自訂'。
    const t = parseTweet(fx('quoted'), '2082883636177916306')!
    t.quoted!.author.handleDisplay = '＠引用自訂'
    const quoted = mount(t).querySelector('[data-part="quoted"]') as HTMLElement
    expect(quoted.textContent).toContain('＠引用自訂')
    expect(quoted.textContent).not.toContain('@＠引用自訂')
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
    t.metrics = t.metrics.map((m) =>
      m.kind === 'replies' ? { ...m, value: null } : m.kind === 'reposts' ? { ...m, value: 0 } : m,
    )
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
// 的地方，也是唯一在這個環境裡可觀察、且會在 revert 後失敗的東西。真實比例
// 與內容縮放仍需要在瀏覽器驗證；固定 height 與縮放計算的純邏輯則由
// card.css.test.ts 守住。
describe('比例的版面樣式與字級收斂（Fix 1）', () => {
  it.each(['auto', '1:1', '4:5', '9:16'] as const)(
    'canvas 節點不設定 CSS 的 aspect-ratio（改用量測出來的固定 height）',
    (aspect) => {
      const s = { ...DEFAULT_SETTINGS, aspect }
      const el = mount(undefined, s)
      const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
      expect(canvas.style.aspectRatio).toBe('')
    },
  )

  it('canvas 節點設定 minHeight:0 與 overflow:hidden，避免內容把固定比例撐開', () => {
    const el = mount()
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    expect(canvas.style.minHeight).toBe('0px')
    expect(canvas.style.overflow).toBe('hidden')
  })

  it('非 auto 比例下，同一段文字的字級比 auto 模式更小（ASPECT_SHRINK 讓中等長度貼文仍落在精確比例上）', () => {
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
})

describe('固定比例的媒體填滿版面', () => {
  const mediaTweet = () => {
    const t = parseTweet(fx('media'), '2083061426923475451')!
    return { ...t, media: t.media.map((m) => ({ ...m, dataUrl: 'data:image/png;base64,eA==' })) }
  }

  it.each(['1:1', '4:5', '9:16'] as const)(
    '%s 有圖片時面板維持滿寬滿高，不再整張縮成小卡',
    (aspect) => {
      const el = mount(mediaTweet(), { ...DEFAULT_SETTINGS, aspect, padding: 28 })
      const panel = el.querySelector('[data-part="panel"]') as HTMLElement
      expect(panel.style.width).toBe('100%')
      expect(panel.style.height).toBe('100%')
      expect(panel.style.transform).toBe('')
      expect(panel.style.display).toBe('flex')
      expect(panel.style.overflow).toBe('hidden')
    },
  )

  it.each(['1:1', '4:5', '9:16'] as const)(
    '%s 讓圖片區吃滿剩餘高度，原圖以 contain 完整顯示',
    (aspect) => {
      const el = mount(mediaTweet(), { ...DEFAULT_SETTINGS, aspect })
      const media = el.querySelector('[data-part="media"]') as HTMLElement
      const tile = media.querySelector('[data-part="media-tile"]') as HTMLElement
      const image = media.querySelector('[data-part="media-image"]') as HTMLElement
      expect(media.style.flex).toBe('1 1 0px')
      expect(media.style.minHeight).toBe('0px')
      expect(tile.style.overflow).toBe('hidden')
      expect(image.style.height).toBe('100%')
      expect(image.style.objectFit).toBe('contain')
    },
  )

  it('固定比例以同圖模糊背景填補比例差，不留下生硬空白邊', () => {
    const el = mount(mediaTweet(), { ...DEFAULT_SETTINGS, aspect: '4:5' })
    const backdrop = el.querySelector('[data-part="media-backdrop"]') as HTMLElement
    expect(backdrop).not.toBeNull()
    expect(backdrop.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop.style.objectFit).toBe('cover')
    expect(backdrop.style.filter).toContain('blur(20px)')
  })

  it('auto 維持原本的完整圖片與內容高度', () => {
    const el = mount(mediaTweet(), { ...DEFAULT_SETTINGS, aspect: 'auto' })
    const panel = el.querySelector('[data-part="panel"]') as HTMLElement
    const media = el.querySelector('[data-part="media"]') as HTMLElement
    const image = media.querySelector('[data-part="media-image"]') as HTMLElement
    expect(panel.style.height).toBe('')
    expect(panel.style.display).toBe('')
    expect(media.style.flex).toBe('')
    expect(image.style.height).toBe('')
    expect(image.style.objectFit).toBe('')
    expect(media.querySelector('[data-part="media-backdrop"]')).toBeNull()
  })

  it('9:16 標記在 canvas，讓固定比例匯出與安全區共用同一個模式', () => {
    const el = mount(mediaTweet(), { ...DEFAULT_SETTINGS, aspect: '9:16', padding: 28 })
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    // happy-dom 會丟棄含 CSS max() 的 padding shorthand，實際數值由
    // card.css.test.ts 的純函式與真瀏覽器幾何驗證。
    expect(canvas.dataset.aspect).toBe('9:16')
  })
})

describe('canvas 節點的 box-sizing', () => {
  it('canvas 節點設定 box-sizing:border-box，讓固定 height 與量測寬度是同一套座標系', () => {
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
    return { ...t, metrics: t.metrics.map((m) => (m.kind === 'views' ? { ...m, value: views } : m)) }
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

// ASPECT_SHRINK 表裡 9:16 的係數是 1（跟 auto 一樣不預先縮字），
// 1:1／4:5 才縮；最終放不下時仍由整張面板等比縮放。
describe('9:16 字級不縮', () => {
  it('9:16 不套用縮字係數，與 auto 相同；1:1 才縮', () => {
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
})

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
    // maskImage 用 toBeFalsy 而非 toBe('')：happy-dom 15.11.7 的
    // CSSStyleDeclaration 只預先定義了一份標準 CSS 屬性清單（maxHeight 在
    // 內），mask-image 不在清單裡——沒被賦值過的話讀回是 undefined，賦值過
    // 一次（哪怕是空字串）之後才會變成 ''。這裡的程式碼已完全不再賦值
    // maskImage（見 Card.tsx 內文 style），所以讀回的是 undefined 而非 ''，
    // 跟「有沒有套遮罩」這件事本身無關。toBeFalsy 兩種空值都收，但遇到真的
    // 塞回一個漸層字串（截斷邏輯復辟）時仍會是 truthy 而失敗，守備力不變。
    expect(body.style.maskImage).toBeFalsy()
    // overflow 是被刪掉的四個 body 屬性之一，maxHeight／maskImage 已有斷言
    // 守著，這裡補上 overflow：截斷路徑復辟的話這行會變回 'hidden'。
    expect(body.style.overflow).not.toBe('hidden')
    // 第四個被刪掉的屬性 WebkitMaskImage 沒有斷言，是因為它測不到而不是遺漏：
    // 實測把 WebkitMaskImage 設成漸層字串後，body.style.webkitMaskImage 仍讀回
    // 空值，這則測試照樣通過。加一個永遠不會紅的斷言比不加更糟 —— 它讓人以為
    // 這個屬性有人看著。真正守住遮罩的是上面的 maskImage（實測會紅）。
  })

  it('畫布不用淡出遮罩假裝比例成立', () => {
    const el = mount(longTweet(), { ...DEFAULT_SETTINGS, aspect: '4:5' })
    const canvas = el.querySelector('[data-part="canvas"]') as HTMLElement
    // 同上一則測試：maskImage 不在 happy-dom 預先定義的 CSS 屬性清單裡，
    // 未賦值過會讀回 undefined 而非 ''，toBeFalsy 兩者都收。
    expect(canvas.style.maskImage).toBeFalsy()
    // happy-dom 沒有版面引擎，offsetWidth 恆為 0，因此固定高度的實際幾何由
    // 真瀏覽器驗證；純函式輸出由 card.css.test.ts 守著。
  })

  it('量測無效時不誤縮面板，縮放原點固定在中心', () => {
    const el = mount(longTweet(), { ...DEFAULT_SETTINGS, aspect: '1:1' })
    const panel = el.querySelector('[data-part="panel"]') as HTMLElement
    expect(panel.style.transform).toBe('')
    expect(panel.style.transformOrigin).toBe('center center')
  })
})

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
