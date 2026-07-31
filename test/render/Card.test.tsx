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
