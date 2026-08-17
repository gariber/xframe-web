import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// web/index.html 硬編了淺色 theme-color（#f3efe8）。web/style.css 另外備了完整
// 的 prefers-color-scheme: dark 主題，深色模式下從 iOS 首頁啟動卻仍會先閃一片
// 米色狀態列，跟馬上出現的近黑色頁面對不上。這裡直接讀原始檔案內容，因為
// 這是靜態 <meta> 標籤，不是執行期行為，happy-dom 也不會執行這個檔案。
const html = readFileSync('web/index.html', 'utf8')

describe('web/index.html 的 theme-color', () => {
  it('保留原本的淺色 theme-color（未加 media 條件，作為預設值）', () => {
    expect(html).toContain('<meta name="theme-color" content="#f3efe8" />')
  })

  it('深色模式有對應的 theme-color，避免啟動畫面在深色系統下閃一片淺色', () => {
    expect(html).toMatch(
      /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#17120f" \/>/,
    )
  })
})

describe('頁面的翻譯邊界', () => {
  it('整頁固定正體中文且不交給瀏覽器翻譯', () => {
    expect(html).toContain('<html lang="zh-Hant">')
    expect(html).toContain('<div id="app" lang="zh-Hant" translate="no"></div>')
  })

  it('不再有 Safari 專用分頁的載入前腳本', () => {
    // 譯文改由使用者從 X 貼上，頁面不再需要為了讓 Safari 提供翻譯選項而
    // 在載入前把自己的語言謊報成英文。
    expect(html).not.toContain('safari-translate')
    expect(html).not.toContain("documentElement.lang = 'en'")
  })
})
