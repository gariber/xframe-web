import { useEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, TweetData } from '../types'
import { Card, DEFAULT_SETTINGS } from '../render/Card'
import { PRESETS, generate, randomPreset } from '../render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../render/export'
import { loadSettings, saveSettings } from './store'
import { parseTweet, extractTweetId } from '../parse/microdata'

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: TweetData }
  | { phase: 'error'; message: string }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  parse: '無法讀取這則推文',
}

async function loadTweet(permalink: string): Promise<TweetData> {
  const id = extractTweetId(permalink)
  if (!id) throw new Error('parse')
  const res = await chrome.runtime.sendMessage({ type: 'fetch-tweet-html', url: permalink })
  if (!res?.ok) throw new Error(res?.kind ?? 'network')
  const tweet = parseTweet(res.html, id)
  if (!tweet) throw new Error('parse')
  const hydrated = await chrome.runtime.sendMessage({ type: 'hydrate-assets', tweet })
  return hydrated?.ok ? hydrated.tweet : tweet
}

export function Panel({ permalink, onClose }: { permalink: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ phase: 'loading' })
  const [settings, setSettings] = useState<CardSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadSettings().then(setSettings) }, [])

  useEffect(() => {
    let cancelled = false
    setStatus({ phase: 'loading' })
    loadTweet(permalink)
      .then((tweet) => { if (!cancelled) setStatus({ phase: 'ready', tweet }) })
      .catch((e) => {
        if (!cancelled) setStatus({ phase: 'error', message: ERROR_TEXT[e.message] ?? ERROR_TEXT.network })
      })
    return () => { cancelled = true }
  }, [permalink])

  const patch = (p: Partial<CardSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    void saveSettings(next)
  }

  const doExport = async () => {
    const node = cardRef.current?.firstElementChild as HTMLElement | null
    if (!node || status.phase !== 'ready') return
    setBusy(true)
    try {
      downloadBlob(await exportPng(node, settings), buildFilename(status.tweet))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="xf-panel">
      <header class="xf-head">
        <strong>XFrame</strong>
        <button type="button" onClick={onClose} aria-label="關閉">✕</button>
      </header>

      <div class="xf-preview" ref={cardRef}>
        {status.phase === 'loading' && <div class="xf-msg">讀取推文中…</div>}
        {status.phase === 'error' && <div class="xf-msg">{status.message}</div>}
        {status.phase === 'ready' && <Card tweet={status.tweet} settings={settings} />}
      </div>

      <button class="xf-export" type="button" disabled={status.phase !== 'ready' || busy} onClick={doExport}>
        {busy ? '產生中…' : '下載 PNG'}
      </button>

      <section class="xf-group">
        <h3>畫布與排版</h3>
        <label>留白 <b>{settings.padding}</b>
          <input type="range" min={24} max={160} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} />
        </label>
        <label>文字尺寸 <b>{settings.fontSize}</b>
          <input type="range" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} />
        </label>
        <label>底板透明度 <b>{Math.round(settings.panelOpacity * 100)}%</b>
          <input type="range" min={0} max={100} value={settings.panelOpacity * 100}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} />
        </label>
        <label>底板顏色
          <input type="color" value={settings.panelColor}
            onInput={(e) => patch({ panelColor: e.currentTarget.value })} />
        </label>
        <label>文字顏色
          <input type="color" value={settings.textColor}
            onInput={(e) => patch({ textColor: e.currentTarget.value })} />
        </label>
        <label>比例
          <select value={settings.aspect}
            onChange={(e) => patch({ aspect: e.currentTarget.value as CardSettings['aspect'] })}>
            <option value="auto">自動高度</option>
            <option value="1:1">1:1 方形</option>
            <option value="4:5">4:5 直式</option>
            <option value="16:9">16:9 橫式</option>
          </select>
        </label>
        <label>倍率
          <select value={String(settings.scale)}
            onChange={(e) => patch({ scale: +e.currentTarget.value as 2 | 3 })}>
            <option value="2">2x</option>
            <option value="3">3x</option>
          </select>
        </label>
      </section>

      <section class="xf-group">
        <h3>背景紙張</h3>
        <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成一張</button>
        <div class="xf-swatches">
          {PRESETS.map((p) => (
            <button key={`${p.kind}-${p.palette}`} type="button" class="xf-sw"
              aria-label={`${p.kind} ${p.palette}`}
              aria-pressed={settings.background.kind === p.kind && settings.background.palette === p.palette}
              style={{ background: generate(p.kind, p.palette, p.seed) }}
              onClick={() => patch({ background: { ...p } })} />
          ))}
        </div>
      </section>

      <section class="xf-group">
        <h3>顯示項目</h3>
        {(['avatar', 'stats', 'timestamp', 'media'] as const).map((k) => (
          <label key={k}>
            <input type="checkbox" checked={settings.show[k]}
              onChange={(e) => patch({ show: { ...settings.show, [k]: e.currentTarget.checked } })} />
            {{ avatar: '頭像', stats: '互動統計', timestamp: '時間', media: '推文圖片' }[k]}
          </label>
        ))}
      </section>
    </div>
  )
}
