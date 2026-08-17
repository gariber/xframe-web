import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

/*
 * 面板的樣式是用 `?inline` 以字串形式打進 content script，再塞進 shadow root 的
 * 一個 <style> 裡。共用的設計語彙（src/ui/theme.css）是靠 CSS `@import` 拉進來的，
 * 而 `@import` 能不能在 `?inline` 的情境下被 Vite 就地展開，是建置管線的行為，
 * 不是原始檔案的性質 —— panel.css 本身永遠看起來是對的。
 *
 * 萬一哪天沒展開，shadow root 裡就只剩一行 `@import`（相對路徑在 shadow root 裡
 * 也解不到），面板會失去全部 token：顏色變成瀏覽器預設、深色模式消失、觸控尺寸
 * 消失。這種壞法不會拋錯、不會有測試變紅，只有使用者看到一個醜面板。
 *
 * 所以直接讀建置產物，驗證 token 真的在裡面。跟 test/manifest.dist.test.ts、
 * test/icons.dist.test.ts 同一個理由：要驗的是「Chrome 實際會載入的東西」。
 */
const DIST_ASSETS = 'dist/assets'

describe('面板樣式的建置產物（shadow DOM 內嵌 CSS）', () => {
  if (!existsSync(DIST_ASSETS)) {
    it('dist/assets 存在', () => {
      throw new Error(
        `找不到 ${DIST_ASSETS}。這個測試檢查的是建置產物 —— 請先執行 \`npm run build\` 再重新跑這個測試檔。`,
      )
    })
    return
  }

  // content script 的 bundle：檔名帶 hash，用前綴找。
  const entry = readdirSync(DIST_ASSETS)
    .filter((f) => f.startsWith('index.tsx-') && f.endsWith('.js') && !f.includes('loader'))
    .map((f) => readFileSync(`${DIST_ASSETS}/${f}`, 'utf8'))
    .find((src) => src.includes('.xf-panel'))

  it('找得到含面板樣式的 content script bundle', () => {
    expect(entry).toBeDefined()
  })

  it('@import 已就地展開：token 真的在 shadow root 的 CSS 裡', () => {
    expect(entry).toContain(':root,:host{')
    for (const token of ['--ink:', '--ground:', '--card:', '--line:', '--accent:', '--tap:']) {
      expect(entry).toContain(token)
    }
  })

  it('深色模式一起被打包進來', () => {
    expect(entry).toContain('prefers-color-scheme')
  })

  it('共用元件樣式（可收合分區、色票）也在裡面', () => {
    expect(entry).toContain('.sheet-head')
    expect(entry).toContain('.swatches')
  })

  it('沒有殘留未展開的 @import —— 那在 shadow root 裡解不到相對路徑', () => {
    // 只看面板 CSS 那一段：modern-screenshot 自己的程式碼裡有處理 @import 的
    // 正規表示式，整份檔案掃會誤判。
    const css = entry!.slice(entry!.indexOf(':root,:host{'), entry!.indexOf('.xf-protected'))
    expect(css).not.toContain('@import')
  })
})
