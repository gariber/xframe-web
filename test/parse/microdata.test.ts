import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseTweet, extractTweetId, decodeEntities, stripTrailingLink, fullTextFromTitle,
} from '../../src/parse/microdata'

const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8')

const VISIBLE_ONLY_ID = '2088048454077763827'
const VISIBLE_ONLY_NAME = 'Aoi | Digital Cat Life🐾もな'
const VISIBLE_ONLY_HANDLE = 'basarafire'
const VISIBLE_ONLY_TEXT = '「いってらっしゃい。ニンゲン」'

function visibleOnlyHtml({
  titleText = VISIBLE_ONLY_TEXT,
  visibleText = VISIBLE_ONLY_TEXT,
  permalink = `https://x.com/${VISIBLE_ONLY_HANDLE}/status/${VISIBLE_ONLY_ID}`,
  metrics = true,
} = {}): string {
  return `<!doctype html>
    <html>
      <head><title>${VISIBLE_ONLY_NAME} on X: "${titleText}" / X</title></head>
      <body>
        <article data-tweet-id="${VISIBLE_ONLY_ID}" itemtype="https://schema.org/SocialMediaPosting">
          <meta itemprop="dateCreated" content="2026-08-13T23:42:00.000Z">
          <meta itemprop="datePublished" content="2026-08-13T23:42:00.000Z">
          <meta itemprop="url" content="${permalink}">
          <div>
            <a href="https://x.com/${VISIBLE_ONLY_HANDLE}">${VISIBLE_ONLY_NAME}</a>
            <a href="https://x.com/${VISIBLE_ONLY_HANDLE}">@${VISIBLE_ONLY_HANDLE}</a>
            <img src="https://pbs.twimg.com/profile_images/2077732264398782464/w2OVbwE6_normal.jpg" alt="user avatar">
            <div dir="auto"><span>${visibleText}</span></div>
            ${metrics ? `
              <a href="/${VISIBLE_ONLY_HANDLE}/status/${VISIBLE_ONLY_ID}">
                <span>1.3萬</span><span>Views</span>
              </a>
              <span><button aria-label="Reply"></button><button><span data-animated-count-visual="true">3</span></button></span>
              <span><button aria-label="Repost"></button><button><span data-animated-count-visual="true">77</span></button></span>
              <span><button aria-label="Like"></button><button><span data-animated-count-visual="true">1155</span></button></span>
            ` : ''}
            <div itemprop="image">
              <img src="https://pbs.twimg.com/media/HPo8v-gaEAAHsFx?format=webp&amp;name=medium" alt="">
            </div>
          </div>
        </article>
      </body>
    </html>`
}

describe('extractTweetId', () => {
  it('從永久連結取出 ID', () => {
    expect(extractTweetId('https://x.com/thsottiaux/status/2083053369351090254'))
      .toBe('2083053369351090254')
  })
  it('容忍尾綴路徑', () => {
    expect(extractTweetId('https://x.com/a/status/123/photo/1')).toBe('123')
  })
  it('非推文網址回傳 null', () => {
    expect(extractTweetId('https://x.com/thsottiaux')).toBeNull()
  })
})

describe('parseTweet 基本欄位', () => {
  const t = parseTweet(fx('plain'), '2083053369351090254')!

  it('解析成功', () => expect(t).not.toBeNull())
  it('id', () => expect(t.id).toBe('2083053369351090254'))
  it('url', () => expect(t.url).toContain('/status/2083053369351090254'))
  it('作者名稱', () => expect(t.author.name).toBe('Tibo'))
  it('作者帳號不含 @', () => expect(t.author.handle).toBe('thsottiaux'))
  it('頭像網址', () => expect(t.author.avatarUrl).toContain('pbs.twimg.com/profile_images/'))
  it('內文', () => expect(t.rawText).toContain('There will be signs'))
  it('建立時間為 ISO 8601', () =>
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/))
})

