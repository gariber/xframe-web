import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

/*
 * 自訂網域靠 GitHub Pages 成品分支根目錄的 CNAME 檔案。它一度只存在於 main
 * 分支上、不由建置產生，所以每次部署都得記得「覆蓋 dist-web 時要排除 CNAME」——
 * 漏掉一次，Pages 就會把自訂網域退回 github.io，xframe.gariber.studio 直接失效。
 *
 * 改放進 web/public/ 之後由 vite 自動複製（web 是 build 的 root，vite 預設
 * publicDir 就是 <root>/public），部署流程可以整包覆蓋，不必再記得例外。
 *
 * 這裡驗建置產物而不是原始檔：會不會進到部署包才是重點，而「原始檔存在」不保證
 * 這件事——publicDir 被改掉、或 root 被改掉，原始檔都還在，CNAME 卻不會被複製。
 * 跟 test/icons.dist.test.ts 同樣的理由。
 */
const CNAME = 'dist-web/CNAME'
const DOMAIN = 'xframe.gariber.studio'

describe('GitHub Pages 自訂網域（dist-web/CNAME）', () => {
  if (!existsSync(CNAME)) {
    it('dist-web/CNAME 存在', () => {
      throw new Error(
        `找不到 ${CNAME}。這個測試檢查的是建置產物 —— 請先執行 \`npm run build:web\` 再重新跑這個測試檔。`,
      )
    })
    return
  }

  it('建置產物內含 CNAME，部署時整包覆蓋也不會弄丟自訂網域', () => {
    expect(readFileSync(CNAME, 'utf8').trim()).toBe(DOMAIN)
  })

  it('沒有多餘的空白或換行 —— Pages 會照字面解析這個檔案', () => {
    expect(readFileSync(CNAME, 'utf8')).toBe(DOMAIN)
  })
})
