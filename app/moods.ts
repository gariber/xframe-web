import type { CardSettings } from '../src/types'
import { STYLE_PRESETS, type StylePatch } from '../src/render/styles'
import { findPaper } from '../src/render/papers'
import { HUMOR_PAPERS } from './papers-humor'
import { APP_FONT_STACK, type AppFont } from './typography'
import { appSettings } from './settings'

export type Mood = {
  id: 'serious' | 'literary' | 'humor' | 'soft'
  name: string
  font: AppFont
  style: StylePatch
  paperIds: string[]
}

const preset = (id: string) => STYLE_PRESETS.find((p) => p.id === id)!.style

/** 依內容的氣質挑：嚴肅→黑白夜間，文學→雜誌感明朝，幽默→活潑紙張，柔和→柔霧玻璃。 */
export const MOODS: Mood[] = [
  { id: 'serious', name: '嚴肅', font: 'sans', style: preset('night'), paperIds: ['noir', 'ink', 'carbon', 'slash', 'night-grid'] },
  { id: 'literary', name: '文學', font: 'mincho', style: preset('magazine'), paperIds: ['linen', 'paper', 'sand', 'dune', 'moss'] },
  { id: 'humor', name: '幽默', font: 'sans', style: preset('clean'), paperIds: HUMOR_PAPERS.map((p) => p.id) },
  { id: 'soft', name: '柔和', font: 'sans', style: preset('haze'), paperIds: ['lilac', 'peach', 'rose', 'sky', 'mint', 'sunset', 'aurora'] },
]

/** 換紙時底板色與文字色跟著紙走（和網頁版選紙一樣成對套用）。 */
function withPaper(settings: CardSettings, id: string): CardSettings {
  const paper = findPaper(id)
  return { ...settings, bgId: paper.id, panelColor: paper.panel, textColor: paper.ink }
}

function pick(pool: string[], random: () => number): string {
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

export function applyMood(settings: CardSettings, mood: Mood, random: () => number = Math.random): CardSettings {
  const styled = appSettings({ ...settings, ...mood.style, fontFamily: APP_FONT_STACK[mood.font] })
  return withPaper(styled, pick(mood.paperIds, random))
}

/** 同氛圍換一張，不會抽到現在這張——按了沒變化會以為按鈕壞了。 */
export function reshufflePaper(settings: CardSettings, mood: Mood, random: () => number = Math.random): CardSettings {
  const others = mood.paperIds.filter((id) => id !== settings.bgId)
  return withPaper(settings, pick(others.length ? others : mood.paperIds, random))
}
