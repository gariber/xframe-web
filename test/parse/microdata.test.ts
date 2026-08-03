import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseTweet, extractTweetId, decodeEntities, stripTrailingLink, fullTextFromTitle,
} from '../../src/parse/microdata'

const fx = (n: string) => readFileSync(`test/fixtures/${n}.html`, 'utf8')

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

  it('五個欄位皆為數字', () => {
    for (const k of ['replies', 'reposts', 'quotes', 'likes', 'views'] as const) {
      expect(typeof t.stats[k]).toBe('number')
    }
  })
  it('讚數為正整數', () => expect(t.stats.likes!).toBeGreaterThan(0))
  it('瀏覽數大於讚數', () => expect(t.stats.views!).toBeGreaterThan(t.stats.likes!))
  it('不把作者的追蹤者數誤當成推文統計', () => {
    // 作者有 37 萬追蹤者；推文的任何統計都不應等於該值
    const followers = 378_000
    for (const v of Object.values(t.stats)) {
      expect(Math.abs((v ?? 0) - followers)).toBeGreaterThan(5_000)
    }
  })
})

describe('parseTweet 巢狀引用推文隔離', () => {
  // quoted.html: 外層推文 2082883636177916306 內嵌了引用推文（citation）
  // 2082878156483219672。兩者的 interactionStatistic 數字必須完全不同，
  // 若 parseStats 不小心用了非直接子層的 querySelectorAll，會把 citation
  // 的統計也掃進來，依 DOM 順序覆蓋掉外層自己的值。
  //
  // 以下期望值皆直接從 test/fixtures/quoted.html 的原始 markup 讀出，
  // 不是憑空捏造：
  //   外層 article（data-tweet-id="2082883636177916306"）自己的
  //   interactionStatistic 區塊：Likes=8015 Retweets=367 Quotes=195
  //   Replies=1003 Views=1096657
  //   巢狀 citation article（data-tweet-id="2082878156483219672"）自己的
  //   interactionStatistic 區塊：Replies=982 Retweets=1600 Quotes=1594
  //   Likes=16299 Views=5928637
  const t = parseTweet(fx('quoted'), '2082883636177916306')!

  it('外層推文統計取自外層自己的區塊，而非巢狀引用推文', () => {
    expect(t).not.toBeNull()
    expect(t.stats).toEqual({
      replies: 1003,
      reposts: 367,
      quotes: 195,
      likes: 8015,
      views: 1096657,
    })
  })

  it('外層推文統計不等於巢狀引用推文的統計（防止未加範圍限制的迴歸）', () => {
    const citationStats = { replies: 982, reposts: 1600, quotes: 1594, likes: 16299, views: 5928637 }
    for (const k of ['replies', 'reposts', 'quotes', 'likes', 'views'] as const) {
      expect(t.stats[k]).not.toBe(citationStats[k])
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

describe('fullTextFromTitle', () => {
  const title = (name: string, body: string) => `${name} on X: "${body}" / X`

  it('meta 被截斷時取回完整內文', () => {
    const full = '無需訂閱，也不用擔心 Token 消耗。只需要把 Base URL 和 API Key 填到 Claude Code、Codex'
    const meta = '無需訂閱，也不用擔心 Token 消耗。只需要把 Base URL 和 API Key 填到 Claude'
    expect(fullTextFromTitle(title('Max For AI', full), 'Max For AI', meta)).toBe(full)
  })

  it('順便去掉尾端 t.co', () =>
    expect(fullTextFromTitle(title('Max For AI', 'aaa https://t.co/GgDZmccdqn'), 'Max For AI', 'aaa'))
      .toBe('aaa'))

  // 安全條件：title 必須是 meta 的延長，否則不採用
  it('title 內容與 meta 對不上時退回 meta', () =>
    expect(fullTextFromTitle(title('Max For AI', '完全不同的東西'), 'Max For AI', '原本的內文'))
      .toBe('原本的內文'))

  it('title 格式改變時退回 meta，而不是把標題列雜訊當內文', () => {
    for (const t of ['Max For AI (@MaxForAI) / X', '', 'Max For AI on X: 沒有引號 / X', 'X']) {
      expect(fullTextFromTitle(t, 'Max For AI', '原本的內文')).toBe('原本的內文')
    }
  })

  it('作者名稱不符時退回 meta', () =>
    expect(fullTextFromTitle(title('別人', '完整內文更長一些'), 'Max For AI', '完整內文'))
      .toBe('完整內文'))

  it('內文本身含引號也能正確取出', () => {
    const body = '他說 "這樣不對" 然後就走了'
    expect(fullTextFromTitle(title('A', body), 'A', '他說')).toBe(body)
  })

  it('內文結尾就是引號時不會多切一個字元', () => {
    const body = '他說 "這樣不對"'
    expect(fullTextFromTitle(title('A', body), 'A', '他說')).toBe(body)
  })

  it('meta 與完整內文相同時原樣返回（大多數短推文）', () =>
    expect(fullTextFromTitle(title('Tibo', 'short one'), 'Tibo', 'short one')).toBe('short one'))
})
