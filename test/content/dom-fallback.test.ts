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
function buildPage(opts: { text?: string; userName?: string; time?: string; avatar?: string } = {}) {
  const {
    text = '看完 poi s03',
    userName = '止痛藥水\n@0x001A',
    time = '2026-07-31T21:54:11.000Z',
    avatar = 'https://pbs.twimg.com/profile_images/1797436415435018240/78IKI5Gj_x96.jpg',
  } = opts
  document.body.innerHTML = `
    <article>
      <a href="/0x001A/status/2083310281724424677">link</a>
      <img src="${avatar}">
      <div data-testid="User-Name">${userName.replace(/\n/g, '<br>')}</div>
      <div data-testid="tweetText">${text}</div>
      <time datetime="${time}">now</time>
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

  it('標記來源為 dom-fallback，讓 UI 顯示鎖推提醒並預設遮蔽', () => {
    buildPage()
    expect(extractFromDom(PERMALINK)!.source).toBe('dom-fallback')
  })

  it('互動數一律 null —— X 只渲染非零數字且不帶標籤，猜錯比顯示「—」更糟', () => {
    buildPage()
    expect(extractFromDom(PERMALINK)!.metrics).toEqual([
      { kind: 'views', value: null },
      { kind: 'replies', value: null },
      { kind: 'reposts', value: null },
      { kind: 'likes', value: null },
    ])
  })

  it('不抓圖片：歸屬錯誤會把別人的圖畫進卡片', () => {
    buildPage()
    expect(extractFromDom(PERMALINK)!.media).toEqual([])
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
