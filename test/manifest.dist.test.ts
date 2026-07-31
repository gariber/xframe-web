import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// test/manifest.test.ts 只驗證 manifest.config.ts —— 那是「餵給 CRXJS 的輸入」，
// 不是 Chrome 真正載入的東西。CRXJS 會改寫它：目前的 dist/manifest.json 就多了
// 一段原始檔案完全沒有的 web_accessible_resources，腳本路徑也被換成雜湊過的
// 檔名。權限守則是「產物」的性質，不是輸入的性質，所以必須直接讀建置產出來驗證。
// @crxjs/vite-plugin 釘死在 beta range（^2.0.0-beta.28），這件事之後很可能變化，
// 所以這個測試不呼叫 build，只負責在 dist/manifest.json 缺席時給出明確訊息，
// 而不是安靜地整組略過或恰好通過。
const DIST_MANIFEST = 'dist/manifest.json'

describe('manifest 權限守則（建置產出 dist/manifest.json，不是原始的 manifest.config.ts）', () => {
  if (!existsSync(DIST_MANIFEST)) {
    it('dist/manifest.json 存在', () => {
      throw new Error(
        `找不到 ${DIST_MANIFEST}。這個測試檢查的是 Chrome 實際載入的建置產物，不是 manifest.config.ts ` +
          '這份輸入 —— 請先執行 `npm run build` 產生 dist/，再重新跑這個測試檔。',
      )
    })
    return
  }

  const manifest = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8'))

  it('permissions 只有 storage', () => {
    expect(manifest.permissions).toEqual(['storage'])
  })

  it('host_permissions 恰為四項且一字不差', () => {
    expect(manifest.host_permissions).toEqual([
      '*://x.com/*',
      '*://twitter.com/*',
      '*://pbs.twimg.com/*',
      '*://abs.twimg.com/*',
    ])
  })

  it('絕不出現高風險權限', () => {
    const all = JSON.stringify(manifest)
    for (const banned of ['<all_urls>', '"tabs"', 'webRequest', '"cookies"']) {
      expect(all).not.toContain(banned)
    }
  })

  it('是 manifest v3', () => {
    expect(manifest.manifest_version).toBe(3)
  })
})
