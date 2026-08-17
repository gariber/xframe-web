import { describe, expect, it } from 'vitest'
import type { Post } from '../../src/types'
import {
  applyPastedTranslation,
  buildTranslationPlan,
  detectTextLanguage,
  toTranslatedFrom,
} from '../../web/translation'
import { translatedLabel } from '../../src/render/translated'

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
    ['GPT-5 now supports longer posts.', 'en'],
    ['新しいモデルが発表されました。', 'ja'],
    ['새로운 기능이 출시되었습니다.', 'ko'],
    ['OpenAI launches 中文 support today.', 'en'],
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

describe('buildTranslationPlan', () => {
  it('主文中文、引用英文時仍提供貼上框，來源語言取第一個外文欄位', () => {
    const plan = buildTranslationPlan(makePost('這是一則中文推文。', 'English quoted text here.'))
    expect(plan.main.kind).toBe('chinese')
    expect(plan.quoted?.kind).toBe('foreign')
    expect(plan.hasForeignText).toBe(true)
    expect(plan.from).toBe('en')
  })

  it('主文日文時來源語言判定為日文', () => {
    const plan = buildTranslationPlan(makePost('充電中です。満タンになるまで動きません。'))
    expect(plan.from).toBe('ja')
  })

  it('整則都是中文時不提供貼上框', () => {
    expect(buildTranslationPlan(makePost('這是一則中文推文。')).hasForeignText).toBe(false)
  })
})

describe('toTranslatedFrom', () => {
  it('偵測不出語言時落回英文，卡片不會標成「翻譯自未知語言」', () => {
    expect(toTranslatedFrom('und')).toBe('en')
    expect(toTranslatedFrom('ja')).toBe('ja')
  })
})

describe('translatedLabel', () => {
  it('比照 X 的說法', () => {
    expect(translatedLabel('ja')).toBe('翻譯自日文')
    expect(translatedLabel('en')).toBe('翻譯自英文')
  })
})

describe('applyPastedTranslation', () => {
  it('只更新外文欄位，rawText 與 tokenize 後的 segments 同步', () => {
    const original = makePost('Read @openai at https://example.com', '這是中文引用。')
    const plan = buildTranslationPlan(original)
    const next = applyPastedTranslation(
      original,
      plan,
      { main: '請閱讀 @openai 的內容：https://example.com', quoted: '不應採用的中文改寫' },
      'en',
    )!

    expect(next.rawText).toBe('請閱讀 @openai 的內容：https://example.com')
    expect(next.text.map((part) => part.value).join('')).toBe(next.rawText)
    expect(next.text.some((part) => part.type === 'mention')).toBe(true)
    expect(next.text.some((part) => part.type === 'link')).toBe(true)
    // 引用是中文，不在翻譯範圍內，貼什麼都不採用
    expect(next.quoted?.rawText).toBe('這是中文引用。')
    expect(next.author).toBe(original.author)
  })

  it('記下來源語言，卡片才畫得出「翻譯自◯文」', () => {
    const original = makePost('充電中です。満タンになるまで動きません。')
    const next = applyPastedTranslation(
      original,
      buildTranslationPlan(original),
      { main: '充電中。充飽之前不會動。', quoted: '' },
      'ja',
    )!
    expect(next.translatedFrom).toBe('ja')
    expect(translatedLabel(next.translatedFrom!)).toBe('翻譯自日文')
  })

  it('貼上框留空時不套用，也不把卡片標成譯文', () => {
    const original = makePost('This is still English.')
    const plan = buildTranslationPlan(original)
    expect(applyPastedTranslation(original, plan, { main: '', quoted: '' }, 'en')).toBeNull()
  })

  it('把原文原封不動貼回來時不算譯文——標示不能說謊', () => {
    const original = makePost('This is still English.')
    const plan = buildTranslationPlan(original)
    expect(
      applyPastedTranslation(original, plan, { main: original.rawText, quoted: '' }, 'en'),
    ).toBeNull()
  })

  it('原文未被取代時不會殘留 translatedFrom', () => {
    const original = makePost('This is still English.')
    expect(original.translatedFrom).toBeUndefined()
  })
})