describe('parseTweet 互動數', () => {
  const t = parseTweet(fx('plain'), '2083053369351090254')!
  const KINDS = ['replies', 'reposts', 'likes', 'views'] as const
  const metricOf = (kind: (typeof KINDS)[number]) => t.metrics.find((m) => m.kind === kind)!.value

  it('四個欄位皆為數字', () => {
    for (const k of KINDS) {
      expect(typeof metricOf(k)).toBe('number')
    }
  })
  it('讚數為正整數', () => expect(metricOf('likes')!).toBeGreaterThan(0))
  it('瀏覽數大於讚數', () => expect(metricOf('views')!).toBeGreaterThan(metricOf('likes')!))
  it('不把作者的追蹤者數誤當成推文統計', () => {
    // 作者有 37 萬追蹤者；推文的任何統計都不應等於該值
    const followers = 378_000
    for (const m of t.metrics) {
      expect(Math.abs((m.value ?? 0) - followers)).toBeGreaterThan(5_000)
    }
  })
})

describe('parseTweet metrics', () => {
  it('依 X 的顯示順序產出，不是解析順序', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.metrics.map((m) => m.kind)).toEqual(['views', 'replies', 'reposts', 'likes'])
  })

  it('缺漏的欄位是 null 而非 0 —— 呼叫端要分得出「沒有這個數字」和「數字是零」', () => {
    const t = parseTweet('<article data-tweet-id="1" itemtype="https://schema.org/SocialMediaPosting">' +
      '<meta itemprop="identifier" content="1">' +
      '<meta itemprop="text" content="hi">' +
      '<div itemprop="author"><meta itemprop="name" content="A"><meta itemprop="alternateName" content="a"></div>' +
      '</article>', '1')!
    expect(t.metrics.every((m) => m.value === null)).toBe(true)
  })
})

describe('parseTweet 巢狀引用推文隔離', () => {
  // quoted.html: 外層推文 2082883636177916306 內嵌了引用推文（citation）
  // 2082878156483219672。兩者的 interactionStatistic 數字必須完全不同，
  // 若 parseMetrics 不小心用了非直接子層的 querySelectorAll，會把 citation
  // 的統計也掃進來，依 DOM 順序覆蓋掉外層自己的值。
  //
  // 以下期望值皆直接從 test/fixtures/quoted.html 的原始 markup 讀出，
  // 不是憑空捏造：
  //   外層 article（data-tweet-id="2082883636177916306"）自己的
  //   interactionStatistic 區塊：Likes=8015 Retweets=367
  //   Replies=1003 Views=1096657
  //   巢狀 citation article（data-tweet-id="2082878156483219672"）自己的
  //   interactionStatistic 區塊：Replies=982 Retweets=1600
  //   Likes=16299 Views=5928637
  const t = parseTweet(fx('quoted'), '2082883636177916306')!
  const KINDS = ['replies', 'reposts', 'likes', 'views'] as const
  const metricOf = (tw: typeof t, kind: (typeof KINDS)[number]) =>
    tw.metrics.find((m) => m.kind === kind)!.value

  it('外層推文統計取自外層自己的區塊，而非巢狀引用推文', () => {
    expect(t).not.toBeNull()
    expect(metricOf(t, 'replies')).toBe(1003)
    expect(metricOf(t, 'reposts')).toBe(367)
    expect(metricOf(t, 'likes')).toBe(8015)
    expect(metricOf(t, 'views')).toBe(1096657)
  })

  it('外層推文統計不等於巢狀引用推文的統計（防止未加範圍限制的迴歸）', () => {
    const citation = { replies: 982, reposts: 1600, likes: 16299, views: 5928637 }
    for (const k of KINDS) {
      expect(metricOf(t, k)).not.toBe(citation[k])
    }
  })
})

