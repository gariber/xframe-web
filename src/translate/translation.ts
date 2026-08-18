import type { Post, TranslatedFrom } from '../types'
import { tokenize } from '../parse/tokenize'

export { TRANSLATED_FROM_LABEL, TRANSLATED_FROM_OPTIONS } from '../render/translated'

export type TextLanguage = {
  kind: 'chinese' | 'foreign' | 'none'
  tag: 'zh' | 'en' | 'ja' | 'ko' | 'und'
}

export type TranslationPlan = {
  main: TextLanguage
  quoted?: TextLanguage
  hasForeignText: boolean
  /** 偵測到的來源語言，作為「翻譯自◯文」的預設值；使用者可以覆蓋。 */
  from: TranslatedFrom
}

export type TranslationDraft = {
  main: string
  quoted: string
}

/**
 * 已套用譯文時，同時握著原文與譯文兩份 Post，以及目前顯示哪一份。
 *
 * 保留原文而不是就地覆蓋，是為了「顯示原文／顯示譯文」能來回切，而且「還原
 * 原文」不必重新抓一次推文。
 */
export type TranslatedVersion = {
  original: Post
  translated: Post
  view: 'original' | 'translated'
}

/*
 * 貼上框一開始是空的，不預先填入原文。
 *
 * 這是個「把 X 翻好的字貼進來」的框：預填原文的話使用者得先全選刪掉才能貼，
 * 而且畫面上會同時出現兩份一模一樣的原文（上面的來源區塊已經有一份），看起來
 * 像是哪裡出錯了。空框配 placeholder 才讀得出它在等什麼。
 */
export function emptyTranslationDraft(): TranslationDraft {
  return { main: '', quoted: '' }
}

/**
 * 這不是一般用途的語言辨識器，只回答「這則貼文值不值得提供翻譯貼上框」。
 *
 * XFrame 的產品規則是簡體、正體都不翻。網址、帳號與 hashtag 也不應因為
 * 出現拉丁字母就讓中文推文冒出翻譯框，所以先排除這些非句子內容。全漢字
 * 日文無法可靠地與中文區分；這種模糊案例保守當中文，不主動提示——這也正是
 * 卡片標示要留一個手動覆蓋下拉的原因。
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
    // 才不會讓一個產品名壓過整句中文。英文占明顯多數的混合句仍提供翻譯框。
    if (latinWords.length >= 2 && han < latinWords.length * 2) {
      return { kind: 'foreign', tag: 'en' }
    }
    return { kind: 'chinese', tag: 'zh' }
  }

  // 只有 emoji、數字、標點、網址、帳號或 hashtag，不值得顯示翻譯流程。
  if (letters < 2) return { kind: 'none', tag: 'und' }
  return { kind: 'foreign', tag: 'en' }
}

/**
 * 偵測結果轉成標示用的語言。
 *
 * `und` 代表偵測不出來（只有 emoji、數字之類），落回英文——標示要嘛講一個
 * 具體語言，要嘛不該出現；「翻譯自未知語言」對看卡片的人沒有意義。這個值
 * 本來就可以被使用者手動覆蓋。
 */
export function toTranslatedFrom(tag: TextLanguage['tag']): TranslatedFrom {
  return tag === 'und' ? 'en' : tag
}

export function buildTranslationPlan(post: Post): TranslationPlan {
  const main = detectTextLanguage(post.rawText)
  const quoted = post.quoted ? detectTextLanguage(post.quoted.rawText) : undefined
  const firstForeign = [main, quoted].find((part) => part?.kind === 'foreign')
  return {
    main,
    quoted,
    hasForeignText: Boolean(firstForeign),
    from: toTranslatedFrom(firstForeign?.tag ?? main.tag),
  }
}

function comparable(value: string): string {
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanVisibleText(value: string): string {
  return value.replace(/ /g, ' ').trim()
}

/**
 * 把使用者貼上的譯文套進 Post。
 *
 * 只採用原先判定為外文、而且確實與原文不同的欄位。貼上框留空、或原封不動把
 * 原文貼回來時，該欄位維持原樣——這樣「套用」不會在什麼都沒改的情況下把卡片
 * 標成譯文，卡片上那行「翻譯自◯文」才不會說謊。
 *
 * 兩個欄位都沒有實質改變時回傳 null，呼叫端據此提示使用者，而不是靜靜地
 * 進入一個看起來已套用、實際上沒變的狀態。
 */
export function applyPastedTranslation(
  post: Post,
  plan: TranslationPlan,
  draft: TranslationDraft,
  from: TranslatedFrom,
): Post | null {
  const main = cleanVisibleText(draft.main)
  const quoted = cleanVisibleText(draft.quoted)

  const mainChanged =
    plan.main.kind === 'foreign' && Boolean(main) && comparable(main) !== comparable(post.rawText)
  const quotedChanged =
    Boolean(post.quoted) &&
    plan.quoted?.kind === 'foreign' &&
    Boolean(quoted) &&
    comparable(quoted) !== comparable(post.quoted!.rawText)

  if (!mainChanged && !quotedChanged) return null

  return {
    ...post,
    translatedFrom: from,
    ...(mainChanged ? { rawText: main, text: tokenize(main) } : {}),
    ...(post.quoted
      ? {
          quoted: {
            ...post.quoted,
            ...(quotedChanged
              ? { rawText: quoted, text: tokenize(quoted), translatedFrom: from }
              : {}),
          },
        }
      : {}),
  }
}
