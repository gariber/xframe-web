import { describe, expect, it } from 'vitest'
import type { Post } from '../../src/types'
import {
  applyTranslationSnapshot,
  buildSafariTranslationPlan,
  detectTextLanguage,
  observeSafariTranslation,
  readTranslationSnapshot,
} from '../../web/safari-translation'

function makePost(rawText: string, quotedText?: string): Post {
  const base = {
    id: '1',
    url: 'https://x.com/example/status/1',
    platform: 'x' as const,
    author: { name: 'Example', handle: 'example', handleDisplay: '@example', avatarUrl: '' },
    rawText,
    text: [{ type: 'text' as const, value: rawText }],
    createdAt: '2026-08-09T00:00:00.000Z',
    metrics: [],
    media: [],
    source: 'fetch' as const,
    textComplete: true,
  }
  return quotedText
    ? {
        ...base,
        quoted: {
          ...base,
          id: '2',
          url: 'https://x.com/quoted/status/2',
          rawText: quotedText,
          text: [{ type: 'text', value: quotedText }],
        },
      }
    : base
}

describe('detectTextLanguage', () => {
  it.each([
    '这次更新支持长文，也可以直接分享。',
    '這次更新支援長文，也可以直接分享。',
    'OpenAI 發表 GPT-5，今天開始測試。',
    '好',
  ])('簡體、正體與中文混產品名都不提示翻譯：%s', (text) => {
    expect(detectTextLanguage(text).kind).toBe('chinese')
  })

  it.each([
    ['GPT-5 now supports longer posts.', 'und'],
    ['新しいモデルが発表されました。', 'ja'],
    ['새로운 기능이 출시되었습니다.', 'ko'],
    ['OpenAI launches 中文 support today.', 'und'],
  ])('外文會提示 Safari 翻譯：%s', (text, tag) => {
    expect(detectTextLanguage(text)).toEqual({ kind: 'foreign', tag })
  })

  it.each([
    '@openai https://x.com/a 🎉',
    '#AI 2026 🎉',
    '12345 !!!',
  ])('網址、帳號、hashtag、emoji 與數字不會單獨觸發：%s', (text) => {
    expect(detectTextLanguage(text).kind).toBe('none')
  })

  it('全漢字日文無法可靠區分，保守視為中文而不誤提示', () => {
    expect(detectTextLanguage('東京大学研究発表').kind).toBe('chinese')
  })
})

describe('buildSafariTranslationPlan', () => {
  it('主文中文、引用英文時只開放引用文字給 Safari', () => {
    const plan = buildSafariTranslationPlan(makePost('這是一則中文推文。', 'This quote is in English.'))
    expect(plan.main.kind).toBe('chinese')
    expect(plan.quoted?.kind).toBe('foreign')
    expect(plan.hasForeignText).toBe(true)
  })

  it('主文英文、引用中文時只開放主文', () => {
    const plan = buildSafariTranslationPlan(makePost('This post is in English.', '這是中文引用。'))
    expect(plan.main.kind).toBe('foreign')
    expect(plan.quoted?.kind).toBe('chinese')
  })
})

describe('Safari 可見譯文快照', () => {
  it('只讀主文與引用正文，不混入作者或統計', () => {
    const canvas = document.createElement('div')
    canvas.innerHTML = `
      <div class="author">Do not include me</div>
      <div data-part="body">主文譯文</div>
      <div data-part="quote-body">引用譯文</div>
      <div data-part="stats">999</div>
    `
    expect(readTranslationSnapshot(canvas)).toEqual({ main: '主文譯文', quoted: '引用譯文' })
  })

  it('只更新外文欄位，rawText 與 tokenize 後的 segments 同步', () => {
    const original = makePost('Read @openai at https://example.com', '這是中文引用。')
    const plan = buildSafariTranslationPlan(original)
    const next = applyTranslationSnapshot(original, plan, {
      main: '請閱讀 @openai 的內容：https://example.com',
      quoted: '不應採用的中文改寫',
    })!

    expect(next.rawText).toBe('請閱讀 @openai 的內容：https://example.com')
    expect(next.text.map((part) => part.value).join('')).toBe(next.rawText)
    expect(next.text.some((part) => part.type === 'mention')).toBe(true)
    expect(next.text.some((part) => part.type === 'link')).toBe(true)
    expect(next.quoted?.rawText).toBe('這是中文引用。')
    expect(next.author).toBe(original.author)
  })

  it('Safari 尚未翻譯時不製造一份假譯文', () => {
    const original = makePost('This is still English.')
    const plan = buildSafariTranslationPlan(original)
    expect(applyTranslationSnapshot(original, plan, { main: original.rawText, quoted: null })).toBeNull()
  })

  it('正文真的變動才通知，停止 observer 後不再通知', async () => {
    const canvas = document.createElement('div')
    canvas.innerHTML = '<div data-part="body">English text</div>'
    let calls = 0
    const stop = observeSafariTranslation(canvas, () => { calls += 1 })
    canvas.querySelector('[data-part="body"]')!.textContent = '繁體中文譯文'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(1)

    stop()
    canvas.querySelector('[data-part="body"]')!.textContent = '另一份譯文'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(1)
  })
})
