import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CardSettings, Post, Segment } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob, EXPORT_WIDTH } from '../src/render/export'
import { ASPECT_VALUE } from '../src/render/card.css'
import { parseTweet, extractTweetId } from '../src/parse/microdata'
import { fetchTweetHtml, hydrateAssets } from './fetch'
import { Sheet } from './Sheet'
import { canShareImageFile, createPngFile, shareImageFile } from './share'
import {
  applyTranslationSnapshot,
  buildSafariTranslationPlan,
  observeSafariTranslation,
  readTranslationSnapshot,
  translationSignature,
  type SafariTranslationPlan,
  type TranslationSnapshot,
} from './safari-translation'

const STORAGE_KEY = 'xframe.web.settings'
const SAFARI_BRIDGE_REQUEST = 'xframe.web.safari-translation.request.'
const SAFARI_BRIDGE_RESULT = 'xframe.web.safari-translation.result.'

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

type SafariVersion = {
  original: Post
  translated: Post
  view: 'original' | 'translated'
}

type TranslationDraft = {
  main: string
  quoted: string
}

type TranslationBridgePart = {
  original: string
  segments: Segment[]
  lang: string
}

type TranslationBridgePayload = {
  main?: TranslationBridgePart
  quoted?: TranslationBridgePart
}

const TEXT_CHANGED_DURING_EXPORT = '卡片文字剛更新，請再存一次。'

function browserTranslation(value: 'yes' | 'no') {
  return (element: HTMLElement | null): void => {
    if (element) element.setAttribute('translate', value)
  }
}

const enableBrowserTranslation = browserTranslation('yes')
const disableBrowserTranslation = browserTranslation('no')

function TranslationSourceText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        segment.type === 'text'
          ? <span key={index}>{segment.value}</span>
          : <span key={index} ref={disableBrowserTranslation}>{segment.value}</span>
      ))}
    </>
  )
}

function initialTranslationDraft(post: Post, plan: SafariTranslationPlan): TranslationDraft {
  return {
    main: plan.main.kind === 'foreign' ? post.rawText : '',
    quoted: plan.quoted?.kind === 'foreign' ? post.quoted?.rawText ?? '' : '',
  }
}

function SafariTranslationBridge({ token }: { token: string }) {
  const [payload] = useState<TranslationBridgePayload | null>(() => {
    try {
      const raw = localStorage.getItem(SAFARI_BRIDGE_REQUEST + token)
      return raw ? JSON.parse(raw) as TranslationBridgePayload : null
    } catch {
      return null
    }
  })
  const sourceRef = useRef<HTMLDivElement>(null)
  const [snapshot, setSnapshot] = useState<TranslationSnapshot>({ main: null, quoted: null })
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'XFrame · Safari Translation'
    const source = sourceRef.current
    if (!source) return
    setSnapshot(readTranslationSnapshot(source))
    return observeSafariTranslation(source, setSnapshot)
  }, [payload])

  if (!payload) {
    return <main class="translation-bridge"><h1>Translation source expired</h1><p>Return to XFrame and open this page again.</p></main>
  }

  const changed =
    Boolean(payload.main && snapshot.main?.trim() && snapshot.main.trim() !== payload.main.original.trim()) ||
    Boolean(payload.quoted && snapshot.quoted?.trim() && snapshot.quoted.trim() !== payload.quoted.original.trim())

  function sendBack() {
    if (!changed) {
      setFeedback('Translate this page with Safari first, then try again.')
      return
    }
    localStorage.setItem(SAFARI_BRIDGE_RESULT + token, JSON.stringify(snapshot))
    setFeedback('Translation sent back. Return to the XFrame tab to review and edit it.')
    /*
     * 這個分頁是 XFrame 自己用 window.open 開的，所以關得掉。關掉之後瀏覽器會
     * 直接把使用者帶回原本那個分頁，省掉「翻完還得自己找回去」那一步——主分頁
     * 監聽 storage 事件，譯文在它那邊已經到位了。
     *
     * 關不掉時（例如使用者是自己貼網址開的，不是被 window.open 開的）呼叫會被
     * 瀏覽器忽略，上面那句提示仍然留著，流程不會斷。
     */
    window.close()
  }

  return (
    <main class="translation-bridge">
      <p class="translation-bridge-brand">XFrame · gariber.studio</p>
      <h1>Translate with Safari</h1>
      <p>Use Safari’s Translate menu to translate this page into Traditional Chinese. Then send the result back to XFrame.</p>
      <div class="translation-bridge-source" ref={sourceRef}>
        {payload.main && (
          <section>
            <span>Main post</span>
            <div data-part="body" ref={enableBrowserTranslation} lang={payload.main.lang} dir="auto">
              <TranslationSourceText segments={payload.main.segments} />
            </div>
          </section>
        )}
        {payload.quoted && (
          <section>
            <span>Quoted post</span>
            <div data-part="quote-body" ref={enableBrowserTranslation} lang={payload.quoted.lang} dir="auto">
              <TranslationSourceText segments={payload.quoted.segments} />
            </div>
          </section>
        )}
      </div>
      <button class="primary" type="button" onClick={sendBack}>Send translation back to XFrame</button>
      {feedback && <p role="status" aria-live="polite">{feedback}</p>}
    </main>
  )
}

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

