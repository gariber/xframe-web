import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, Post } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob, EXPORT_WIDTH } from '../src/render/export'
import { ASPECT_VALUE } from '../src/render/card.css'
import { parseTweet, extractTweetId } from '../src/parse/microdata'
import { fetchTweetHtml, hydrateAssets } from './fetch'
import { Sheet } from './Sheet'
import { canShareImageFile, createPngFile, shareImageFile } from './share'

const STORAGE_KEY = 'xframe.web.settings'

/** 網頁版預設精確 9:16 直式，適合限時動態；放不下時完整面板會等比縮小。
 *  留白改小：72 是桌面尺寸，在 390px 手機上會把內容寬度壓到剩約 166px。 */
const WEB_DEFAULTS: CardSettings = { ...DEFAULT_SETTINGS, aspect: '9:16', padding: 28 }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  cors: 'X 已變更存取政策，網頁版暫時無法使用 —— 請改用 Chrome 擴充功能',
  parse: '無法讀取這則推文。若是鎖推帳號，網頁版取不到內容，請用 Chrome 擴充功能',
  badurl: '這看起來不是推文網址',
  export: '產生圖片失敗，請重試',
  share: '這個瀏覽器目前無法分享圖片，請改用下載或長按圖片',
}

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: Post }
  | { phase: 'error'; message: string }

/**
 * 已移除的比例（16:9）仍可能存在舊使用者的儲存資料裡。直接套用會得到一個不在
 * ASPECT_VALUE 裡的值 —— 畫面上是「比例下拉選單沒有任何選項被選中」，而卡片
 * 靜靜退化成自動高度。不是崩潰，但使用者看不懂發生什麼事，所以退回預設值。
 */
function validAspect(v: unknown): v is CardSettings['aspect'] {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ASPECT_VALUE, v)
}

function loadSettings(): CardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...WEB_DEFAULTS }
    const saved = JSON.parse(raw) as Partial<CardSettings>
    const out: CardSettings = { ...WEB_DEFAULTS, show: { ...WEB_DEFAULTS.show }, background: { ...WEB_DEFAULTS.background } }
    for (const k of Object.keys(WEB_DEFAULTS) as (keyof CardSettings)[]) {
      const v = saved[k]
      if (v === undefined) continue
      if (k === 'aspect' && !validAspect(v)) continue
      if (k === 'show' || k === 'background') Object.assign(out[k], v)
      else out[k] = v as never
    }
    return out
  } catch {
    return { ...WEB_DEFAULTS }
  }
}