describe('parseTweet 失敗路徑', () => {
  it('找不到指定 ID 時回傳 null', () => {
    expect(parseTweet(fx('plain'), '9999999999999999999')).toBeNull()
  })
  it('空字串回傳 null', () => {
    expect(parseTweet('', '123')).toBeNull()
  })
  it('無 microdata 的 HTML 回傳 null', () => {
    expect(parseTweet('<html><body><p>hi</p></body></html>', '123')).toBeNull()
  })
})

describe('parseTweet 圖片', () => {
  it('抓到推文自己的圖片', () => {
    const t = parseTweet(fx('media'), '2083061426923475451')!
    expect(t.media.length).toBeGreaterThan(0)
    expect(t.media[0].url).toContain('pbs.twimg.com/media/')
  })

  it('純文字推文的 media 為空陣列', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.media).toEqual([])
  })

  it('不把引用推文的圖片算成外層推文的圖片', () => {
    const t = parseTweet(fx('quoted-with-media'), '2082981910209540352')!
    const quotedUrls = new Set(t.quoted?.media.map((m) => m.url) ?? [])
    for (const m of t.media) expect(quotedUrls.has(m.url)).toBe(false)
  })

  // 上一個測試在 quoted-with-media.html 上其實是空集合對空集合：該 fixture 裡，外層
  // 推文（2082981910209540352）與其引用推文（2082855170296205719）皆沒有符合
  // `pbs.twimg.com/media/` 的 <img>（引用推文帶的是 amplify_video_thumb 影片縮圖，
  // 不是靜態圖片），所以那個測試即使完全不做歸屬過濾也會通過，證明不了任何事。
  //
  // 真正能證明 `img.closest('article') === article` 有效的案例是 quoted.html：
  // 外層推文（2082883636177916306）本身沒有圖片，但其引用推文
  // （2082878156483219672）帶有一張 `pbs.twimg.com/media/HOfepUra4AAUEZi` 圖片。
  // 已實測驗證：若對外層 article 做未加範圍限制的
  // `querySelectorAll('img[src*="pbs.twimg.com/media/"]')`，會把這張引用推文的圖片
  // 一併撈出來；只有用 closest('article') === article 過濾才能正確把它排除、同時保留
  // 在引用推文自己的 media 裡。
  it('引用推文有自己的圖片時，該圖片不會外洩到外層推文的 media（非空集合驗證）', () => {
    const t = parseTweet(fx('quoted'), '2082883636177916306')!
    expect(t.quoted?.media.length).toBeGreaterThan(0)
    expect(t.quoted?.media[0].url).toContain('pbs.twimg.com/media/')
    const quotedUrls = new Set(t.quoted?.media.map((m) => m.url) ?? [])
    expect(t.media.some((m) => quotedUrls.has(m.url))).toBe(false)
    expect(t.media).toEqual([])
  })
})

describe('parseTweet 引用推文', () => {
  const t = parseTweet(fx('quoted'), '2082883636177916306')!

  it('有 quoted 欄位', () => expect(t.quoted).toBeDefined())
  it('引用推文的作者不同於外層', () =>
    expect(t.quoted!.author.handle).not.toBe(t.author.handle))
  it('引用推文有內文', () =>
    expect(t.quoted!.rawText.length).toBeGreaterThan(0))
  it('引用推文不再遞迴巢狀', () =>
    expect((t.quoted as Record<string, unknown>).quoted).toBeUndefined())

  it('純文字推文沒有 quoted', () => {
    const p = parseTweet(fx('plain'), '2083053369351090254')!
    expect(p.quoted).toBeUndefined()
  })
})

describe('parseTweet 新版 X 公開頁面', () => {
  const t = parseTweet(fx('shared-content'), '2086283765132022130')!

  it('meta 與 title 同時被截斷時，從 article 的可見文字補回完整五段', () => {
    expect(t.rawText).toContain('Codex 的限制。')
    expect(t.rawText).toContain('估计这是为了恶心 Anthropic')
    expect(t.rawText).toContain('周一还有一次重置')
    expect(t.textComplete).toBe(true)
  })

  it('解析新版 sharedContent 引用推文', () => {
    expect(t.quoted?.id).toBe('2086280578215924039')
    expect(t.quoted?.rawText).toBe('啊？突然就重置了')
  })

  it('統計仍取自主推文自己的 microdata', () => {
    expect(t.metrics.find((m) => m.kind === 'reposts')?.value).toBe(3)
  })
})

