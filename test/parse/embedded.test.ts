import { describe, it, expect } from 'vitest'
import { parseEmbeddedCounts } from '../../src/parse/embedded'

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
  it('以推文 ID 為鍵讀出四項計數', () => {
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
