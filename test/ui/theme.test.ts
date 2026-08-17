import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * 網頁版與擴充功能面板曾各自寫死一套顏色與尺寸：手機上是 #f3efe8 的底、支援
 * 深色模式、觸控目標 44px；擴充功能裡卻是 #faf7f2、永遠亮色、按鈕沒有尺寸下限。
 * 同一個產品長成兩個樣子。
 *
 * 這組測試守住「只有一份設計語彙」這件事本身 —— 顏色實際畫出來對不對要靠眼睛，
 * 但「兩邊是不是從同一個來源取用」是可以驗的。
 */
const theme = readFileSync('src/ui/theme.css', 'utf8')
const webCss = readFileSync('web/style.css', 'utf8')
const panelCss = readFileSync('src/editor/panel.css', 'utf8')

describe('共用設計語彙', () => {
  it('兩邊都 import 同一份 theme.css', () => {
    expect(webCss).toMatch(/@import\s+['"][^'"]*ui\/theme\.css['"]/)
    expect(panelCss).toMatch(/@import\s+['"][^'"]*ui\/theme\.css['"]/)
  })

  // 面板活在 shadow root 裡，:root 不會命中它；網頁版是一般文件，:host 不會命中。
  // 兩個都列才能一份檔案供兩邊使用。CSS 的選擇器列表只要有一個「無效」就整條
  // 被丟掉，而「不命中」不等於「無效」—— 這正是這個寫法成立的原因。
  it('token 同時定義在 :root 與 :host，兩種掛載方式都取得到', () => {
    expect(theme).toMatch(/:root,\s*:host\s*\{/)
  })

  it('深色模式也定義在同一份，兩邊一起生效', () => {
    expect(theme).toContain('prefers-color-scheme: dark')
    const dark = theme.slice(theme.indexOf('prefers-color-scheme: dark'))
    for (const token of ['--ink', '--ground', '--card', '--line', '--accent']) {
      expect(dark).toContain(`${token}:`)
    }
  })

  it.each(['--ink', '--ink-soft', '--ink-faint', '--line', '--ground', '--card', '--accent', '--tap'])(
    'token %s 由 theme.css 定義',
    (token) => expect(theme).toMatch(new RegExp(`${token}:\\s*\\S`)),
  )

  // 面板從前寫死 #faf7f2 底色、#e2ddd4 框線這類值，和手機版差一點點又不完全一樣，
  // 是最難發現的那種不一致。
  it('面板不再寫死顏色，一律走 token', () => {
    const withoutComments = panelCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const hex = [...withoutComments.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0])
    // 唯一的例外是鎖推提醒的警示色：它本來就該跳出既有色階，且深淺兩色各一組。
    const protectedBlock = withoutComments.slice(withoutComments.indexOf('.xf-protected'))
    for (const c of hex) expect(protectedBlock).toContain(c)
  })

  it('觸控目標尺寸來自 token，不是各寫各的數字', () => {
    expect(theme).toMatch(/--tap:\s*44px/)
    expect(theme).toMatch(/min-height:\s*var\(--tap\)/)
  })
})

describe('共用元件樣式', () => {
  it.each(['.sheet', '.sheet-head', '.sheet-body', '.swatches', '.hint', '.hint-inline', '.msg', '.err', '.sr-only'])(
    '%s 定義在 theme.css，不在任何一邊的私有樣式表',
    (sel) => {
      expect(theme).toContain(`${sel} `)
      expect(webCss).not.toMatch(new RegExp(`^\\${sel}\\s*\\{`, 'm'))
      expect(panelCss).not.toMatch(new RegExp(`^\\${sel}\\s*\\{`, 'm'))
    },
  )

  it('主要動作按鈕的樣式只有一份', () => {
    expect(theme).toContain('button.primary')
    expect(webCss).not.toContain('button.primary')
    expect(panelCss).not.toContain('button.primary')
  })
})
