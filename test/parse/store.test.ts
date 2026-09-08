import { describe, it, expect } from 'vitest'
import {
  decodeJsString,
  intField,
  intsField,
  openStore,
  refField,
  refsField,
  stringField,
} from '../../src/parse/store'

function page(...scripts: string[]): Document {
  const body = scripts.map((source) => `<script>${source}</script>`).join('')
  return new DOMParser().parseFromString(`<!doctype html><html><body>${body}</body></html>`, 'text/html')
}

describe('decodeJsString', () => {
  it('沒有反斜線時原樣回傳', () => {
    expect(decodeJsString('Never gonna give you up')).toBe('Never gonna give you up')
  })

  it('常見的短逸出', () => {
    expect(decodeJsString('a\\nb\\tc')).toBe('a\nb\tc')
    expect(decodeJsString("We\\'ve investigated")).toBe("We've investigated")
    expect(decodeJsString('say \\"hi\\"')).toBe('say "hi"')
    expect(decodeJsString('C:\\\\path')).toBe('C:\\path')
  })

  it('\\uXXXX 與 \\u{…}', () => {
    expect(decodeJsString('\\u3042')).toBe('あ')
    expect(decodeJsString('\\u{1F43E}')).toBe('🐾')
  })

  it('\\xNN', () => {
    expect(decodeJsString('caf\\xe9')).toBe('café')
  })

  it('認不得的逸出只丟掉反斜線 —— 這正是 JS 自己的規則', () => {
    expect(decodeJsString('\\q\\-')).toBe('q-')
  })

  it('反斜線接換行是行接續，什麼都不產生', () => {
    expect(decodeJsString('a\\\nb')).toBe('ab')
  })

  it('半途結束的逸出不會丟例外', () => {
    expect(decodeJsString('tail\\')).toBe('tail')
    expect(decodeJsString('\\u12')).toBe('u12')
  })
})

describe('欄位讀取', () => {
  const body = '{__id:"n",full_text:"hello",text:"world",favorite_count:12,count:"7",range:$R[3]=[0,5]}'

  it('欄位名前面必須是 { 或 , —— 否則 text 會讀到 full_text', () => {
    expect(stringField(body, 'text')).toBe('world')
    expect(stringField(body, 'full_text')).toBe('hello')
  })

  it('整數同樣不會讀到後綴相同的別的欄位', () => {
    expect(intField(body, 'count')).toBe(7)
    expect(intField(body, 'favorite_count')).toBe(12)
  })

  it('整數陣列', () => {
    expect(intsField(body, 'range')).toEqual([0, 5])
    expect(intsField(body, 'missing')).toBeNull()
  })

  it('缺席的欄位回 null，不是空字串或 0', () => {
    expect(stringField(body, 'nope')).toBeNull()
    expect(intField(body, 'nope')).toBeNull()
  })

  it('參照與參照陣列', () => {
    const refs = '{__id:"n",core:$R[1]={__ref:"User:1"},media:$R[2]={__refs:$R[3]=["a","b"]},empty:$R[4]={__refs:$R[5]=[]}}'
    expect(refField(refs, 'core')).toBe('User:1')
    expect(refsField(refs, 'media')).toEqual(['a', 'b'])
    expect(refsField(refs, 'empty')).toEqual([])
    expect(refField(refs, 'media')).toBeNull()
  })
})

describe('openStore().node', () => {
  it('依 __id 取出節點，鍵有沒有引號都認得', () => {
    const store = openStore(page(
      'x={"client:a=b:core":$R[1]={__id:"client:a=b:core",name:"Tibo"},Plain:$R[2]={__id:"Plain",name:"Aoi"}}',
    ))
    expect(stringField(store.node('client:a=b:core')!, 'name')).toBe('Tibo')
    expect(stringField(store.node('Plain')!, 'name')).toBe('Aoi')
  })

  it('只有參照的佔位節點不算數 —— 節點必須自報同一個 __id', () => {
    const store = openStore(page('x={core:$R[1]={__ref:"User:1"}}'))
    expect(store.node('User:1')).toBeNull()
  })

  it('先遇到參照、後面才是本體時仍取得到本體', () => {
    const store = openStore(page(
      'x={core:$R[1]={__ref:"User:1"},"User:1":$R[2]={__id:"User:1",name:"Tibo"}}',
    ))
    expect(stringField(store.node('User:1')!, 'name')).toBe('Tibo')
  })

  it('字串裡的大括號不會把節點切斷', () => {
    const store = openStore(page(
      'x={"T:1":$R[1]={__id:"T:1",full_text:"function(){ return } // }",name:"Tibo"}}',
    ))
    const node = store.node('T:1')!
    expect(stringField(node, 'full_text')).toBe('function(){ return } // }')
    expect(stringField(node, 'name')).toBe('Tibo')
  })

  it('讀到的是節點自己的欄位，不是巢狀子物件的同名欄位', () => {
    const store = openStore(page(
      'x={"T:1":$R[1]={__id:"T:1",inner:$R[2]={__id:"T:1:inner",v:"deep"},v:"outer"}}',
    ))
    expect(stringField(store.node('T:1')!, 'v')).toBe('outer')
  })

  it('節點靠自己的鍵定址 —— X 的序列化每個節點都有一個鍵', () => {
    const store = openStore(page(
      'x={"T:1":$R[1]={__id:"T:1",inner:$R[2]={__ref:"T:1:inner"}},"T:1:inner":$R[3]={__id:"T:1:inner",v:"deep"}}',
    ))
    expect(stringField(store.node('T:1:inner')!, 'v')).toBe('deep')
  })

  it('只讀 script —— 頁面上其他地方長得再像也不算', () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><body><div dir="auto">{"T:1":{__id:"T:1",name:"forged"}}</div></body></html>',
      'text/html',
    )
    expect(openStore(doc).node('T:1')).toBeNull()
  })

  it('找不到就回 null，不會丟例外', () => {
    expect(openStore(page('x={}')).node('T:1')).toBeNull()
    expect(openStore(page()).node('T:1')).toBeNull()
  })
})
