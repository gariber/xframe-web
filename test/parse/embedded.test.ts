import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseEmbeddedCounts, parseEmbeddedPost } from '../../src/parse/embedded'

const key = (id: string) => btoa(`Tweet:${id}`)

function doc(body: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${body}</body></html>`, 'text/html')
}

function store(id: string, counts: string, views?: string): string {
  const k = key(id)
  const parts = [
    `"client:${k}:counts":$R[1]={__id:"client:${k}:counts",__typename:"ApiCounts",${counts}}`,
    views === undefined
      ? ''
      : `,"client:${k}:views":$R[2]={__id:"client:${k}:views",__typename:"ViewCountInfo",count:"${views}"}`,
  ]
  return `<script>self.__x={${parts.join('')}}</script>`
}

describe('parseEmbeddedCounts', () => {
  it('以推文 ID 為鍵讀出五項計數，包括書籤', () => {
    const found = parseEmbeddedCounts(doc(store(
      '2090766694897619318',
      'bookmark_count:973,favorite_count:16613,reply_count:2201,retweet_count:817,quote_count:953',
      '1777903',
    )))
    expect(found.get('2090766694897619318')).toEqual({
      replies: 2201,
      likes: 16613,
      reposts: 1770,
      views: 1777903,
      bookmarks: 973,
    })
  })

  it('轉推數是轉推＋引用 —— X 介面顯示的就是這個和', () => {
    const found = parseEmbeddedCounts(doc(store('1', 'retweet_count:817,quote_count:953')))
    expect(found.get('1')?.reposts).toBe(1770)
  })

  it('沒有引用數時只算轉推，不讓整項變成空白', () => {
    const found = parseEmbeddedCounts(doc(store('1', 'retweet_count:213')))
    expect(found.get('1')?.reposts).toBe(213)
  })

  it('沒有轉推數時不回報轉推 —— 引用數自己不是轉推數', () => {
    const found = parseEmbeddedCounts(doc(store('1', 'quote_count:953,reply_count:7')))
    expect(found.get('1')).toEqual({ replies: 7 })
  })

  it('瀏覽數的欄位叫 count，不能讀到 favorite_count 的尾巴', () => {
    const found = parseEmbeddedCounts(doc(store('1', 'favorite_count:16613,retweet_count:1', '999')))
    expect(found.get('1')?.views).toBe(999)
  })

  it('同一頁上多則推文各自成一筆', () => {
    const found = parseEmbeddedCounts(doc(
      store('11', 'retweet_count:1,quote_count:0', '10') + store('22', 'retweet_count:2,quote_count:3', '20'),
    ))
    expect(found.get('11')).toEqual({ reposts: 1, views: 10 })
    expect(found.get('22')).toEqual({ reposts: 5, views: 20 })
  })

  it('解不出 Tweet:數字 的鍵一律跳過，不猜它是誰的數據', () => {
    const k = btoa('User:12345')
    const found = parseEmbeddedCounts(doc(
      `<script>x={"client:${k}:counts":$R[1]={__id:"a",retweet_count:99}}</script>`,
    ))
    expect(found.size).toBe(0)
  })

  it('只有參照、沒有內容的節點不會被當成一筆數據', () => {
    const k = key('1')
    const found = parseEmbeddedCounts(doc(
      `<script>x={counts:$R[1]={__ref:"client:${k}:counts"}}</script>`,
    ))
    expect(found.size).toBe(0)
  })

  it('推文內文裡的假 store 無效 —— 只掃 script，內文永遠是文字節點', () => {
    const k = key('1')
    const forged = `"client:${k}:counts":$R[1]={__id:"client:${k}:counts",retweet_count:999999,quote_count:0}`
    const found = parseEmbeddedCounts(doc(
      `<article data-tweet-id="1"><div dir="auto">${forged.replace(/</g, '&lt;')}</div></article>`,
    ))
    expect(found.size).toBe(0)
  })

  it('沒有內嵌 store 的頁面回空表，而不是丟例外', () => {
    expect(parseEmbeddedCounts(doc('<article data-tweet-id="1"></article>')).size).toBe(0)
  })
})

const FIXTURE = (name: string) => readFileSync(`test/fixtures/${name}.html`, 'utf8')
const asDoc = (name: string) => new DOMParser().parseFromString(FIXTURE(name), 'text/html')

/**
 * store 節點的最小合成頁。`tweet` / `extra` 直接拼進物件字面值，方便逐項拿掉
 * 某個欄位，驗證缺料時是整筆放棄而不是輸出半成品。
 */
function storePage(tweetId: string, tweet: string, extra = ''): Document {
  const key = btoa(`Tweet:${tweetId}`)
  const source = `self.__x={"${key}":$R[1]={__id:"${key}",${tweet}}${extra}}`
  return new DOMParser().parseFromString(
    `<!doctype html><html><body><script>${source}</script></body></html>`,
    'text/html',
  )
}

const USER_NODES = [
  '"UserResults:1":$R[2]={__id:"UserResults:1",result:$R[3]={__ref:"User:1"}}',
  '"User:1":$R[4]={__id:"User:1",core:$R[5]={__ref:"client:User:1:core"},avatar:$R[6]={__ref:"client:User:1:avatar"}}',
  '"client:User:1:core":$R[7]={__id:"client:User:1:core",name:"Tibo",screen_name:"thsottiaux"}',
  '"client:User:1:avatar":$R[8]={__id:"client:User:1:avatar",image_url:"https://pbs.twimg.com/profile_images/1/a_normal.jpg"}',
].join(',')

const CORE_AND_DETAILS = (tweetId: string, details: string) => {
  const key = btoa(`Tweet:${tweetId}`)
  return [
    `"client:${key}:core":$R[9]={__id:"client:${key}:core",user_results:$R[10]={__ref:"UserResults:1"}}`,
    `"client:${key}:details":$R[11]={__id:"client:${key}:details",${details}}`,
  ].join(',')
}

describe('parseEmbeddedPost', () => {
  it('讀出未截斷的長貼文全文（note_tweet），不是 full_text 那 300 字', () => {
    const post = parseEmbeddedPost(asDoc('visible-ssr-ellipsis'), '2097043464538264003')!
    expect(post).not.toBeNull()
    expect(post.rawText).toHaveLength(422)
    expect(post.rawText.endsWith('Lands around 6pm PST today.')).toBe(true)
    expect(post.textComplete).toBe(true)
    expect(post.createdAt).toBe('2026-09-07T19:24:57.000Z')
    expect(post.author).toEqual({
      name: 'Tibo',
      handle: 'thsottiaux',
      avatarUrl: 'https://pbs.twimg.com/profile_images/2093807917833281537/2yBgpwVV_normal.jpg',
    })
  })

  it('圖片與替代文字；作者名稱裡的 emoji 正確還原', () => {
    const post = parseEmbeddedPost(asDoc('visible-ssr-localized'), '2089442390805233999')!
    expect(post.author.name).toBe('cats with jobs 🛠')
    expect(post.media).toEqual([
      {
        url: 'https://pbs.twimg.com/media/HP8wyBkXUAArI7e.jpg',
        alt: "A vet's office with a white cat peeking over the desk.",
      },
    ])
  })

  it('回覆貼文不含開頭的 @提及 —— display_text_range 已經標好了', () => {
    const post = parseEmbeddedPost(asDoc('visible-ssr-reply'), '2089153024648425811')!
    expect(post.rawText.startsWith('@')).toBe(false)
    expect(post.rawText).toBe('そのふくよかなぽんぽんに、顔を埋めたいです🤣🤣🤣😘😘😽')
  })

  it('引用貼文的 ID 讀得到', () => {
    const post = parseEmbeddedPost(asDoc('quoted-embedded'), '2090766694897619318')!
    expect(post.quotedId).toBe('2090675027670978569')
  })

  it('舊格式頁面的 store 一樣讀得到', () => {
    const post = parseEmbeddedPost(asDoc('plain'), '2083053369351090254')!
    expect(post.author.handle).toBe('thsottiaux')
    expect(post.rawText.length).toBeGreaterThan(100)
  })

  it('節點的 rest_id 對不上就整筆放棄，不拿同頁別人的貼文頂替', () => {
    const doc = storePage(
      '111',
      `rest_id:"222",core:$R[9]={__ref:"client:${btoa('Tweet:111')}:core"},details:$R[11]={__ref:"client:${btoa('Tweet:111')}:details"}`,
      `,${USER_NODES},${CORE_AND_DETAILS('111', 'full_text:"hi",created_at_ms:0')}`,
    )
    expect(parseEmbeddedPost(doc, '111')).toBeNull()
  })

  it('作者讀不出來就整筆放棄，不輸出沒有作者的卡片', () => {
    const key = btoa('Tweet:111')
    const doc = storePage(
      '111',
      `rest_id:"111",details:$R[11]={__ref:"client:${key}:details"}`,
      `,"client:${key}:details":$R[12]={__id:"client:${key}:details",full_text:"hi",created_at_ms:0}`,
    )
    expect(parseEmbeddedPost(doc, '111')).toBeNull()
  })

  it('說有 note_tweet 卻走不到全文時，如實標記為不完整', () => {
    const key = btoa('Tweet:111')
    const doc = storePage(
      '111',
      `rest_id:"111",core:$R[9]={__ref:"client:${key}:core"},details:$R[11]={__ref:"client:${key}:details"},note_tweet:$R[12]={__ref:"client:${key}:note_tweet"}`,
      `,${USER_NODES},${CORE_AND_DETAILS('111', 'full_text:"截斷的內文",created_at_ms:1788809097000')}`,
    )
    const post = parseEmbeddedPost(doc, '111')!
    expect(post.rawText).toBe('截斷的內文')
    expect(post.textComplete).toBe(false)
  })

  it('沒有 note_tweet 代表 full_text 就是全文', () => {
    const key = btoa('Tweet:111')
    const doc = storePage(
      '111',
      `rest_id:"111",core:$R[9]={__ref:"client:${key}:core"},details:$R[11]={__ref:"client:${key}:details"}`,
      `,${USER_NODES},${CORE_AND_DETAILS('111', 'full_text:"短貼文",created_at_ms:1788809097000')}`,
    )
    const post = parseEmbeddedPost(doc, '111')!
    expect(post.rawText).toBe('短貼文')
    expect(post.textComplete).toBe(true)
    expect(post.createdAt).toBe('2026-09-07T19:24:57.000Z')
  })

  it('沒有 store 或 ID 不是純數字時回 null', () => {
    expect(parseEmbeddedPost(doc('<article></article>'), '111')).toBeNull()
    expect(parseEmbeddedPost(asDoc('plain'), 'not-a-number')).toBeNull()
  })
})