describe('parseTweet 2026-08 可見 SSR fallback', () => {
  it('結構化 author/text 消失時，以 permalink、作者連結、title 與可見正文交叉驗證後解析', () => {
    const t = parseTweet(visibleOnlyHtml(), VISIBLE_ONLY_ID)!

    expect(t).not.toBeNull()
    expect(t.id).toBe(VISIBLE_ONLY_ID)
    expect(t.url).toBe(`https://x.com/${VISIBLE_ONLY_HANDLE}/status/${VISIBLE_ONLY_ID}`)
    expect(t.author).toMatchObject({
      name: VISIBLE_ONLY_NAME,
      handle: VISIBLE_ONLY_HANDLE,
      handleDisplay: `@${VISIBLE_ONLY_HANDLE}`,
    })
    expect(t.author.avatarUrl).toContain('pbs.twimg.com/profile_images/')
    expect(t.rawText).toBe(VISIBLE_ONLY_TEXT)
    expect(t.createdAt).toBe('2026-08-13T23:42:00.000Z')
    expect(t.media).toEqual([
      expect.objectContaining({ url: expect.stringContaining('pbs.twimg.com/media/HPo8v-gaEAAHsFx') }),
    ])
    expect(t.metrics).toEqual([
      { kind: 'views', value: 13_000 },
      { kind: 'replies', value: 3 },
      { kind: 'reposts', value: 77 },
      { kind: 'likes', value: 1155 },
    ])
    expect(t.source).toBe('fetch')
    expect(t.textComplete).toBe(true)
  })

  it('title 與可見正文對不上時 fail closed，不把其他 UI 文字當推文', () => {
    expect(parseTweet(visibleOnlyHtml({ visibleText: '另一段文字' }), VISIBLE_ONLY_ID)).toBeNull()
  })

  it('article ID 與 permalink ID 不同時 fail closed', () => {
    const wrong = `https://x.com/${VISIBLE_ONLY_HANDLE}/status/9999999999999999999`
    expect(parseTweet(visibleOnlyHtml({ permalink: wrong }), VISIBLE_ONLY_ID)).toBeNull()
  })

  it('語意互動按鈕存在但沒有數字時解析為 0；整組不存在仍為 null', () => {
    const html = visibleOnlyHtml({ metrics: false }).replace(
      '<div itemprop="image">',
      '<span><button aria-label="Reply"></button></span><div itemprop="image">',
    )
    const t = parseTweet(html, VISIBLE_ONLY_ID)!

    expect(t.metrics).toEqual([
      { kind: 'views', value: null },
      { kind: 'replies', value: 0 },
      { kind: 'reposts', value: null },
      { kind: 'likes', value: null },
    ])
  })

  // 回覆推文的 title 內文帶著被回覆對象的帳號，可見正文不帶。這個差異曾讓每一則
  // 回覆都解析失敗、無聲退化成 DOM 路徑（作者被遮蔽、圖片與互動數全空）。
  it('回覆推文：title 多出開頭的 @提及時仍解析成功，且內文與 X 一致不含該提及', () => {
    const t = parseTweet(
      visibleOnlyHtml({ titleText: `@someone ${VISIBLE_ONLY_TEXT}` }),
      VISIBLE_ONLY_ID,
    )!

    expect(t).not.toBeNull()
    expect(t.rawText).toBe(VISIBLE_ONLY_TEXT)
  })

  it('回覆推文：連續多個 @提及也剝得乾淨', () => {
    const t = parseTweet(
      visibleOnlyHtml({ titleText: `@a_one @b_two @c_three ${VISIBLE_ONLY_TEXT}` }),
      VISIBLE_ONLY_ID,
    )!

    expect(t.rawText).toBe(VISIBLE_ONLY_TEXT)
  })

  // 剝除只是「對不上時」的第二順位。內文本身就以 @ 開頭的非回覆推文，第一輪的
  // 完全相等就會命中，開頭不該被吃掉。
  it('內文真的以 @提及開頭時不剝除（先比完全相等，後比剝除版）', () => {
    const withMention = `@someone ${VISIBLE_ONLY_TEXT}`
    const t = parseTweet(
      visibleOnlyHtml({ titleText: withMention, visibleText: withMention }),
      VISIBLE_ONLY_ID,
    )!

    expect(t.rawText).toBe(withMention)
  })

  it('剝掉 @提及後仍對不上時維持 fail closed', () => {
    expect(parseTweet(
      visibleOnlyHtml({ titleText: '@someone 完全不同的文字' }),
      VISIBLE_ONLY_ID,
    )).toBeNull()
  })
})

