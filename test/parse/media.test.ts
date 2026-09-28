import { describe, it, expect } from 'vitest'
import { TWEET_MEDIA_SELECTOR, mediaDedupeKey, mediaKindOfUrl } from '../../src/parse/media'

const P = 'https://pbs.twimg.com'

describe('mediaKindOfUrl', () => {
  it.each([
    [`${P}/media/HPzzMRcaQAA8Dnb.jpg`, 'photo'],
    [`${P}/amplify_video_thumb/2097052706464735232/img/GqEm45rSpRiDksb4.jpg`, 'video'],
    [`${P}/ext_tw_video_thumb/123/pu/img/abc.jpg`, 'video'],
    [`${P}/tweet_video_thumb/AbCdEf.jpg`, 'gif'],
  ])('%s → %s', (url, kind) => {
    expect(mediaKindOfUrl(url)).toBe(kind)
  })

  it('頭像不是推文媒體 —— 它有自己的欄位，混進來會在卡片上多一張大頭照', () => {
    expect(mediaKindOfUrl(`${P}/profile_images/123/abc_x96.jpg`)).toBeNull()
  })

  it('別的主機一律不算', () => {
    expect(mediaKindOfUrl('https://example.com/pbs.twimg.com/media/x.jpg')).toBeNull()
  })

  it('查詢字串不影響判斷', () => {
    expect(mediaKindOfUrl(`${P}/media/AAA?format=jpg&name=large`)).toBe('photo')
  })
})

describe('TWEET_MEDIA_SELECTOR', () => {
  const page = (...srcs: string[]) => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><body>${srcs.map((s) => `<img src="${s}">`).join('')}</body></html>`,
      'text/html',
    )
    return [...doc.querySelectorAll(TWEET_MEDIA_SELECTOR)].map((el) => el.getAttribute('src'))
  }

  it('選到照片、影片封面與 GIF 封面，選不到頭像', () => {
    expect(page(
      `${P}/media/AAA.jpg`,
      `${P}/amplify_video_thumb/1/img/B.jpg`,
      `${P}/tweet_video_thumb/C.jpg`,
      `${P}/profile_images/1/D_x96.jpg`,
    )).toEqual([`${P}/media/AAA.jpg`, `${P}/amplify_video_thumb/1/img/B.jpg`, `${P}/tweet_video_thumb/C.jpg`])
  })
})

describe('mediaDedupeKey', () => {
  it('同一張圖的縮圖與放大版是同一個鍵', () => {
    expect(mediaDedupeKey(`${P}/media/AAA?format=jpg&name=small`))
      .toBe(mediaDedupeKey(`${P}/media/AAA?format=jpg&name=large`))
  })

  it('不同張圖不會撞鍵', () => {
    expect(mediaDedupeKey(`${P}/media/AAA.jpg`)).not.toBe(mediaDedupeKey(`${P}/media/BBB.jpg`))
  })

  it('照片與影片封面即使 ID 相同也不會互相蓋掉', () => {
    expect(mediaDedupeKey(`${P}/media/123.jpg`))
      .not.toBe(mediaDedupeKey(`${P}/amplify_video_thumb/123/img/x.jpg`))
  })

  it('不是推文媒體時回 null，不會生出一個假的鍵', () => {
    expect(mediaDedupeKey(`${P}/profile_images/1/D_x96.jpg`)).toBeNull()
  })
})
