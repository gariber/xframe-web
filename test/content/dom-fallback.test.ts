import { describe, it, expect, beforeEach } from 'vitest'
import { parseUserName, extractFromDom } from '../../src/content/dom-fallback'

describe('parseUserName', () => {
  it('解析實測格式：名稱與帳號以換行分隔', () => {
    // 2026-08-01 於登入狀態的 x.com 實測取得的真實值
    expect(parseUserName('止痛藥水\n@0x001A')).toEqual({ name: '止痛藥水', handle: '0x001A' })
  })

  it('時間軸檢視多帶的時間不會被誤當成名稱或帳號', () => {
    expect(parseUserName('考特\n@Onxxx\n·\n58 分鐘')).toEqual({ name: '考特', handle: 'Onxxx' })
  })

  it('不靠行號取值：帳號在前也能解析', () => {
    expect(parseUserName('@foo\nBar')).toEqual({ name: 'Bar', handle: 'foo' })
  })

  it('handle 不含 @', () => {
    expect(parseUserName('A\n@b')!.handle).toBe('b')
  })

  it.each([
    ['只有名稱沒有帳號', 'Tibo'],
    ['只有帳號沒有名稱', '@tibo'],
    ['空字串', ''],
    ['只有空白與分隔符', '  \n · \n '],
  ])('%s 時回傳 null', (_case, raw) => {
    expect(parseUserName(raw)).toBeNull()
  })
})

const PERMALINK = 'https://x.com/0x001A/status/2083310281724424677'

/** 依 2026-08-01 實測的登入版結構搭建最小 DOM */
function buildPage(opts: {
  text?: string
  userName?: string
  time?: string
  avatar?: string
  isProtected?: boolean
  metrics?: { views: string; replies: string; reposts: string; likes: string; bookmarks: string } | null
  /** 這則推文自己的圖片（src 直接給值，模擬 X 的 DOM） */
  images?: { src: string; alt?: string }[]
  /** 巢狀引用推文帶的圖片 —— 絕不可被算成外層推文的圖 */
  quotedImages?: string[]
} = {}) {
  const {
    text = '看完 poi s03',
    userName = '止痛藥水\n@0x001A',
    time = '2026-07-31T21:54:11.000Z',
    avatar = 'https://pbs.twimg.com/profile_images/1797436415435018240/78IKI5Gj_x96.jpg',
    isProtected = false,
    metrics = { views: '12,345', replies: '2', reposts: '0', likes: '89', bookmarks: '7' },
    images = [],
    quotedImages = [],
  } = opts
  document.body.innerHTML = `
    <svg data-testid="icon-lock" aria-label="檢視者自己的鎖頭"></svg>
    <article>
      <a href="/0x001A/status/2083310281724424677">link</a>
      <img src="${avatar}">
      <div data-testid="User-Name">
        ${userName.replace(/\n/g, '<br>')}
        ${isProtected ? '<svg data-testid="icon-lock" aria-label="受保護的帳戶"></svg>' : ''}
      </div>
      <div data-testid="tweetText">${text}</div>
      ${images.map((i) => `<img src="${i.src}" alt="${i.alt ?? ''}">`).join('')}
      ${quotedImages.length ? `<article>${quotedImages.map((src) => `<img src="${src}">`).join('')}</article>` : ''}
      <time datetime="${time}">now</time>
      ${metrics ? `
        <div role="group" aria-label="${metrics.replies} 則回覆、${metrics.reposts} 次轉發、${metrics.likes} 個喜歡、${metrics.views} 次觀看">
          <button data-testid="reply" aria-label="${metrics.replies} 則回覆。回覆"></button>
          <button data-testid="retweet" aria-label="${metrics.reposts} 次轉發。轉發"></button>
          <button data-testid="like" aria-label="${metrics.likes} 個喜歡。喜歡"></button>
          <button data-testid="bookmark" aria-label="${metrics.bookmarks} 個書籤。加入書籤"></button>
          <a href="/0x001A/status/2083310281724424677/analytics">1.2 萬 次查看</a>
        </div>` : ''}
    </article>`
  // happy-dom 的 innerText 不會把 <br> 轉成換行，實測的來源是真瀏覽器的
  // innerText。這裡直接補上真實的多行文字，讓測試對齊實測輸入而非 DOM 細節。
  const un = document.querySelector('[data-testid="User-Name"]') as HTMLElement
  Object.defineProperty(un, 'innerText', { value: userName, configurable: true })
  const tt = document.querySelector('[data-testid="tweetText"]') as HTMLElement
  Object.defineProperty(tt, 'innerText', { value: text, configurable: true })
}

beforeEach(() => { document.body.innerHTML = '' })