// 這兩份是 2026-08 從 x.com 實抓的新版未登入 SSR，不是合成的。合成 HTML 只驗證
// 我們以為的形狀，真實頁面才驗證 X 實際給的形狀 —— 上一次退化正是因為所有
// fixture 都還是舊格式，測試全綠卻沒人發現公開抓取早就整條壞了。
describe('parseTweet 真實新版 SSR 頁面', () => {
  it('一般推文：作者、內文、互動數與圖片都解析得到，不需要降級', () => {
    const t = parseTweet(fx('visible-ssr-media'), '2088868860346937579')!

    expect(t).not.toBeNull()
    expect(t.source).toBe('fetch')
    expect(t.author.handle).toBe('basarafire')
    expect(t.author.avatarUrl).toContain('pbs.twimg.com/profile_images/')
    expect(t.rawText).toContain('お盆休み最終日。')
    expect(t.media).toHaveLength(1)
    expect(t.media[0].url).toContain('pbs.twimg.com/media/')
    // 全部四項都要有值 —— 降級路徑的特徵就是這四項全是 null
    for (const m of t.metrics) expect(m.value).not.toBeNull()
  })

  /*
   * X 的未登入 SSR 會連解析用的錨點一起在地化：`<title>` 的樣板、操作列的
   * aria-label、以及瀏覽數的單位詞。我們雖然固定以英文抓取，但 X 的語系判定
   * 不只看 Accept-Language（實測無法從單一環境完全控制它），所以解析本身不能
   * 依賴語系。
   *
   * 這份 fixture 是同一則推文的日文版：title 是「Xユーザーの…さん:」、
   * aria-label 是「返信／リポスト／いいね」。它必須和英文版解出一樣的結果。
   */
  it('在地化頁面（日文）一樣解析成功，不退化', () => {
    const t = parseTweet(fx('visible-ssr-localized'), '2089442390805233999')!

    expect(t).not.toBeNull()
    expect(t.source).toBe('fetch')
    expect(t.author.handle).toBe('CatWorkers')
    expect(t.rawText).toContain('Spotted at the local vet.')
    expect(t.media).toHaveLength(1)
  })

  it('在地化頁面的互動數不靠英文標籤，一樣讀得到', () => {
    const t = parseTweet(fx('visible-ssr-localized'), '2089442390805233999')!

    // 全部四項都要有值 —— 只靠英文 aria-label 的話這裡會整排是 null
    for (const m of t.metrics) expect(m.value).not.toBeNull()
    const by = (k: string) => t.metrics.find((m) => m.kind === k)!.value
    expect(by('replies')).toBe(10)
    expect(by('reposts')).toBe(46)
    expect(by('views')).toBe(38_000)
  })

  it('回覆推文：不再退化，內文不含被回覆對象的帳號', () => {
    const t = parseTweet(fx('visible-ssr-reply'), '2089153024648425811')!

    expect(t).not.toBeNull()
    expect(t.source).toBe('fetch')
    expect(t.author.handle).toBe('uki_neko')
    expect(t.rawText).toBe('そのふくよかなぽんぽんに、顔を埋めたいです🤣🤣🤣😘😘😽')
    expect(t.rawText.startsWith('@')).toBe(false)
  })
})

