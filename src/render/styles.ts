import type { CardSettings } from '../types'
import { findPaper } from './papers'

/**
 * 字體與樣式預設：跟 ThreadsFrame 同一套。
 *
 * ## 單位
 *
 * ThreadsFrame 的數值是以 1080px 寬的成品圖量的；XFrame 的卡片是 DOM，數值是
 * 版面上的 px，匯出時整張放大到 1080 寬。手機上卡片的版面寬度大約 360，所以
 * 留白、圓角、模糊這三個「量在畫面上的尺寸」一律除以 3 換過來 —— 兩邊做出來的
 * 卡片，留白佔畫面的比例才會一樣。
 *
 * 字級不照除：XFrame 的字級另有一套依內文長度縮放的規則（fitFontSize），
 * 基準是 20。這裡只保留各個預設之間的相對大小（ThreadsFrame 的基準是 34），
 * 「大字報」照樣比「純淨白」大。
 */
const TF_UNIT = 1 / 3
const TF_TEXT_BASE = 34
const XF_TEXT_BASE = 20

export type Font = { id: string; name: string; stack: string }

/** 只用系統內建字型：不外連字型檔，離線與隱私都不受影響。 */
export const FONTS: Font[] = [
  {
    id: 'sans',
    name: '黑體',
    stack: '"PingFang TC", "Noto Sans TC", "Hiragino Sans TC", "Microsoft JhengHei", system-ui, -apple-system, sans-serif',
  },
  {
    id: 'serif',
    name: '襯線',
    stack: '"Songti TC", "Noto Serif TC", "Source Han Serif TC", "Times New Roman", Georgia, serif',
  },
  {
    id: 'rounded',
    name: '圓體',
    stack: '"Yuanti TC", "Hiragino Maru Gothic ProN", "Noto Sans TC", "PingFang TC", system-ui, sans-serif',
  },
  {
    id: 'mono',
    name: '等寬',
    stack: 'ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono CJK TC", monospace',
  },
]

/** 目前的字體堆疊對應到哪一個選項；舊存檔裡的堆疊認不得時算黑體。 */
export function fontIdOf(stack: string): string {
  return FONTS.find((f) => f.stack === stack)?.id ?? 'sans'
}

type TfRatio = 'portrait' | 'tall' | 'square' | 'auto'
const RATIO: Record<TfRatio, CardSettings['aspect']> = {
  portrait: '4:5',
  tall: '9:16',
  square: '1:1',
  auto: 'auto',
}

/** 照抄 ThreadsFrame 的 presets.ts 的寫法與數值，換算在 toSettings 裡。 */
type TfStyle = {
  bgId: string
  pad: number
  textSize: number
  radius: number
  panelAlpha: number
  panelColor: string
  textColor: string
  ratio: TfRatio
  glass: boolean
  blur: number
}

/** 套用樣式時會被覆寫的欄位。顯示項目、隱私、時間格式屬於使用者的選擇，不動。 */
export type StylePatch = Pick<
  CardSettings,
  'bgId' | 'padding' | 'fontSize' | 'radius' | 'panelOpacity' | 'panelColor' | 'textColor' | 'aspect' | 'glass' | 'blur'
>

export type StylePreset = { id: string; name: string; style: StylePatch }

function toSettings(tf: TfStyle): StylePatch {
  return {
    bgId: tf.bgId,
    padding: Math.round(tf.pad * TF_UNIT),
    fontSize: Math.round((tf.textSize / TF_TEXT_BASE) * XF_TEXT_BASE),
    radius: Math.round(tf.radius * TF_UNIT),
    panelOpacity: tf.panelAlpha,
    panelColor: tf.panelColor,
    textColor: tf.textColor,
    aspect: RATIO[tf.ratio],
    glass: tf.glass,
    blur: Math.round(tf.blur * TF_UNIT),
  }
}

const TF_PRESETS: { id: string; name: string; style: TfStyle }[] = [
  {
    id: 'clean', name: '純淨白',
    style: { bgId: 'paper', pad: 64, textSize: 34, radius: 28, panelAlpha: 1, panelColor: '#ffffff', textColor: '#16130f', ratio: 'auto', glass: false, blur: 40 },
  },
  {
    id: 'night', name: '夜間',
    style: { bgId: 'ink', pad: 64, textSize: 34, radius: 28, panelAlpha: 1, panelColor: '#1d1916', textColor: '#f2ece6', ratio: 'auto', glass: false, blur: 40 },
  },
  {
    id: 'magazine', name: '雜誌感',
    style: { bgId: 'linen', pad: 104, textSize: 30, radius: 4, panelAlpha: 1, panelColor: '#ffffff', textColor: '#2b2521', ratio: 'portrait', glass: false, blur: 40 },
  },
  {
    id: 'note', name: '便條紙',
    style: { bgId: 'sand', pad: 44, textSize: 32, radius: 12, panelAlpha: 1, panelColor: '#fffdf6', textColor: '#3b2f24', ratio: 'portrait', glass: false, blur: 40 },
  },
  {
    id: 'poster', name: '大字報',
    style: { bgId: 'ember', pad: 72, textSize: 48, radius: 32, panelAlpha: 1, panelColor: '#3a1d1a', textColor: '#fdeee4', ratio: 'square', glass: false, blur: 40 },
  },
  {
    id: 'haze', name: '柔霧',
    style: { bgId: 'lilac', pad: 72, textSize: 34, radius: 40, panelAlpha: 0.45, panelColor: '#ffffff', textColor: '#2b2340', ratio: 'portrait', glass: true, blur: 48 },
  },
  {
    id: 'glass-sunset', name: '夕燒玻璃',
    style: { bgId: 'sunset', pad: 72, textSize: 34, radius: 36, panelAlpha: 0.4, panelColor: '#1a0f0d', textColor: '#fdf1ec', ratio: 'portrait', glass: true, blur: 56 },
  },
  {
    id: 'glass-aurora', name: '極光玻璃',
    style: { bgId: 'aurora', pad: 72, textSize: 34, radius: 36, panelAlpha: 0.4, panelColor: '#0b171d', textColor: '#e9f7f4', ratio: 'portrait', glass: true, blur: 56 },
  },
]

export const STYLE_PRESETS: StylePreset[] = TF_PRESETS.map((p) => ({ id: p.id, name: p.name, style: toSettings(p.style) }))

/** 目前的設定是不是就是這個樣式（樣式列上要把它標成選中）。 */
export function matchesPreset(settings: CardSettings, preset: StylePreset): boolean {
  return (Object.keys(preset.style) as (keyof StylePatch)[]).every((key) => settings[key] === preset.style[key])
}

/**
 * ThreadsFrame 的預設樣式：純黑紙、同色系實心底板、不開毛玻璃。
 * 底板色與文字色取自同一張紙 —— 分開寫死會做出白底白字。
 */
const DEFAULT_PAPER = findPaper('noir')
export const DEFAULT_STYLE: Omit<StylePatch, 'aspect' | 'fontSize'> = {
  bgId: DEFAULT_PAPER.id,
  padding: Math.round(64 * TF_UNIT),
  radius: Math.round(28 * TF_UNIT),
  panelOpacity: 1,
  panelColor: DEFAULT_PAPER.panel,
  textColor: DEFAULT_PAPER.ink,
  glass: false,
  blur: Math.round(40 * TF_UNIT),
}

/** 存檔裡屬於「樣式」的欄位。舊版的存檔沒有 bgId 時，這幾個欄位一起作廢。 */
export const STYLE_KEYS = [
  'padding', 'panelColor', 'panelOpacity', 'radius', 'glass', 'blur', 'fontFamily', 'textColor',
] as const
