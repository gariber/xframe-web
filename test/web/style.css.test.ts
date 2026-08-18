import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * 預覽卡片是 position: sticky，捲動時黏在畫面頂端，其餘內容應該從它「底下」
 * 經過——.preview 自己的註解就是這樣寫的。
 *
 * 翻譯面板一度是 z-index: 6，比 .preview 的 5 高一級，於是它反過來蓋在卡片
 * 上面：調整卡片樣式時整張卡被面板遮掉一大塊，而那正是使用者最需要看到卡片
 * 的時候。
 *
 * 這種疊層關係在 happy-dom 驗不到（沒有版面引擎，讀不到計算後的樣式），真實
 * 瀏覽器驗證又要先抓到一則推文。所以直接讀樣式表本身：規則寫錯就擋下來。
 */
/*
 * 翻譯面板的樣式已移進共用的設計語彙（兩邊用同一個 TranslationPanel 元件），
 * 而 .preview 仍是網頁版自己的版面。疊層關係要跨這兩份檔案才看得完整，所以
 * 合起來檢查 —— 只讀其中一份，這個守則就會出現破口。
 *
 * 刻意不含 src/editor/panel.css：面板是 position: fixed 的側欄，用的是
 * 2147483647 去壓過 x.com 自己的介面，和這裡談的頁內疊層是兩回事。
 */
const css = readFileSync('src/ui/theme.css', 'utf8') + '\n' + readFileSync('web/style.css', 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(selector + ' {')
  if (start < 0) throw new Error(`樣式表裡找不到 ${selector}`)
  return css.slice(start, css.indexOf('}', start))
}

describe('捲動時的疊層關係', () => {
  it('黏在頂端的預覽有 z-index', () => {
    expect(ruleBody('.preview')).toMatch(/z-index:\s*5\b/)
  })

  it('翻譯面板不設 z-index，才會從預覽底下經過而不是蓋在上面', () => {
    expect(ruleBody('.translation-guide')).not.toContain('z-index')
  })

  it('整份樣式表裡沒有任何規則的 z-index 高過預覽', () => {
    // 先剝掉註解再掃：說明那個 bug 的文字本身就含有「z-index: 6」，
    // 連註解一起掃的話，正確的樣式表會因為解釋自己的歷史而被判失敗。
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const levels = [...rules.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1]))
    expect(levels.length).toBeGreaterThan(0)
    expect(Math.max(...levels)).toBe(5)
  })
})