describe('parseTweet 文字分段', () => {
  it('text 已分段且非空', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.text.length).toBeGreaterThan(0)
    expect(t.text.map((s) => ('value' in s ? s.value : '')).join('')).toBe(t.rawText)
  })

  // 上面那則測試用 plain.html 的主推文，內文完全沒有 hashtag/mention/連結，
  // tokenize() 對它只會產生單一 text 段落，斷言退化成「一個段落等於原字串」，
  // 對 parseTweet 是否真的有做分段這件事沒有任何驗證力。
  //
  // media.html 裡 id=2083061426923475451 的推文（也就是「parseTweet 圖片」
  // 測試取圖片的同一則）內文是 "@thsottiaux bruv, I was counting on you"，
  // 真的含有一個 mention，會被切成 [mention, text] 兩段，藉此在 parseTweet
  // 的整合層級真正驗證分段行為，而不是只驗證 tokenize() 本身（那已經在
  // test/parse/tokenize.test.ts 涵蓋了）。
  it('內文含 mention 時，parseTweet 回傳的 text 真的被切成多段（而非單一 text 段落假裝分段）', () => {
    const t = parseTweet(fx('media'), '2083061426923475451')!
    expect(t.rawText).toBe('@thsottiaux bruv, I was counting on you')

    // 真正證明有分段：段落數 > 1，且至少有一段不是 'text'
    expect(t.text.length).toBeGreaterThan(1)
    expect(t.text.some((s) => s.type !== 'text')).toBe(true)
    expect(t.text.some((s) => s.type === 'mention' && s.value === '@thsottiaux')).toBe(true)

    // round-trip 仍要成立，證明分段沒有遺漏或重複任何字元
    expect(t.text.map((s) => ('value' in s ? s.value : '')).join('')).toBe(t.rawText)
  })
})

// X 把 <meta itemprop="text"> 截在約 200 字，完整內文只在 <title> 裡。
// 實測那則 AGI Bar 推文：meta 199 字、實際 538 字。
describe('decodeEntities', () => {
  it('解掉 X 多編碼的一層 &amp;', () =>
    expect(decodeEntities('担任MAS&amp;Head of growth')).toBe('担任MAS&Head of growth'))
  it('解 &lt; &gt; &quot;', () =>
    expect(decodeEntities('&lt;b&gt;a&quot;b&quot;')).toBe('<b>a"b"'))
  it('作者自己打出的 &lt; 字樣只被解一層，不會變成真的 <', () =>
    expect(decodeEntities('&amp;lt;')).toBe('&lt;'))
  it('沒有實體時原樣返回', () =>
    expect(decodeEntities('plain text 100% fine')).toBe('plain text 100% fine'))
})

describe('stripTrailingLink', () => {
  it('去掉尾端自動附加的 t.co', () =>
    expect(stripTrailingLink('是的是的，大清查开始了 https://t.co/GgDZmccdqn'))
      .toBe('是的是的，大清查开始了'))
  it('不動內文中間的連結', () => {
    const s = '看 https://t.co/abc123 這個 然後還有後話'
    expect(stripTrailingLink(s)).toBe(s)
  })
  it('只去掉一個，不會把連續連結全吃掉', () =>
    expect(stripTrailingLink('a https://t.co/aaa https://t.co/bbb'))
      .toBe('a https://t.co/aaa'))
  it('非 t.co 的尾端網址保留（那是作者打的）', () => {
    const s = '推薦這個 https://example.com/x'
    expect(stripTrailingLink(s)).toBe(s)
  })
})

