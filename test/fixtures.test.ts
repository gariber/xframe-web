import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

const NAMES = ['plain', 'quoted', 'media', 'quoted-with-media']

describe('fixtures', () => {
  it.each(NAMES)('%s 存在且含 microdata article', (name) => {
    const path = `test/fixtures/${name}.html`
    expect(existsSync(path)).toBe(true)
    const html = readFileSync(path, 'utf8')
    expect(html.length).toBeGreaterThan(100_000)
    expect(html).toContain('itemType="https://schema.org/SocialMediaPosting"')
    expect(html).toContain('data-tweet-id')
  })

  it('quoted fixture 含引用推文', () => {
    const html = readFileSync('test/fixtures/quoted.html', 'utf8')
    expect(html).toContain('itemProp="citation"')
  })

  it('media fixture 含推文圖片', () => {
    const html = readFileSync('test/fixtures/media.html', 'utf8')
    expect(html).toContain('pbs.twimg.com/media/')
  })
})

/**
 * 上面那批 fixture 全是舊版格式（itemprop="author"/"text"/"interactionStatistic"）。
 * X 在 2026-08 把公開頁面換成新版 SSR 之後，那些欄位都不見了，但所有測試依然全綠
 * —— 公開抓取整條壞掉、無聲退化成 DOM 路徑，卻沒有任何一個測試察覺。
 *
 * 這組 fixture 存在的意義就是不讓同樣的事再發生一次：它們必須維持新版的形狀，
 * 也就是「沒有 itemprop=text，只能靠 permalink + 可見作者連結 + title + 可見正文
 * 交叉驗證」。
 */
const VISIBLE_SSR = ['visible-ssr-media', 'visible-ssr-reply']

describe('新版 SSR fixtures（2026-08 實抓）', () => {
  it.each(VISIBLE_SSR)('%s 是新版形狀：有 article 但沒有結構化 text/author', (name) => {
    const path = `test/fixtures/${name}.html`
    expect(existsSync(path)).toBe(true)
    const html = readFileSync(path, 'utf8')

    expect(html).toContain('itemType="https://schema.org/SocialMediaPosting"')
    expect(html).toContain('data-tweet-id')
    // 這三個正是新版拿掉的東西。哪天又出現了，代表 X 改回來了，該回頭確認
    // parseVisibleArticle 這條 fallback 是不是還有必要。
    expect(html).not.toMatch(/itemProp="text"/i)
    expect(html).not.toMatch(/itemProp="author"/i)
    expect(html).not.toMatch(/itemProp="interactionStatistic"/i)
  })

  it('抓取時固定送英文，所以 fixture 必須是英文版的 title 與 aria-label', () => {
    for (const name of VISIBLE_SSR) {
      const html = readFileSync(`test/fixtures/${name}.html`, 'utf8')
      expect(html).toContain(' on X: &quot;')
      expect(html).toContain('aria-label="Reply"')
    }
  })

  /*
   * 這一份刻意是**日文版**：title 樣板、操作列 aria-label、瀏覽數單位詞全部是
   * 在地化的。解析不得依賴任何一個英文字串 —— 我們雖然固定以英文抓取，但 X 的
   * 語系判定不只看 Accept-Language，實測無法從單一環境完全控制。
   */
  it('在地化 fixture 確實不含任何英文錨點', () => {
    const html = readFileSync('test/fixtures/visible-ssr-localized.html', 'utf8')
    expect(html).not.toContain(' on X: &quot;')
    expect(html).not.toContain('aria-label="Reply"')
    expect(html).toContain('aria-label="返信"')
    // og:description 是唯一不被在地化的內文來源，解析靠它
    expect(html).toContain('property="og:description"')
  })

  it('reply fixture 的 title 帶著被回覆對象的帳號，可見正文不帶（這正是退化成因）', () => {
    const html = readFileSync('test/fixtures/visible-ssr-reply.html', 'utf8')
    expect(html).toMatch(/<title>[^<]*on X: &quot;@basarafire /)
  })
})
