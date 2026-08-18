import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * iOS Safari 會在使用者聚焦一個「計算後字級小於 16px」的文字輸入框或下拉選單時
 * 自動放大整頁，而且失焦之後不會縮回去 —— 使用者貼完譯文，得先雙指把畫面縮小，
 * 才按得到底下的「套用到卡片」。
 *
 * 這個門檻在 happy-dom 驗不到（沒有版面引擎，讀不到計算後的字級），在 Chromium
 * 量得到但 CI 裡沒有 Safari，而真正會出事的行為只發生在 Safari。所以這裡守的是
 * 「不可能踩到門檻」的樣式表結構本身。
 *
 * 曾經踩到門檻的方式有兩種，兩種都要擋：
 *   - `font: inherit` 這個簡寫會把字級一起重設成繼承值。譯文 textarea 包在
 *     .translation-editors label（.8rem）裡，繼承到的是 12.8px，不是 --font
 *     的 15px —— 寫的人多半以為它會拿到 body 的字級。
 *   - select 預設不繼承字體，沒有明確規則時吃的是瀏覽器 UA 預設的 13.33px。
 *
 * 讀兩份檔案：控制項的外觀在共用的設計語彙裡（兩邊同一組樣式），版面才是網頁版
 * 自己的。只讀其中一份，這個守則就會出現破口。
 */
const css =
  readFileSync('src/ui/theme.css', 'utf8') + '\n' + readFileSync('web/style.css', 'utf8')

// 註解裡就寫著這個 bug 的成因（包含 `font: inherit` 這串字），連註解一起掃的話，
// 正確的樣式表會因為解釋自己的歷史而被判失敗。
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

type Rule = { selector: string; body: string }

function parseRules(source: string): Rule[] {
  const out: Rule[] = []
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] })
  }
  return out
}

/*
 * 會被 iOS 放大的元素：文字輸入框、多行輸入框、下拉選單。
 * 按鈕不列入（不接受輸入），range/color/checkbox 也不會觸發，但它們都寫成
 * input[type="…"]，這裡不特別排除 —— 多守幾個不會錯，漏守才會出事。
 */
const ZOOMABLE = /(^|[\s,>+~])(input|textarea|select)\b/

const controlRules = parseRules(rules).filter((r) => ZOOMABLE.test(r.selector))

describe('iOS Safari 表單自動放大門檻', () => {
  it('掃到的控制項規則不是空的（選擇器解析沒有整個失效）', () => {
    expect(controlRules.length).toBeGreaterThan(0)
  })

  it('有一條基準規則替輸入控制項設下 16px 字級下限', () => {
    const base = controlRules.find((r) => /font-size:\s*max\(\s*16px/.test(r.body))
    expect(base, '找不到設定 16px 下限的規則').toBeDefined()
    // 三種控制項都要被這條規則涵蓋，漏掉任何一種，那一種就會觸發放大
    expect(base!.selector).toMatch(/\binput\b/)
    expect(base!.selector).toMatch(/\btextarea\b/)
    expect(base!.selector).toMatch(/\bselect\b/)
  })

  it('沒有任何輸入控制項用 `font:` 簡寫 —— 那會把字級一起重設回繼承值', () => {
    const offenders = controlRules.filter((r) => /(^|;)\s*font:\s/.test(r.body))
    expect(offenders.map((r) => r.selector)).toEqual([])
  })

  it('沒有任何規則把輸入控制項的字級壓到 16px 以下', () => {
    const tooSmall: string[] = []
    for (const rule of controlRules) {
      for (const m of rule.body.matchAll(/font-size:\s*([^;]+)/g)) {
        const value = m[1].trim()
        if (value.startsWith('max(')) continue // 下限已經由 max() 保證
        const px = /^([\d.]+)px$/.exec(value)
        const rem = /^([\d.]+)rem$/.exec(value)
        if (px && Number(px[1]) < 16) tooSmall.push(`${rule.selector} → ${value}`)
        if (rem && Number(rem[1]) < 1) tooSmall.push(`${rule.selector} → ${value}`)
      }
    }
    expect(tooSmall).toEqual([])
  })
})
