import type { CardSettings } from '../types'
import { DEFAULT_SETTINGS } from '../render/Card'
import { ASPECT_VALUE } from '../render/card.css'

const KEY = 'xframe.settings'

/**
 * 已移除的比例（16:9）仍可能存在舊使用者的儲存資料裡。直接套用會得到一個不在
 * ASPECT_VALUE 裡的值 —— 畫面上是「比例下拉選單沒有任何選項被選中」，而卡片
 * 靜靜退化成自動高度。不是崩潰，但使用者看不懂發生什麼事，所以退回預設值。
 */
function validAspect(v: unknown): v is CardSettings['aspect'] {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ASPECT_VALUE, v)
}

/** 只採用已知欄位，避免舊版殘留資料污染型別。 */
export function mergeSettings(raw: Partial<CardSettings> | undefined): CardSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  // `show`/`background` 須各自複製一份：單純 `{ ...DEFAULT_SETTINGS }` 只是淺拷貝，
  // 巢狀物件仍與 DEFAULT_SETTINGS 共用同一參照。下方對 out[key] 的 Object.assign
  // 若沒有這兩行，會直接改到 DEFAULT_SETTINGS 這個模組級單例本身，
  // 讓「預設值」在第一次合併後就被永久污染。
  const out: CardSettings = {
    ...DEFAULT_SETTINGS,
    show: { ...DEFAULT_SETTINGS.show },
    background: { ...DEFAULT_SETTINGS.background },
  }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof CardSettings)[]) {
    const v = raw[key]
    if (v === undefined) continue
    if (key === 'aspect' && !validAspect(v)) continue
    if (key === 'show' || key === 'background') {
      Object.assign(out[key], v)
    } else {
      out[key] = v as never
    }
  }
  return out
}

export async function loadSettings(): Promise<CardSettings> {
  const got = await chrome.storage.local.get(KEY)
  return mergeSettings(got?.[KEY] as Partial<CardSettings> | undefined)
}

export async function saveSettings(settings: CardSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings })
}
