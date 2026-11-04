import type { TypeTuning } from '../src/types'

export type { TypeTuning }

export const SANS_STACK = '"PingFang TC", system-ui, sans-serif'
export const MINCHO_STACK = '"Hiragino Mincho ProN", "Songti TC", serif'

export type AppFont = 'sans' | 'mincho'

export const APP_FONT_STACK: Record<AppFont, string> = { sans: SANS_STACK, mincho: MINCHO_STACK }

/** 使用者 2026-10-29 在比較頁挑的「D 雜誌」：兩種字體用同一組。 */
const MAGAZINE: TypeTuning = { lineHeight: 1.9, letterSpacingEm: 0.06, bodyWeight: 300, nameWeight: 600 }

export const APP_TYPE: Record<AppFont, TypeTuning> = { sans: MAGAZINE, mincho: MAGAZINE }
