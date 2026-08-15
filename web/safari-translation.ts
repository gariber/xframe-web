import type { Post } from '../src/types'
import { tokenize } from '../src/parse/tokenize'

export type TextLanguage = {
  kind: 'chinese' | 'foreign' | 'none'
  /** `und` 代表交給 Safari 自行判斷來源語言。 */
  tag: 'zh' | 'ja' | 'ko' | 'und'
}

export type SafariTranslationPlan = {
  main: TextLanguage
  quoted?: TextLanguage
  hasForeignText: boolean
  pageLanguage: string
}

export type TranslationSnapshot = {
  main: string | null
  quoted: string | null
}

/**
 * 這不是一般用途的語言辨識器，只回答「是否值得提示 Safari 翻譯」。
 *
 * XFrame 的產品規則是簡體、正體都不翻。網址、帳號與 hashtag 也不應因為
 * 出現拉丁字母就讓中文推文冒出翻譯提示，所以先排除這些非句子內容。全漢字
 * 日文無法可靠地與中文區分；這種模糊案例保守當中文，不主動提示。
 */
export function detectTextLanguage(raw: string): TextLanguage {
  const prose = raw
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/@\w{1,15}/gu, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')

  const count = (pattern: RegExp) => (prose.match(pattern) ?? []).length
  const han = count(/\p{Script=Han}/gu)
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)
  const hangul = count(/\p{Script=Hangul}/gu)
  const letters = count(/\p{L}/gu)
  const latinWords = prose.match(/\p{Script=Latin}[\p{Script=Latin}\p{M}'’-]*/gu) ?? []

  if (kana >= 2) return { kind: 'foreign', tag: 'ja' }
  if (hangul >= 2) return { kind: 'foreign', tag: 'ko' }

  if (han > 0) {
    // 中文裡常見 OpenAI、GPT-5、XFrame；以「英文單字數」而非字母數比較，
    // 才不會讓一個產品名壓過整句中文。英文占明顯多數的混合句仍提示翻譯。
    if (latinWords.length >= 2 && han < latinWords.length * 2) {
      return { kind: 'foreign', tag: 'und' }
    }
    return { kind: 'chinese', tag: 'zh' }
  }

  // 只有 emoji、數字、標點、網址、帳號或 hashtag，不值得顯示翻譯流程。
  if (letters < 2) return { kind: 'none', tag: 'und' }
  return { kind: 'foreign', tag: 'und' }
}

export function buildSafariTranslationPlan(post: Post): SafariTranslationPlan {
  const main = detectTextLanguage(post.rawText)
  const quoted = post.quoted ? detectTextLanguage(post.quoted.rawText) : undefined
  const firstForeign = [main, quoted].find((part) => part?.kind === 'foreign')
  return {
    main,
    quoted,
    hasForeignText: Boolean(firstForeign),
    pageLanguage: firstForeign?.tag ?? 'zh-Hant',
  }
}

function visibleText(root: ParentNode, selector: string): string | null {
  const text = root.querySelector(selector)?.textContent ?? ''
  return text.trim() ? text : null
}

export function readTranslationSnapshot(canvas: ParentNode): TranslationSnapshot {
  return {
    main: visibleText(canvas, '[data-part="body"]'),
    quoted: visibleText(canvas, '[data-part="quote-body"]'),
  }
}

function comparable(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanVisibleText(value: string): string {
  return value.replace(/\u00a0/g, ' ').trim()
}

/**
 * 只採用原先判定為外文、而且確實與原文不同的可見文字。Safari 沒翻譯、只翻了
 * 作者資訊，或意外動到中文欄位時，都不會污染正式 Post。
 */
export function applyTranslationSnapshot(
  post: Post,
  plan: SafariTranslationPlan,
  snapshot: TranslationSnapshot,
): Post | null {
  const main = snapshot.main ? cleanVisibleText(snapshot.main) : null
  const quoted = snapshot.quoted ? cleanVisibleText(snapshot.quoted) : null

  const mainChanged =
    plan.main.kind === 'foreign' && Boolean(main) && comparable(main!) !== comparable(post.rawText)
  const quotedChanged =
    Boolean(post.quoted) &&
    plan.quoted?.kind === 'foreign' &&
    Boolean(quoted) &&
    comparable(quoted!) !== comparable(post.quoted!.rawText)

  if (!mainChanged && !quotedChanged) return null

  return {
    ...post,
    ...(mainChanged ? { rawText: main!, text: tokenize(main!) } : {}),
    ...(post.quoted
      ? {
          quoted: {
            ...post.quoted,
            ...(quotedChanged ? { rawText: quoted!, text: tokenize(quoted!) } : {}),
          },
        }
      : {}),
  }
}

export function translationSignature(root: ParentNode): string {
  const snapshot = readTranslationSnapshot(root)
  return JSON.stringify(snapshot)
}

/** 只在主文／引用正文真的改變時通知，樣式與圖片載入不會誤觸。 */
export function observeSafariTranslation(root: ParentNode, onChange: (snapshot: TranslationSnapshot) => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined
  let signature = translationSignature(root)
  const observer = new MutationObserver(() => {
    const next = translationSignature(root)
    if (next === signature) return
    signature = next
    onChange(readTranslationSnapshot(root))
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true })
  return () => observer.disconnect()
}
