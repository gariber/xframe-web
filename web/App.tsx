import { useEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, TweetData } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../src/render/export'
import { parseTweet, extractTweetId } from '../src/parse/microdata'
import { fetchTweetHtml, hydrateAssets } from './fetch'
import { Sheet } from './Sheet'

const STORAGE_KEY = 'xframe.web.settings'

/** 網頁版預設直式，適合限時動態；不鎖死高度，長推文會繼續變高。 */
const WEB_DEFAULTS: CardSettings = { ...DEFAULT_SETTINGS, aspect: '9:16' }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  cors: 'X 已變更存取政策，網頁版暫時無法使用 —— 請改用 Chrome 擴充功能',
  parse: '無法讀取這則推文。若是鎖推帳號，網頁版取不到內容，請用 Chrome 擴充功能',
  badurl: '這看起來不是推文網址',
  export: '產生圖片失敗，請重試',
}

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: TweetData }
  | { phase: 'error'; message: string }

function loadSettings(): CardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...WEB_DEFAULTS }
    const saved = JSON.parse(raw) as Partial<CardSettings>
    const out: CardSettings = { ...WEB_DEFAULTS, show: { ...WEB_DEFAULTS.show }, background: { ...WEB_DEFAULTS.background } }
    for (const k of Object.keys(WEB_DEFAULTS) as (keyof CardSettings)[]) {
      const v = saved[k]
      if (v === undefined) continue
      if (k === 'show' || k === 'background') Object.assign(out[k], v)
      else out[k] = v as never
    }
    return out
  } catch {
    return { ...WEB_DEFAULTS }
  }
}

async function loadTweet(url: string): Promise<TweetData> {
  const id = extractTweetId(url)
  if (!id) throw new Error('badurl')
  const html = await fetchTweetHtml(url)
  const tweet = parseTweet(html, id)
  if (!tweet) throw new Error('parse')
  return hydrateAssets(tweet)
}

