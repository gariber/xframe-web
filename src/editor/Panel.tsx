import { useEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, TweetData } from '../types'
import { Card, DEFAULT_SETTINGS } from '../render/Card'
import { PRESETS, generate, randomPreset } from '../render/backgrounds'
import { exportPng, buildFilename, downloadBlob } from '../render/export'
import { loadSettings, saveSettings } from './store'
import { parseTweet, extractTweetId } from '../parse/microdata'
// type-only：只要背景模組的型別，不能把 `addListener` 的側作用拉進內容腳本的
// bundle。混進值匯入的話，vite 會把整個 background/index.ts（包含它 import
// 的 fetch-tweet、asset-proxy）一起打進 content script。
import type { Request, Response } from '../background/index'

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: TweetData }
  | { phase: 'error'; message: string }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  parse: '無法讀取這則推文',
  export: '產生圖片失敗，請重試',
  'unknown-request': '擴充功能版本不相符，請重新載入頁面',
}

async function loadTweet(permalink: string): Promise<TweetData> {
  const id = extractTweetId(permalink)
  if (!id) throw new Error('parse')
  const res = await chrome.runtime.sendMessage<Request, Response>({ type: 'fetch-tweet-html', url: permalink })
  if (!res.ok) throw new Error(res.kind)
  if (res.type !== 'fetch-tweet-html') throw new Error('unknown-request')
  const tweet = parseTweet(res.html, id)
  if (!tweet) throw new Error('parse')
  const hydrated = await chrome.runtime.sendMessage<Request, Response>({ type: 'hydrate-assets', tweet })
  return hydrated.ok && hydrated.type === 'hydrate-assets' ? hydrated.tweet : tweet
}

export function Panel({ permalink, onClose }: { permalink: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ phase: 'loading' })
  const [settings, setSettings] = useState<CardSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  // 重試不改變 permalink，所以不能只靠 permalink 當 effect 依賴——需要一個
  // 每次點「重試」就變動的值，讓下面抓推文的 effect 重新跑一次。
  const [retryCount, setRetryCount] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 讀取失敗（例如 chrome.storage 出錯）就退回預設值，而不是留下一個永遠
    // 不會 resolve 的 promise 靜默吞掉錯誤 —— 面板至少要能用預設設定運作。
    loadSettings().then(setSettings).catch(() => setSettings(DEFAULT_SETTINGS))
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus({ phase: 'loading' })
    loadTweet(permalink)
      .then((tweet) => { if (!cancelled) setStatus({ phase: 'ready', tweet }) })
      .catch((e) => {
        if (!cancelled) setStatus({ phase: 'error', message: ERROR_TEXT[e.message] ?? ERROR_TEXT.network })
      })
    return () => { cancelled = true }
  }, [permalink, retryCount])

  const patch = (p: Partial<CardSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    void saveSettings(next)
  }

  const doExport = async () => {
    const node = cardRef.current?.firstElementChild as HTMLElement | null
    if (!node || status.phase !== 'ready') return
    setBusy(true)
    setExportError(null)
    try {
      downloadBlob(await exportPng(node, settings), buildFilename(status.tweet))
    } catch {
      // doExport 是裸 onClick、沒有任何東西 await 它 —— 若不在這裡自己接住，
      // 光柵化失敗時按鈕只會默默從「產生中…」變回「下載 PNG」，使用者不會
      // 知道下載其實沒發生。
      setExportError(ERROR_TEXT.export)
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
        {status.phase === 'error' && (
          <div class="xf-msg">
            <div>{status.message}</div>
            <button type="button" class="xf-retry" onClick={() => setRetryCount((n) => n + 1)}>
              重試
            </button>
          </div>
        )}
        {status.phase === 'ready' && <Card tweet={status.tweet} settings={settings} />}
      </div>

      <button class="xf-export" type="button" disabled={status.phase !== 'ready' || busy} onClick={doExport}>
        {busy ? '產生中…' : '下載 PNG'}
      </button>
      {exportError && <div class="xf-export-error">{exportError}</div>}

      {/*
        exportPng 是直接對 cardRef 底下這個活生生的 DOM 節點做光柵化，光柵化
        期間若任何設定控制項還能操作，就會在 domToBlob 還在走訪同一個節點時
        即時 live-patch 它 —— 產生的圖可能是新舊設定混雜的畫面。用一個
        fieldset 包住所有設定控制項，busy 時整批 disabled，是最簡單、不需要
        自己刻鎖的做法。
      */}
      <fieldset class="xf-fieldset" disabled={busy}>
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
      </fieldset>
    </div>
  )
}
