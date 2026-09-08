import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

/*
 * Cloudflare Web Analytics 的 beacon 一度只存在於 main 分支的 index.html 上，
 * 從來沒有進過原始碼 —— 它是直接提交到成品分支的（9928ac1）。而部署流程是
 * 「整包覆蓋 dist-web」，所以只要有人照著流程部署一次，這段就會被靜靜地刪掉，
 * 網站的流量統計從此停止，沒有任何錯誤訊息。實際上就發生過一次。
 *
 * 跟 CNAME 同樣的解法：把它放進 web/index.html，讓它成為建置產物的一部分，
 * 整包覆蓋反而變成正確的做法。這裡兩邊都驗 —— 原始檔保證意圖還在，建置產物
 * 保證它真的會被部署出去。
 */
const TOKEN = '23b710d8984049ed807280ba7c55be6c'
const BEACON = 'static.cloudflareinsights.com/beacon.min.js'
const DIST = 'dist-web/index.html'

describe('Cloudflare Web Analytics beacon', () => {
  it('原始檔帶著 beacon 與 token', () => {
    const html = readFileSync('web/index.html', 'utf8')
    expect(html).toContain(BEACON)
    expect(html).toContain(TOKEN)
  })

  if (!existsSync(DIST)) {
    it('dist-web/index.html 存在', () => {
      throw new Error(
        `找不到 ${DIST}。這個測試檢查的是建置產物 —— 請先執行 \`npm run build:web\` 再重新跑這個測試檔。`,
      )
    })
    return
  }

  it('建置產物也帶著它，整包覆蓋部署不會再把統計弄丟', () => {
    const html = readFileSync(DIST, 'utf8')
    expect(html).toContain(BEACON)
    expect(html).toContain(TOKEN)
  })
})
