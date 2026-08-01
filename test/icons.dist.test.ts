import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'

// scripts/make-icons.py 曾經對兩個輸出目錄用同一份 SIZES 清單（含 180/512），
// 但 manifest.config.ts 只宣告 16/32/48/128 —— 180/512 是 PWA 專用的
// apple-touch-icon／大尺寸圖示，混進擴充功能的 dist/icons 只是白佔 Web Store
// 上傳包空間。跟 test/manifest.dist.test.ts 同樣的理由：這是建置產物的性質，
// 不是原始檔案（scripts/make-icons.py）的性質，直接讀 dist/ 才驗證得到「Chrome
// 實際會打包的東西」。dist/ 不存在時給出明確訊息，而不是安靜略過。
const DIST_ICONS = 'dist/icons'

describe('擴充功能圖示（dist/icons，不是 public/icons 這份輸入）', () => {
  if (!existsSync(DIST_ICONS)) {
    it('dist/icons 存在', () => {
      throw new Error(
        `找不到 ${DIST_ICONS}。這個測試檢查的是建置產物 —— 請先執行 \`npm run build\` 再重新跑這個測試檔。`,
      )
    })
    return
  }

  const files = readdirSync(DIST_ICONS).sort()

  it('只有 manifest.config.ts 宣告的四個尺寸', () => {
    expect(files).toEqual(['icon128.png', 'icon16.png', 'icon32.png', 'icon48.png'])
  })

  it('不含 PWA 專用的 180/512（未在 manifest 宣告，屬於死重量）', () => {
    expect(files).not.toContain('icon180.png')
    expect(files).not.toContain('icon512.png')
  })
})