describe('extractFromDom', () => {
  it('抽出名稱、帳號、內文、時間、頭像', () => {
    buildPage()
    const t = extractFromDom(PERMALINK)!
    expect(t.author.name).toBe('止痛藥水')
    expect(t.author.handle).toBe('0x001A')
    expect(t.rawText).toBe('看完 poi s03')
    expect(t.createdAt).toBe('2026-07-31T21:54:11.000Z')
    expect(t.author.avatarUrl).toContain('profile_images')
  })

  it('DOM 降級來源不等於鎖推；只有作者區內有 icon-lock 才標記鎖推', () => {
    buildPage()
    const publicPost = extractFromDom(PERMALINK)!
    expect(publicPost.source).toBe('dom')
    expect(publicPost.isProtected).toBe(false)

    buildPage({ isProtected: true })
    expect(extractFromDom(PERMALINK)!.isProtected).toBe(true)
  })

  it('依 X 的語意控制項讀出五項精確互動數，包括書籤、零值與千分位', () => {
    buildPage()
    expect(extractFromDom(PERMALINK)!.metrics).toEqual([
      { kind: 'views', value: 12_345 },
      { kind: 'replies', value: 2 },
      { kind: 'reposts', value: 0 },
      { kind: 'likes', value: 89 },
      { kind: 'bookmarks', value: 7 },
    ])
  })

  it('頁面沒有提供互動語意標記時維持 null，不猜測未標記的數字', () => {
    buildPage({ metrics: null })
    expect(extractFromDom(PERMALINK)!.metrics.every((metric) => metric.value === null)).toBe(true)
  })

  /*
   * 這裡原本是「不抓圖片」。當初的理由是歸屬難以保證，但 ownedElements 出現之後
   * 就能用 `closest('article') === article` 嚴格限定範圍了 —— 公開抓取路徑的
   * parseMedia 用的正是同一招。降級後卡片少一張圖，對使用者就是「明明有圖卻
   * 沒有圖」，所以現在給，但歸屬必須守得住，下面幾個測試就是在守這件事。
   */
  it('抓到這則推文自己的圖片，連同 alt', () => {
    buildPage({ images: [{ src: 'https://pbs.twimg.com/media/AAA?format=jpg&name=small', alt: '一隻貓' }] })
    expect(extractFromDom(PERMALINK)!.media).toEqual([
      { url: 'https://pbs.twimg.com/media/AAA?format=jpg&name=small', alt: '一隻貓' },
    ])
  })

  it('沒有圖片時是空陣列', () => {
    buildPage()
    expect(extractFromDom(PERMALINK)!.media).toEqual([])
  })

  // 這是當初不敢抓圖的原因，也是現在最該守住的一條。
  it('不把巢狀引用推文的圖片算成外層推文的圖片', () => {
    buildPage({
      images: [{ src: 'https://pbs.twimg.com/media/MINE?format=jpg&name=small' }],
      quotedImages: ['https://pbs.twimg.com/media/THEIRS?format=jpg&name=small'],
    })
    const media = extractFromDom(PERMALINK)!.media
    expect(media).toHaveLength(1)
    expect(media[0].url).toContain('MINE')
  })

  it('頭像與影片縮圖都不算推文圖片', () => {
    buildPage({
      images: [
        { src: 'https://pbs.twimg.com/profile_images/123/abc_x96.jpg' },
        { src: 'https://pbs.twimg.com/amplify_video_thumb/456/img/def.jpg' },
      ],
    })
    expect(extractFromDom(PERMALINK)!.media).toEqual([])
  })

  // 同一張圖在 DOM 裡可能縮圖與放大版並存，卡片不該排出兩張一樣的。
  it('同一張圖只取一次', () => {
    buildPage({
      images: [
        { src: 'https://pbs.twimg.com/media/SAME?format=jpg&name=small' },
        { src: 'https://pbs.twimg.com/media/SAME?format=jpg&name=large' },
        { src: 'https://pbs.twimg.com/media/OTHER?format=jpg&name=small' },
      ],
    })
    const media = extractFromDom(PERMALINK)!.media
    expect(media).toHaveLength(2)
    expect(media.map((m) => m.url.includes('SAME')).filter(Boolean)).toHaveLength(1)
  })

  it('內文經 tokenize，hashtag 仍可上色', () => {
    buildPage({ text: '看 #劇場版 好看' })
    expect(extractFromDom(PERMALINK)!.text.some((s) => s.type === 'hashtag')).toBe(true)
  })

  it('id 由永久連結取出', () => {
    buildPage()
    expect(extractFromDom(PERMALINK)!.id).toBe('2083310281724424677')
  })

  it('頁面上沒有對應推文時回傳 null', () => {
    buildPage()
    expect(extractFromDom('https://x.com/other/status/999')).toBeNull()
  })

  it('缺內文時回傳 null，不產出殘缺資料', () => {
    buildPage({ text: '   ' })
    expect(extractFromDom(PERMALINK)).toBeNull()
  })

  it('缺作者資訊時回傳 null', () => {
    buildPage({ userName: '' })
    expect(extractFromDom(PERMALINK)).toBeNull()
  })
})
