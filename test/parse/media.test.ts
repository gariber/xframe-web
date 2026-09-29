import { describe, it, expect } from 'vitest'
import {
  MAX_VIDEO_WIDTH,
  TWEET_MEDIA_SELECTOR,
  mediaDedupeKey,
  mediaKindOfUrl,
  pickVideoVariant,
} from '../../src/parse/media'

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

/*
 * X 同時給一份 HLS 播放清單與四種 progressive MP4。這一組正是實抓到的那四種
 * （test/fixtures/inline-store-video.html）。
 */
const V = (path: string, bitrate: number | null, contentType = 'video/mp4') => ({
  url: `https://video.twimg.com/amplify_video/1/${path}`,
  bitrate,
  contentType,
})
const REAL = [
  V('pl/x.m3u8?tag=29', null, 'application/x-mpegURL'),
  V('vid/avc1/472x270/a.mp4?tag=29', 256_000),
  V('vid/avc1/630x360/b.mp4?tag=29', 832_000),
  V('vid/avc1/1260x720/c.mp4?tag=29', 2_176_000),
  V('vid/avc1/1344x768/d.mp4?tag=29', 10_368_000),
]

describe('pickVideoVariant', () => {
  it('挑寬度上限內位元率最高的那支', () => {
    expect(pickVideoVariant(REAL)).toContain('1260x720')
  })

  it('不挑 HLS —— 那是播放清單，抓不成單一檔案', () => {
    expect(pickVideoVariant([REAL[0]])).toBeNull()
  })

  it('超過寬度上限的那支不挑，即使它畫質最好', () => {
    expect(pickVideoVariant(REAL)).not.toContain('1344x768')
    expect(MAX_VIDEO_WIDTH).toBeLessThan(1344)
  })

  it('全部都超過上限時取最小的 —— 那時候別讓使用者等比較重要', () => {
    const huge = [V('vid/avc1/1920x1080/a.mp4', 12_000_000), V('vid/avc1/2560x1440/b.mp4', 25_000_000)]
    expect(pickVideoVariant(huge)).toContain('1920x1080')
  })

  it('直式影片照樣看寬度，不會被高度誤傷', () => {
    const portrait = [V('vid/avc1/320x568/a.mp4', 300_000), V('vid/avc1/720x1280/b.mp4', 2_000_000)]
    expect(pickVideoVariant(portrait)).toContain('720x1280')
  })

  it('網址看不出尺寸時只比位元率，不會整個放棄', () => {
    const odd = [V('vid/a.mp4', 300_000), V('vid/b.mp4', 900_000)]
    expect(pickVideoVariant(odd)).toContain('b.mp4')
  })

  it('沒有位元率也不會當掉', () => {
    expect(pickVideoVariant([V('vid/avc1/630x360/a.mp4', null)])).toContain('a.mp4')
  })

  it('沒有任何 MP4 時回 null', () => {
    expect(pickVideoVariant([])).toBeNull()
    expect(pickVideoVariant([V('vid/a.mp4', 1, 'video/webm')])).toBeNull()
  })
})