function XFrameApp() {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [settings, setSettings] = useState<CardSettings>(loadSettings)
  const [busy, setBusy] = useState(false)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  // 桌面下載需要原始 blob；只留 objectURL 是拿不回 blob 的
  const [pngBlob, setPngBlob] = useState<Blob | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const [safariVersion, setSafariVersion] = useState<SafariVersion | null>(null)
  const [translationDraft, setTranslationDraft] = useState<TranslationDraft | null>(null)
  const [translationFeedback, setTranslationFeedback] = useState<string | null>(null)
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
  const bridgeTokenRef = useRef<string | null>(null)
  const translationRevisionRef = useRef(0)

  // status 永遠保留抓回來的原文；顯示版本另外管理，才可以在原文與譯文之間切換，
  // 也不會因調整背景或字級而把 Safari 譯文沖掉。
  const displayedTweet = status.phase === 'ready'
    ? safariVersion?.view === 'translated'
      ? safariVersion.translated
      : safariVersion?.original ?? status.tweet
    : null
  const translationPlan = useMemo(
    () => status.phase === 'ready' ? buildSafariTranslationPlan(status.tweet) : null,
    [status],
  )
  // createObjectURL 產生的 URL 不會自動回收，整個分頁生命週期都會佔住記憶體，
  // 除非明確 revokeObjectURL —— 每次換圖前先撤銷舊的，卸載時再撤銷最後一個。
  const releasePng = () => {
    if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current)
    pngUrlRef.current = null
    setPngUrl(null)
    setPngBlob(null)
  }

  const resetSafariState = () => {
    setSafariVersion(null)
    setTranslationDraft(null)
    setTranslationFeedback(null)
    translationRevisionRef.current += 1
  }

  useEffect(() => () => { if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current) }, [])

  useEffect(() => {
    if (status.phase !== 'ready' || !translationPlan?.hasForeignText) {
      setTranslationDraft(null)
      return
    }
    setTranslationDraft(initialTranslationDraft(status.tweet, translationPlan))
  }, [status, translationPlan])

  function acceptSafariSnapshot(snapshot: TranslationSnapshot, announce: boolean): boolean {
    if (status.phase !== 'ready' || !translationPlan) return false
    const translated = applyTranslationSnapshot(status.tweet, translationPlan, snapshot)
    if (!translated) {
      if (announce) setTranslationFeedback('尚未讀到譯文。請先用 Safari 翻譯頁面，或直接在下方編輯。')
      return false
    }
    setTranslationDraft({
      main: translationPlan.main.kind === 'foreign' ? translated.rawText : '',
      quoted: translationPlan.quoted?.kind === 'foreign' ? translated.quoted?.rawText ?? '' : '',
    })
    setTranslationFeedback('已讀取 Safari 譯文；你可以先修改，再套用到卡片。')
    return true
  }

  useEffect(() => {
    function consumeSavedTranslation() {
      const token = bridgeTokenRef.current
      if (!token) return
      const saved = localStorage.getItem(SAFARI_BRIDGE_RESULT + token)
      if (!saved) return
      try {
        const snapshot = JSON.parse(saved) as TranslationSnapshot
        acceptSafariSnapshot(snapshot, true)
        localStorage.removeItem(SAFARI_BRIDGE_REQUEST + token)
        localStorage.removeItem(SAFARI_BRIDGE_RESULT + token)
      } catch {
        setTranslationFeedback('無法讀取 Safari 譯文，請直接貼到下方編輯框。')
      }
    }

    function receiveTranslation(event: StorageEvent) {
      const token = bridgeTokenRef.current
      if (!token || event.key !== SAFARI_BRIDGE_RESULT + token || !event.newValue) return
      consumeSavedTranslation()
    }
    window.addEventListener('storage', receiveTranslation)
    window.addEventListener('focus', consumeSavedTranslation)
    return () => {
      window.removeEventListener('storage', receiveTranslation)
      window.removeEventListener('focus', consumeSavedTranslation)
    }
  }, [status, translationPlan])

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
    resetSafariState()
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

  function openSafariTranslation() {
    if (status.phase !== 'ready' || !translationPlan) return
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const payload: TranslationBridgePayload = {
      ...(translationPlan.main.kind === 'foreign'
        ? { main: { original: status.tweet.rawText, segments: status.tweet.text, lang: translationPlan.main.tag } }
        : {}),
      ...(translationPlan.quoted?.kind === 'foreign' && status.tweet.quoted
        ? { quoted: { original: status.tweet.quoted.rawText, segments: status.tweet.quoted.text, lang: translationPlan.quoted.tag } }
        : {}),
    }
    try {
      localStorage.setItem(SAFARI_BRIDGE_REQUEST + token, JSON.stringify(payload))
      bridgeTokenRef.current = token
      const bridgeUrl = new URL(location.href)
      bridgeUrl.search = ''
      bridgeUrl.hash = ''
      bridgeUrl.searchParams.set('safari-translate', token)
      if (!window.open(bridgeUrl, '_blank')) throw new Error('popup-blocked')
      setTranslationFeedback('已開啟 Safari 翻譯分頁；翻譯後把結果送回 XFrame。')
    } catch {
      setTranslationFeedback('無法開啟翻譯分頁；請允許彈出視窗，或直接在下方編輯。')
    }
  }

  function applyDraftTranslation() {
    if (status.phase !== 'ready' || !translationPlan || !translationDraft) return
    const translated = applyTranslationSnapshot(status.tweet, translationPlan, {
      main: translationPlan.main.kind === 'foreign' ? translationDraft.main : null,
      quoted: translationPlan.quoted?.kind === 'foreign' ? translationDraft.quoted : null,
    })

    if (!translated) {
      setTranslationFeedback('譯文仍和原文相同；請先翻譯或編輯，再套用到卡片。')
      return
    }

    releasePng()
    translationRevisionRef.current += 1
    setSafariVersion({ original: status.tweet, translated, view: 'translated' })
    setTranslationFeedback('譯文已套用到卡片。')
  }

  function showSafariVersion(view: SafariVersion['view']) {
    if (!safariVersion || safariVersion.view === view) return
    releasePng()
    translationRevisionRef.current += 1
    setSafariVersion({ ...safariVersion, view })
    setTranslationFeedback(null)
  }

  function restoreOriginal() {
    if (status.phase !== 'ready' || !translationPlan) return
    releasePng()
    translationRevisionRef.current += 1
    setSafariVersion(null)
    setTranslationDraft(initialTranslationDraft(status.tweet, translationPlan))
    setTranslationFeedback('已還原原文；翻譯草稿也已重設。')
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
  }, [displayedTweet, settings])

  async function doExport() {
    // 直接查 canvas，不用 firstElementChild —— 中間多包一層縮放容器之後，
    // firstElementChild 就不再是卡片了，而那種錯誤不會報錯只會匯出錯的東西。
    const node = cardRef.current?.querySelector('[data-part="canvas"]') as HTMLElement | null
    if (!node || status.phase !== 'ready' || !displayedTweet) return
    const revision = translationRevisionRef.current
    const signature = translationSignature(node)
    setBusy(true)
    setExportErr(null)
    try {
      const blob = await exportPng(node)
      // Safari 可以在光柵化進行中完成翻譯。那張 blob 的內容版本無法再確認，
      // 寧可丟棄並請使用者重按，也不能讓預覽是譯文、分享出去卻仍是原文。
      if (
        revision !== translationRevisionRef.current ||
        signature !== translationSignature(node)
      ) {
        setExportErr(TEXT_CHANGED_DURING_EXPORT)
        return
      }
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
    if (!pngBlob || status.phase !== 'ready' || !displayedTweet) return
    const file = createPngFile(pngBlob, buildFilename(displayedTweet))
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

  const shareFile = pngBlob && status.phase === 'ready' && displayedTweet
    ? createPngFile(pngBlob, buildFilename(displayedTweet))
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
            resetSafariState()
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
        {status.phase === 'ready' && displayedTweet && (
          <Card post={displayedTweet} settings={settings} />
        )}
        </div>
      </div>

      {status.phase === 'ready' && translationPlan?.hasForeignText && translationDraft && (
        <section class="translation-guide" aria-labelledby="safari-translation-title">
          <div class="translation-heading">
            <div>
              <strong id="safari-translation-title">翻譯</strong>
              <span>Safari 輔助 · 可編輯後再套用</span>
            </div>
            {safariVersion && <span class="translation-state">已套用</span>}
          </div>

          <p class="translation-instructions">
            在 Safari 開啟專用翻譯分頁，選「翻譯成繁體中文」，再把結果送回。非 Safari 也可以直接貼上或編輯。
          </p>

          <div class="translation-source" ref={disableBrowserTranslation} aria-label="Safari 待翻譯來源">
            {translationPlan.main.kind === 'foreign' && (
              <div class="translation-source-part">
                <span class="translation-kicker">主文來源</span>
                <div data-part="body" lang={translationPlan.main.tag} dir="auto">
                  <TranslationSourceText segments={status.tweet.text} />
                </div>
              </div>
            )}
            {translationPlan.quoted?.kind === 'foreign' && status.tweet.quoted && (
              <div class="translation-source-part">
                <span class="translation-kicker">引用來源</span>
                <div data-part="quote-body" lang={translationPlan.quoted.tag} dir="auto">
                  <TranslationSourceText segments={status.tweet.quoted.text} />
                </div>
              </div>
            )}
          </div>

          <button class="translation-read" type="button" disabled={busy} onClick={openSafariTranslation}>
            開啟 Safari 翻譯分頁
          </button>

          <div class="translation-editors">
            {translationPlan.main.kind === 'foreign' && (
              <label for="translation-main">
                主文譯文
                <textarea
                  id="translation-main"
                  dir="auto"
                  value={translationDraft.main}
                  onInput={(event) => {
                    setTranslationDraft({ ...translationDraft, main: event.currentTarget.value })
                    setTranslationFeedback(null)
                  }}
                />
              </label>
            )}
            {translationPlan.quoted?.kind === 'foreign' && (
              <label for="translation-quoted">
                引用譯文
                <textarea
                  id="translation-quoted"
                  dir="auto"
                  value={translationDraft.quoted}
                  onInput={(event) => {
                    setTranslationDraft({ ...translationDraft, quoted: event.currentTarget.value })
                    setTranslationFeedback(null)
                  }}
                />
              </label>
            )}
          </div>

          <button class="primary translation-apply" type="button" disabled={busy} onClick={applyDraftTranslation}>
            套用到卡片
          </button>

          <div class="translation-actions">
            {safariVersion && (
              <>
                <button type="button" aria-pressed={safariVersion.view === 'translated'}
                  onClick={() => showSafariVersion('translated')}>顯示譯文</button>
                <button type="button" aria-pressed={safariVersion.view === 'original'}
                  onClick={() => showSafariVersion('original')}>顯示原文</button>
              </>
            )}
            <button class="translation-restore" type="button" onClick={restoreOriginal}>還原原文</button>
          </div>

          {translationFeedback && <p class="translation-feedback" role="status" aria-live="polite">{translationFeedback}</p>}
          <p class="translation-note">
            XFrame 不使用翻譯 API；專用分頁只在同一個 XFrame 網址暫存原文與譯文，
            卡片也只在你按下「套用到卡片」後才會被譯文取代。
            Apple 表示 Safari 網頁翻譯會把網頁文字傳送給 Apple。
            {' '}<a href="https://www.apple.com/tw/legal/privacy/data/zh-tw/safari/" target="_blank" rel="noreferrer">了解隱私說明</a>
          </p>
        </section>
      )}

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
              onClick={() => pngBlob && displayedTweet && downloadBlob(pngBlob, buildFilename(displayedTweet))}>下載</button>
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
              <option value="9:16">9:16 IG 限動</option>
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
              不隨這台裝置的畫面寬度變動。
              {settings.aspect === '9:16' && ' 已保留 IG 限動上下安全區。'}
              預覽只是縮小顯示，不影響輸出。
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

export function App() {
  const bridgeToken = new URLSearchParams(location.search).get('safari-translate')
  return bridgeToken ? <SafariTranslationBridge token={bridgeToken} /> : <XFrameApp />
}
