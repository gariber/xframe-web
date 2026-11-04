import type { CardSettings } from '../src/types'
import { DEFAULT_SETTINGS } from '../src/render/Card'

/**
 * app 的版面鎖定：輸出固定 9:16（IG 限動），媒體照原比例、不裁切。
 * 網頁版的設定與預設不受影響。
 */
export function appSettings(base: CardSettings): CardSettings {
  return { ...base, aspect: '9:16', wholeMedia: true }
}

export const APP_DEFAULT_SETTINGS: CardSettings = appSettings(DEFAULT_SETTINGS)