export function App() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [settings, setSettings] = useState<CardSettings>(loadSettings)
  const [busy, setBusy] = useState(false)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  // 桌面下載需要原始 blob；只留 objectURL 是拿不回 blob 的
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // 支援 ?u= 帶入，讓捷徑或書籤可以直接開啟並自動抓取
  useEffect(() => {
    const u = new URLSearchParams(location.search).get('u')
    if (u) { setUrl(u); void go(u) }
  }, [])

  const patch = (p: Partial<CardSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* 隱私瀏覽模式可能不給寫 */ }
  }

  async function go(target = url) {
    setStatus({ phase: 'loading' })
    setPngUrl(null)
    setPngBlob(null)
    try {
      setStatus({ phase: 'ready', tweet: await loadTweet(target.trim()) })
    } catch (e) {
      const key = e instanceof Error ? (e as { kind?: string }).kind ?? e.message : 'network'
      setStatus({ phase: 'error', message: ERROR_TEXT[key] ?? ERROR_TEXT.network })
    }
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setUrl(t); void go(t) }
    } catch {
      // Safari 可能拒絕或使用者取消 —— 退回讓他自己貼進輸入框，不顯示錯誤
    }
  }

  async function doExport() {
    const node = cardRef.current?.firstElementChild as HTMLElement | null
    if (!node || status.phase !== 'ready') return
    setBusy(true)
    setExportErr(null)
    try {
      const blob = await exportPng(node, settings)
      setPngBlob(blob)
      setPngUrl(URL.createObjectURL(blob))
    } catch {
      setExportErr(ERROR_TEXT.export)
    } finally {
      setBusy(false)
    }
  }

  const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  return (
    <div class="wrap">
      <h1>XFrame</h1>

      <div class="urlbar">
        <input
          type="url" inputMode="url" placeholder="貼上推文網址" value={url}
          onInput={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void go() }}
        />
        <button type="button" onClick={paste}>貼上</button>
      </div>
      <button class="primary export-btn" type="button" disabled={!url.trim() || status.phase === 'loading'} onClick={() => void go()}>
        {status.phase === 'loading' ? '讀取中…' : '產生卡片'}
      </button>

      <div class="preview" ref={cardRef}>
        {status.phase === 'idle' && <div class="msg">貼上一則推文的網址，就會出現卡片。</div>}
        {status.phase === 'loading' && <div class="msg">讀取推文中…</div>}
        {status.phase === 'error' && (
          <div class="msg">
            <div class="err">{status.message}</div>
            <button type="button" onClick={() => void go()}>重試</button>
          </div>
        )}
        {status.phase === 'ready' && <Card tweet={status.tweet} settings={settings} />}
      </div>

      {status.phase === 'ready' && (
        <button class="primary export-btn" type="button" disabled={busy} onClick={() => void doExport()}>
          {busy ? '產生中…' : '存成圖片'}
        </button>
      )}
      {exportErr && <div class="err">{exportErr}</div>}

      {pngUrl && status.phase === 'ready' && (
        <div class="result">
          <img src={pngUrl} alt="產生的分享圖" />
          {isTouch ? (
            <p>長按上面的圖片 → 「加入照片」即可存檔。</p>
          ) : (
            <button type="button" disabled={!pngBlob}
              onClick={() => pngBlob && downloadBlob(pngBlob, buildFilename(status.tweet))}>下載</button>
          )}
        </div>
      )}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <Sheet title="背景紙張">
          <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成一張</button>
          <div class="swatches">
            {PRESETS.map((p) => (
              <button
                key={`${p.kind}-${p.palette}`} type="button" aria-label={`${p.kind} ${p.palette}`}
                aria-pressed={settings.background.kind === p.kind && settings.background.palette === p.palette}
                style={{ background: generate(p.kind, p.palette, p.seed) }}
                onClick={() => patch({ background: { ...p } })}
              />
            ))}
          </div>
        </Sheet>

        <Sheet title="畫布與排版">
          <label>留白<input type="range" min={16} max={120} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} /></label>
          <label>文字尺寸<input type="range" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} /></label>
          <label>底板透明度<input type="range" min={0} max={100} value={settings.panelOpacity * 100}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} /></label>
          <label>底板顏色<input type="color" value={settings.panelColor}
            onInput={(e) => patch({ panelColor: e.currentTarget.value })} /></label>
          <label>文字顏色<input type="color" value={settings.textColor}
            onInput={(e) => patch({ textColor: e.currentTarget.value })} /></label>
          <label>比例
            <select value={settings.aspect} onChange={(e) => patch({ aspect: e.currentTarget.value as CardSettings['aspect'] })}>
              <option value="9:16">9:16 直式（不限長度）</option>
              <option value="auto">自動高度</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:5">4:5 直式</option>
              <option value="16:9">16:9 橫式</option>
            </select>
          </label>
          <label>時間格式
            <select value={settings.timeFormat} onChange={(e) => patch({ timeFormat: e.currentTarget.value as CardSettings['timeFormat'] })}>
              <option value="relative">相對（6h）</option>
              <option value="absolute">絕對（2026-08-01 05:54）</option>
            </select>
          </label>
          <label>倍率
            <select value={String(settings.scale)} onChange={(e) => patch({ scale: +e.currentTarget.value as 2 | 3 })}>
              <option value="2">2x</option>
              <option value="3">3x</option>
            </select>
          </label>
        </Sheet>

        <Sheet title="顯示項目">
          {(['avatar', 'stats', 'timestamp', 'media'] as const).map((k) => (
            <label key={k}>
              <input type="checkbox" checked={settings.show[k]}
                onChange={(e) => patch({ show: { ...settings.show, [k]: e.currentTarget.checked } })} />
              {{ avatar: '頭像', stats: '互動統計', timestamp: '時間', media: '推文圖片' }[k]}
            </label>
          ))}
        </Sheet>

        <Sheet title="隱私">
          <label>
            <input type="checkbox" checked={settings.maskIdentity}
              onChange={(e) => patch({ maskIdentity: e.currentTarget.checked })} />
            遮蔽作者身分
          </label>
          <p style={{ fontSize: '.82rem', color: 'var(--ink-soft)', margin: 0 }}>
            名稱、帳號、頭像會一起蓋掉。內文若含可識別線索不在處理範圍。
          </p>
        </Sheet>
      </fieldset>
    </div>
  )
}
