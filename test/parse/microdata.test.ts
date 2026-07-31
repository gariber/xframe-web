import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseTweet, extractTweetId } from '../../src/parse/microdata'

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
