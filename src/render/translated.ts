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

/**
 * Grok 的官方標誌，由專案擁有者提供。
 *
 * 不是從 simple-icons 來的（那份沒有收 Grok），所以路徑直接留在這裡並註明
 * 來源。viewBox 是 600×600 而非其餘圖示的 24×24 —— 官方原檔就是這個尺寸，
 * 照抄比自己換算安全：重畫座標等於重繪商標，差一點就不是那個標誌了。
 *
 * X 站上的譯文標記用的就是這個標誌，卡片跟著用，讀者才認得出是同一件事。
 */
export const GROK_LOGO_VIEWBOX = '0 0 600 600'
export const GROK_LOGO_PATH =
  'm231.8 382.3 199.4-147.5c9.8-7.2 23.8-4.4 28.4 6.8A164 164 0 0 1 424.4 421c-48.8 48.8-116.7 59.5-178.7 35.1l-67.8 31.4c97.2 66.6 215.3 50.1 289-23.8a223 223 0 0 0 59.7-210.5l.2.2c-24.6-105.8 6-148.1 68.7-234.6l4.5-6.2-82.5 82.6V95L231.7 382.3m-41.1 35.8c-69.8-66.8-57.8-170 1.8-229.6a166 166 0 0 1 179.1-35.7l67.6-31.2a195 195 0 0 0-45.7-25 224 224 0 0 0-243.8 49.2 226 226 0 0 0-49 244C126 452 84.2 496 42 540.5c-15 15.7-30 31.4-42 48z'
