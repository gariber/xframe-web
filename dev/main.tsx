import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { TweetData, CardSettings } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../src/render/export'
import { loadFixture, FIXTURES } from './fixture'

type Name = keyof typeof FIXTURES

function App() {
  const [name, setName] = useState<Name>('plain')
  const [tweet, setTweet] = useState<TweetData | null>(null)
  const [settings, setSettings] = useState<CardSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    setTweet(null)
    loadFixture(name).then(setTweet)
  }, [name])

  const patch = (p: Partial<CardSettings>) => setSettings({ ...settings, ...p })

  const doExport = async () => {
    const node = document.querySelector('[data-part="canvas"]') as HTMLElement | null
    if (!node || !tweet) return
    downloadBlob(await exportPng(node), buildFilename(tweet))
  }

  return (
    <>
      <div class="stage">
        <div class="picker">
          {(Object.keys(FIXTURES) as Name[]).map((n) => (
            <button key={n} type="button" aria-pressed={n === name} onClick={() => setName(n)}>{n}</button>
          ))}
        </div>
        {tweet ? <Card tweet={tweet} settings={settings} /> : <p style="text-align:center">載入中…</p>}
      </div>
      <div class="xf-panel" style="padding:16px;background:#faf7f2;overflow:auto">
        <button type="button" onClick={doExport} style="width:100%;padding:12px;margin-bottom:16px">下載 PNG</button>
        <label>留白 {settings.padding}
          <input type="range" min={24} max={160} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} />
        </label>
        <label>文字尺寸 {settings.fontSize}
          <input type="range" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} />
        </label>
        <label>底板透明度 {Math.round(settings.panelOpacity * 100)}%
          <input type="range" min={0} max={100} value={settings.panelOpacity * 100}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} />
        </label>
        <label>比例
          <select value={settings.aspect}
            onChange={(e) => patch({ aspect: e.currentTarget.value as CardSettings['aspect'] })}>
            <option value="auto">自動高度</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
        </label>
        <label>時間格式
          <select value={settings.timeFormat}
            onChange={(e) => patch({ timeFormat: e.currentTarget.value as CardSettings['timeFormat'] })}>
            <option value="relative">相對</option>
            <option value="absolute">絕對</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={settings.maskIdentity}
            onChange={(e) => patch({ maskIdentity: e.currentTarget.checked })} />
          遮蔽作者身分
        </label>
        <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成</button>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-top:10px">
          {PRESETS.map((p) => (
            <button key={`${p.kind}-${p.palette}`} type="button"
              aria-label={`${p.kind} ${p.palette}`}
              style={{ aspectRatio: '3/4', borderRadius: 6, border: '1px solid #d9d3c9', cursor: 'pointer', padding: 0, background: generate(p.kind, p.palette, p.seed) }}
              onClick={() => patch({ background: { ...p } })} />
          ))}
        </div>
      </div>
    </>
  )
}

render(<App />, document.getElementById('app')!)