async function loadTweet(url: string): Promise<Post> {
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
  const fitRef = useRef<HTMLDivElement>(null)
  // 卡片縮到預覽框內的比例。整張看得到才叫「即時看到效果」——
  // 只露出上半部的話，調留白或比例的差異剛好都在看不到的地方。
  const [fit, setFit] = useState(1)
  // 卡片的版面尺寸，用來換算固定寬度下的輸出高度。
  // 沒有這個，那個選項對使用者而言等於沒作用 —— 它只影響下載的檔案，
  // 畫面上看不出任何差別。
  const [cardSize, setCardSize] = useState<[number, number] | null>(null)
  // 用 ref 而非讀 state 來撤銷 —— state 在非同步 callback 裡可能是舊的閉包值，
  // ref 永遠是「目前真正存活的那個 URL」，撤銷才不會漏掉或撤錯。
  const pngUrlRef = useRef<string | null>(null)
  const requestRef = useRef(0)

  // createObjectURL 產生的 URL 不會自動回收，整個分頁生命週期都會佔住記憶體，
  // 除非明確 revokeObjectURL —— 每次換圖前先撤銷舊的，卸載時再撤銷最後一個。
  const releasePng = () => {
    if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current)
    pngUrlRef.current = null
    setPngUrl(null)
    setPngBlob(null)
  }

  useEffect(() => () => { if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current) }, [])

  // 支援 ?u= 帶入，讓捷徑或書籤可以直接開啟並自動抓取
  useEffect(() => {
    const u = new URLSearchParams(location.search).get('u')
    if (u) { setUrl(u); void go(u) }
  }, [])

  const patch = (p: Partial<CardSettings>) => {
    // 設定一變，舊 PNG 就不再代表目前預覽；移除它可避免誤分享舊圖。
    releasePng()
    setExportErr(null)
    const next = { ...settings, ...p }
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* 隱私瀏覽模式可能不給寫 */ }
  }

  async function go(target = url) {
    const request = ++requestRef.current
    setStatus({ phase: 'loading' })
    releasePng()
    try {
      const tweet = await loadTweet(target.trim())
      if (request === requestRef.current) setStatus({ phase: 'ready', tweet })
    } catch (e) {
      if (request !== requestRef.current) return
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

  // 量測卡片實際高度，算出塞進預覽框所需的縮放比例。
  // 用 offsetHeight 而非 getBoundingClientRect：前者是版面尺寸，不受自己
  // 套上的 transform 影響，否則會量到縮放後的值再縮一次，一路收斂到極小。
  useLayoutEffect(() => {
    const host = cardRef.current
    const inner = fitRef.current
    if (!host || !inner) return
    const measure = () => {
      const card = inner.firstElementChild as HTMLElement | null
      if (!card || !card.offsetHeight) { setFit(1); setCardSize(null); return }
      const avail = host.clientHeight
      setFit(avail > 0 ? Math.min(1, avail / card.offsetHeight) : 1)
      setCardSize([card.offsetWidth, card.offsetHeight])
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    if (inner.firstElementChild) ro.observe(inner.firstElementChild)
    return () => ro.disconnect()
  }, [status, settings])

  async function doExport() {
    // 直接查 canvas，不用 firstElementChild —— 中間多包一層縮放容器之後，
    // firstElementChild 就不再是卡片了，而那種錯誤不會報錯只會匯出錯的東西。
    const node = cardRef.current?.querySelector('[data-part="canvas"]') as HTMLElement | null
    if (!node || status.phase !== 'ready') return
    setBusy(true)
    setExportErr(null)
    try {
      const blob = await exportPng(node)
      if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current)
      const url = URL.createObjectURL(blob)
      pngUrlRef.current = url
      setPngBlob(blob)
      setPngUrl(url)
    } catch {
      setExportErr(ERROR_TEXT.export)
    } finally {
      setBusy(false)
    }
  }

  async function doShare() {
    if (!pngBlob || status.phase !== 'ready') return
    const file = createPngFile(pngBlob, buildFilename(status.tweet))
    setBusy(true)
    setExportErr(null)
    try {
      const result = await shareImageFile(file)
      if (result === 'unsupported') setExportErr(ERROR_TEXT.share)
    } catch {
      setExportErr(ERROR_TEXT.share)
    } finally {
      setBusy(false)
    }
  }

  const shareFile = pngBlob && status.phase === 'ready'
    ? createPngFile(pngBlob, buildFilename(status.tweet))
    : null
  const shareSupported = shareFile !== null && canShareImageFile(shareFile)
  const fixedRatio = ASPECT_VALUE[settings.aspect]
  const downloadHeight = cardSize
    ? Math.round(fixedRatio
      ? EXPORT_WIDTH / fixedRatio
      : EXPORT_WIDTH * cardSize[1] / cardSize[0])
    : null

  return (
    <div class="wrap">
      <h1>XFrame</h1>

      <div class="urlbar">
        <label class="sr-only" for="tweet-url">推文網址</label>
        <input
          id="tweet-url" type="url" inputMode="url" placeholder="貼上推文網址" value={url}
          disabled={busy}
          onInput={(e) => {
            // 輸入值一變，舊卡片與任何尚未完成的讀取都不再代表這個網址。
            requestRef.current += 1
            setUrl(e.currentTarget.value)
            setStatus({ phase: 'idle' })
            releasePng()
            setExportErr(null)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') void go() }}
        />
        <button type="button" disabled={busy} onClick={paste}>貼上</button>
      </div>
      <button class="primary export-btn" type="button" disabled={!url.trim() || status.phase === 'loading' || busy} onClick={() => void go()}>
        {status.phase === 'loading' ? '讀取中…' : '產生卡片'}
      </button>

      <div class="preview" ref={cardRef}>
        <div class="preview-fit" ref={fitRef} style={{ transform: `scale(${fit})` }}>
        {status.phase === 'idle' && <div class="msg" role="status">貼上一則推文的網址，就會出現卡片。</div>}
        {status.phase === 'loading' && <div class="msg" role="status">讀取推文中…</div>}
        {status.phase === 'error' && (
          <div class="msg">
            <div class="err" role="alert">{status.message}</div>
            <button type="button" onClick={() => void go()}>重試</button>
          </div>
        )}
        {status.phase === 'ready' && <Card post={status.tweet} settings={settings} />}
        </div>
      </div>

      {status.phase === 'ready' && (
        <button class="primary export-btn" type="button" disabled={busy} onClick={() => void doExport()}>
          {busy ? '產生中…' : '存成圖片'}
        </button>
      )}
      {exportErr && <div class="err" role="alert">{exportErr}</div>}

      {pngUrl && status.phase === 'ready' && (
        <div class="result">
          <img src={pngUrl} alt="產生的分享圖" />
          <p>
            {shareSupported
              ? '可直接分享，或長按圖片加入照片。'
              : '可下載圖片；在 iPhone 上也能長按圖片加入照片。'}
          </p>
          <div class="result-actions">
            <button type="button" disabled={!pngBlob}
              onClick={() => pngBlob && downloadBlob(pngBlob, buildFilename(status.tweet))}>下載</button>
            {shareSupported && (
              <button type="button" disabled={busy || !pngBlob} onClick={() => void doShare()}>分享</button>
            )}
          </div>
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
              <option value="9:16">9:16 直式</option>
              <option value="auto">自動高度</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:5">4:5 直式</option>
            </select>
          </label>
          <label>時間格式
            <select value={settings.timeFormat} onChange={(e) => patch({ timeFormat: e.currentTarget.value as CardSettings['timeFormat'] })}>
              <option value="relative">相對（6h）</option>
              <option value="absolute">絕對（2026-08-01 05:54）</option>
            </select>
          </label>
          {downloadHeight !== null && (
            <p class="hint">
              下載尺寸固定 {EXPORT_WIDTH}×{downloadHeight} px，
              不隨這台裝置的畫面寬度變動。預覽只是縮小顯示，不影響輸出。
            </p>
          )}
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
