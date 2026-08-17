import type { TranslatedFrom } from '../types'

/**
 * 卡片標示與設定下拉共用的語言名。
 *
 * 放在 src/render 而不是 web/：卡片本身要畫這行字，而卡片同時被 Chrome 擴充
 * 功能和網頁版使用。放進 web/ 的話擴充功能就得反向依賴網頁版的模組。
 */
export const TRANSLATED_FROM_LABEL: Record<TranslatedFrom, string> = {
  ja: '日文',
  ko: '韓文',
  en: '英文',
  zh: '中文',
}

export const TRANSLATED_FROM_OPTIONS = Object.keys(TRANSLATED_FROM_LABEL) as TranslatedFrom[]

/** 卡片上那一行的完整文字，比照 X 自己的說法。 */
export function translatedLabel(from: TranslatedFrom): string {
  return `翻譯自${TRANSLATED_FROM_LABEL[from]}`
}
