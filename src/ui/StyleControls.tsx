import { useEffect, useState } from 'preact/hooks'
import type { CardSettings } from '../types'
import { LIBRARY, PAPERS, randomPaper, type Paper } from '../render/papers'
import { FONTS, STYLE_PRESETS, fontIdOf, matchesPreset, type StylePatch } from '../render/styles'

/*
 * 樣式與背景紙張的控制項，照 ThreadsFrame 的編排：
 *
 * - 「樣式」一排常駐在主畫面 —— 挑樣式是每次分享都會做的事，不該藏在面板裡。
 * - 「微調」裡才是細項：背景紙張（十四款＋紙庫）與畫布排版。
 *
 * 網頁版與擴充功能面板共用這一份。兩邊是同一個產品，設定長成兩個樣子的話，
 * 使用者會以為其中一邊少了功能。
 */

type Patch = (p: Partial<CardSettings>) => void

/** 選紙時底板色與文字色跟著換：兩者取自同一張紙，分開留著會做出白底白字。 */
function paperPatch(paper: Paper): Partial<CardSettings> {
  return { bgId: paper.id, panelColor: paper.panel, textColor: paper.ink }
}

export function StylePresets({ settings, onApply }: { settings: CardSettings; onApply: (style: StylePatch) => void }) {
  return (
    <div class="presets" role="group" aria-label="樣式">
      {STYLE_PRESETS.map((preset) => {
        const p = preset.style
        const paper = PAPERS.concat(LIBRARY).find((x) => x.id === p.bgId)
        return (
          <button key={preset.id} type="button" class="preset"
            aria-pressed={matchesPreset(settings, preset)} onClick={() => onApply(p)}>
            <span class="preset-thumb" style={{ background: paper?.css(62, 78) }}>
              {/* 小方塊代表底板，讓圓角、留白與透明度一眼看得出差異 */}
              <span class="preset-panel" style={{
                background: p.panelColor,
                opacity: p.panelOpacity,
                borderRadius: `${Math.max(1, (p.radius * 3) / 7)}px`,
                inset: `${Math.round((p.padding * 3) / 14)}px`,
                backdropFilter: p.glass ? `blur(${Math.max(2, Math.round(p.blur / 4))}px)` : undefined,
                WebkitBackdropFilter: p.glass ? `blur(${Math.max(2, Math.round(p.blur / 4))}px)` : undefined,
                border: p.glass ? '1px solid rgba(255, 255, 255, 0.35)' : undefined,
              }} />
            </span>
            <span class="preset-name">{preset.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function Swatch({ paper, selected, big = false, onPick }: {
  paper: Paper; selected: boolean; big?: boolean; onPick: (paper: Paper) => void
}) {
  const [w, h] = big ? [66, 88] : [44, 58]
  return (
    <button type="button" class={big ? 'big' : undefined} title={paper.name} aria-label={paper.name}
      aria-pressed={selected} style={{ background: paper.css(w, h) }} onClick={() => onPick(paper)} />
  )
}

export function PaperPicker({ settings, patch }: { settings: CardSettings; patch: Patch }) {
  const pick = (paper: Paper) => patch(paperPatch(paper))
  return (
    <>
      <p class="hint">{PAPERS.length} 款內建背景；紙庫裡還有 {LIBRARY.length} 張</p>
      <div class="swatches">
        {PAPERS.map((paper) => (
          <Swatch key={paper.id} paper={paper} selected={settings.bgId === paper.id} onPick={pick} />
        ))}
      </div>
      <div class="paper-row">
        <button type="button" onClick={() => pick(randomPaper(settings.bgId))}>隨機一張</button>
      </div>
      <details class="library">
        <summary>紙庫 <span>{LIBRARY.length} 張</span></summary>
        <div class="swatches wrap-grid">
          {LIBRARY.map((paper) => (
            <Swatch key={paper.id} paper={paper} big selected={settings.bgId === paper.id} onPick={pick} />
          ))}
        </div>
      </details>
    </>
  )
}

/** 色票與色碼欄互相同步；色碼只在格式正確時才套用，打到一半不會亂跳。 */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value.toUpperCase())
  useEffect(() => setDraft(value.toUpperCase()), [value])
  return (
    <label>{label}
      <input type="color" value={value} onInput={(e) => onChange(e.currentTarget.value)} />
      <input class="hex" type="text" spellcheck={false} autocomplete="off" aria-label={`${label}色碼`} value={draft}
        onInput={(e) => {
          const next = e.currentTarget.value.trim()
          setDraft(next)
          if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next.toLowerCase())
        }}
        onChange={() => setDraft(value.toUpperCase())} />
    </label>
  )
}

const RATIOS: [CardSettings['aspect'], string][] = [
  ['4:5', '直式 4:5'],
  ['9:16', '直式 9:16'],
  ['1:1', '方形'],
  ['auto', '自動高度'],
]

export function CanvasControls({ settings, patch }: { settings: CardSettings; patch: Patch }) {
  return (
    <>
      <label>留白<input type="range" min={0} max={54} value={settings.padding}
        onInput={(e) => patch({ padding: +e.currentTarget.value })} /></label>
      <label>文字尺寸<input type="range" min={13} max={40} value={settings.fontSize}
        onInput={(e) => patch({ fontSize: +e.currentTarget.value })} /></label>
      <label>圓角<input type="range" min={0} max={24} value={settings.radius}
        onInput={(e) => patch({ radius: +e.currentTarget.value })} /></label>
      <label>底板透明度<input type="range" min={0} max={100} step={5} value={Math.round(settings.panelOpacity * 100)}
        onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} /></label>
      <label class="check"><input type="checkbox" checked={settings.glass}
        onChange={(e) => patch({ glass: e.currentTarget.checked })} />毛玻璃</label>
      <label>模糊<input type="range" min={3} max={32} value={settings.blur} disabled={!settings.glass}
        onInput={(e) => patch({ blur: +e.currentTarget.value })} /></label>
      <p class="hint">
        毛玻璃會把底板下方的背景模糊掉，並加上細亮邊與陰影。底板透明度要低於 100% 才看得到效果。
      </p>
      <label>字體
        <select value={fontIdOf(settings.fontFamily)}
          onChange={(e) => patch({ fontFamily: FONTS.find((f) => f.id === e.currentTarget.value)?.stack ?? FONTS[0].stack })}>
          {FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <ColorField label="底板顏色" value={settings.panelColor} onChange={(v) => patch({ panelColor: v })} />
      <ColorField label="文字顏色" value={settings.textColor} onChange={(v) => patch({ textColor: v })} />
      <fieldset class="ratio">
        <legend>比例</legend>
        {RATIOS.map(([value, name]) => (
          <label key={value}>
            <input type="radio" name="ratio" value={value} checked={settings.aspect === value}
              onChange={() => patch({ aspect: value })} />{name}
          </label>
        ))}
      </fieldset>
    </>
  )
}