describe('textComplete', () => {
  it('主推文從 title 補回全文時標記為完整', () => {
    const t = parseTweet(fx('plain'), '2083053369351090254')!
    expect(t.textComplete).toBe(true)
  })

  // quoted fixture 的引用推文（citation）meta itemprop="text" 實測 276 字
  // （超過 190 字下界，且句子在「Luna and Terra's lower prices are」中間斷開，
  // 確實是被截斷，不是巧合地剛好夠長），brief 原先斷言的「小於 190」不成立。
  // 一份文件只有一個 <title>，它描述主推文，引用推文沒有第二份來源可以驗證
  // 是否被截斷，只能靠長度判斷 —— 這正是這個測試要證明的：長度過線時標記為
  // 不完整，而不是誤標成完整。
  it('長的引用推文（實測 276 字，超過 190 字下界且確實斷句）標記為不完整', () => {
    const t = parseTweet(fx('quoted'), '2082883636177916306')!
    expect(t.quoted!.rawText.length).toBeGreaterThanOrEqual(190)
    expect(t.quoted!.textComplete).toBe(false)
  })
})

describe('fullTextFromTitle', () => {
  const title = (name: string, body: string) => `${name} on X: "${body}" / X`

  it('meta 被截斷時取回完整內文', () => {
    const full = '無需訂閱，也不用擔心 Token 消耗。只需要把 Base URL 和 API Key 填到 Claude Code、Codex'
    const meta = '無需訂閱，也不用擔心 Token 消耗。只需要把 Base URL 和 API Key 填到 Claude'
    expect(fullTextFromTitle(title('Max For AI', full), 'Max For AI', meta))
      .toEqual({ text: full, fromTitle: true })
  })

  it('順便去掉尾端 t.co', () =>
    expect(fullTextFromTitle(title('Max For AI', 'aaa https://t.co/GgDZmccdqn'), 'Max For AI', 'aaa'))
      .toEqual({ text: 'aaa', fromTitle: true }))

  // 安全條件：title 必須是 meta 的延長，否則不採用
  it('title 內容與 meta 對不上時退回 meta', () =>
    expect(fullTextFromTitle(title('Max For AI', '完全不同的東西'), 'Max For AI', '原本的內文'))
      .toEqual({ text: '原本的內文', fromTitle: false }))

  it('title 格式改變時退回 meta，而不是把標題列雜訊當內文', () => {
    for (const t of ['Max For AI (@MaxForAI) / X', '', 'Max For AI on X: 沒有引號 / X', 'X']) {
      expect(fullTextFromTitle(t, 'Max For AI', '原本的內文')).toEqual({ text: '原本的內文', fromTitle: false })
    }
  })

  it('作者名稱不符時退回 meta', () =>
    expect(fullTextFromTitle(title('別人', '完整內文更長一些'), 'Max For AI', '完整內文'))
      .toEqual({ text: '完整內文', fromTitle: false }))

  it('內文本身含引號也能正確取出', () => {
    const body = '他說 "這樣不對" 然後就走了'
    expect(fullTextFromTitle(title('A', body), 'A', '他說')).toEqual({ text: body, fromTitle: true })
  })

  it('內文結尾就是引號時不會多切一個字元', () => {
    const body = '他說 "這樣不對"'
    expect(fullTextFromTitle(title('A', body), 'A', '他說')).toEqual({ text: body, fromTitle: true })
  })

  it('meta 與完整內文相同時原樣返回（大多數短推文）', () =>
    expect(fullTextFromTitle(title('Tibo', 'short one'), 'Tibo', 'short one'))
      .toEqual({ text: 'short one', fromTitle: true }))

  it('title 是 meta 的延長時採用它，並標記來源', () => {
    const meta = '前半段'
    const t = 'A on X: "前半段後半段" / X'
    expect(fullTextFromTitle(t, 'A', meta)).toEqual({ text: '前半段後半段', fromTitle: true })
  })

  it('title 格式不符時退回 meta，不標記', () => {
    expect(fullTextFromTitle('完全不同的標題', 'A', '內文')).toEqual({ text: '內文', fromTitle: false })
  })
})
