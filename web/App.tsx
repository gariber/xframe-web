import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CardSettings, Post, TranslatedFrom } from '../src/types'
import { Card, DEFAULT_SETTINGS, wholeMediaOf } from '../src/render/Card'
import { PRESETS, generate, randomPreset } from '../src/render/backgrounds'
import { exportPng, buildFilename, downloadBlob, EXPORT_WIDTH } from '../src/render/export'
import { buildVideoFilename, canRecordVideo, exportVideo, type VideoExportMode } from '../src/render/video'
import { ASPECT_VALUE } from '../src/render/card.css'
import { parseTweet, extractTweetId } from '../src/parse/microdata'
import { fetchTweetHtml, fetchVideoBlob, hydrateAssets } from './fetch'
import { Sheet } from '../src/ui/Sheet'
import { canShareFile, createShareFile, shareFile } from './share'
import { TranslationPanel } from '../src/ui/TranslationPanel'
import {
  applyPastedTranslation,
  buildTranslationPlan,
  emptyTranslationDraft,
  type TranslatedVersion,
  type TranslationDraft,
} from '../src/translate/translation'

const STORAGE_KEY = 'xframe.web.settings'

/** 網頁版預設精確 9:16 直式，適合限時動態；放不下時完整面板會等比縮小。
 *  留白比桌面小：手機畫布本來就窄，留白一大就把內容寬度整個吃掉。 */
const WEB_DEFAULTS: CardSettings = { ...DEFAULT_SETTINGS, aspect: '9:16', padding: 18 }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  cors: 'X 已變更存取政策，網頁版暫時無法使用 —— 請改用 Chrome 擴充功能',
  parse: '無法讀取這則推文。若是鎖推帳號，網頁版取不到內容，請用 Chrome 擴充功能',
  badurl: '這看起來不是推文網址',
  export: '產生圖片失敗，請重試',
  share: '這個瀏覽器目前無法分享圖片，請改用下載或長按圖片',
  videoExport: '錄製影片失敗，請重試',
}

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: Post }
  | { phase: 'error'; message: string }

const TEXT_CHANGED_DURING_EXPORT = '卡片文字剛更新，請再存一次。'

/** 成品。一次只有一份 —— 見 output 那個 state 的說明。 */
type Output = { kind: 'png' | 'video'; blob: Blob; url: string }

function outputName(output: Output, post: Post): string {
  const png = buildFilename(post)
  return output.kind === 'png' ? png : buildVideoFilename(png, output.blob.type)
}

/** 卡片上那支可以錄成影片的媒體。沒有就是沒有，不猜。 */
function playableVideo(post: Post | null): { url: string; durationMs: number } | null {
  return post?.media.find((m) => m.video)?.video ?? null
}

/**
 * 卡片上可見文字的指紋，用來在匯出前後比對內容有沒有被換掉。
 *
 * 譯文流程改成貼上之後，卡片文字只會因為我們自己的狀態改變而變（那由
 * translationRevisionRef 顧），但使用者仍可能自己對整頁下瀏覽器翻譯指令——
 * 卡片雖然標了 translate="no"，這個保險還是留著：預覽是一種文字、分享出去
 * 卻是另一種，是最不該發生的結果。
 */
function cardTextSignature(root: ParentNode): string {
  const read = (selector: string) => root.querySelector(selector)?.textContent ?? ''
  return JSON.stringify([read('[data-part="body"]'), read('[data-part="quote-body"]')])
}


/**
 * 已移除的比例（16:9）仍可能存在舊使用者的儲存資料裡。直接套用會得到一個不在
 * ASPECT_VALUE 裡的值 —— 畫面上是「比例下拉選單沒有任何選項被選中」，而卡片
 * 靜靜退化成自動高度。不是崩潰，但使用者看不懂發生什麼事，所以退回預設值。
 */
function validAspect(v: unknown): v is CardSettings['aspect'] {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ASPECT_VALUE, v)
}

/**
 * 存檔裡唯一還算數的顯示選擇。
 *
 * 「顯示項目」那一區已經移除（頭像、互動統計、時間、推文圖片四個開關），
 * 但存檔是使用者裝置上的舊資料，裡面可能還留著當初關掉的選擇 —— 例如把推文
 * 圖片關掉。介面上沒有地方可以打開了，那個人就再也看不到圖片，而且找不到
 * 原因。所以讀回存檔時只認 parent，其餘一律回到預設值。
 *
 * parent 與 quoted（要不要一起畫出被回覆的、被引用的那一則）留著，因為它們
 * 在預覽底下各有自己的控制項，關掉之後打得開。
 */
const PERSISTED_SHOW_KEYS = ['parent', 'quoted'] as const

/**
 * 把存檔套回預設值上。抽成純函式是為了讓上面那段遷移邏輯可以被斷言 ——
 * 它保護的是「使用者再也打不開某個東西」這種無聲的壞掉，靠人工點一遍發現
 * 不了，因為要先有一份含著舊選擇的存檔才看得出來。
 */
export function settingsFromSaved(saved: Partial<CardSettings>): CardSettings {
  const out: CardSettings = {
    ...WEB_DEFAULTS,
    show: { ...WEB_DEFAULTS.show },
    background: { ...WEB_DEFAULTS.background },
  }
  for (const k of Object.keys(WEB_DEFAULTS) as (keyof CardSettings)[]) {
    const v = saved[k]
    if (v === undefined) continue
    if (k === 'aspect' && !validAspect(v)) continue
    if (k === 'show') {
      for (const key of PERSISTED_SHOW_KEYS) {
        const flag = (v as CardSettings['show'])[key]
        if (typeof flag === 'boolean') out.show[key] = flag
      }
    } else if (k === 'background') Object.assign(out[k], v)
    else out[k] = v as never
  }
  return out
}

function loadSettings(): CardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...WEB_DEFAULTS }
    return settingsFromSaved(JSON.parse(raw) as Partial<CardSettings>)
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
  /* 一次只有一份成品。PNG 與影片各存一份的話，兩者可能同時存在而畫面只顯示
     其中一個 —— 使用者按下「分享」拿到的會是另一個。 */
  const [output, setOutput] = useState<Output | null>(null)
  /* 錄製中與否要用 state 不能用 ref 推導：ref 改了不會重繪，進度百分比會
     永遠停在 0%，看起來像當掉了。 */
  const [recording, setRecording] = useState(false)
  const [videoMode, setVideoMode] = useState<VideoExportMode | null>(null)
  const [videoFallbackReason, setVideoFallbackReason] = useState<string | null>(null)
  /*
   * 抓下來的影片。blobUrl 給卡片當預覽播放用，blob 本身留著給匯出重用 ——
   * 同一支影片不該因為「先看過再存」就下載兩次。
   */
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null)
  const videoBlobRef = useRef<{ url: string; blob: Blob; source: string } | null>(null)
  const [videoProgress, setVideoProgress] = useState(0)

  const [exportErr, setExportErr] = useState<string | null>(null)
  const [translatedVersion, setTranslatedVersion] = useState<TranslatedVersion | null>(null)
  const [translationDraft, setTranslationDraft] = useState<TranslationDraft | null>(null)
  const [translationFeedback, setTranslationFeedback] = useState<string | null>(null)
  /* 卡片標示用的來源語言。偵測結果只是預設值——全漢字日文無法可靠地和中文
     區分（見 detectTextLanguage 的註解），所以留一個下拉讓使用者改。 */
  const [translatedFrom, setTranslatedFrom] = useState<TranslatedFrom>('en')
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
  const outputRef = useRef<Output | null>(null)
  const videoAbortRef = useRef<AbortController | null>(null)
  const requestRef = useRef(0)
  const translationRevisionRef = useRef(0)

  // status 永遠保留抓回來的原文；顯示版本另外管理，才可以在原文與譯文之間切換，
  // 也不會因調整背景或字級而把貼上的譯文沖掉。
  const displayedTweet = status.phase === 'ready'
    ? translatedVersion?.view === 'translated'
      ? translatedVersion.translated
      : translatedVersion?.original ?? status.tweet
    : null
  const translationPlan = useMemo(
    () => status.phase === 'ready' ? buildTranslationPlan(status.tweet) : null,
    [status],
  )
  // createObjectURL 產生的 URL 不會自動回收，整個分頁生命週期都會佔住記憶體，
  // 除非明確 revokeObjectURL —— 每次換圖前先撤銷舊的，卸載時再撤銷最後一個。
  const keepOutput = (made: { kind: Output['kind']; blob: Blob }) => {
    if (outputRef.current) URL.revokeObjectURL(outputRef.current.url)
    const next = { ...made, url: URL.createObjectURL(made.blob) }
    outputRef.current = next
    setOutput(next)
  }

  const releaseVideoBlob = () => {
    if (videoBlobRef.current) URL.revokeObjectURL(videoBlobRef.current.url)
    videoBlobRef.current = null
    setVideoBlobUrl(null)
  }

  /** 影片的位元組。抓過就用抓過的那一份。 */
  async function ensureVideoBlob(sourceUrl: string): Promise<Blob> {
    const cached = videoBlobRef.current
    if (cached && cached.source === sourceUrl) return cached.blob
    releaseVideoBlob()
    const blob = await fetchVideoBlob(sourceUrl)
    const url = URL.createObjectURL(blob)
    videoBlobRef.current = { url, blob, source: sourceUrl }
    setVideoBlobUrl(url)
    return blob
  }

  const releaseOutput = () => {
    if (outputRef.current) URL.revokeObjectURL(outputRef.current.url)
    outputRef.current = null
    setOutput(null)
    setVideoProgress(0)
  }

  const resetTranslationState = () => {
    setTranslatedVersion(null)
    setTranslationDraft(null)
    setTranslationFeedback(null)
    translationRevisionRef.current += 1
  }

  useEffect(() => () => {
    if (outputRef.current) URL.revokeObjectURL(outputRef.current.url)
    if (videoBlobRef.current) URL.revokeObjectURL(videoBlobRef.current.url)
  }, [])

  useEffect(() => {
    if (status.phase !== 'ready' || !translationPlan?.hasForeignText) {
      setTranslationDraft(null)
      return
    }
    setTranslationDraft(emptyTranslationDraft())
    setTranslatedFrom(translationPlan.from)
  }, [status, translationPlan])

  // 支援 ?u= 帶入，讓捷徑或書籤可以直接開啟並自動抓取
  useEffect(() => {
    const u = new URLSearchParams(location.search).get('u')
    if (u) { setUrl(u); void go(u) }
  }, [])

  const patch = (p: Partial<CardSettings>) => {
    // 設定一變，舊 PNG 就不再代表目前預覽；移除它可避免誤分享舊圖。
    releaseOutput()
    setExportErr(null)
    const next = { ...settings, ...p }
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* 隱私瀏覽模式可能不給寫 */ }
  }

  async function go(target = url) {
    const request = ++requestRef.current
    setStatus({ phase: 'loading' })
    releaseOutput()
    // 換了推文才丟掉抓好的影片。改設定（patch）不丟 —— 調個留白就要重新
    // 下載好幾 MB，那是在罰使用者試東西。
    releaseVideoBlob()
    resetTranslationState()
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

  function applyDraftTranslation() {
    if (status.phase !== 'ready' || !translationPlan || !translationDraft) return
    const translated = applyPastedTranslation(
      status.tweet,
      translationPlan,
      translationDraft,
      translatedFrom,
    )

    if (!translated) {
      setTranslationFeedback('貼上框是空的，或內容和原文相同。請貼上 X 翻好的譯文。')
      return
    }

    releaseOutput()
    translationRevisionRef.current += 1
    setTranslatedVersion({ original: status.tweet, translated, view: 'translated' })
    setTranslationFeedback('譯文已套用到卡片。')
  }

  function showTranslatedVersion(view: TranslatedVersion['view']) {
    if (!translatedVersion || translatedVersion.view === view) return
    releaseOutput()
    translationRevisionRef.current += 1
    setTranslatedVersion({ ...translatedVersion, view })
    setTranslationFeedback(null)
  }

  function restoreOriginal() {
    if (status.phase !== 'ready' || !translationPlan) return
    releaseOutput()
    translationRevisionRef.current += 1
    setTranslatedVersion(null)
    setTranslationDraft(emptyTranslationDraft())
    setTranslatedFrom(translationPlan.from)
    setTranslationFeedback('已還原原文；貼上框也已清空。')
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
    const signature = cardTextSignature(node)
    setBusy(true)
    setExportErr(null)
    try {
      const blob = await exportPng(node)
      // Safari 可以在光柵化進行中完成翻譯。那張 blob 的內容版本無法再確認，
      // 寧可丟棄並請使用者重按，也不能讓預覽是譯文、分享出去卻仍是原文。
      if (
        revision !== translationRevisionRef.current ||
        signature !== cardTextSignature(node)
      ) {
        setExportErr(TEXT_CHANGED_DURING_EXPORT)
        return
      }
      keepOutput({ kind: 'png', blob })
    } catch {
      setExportErr(ERROR_TEXT.export)
    } finally {
      setBusy(false)
    }
  }

  /**
   * 錄成影片。
   *
   * 錄製是即時的 —— 十五秒的影片就要錄十五秒，中途畫面不能離開。所以這裡
   * 一路回報進度，也留一個中止的出口；沒有那兩樣東西的話，使用者只會看到
   * 一顆按不動的按鈕，不知道是在跑還是壞了。
   */
  async function doExportVideo() {
    const node = cardRef.current?.querySelector('[data-part="canvas"]') as HTMLElement | null
    const video = playableVideo(displayedTweet)
    if (!node || !video || status.phase !== 'ready' || !displayedTweet) return
    const revision = translationRevisionRef.current
    const signature = cardTextSignature(node)
    const controller = new AbortController()
    videoAbortRef.current = controller
    setBusy(true)
    setRecording(true)
    setExportErr(null)
    setVideoProgress(0)
    setVideoMode(null)
    setVideoFallbackReason(null)
    try {
      const blob = await exportVideo(node, await ensureVideoBlob(video.url), {
        focusY: settings.mediaFocusY,
        signal: controller.signal,
        onProgress: setVideoProgress,
        onMode: (mode, reason) => {
          setVideoMode(mode)
          setVideoFallbackReason(reason ?? null)
        },
      })
      if (controller.signal.aborted) return
      // 同靜圖：預覽是一種文字、分享出去卻是另一種，是最不該發生的結果。
      if (revision !== translationRevisionRef.current || signature !== cardTextSignature(node)) {
        setExportErr(TEXT_CHANGED_DURING_EXPORT)
        return
      }
      keepOutput({ kind: 'video', blob })
    } catch (e) {
      const kind = e instanceof Error ? (e as { kind?: string }).kind : undefined
      setExportErr(kind ? ERROR_TEXT[kind] ?? ERROR_TEXT.videoExport : ERROR_TEXT.videoExport)
    } finally {
      videoAbortRef.current = null
      setRecording(false)
      setBusy(false)
    }
  }

  async function doShare() {
    if (!outputFile) return
    setBusy(true)
    setExportErr(null)
    try {
      const result = await shareFile(outputFile)
      if (result === 'unsupported') setExportErr(ERROR_TEXT.share)
    } catch {
      setExportErr(ERROR_TEXT.share)
    } finally {
      setBusy(false)
    }
  }

  const videoMedia = playableVideo(displayedTweet)
  const videoSeconds = videoMedia ? Math.max(1, Math.round(videoMedia.durationMs / 1000)) : 0
  const outputFile = output && displayedTweet
    ? createShareFile(output.blob, outputName(output, displayedTweet))
    : null
  const shareSupported = outputFile !== null && canShareFile(outputFile)
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
            releaseOutput()
            releaseVideoBlob()
            resetTranslationState()
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
          <Card
            post={displayedTweet}
            settings={settings}
            videoUrl={videoBlobUrl ?? undefined}
            onPlayVideo={videoMedia ? () => { void ensureVideoBlob(videoMedia.url) } : undefined}
            /* 播不動就退回封面與播放鍵，讓它看起來還能再試一次。抓好的位元組
               留著不丟 —— 匯出那條路用的是另一套解碼，不見得跟著失敗。 */
            onVideoError={() => setVideoBlobUrl(null)}
          />
        )}
        </div>
      </div>

      {/*
        這則是回覆時才出現。一則沒有回覆對象的貼文上放一個「被回覆的貼文」
        勾選框，勾了也不會有任何變化 —— 那是在騙人。
      */}
      {status.phase === 'ready' && displayedTweet?.replyTo && (
        <label class="thread-choice">
          <input type="checkbox" checked={settings.show.parent} disabled={busy}
            onChange={(e) => patch({ show: { ...settings.show, parent: e.currentTarget.checked } })} />
          一起帶上被回覆的那一則
        </label>
      )}

      {/* 同理：沒有引用別人的貼文上放這個勾選框，勾了不會有任何變化。 */}
      {status.phase === 'ready' && displayedTweet?.quoted && (
        <label class="thread-choice">
          <input type="checkbox" checked={settings.show.quoted} disabled={busy}
            onChange={(e) => patch({ show: { ...settings.show, quoted: e.currentTarget.checked } })} />
          一起帶上被引用的那一則
        </label>
      )}

      {/*
        主要動作緊跟在預覽底下。它原本排在翻譯區之後 —— 而翻譯區在外文推文上
        佔掉半個畫面，等於把「存成圖片」推到看不見的地方，第一次用的人得先捲過
        一整段用不到的說明才找得到那顆按鈕。
      */}
      {status.phase === 'ready' && (
        <button class="primary export-btn" type="button" disabled={busy} onClick={() => void doExport()}>
          {busy ? '產生中…' : '存成圖片'}
        </button>
      )}

      {/*
        只有這則貼文真的帶著可下載的影片、而且這個瀏覽器錄得出來時才出現。
        兩個條件缺一不可：按了才發現不能錄，比沒有這顆按鈕更糟。
      */}
      {status.phase === 'ready' && videoMedia && canRecordVideo() && (
        <>
          <button class="export-btn" type="button" disabled={busy} onClick={() => void doExportVideo()}>
            {recording
              ? `${videoMode === 'realtime' ? '錄製中' : '轉檔中'}… ${Math.round(videoProgress * 100)}%`
              : `存成影片（${videoSeconds} 秒）`}
          </button>
          {recording && (
            <>
              {/* 慢路綁著真實時間，畫面離開就會掉幀 —— 這句話得在他離開之前看到。
                  快路不跟著跑，講這句只會讓人白等在那裡看著。 */}
              {videoMode === 'realtime' && (
                <p class="hint">
                  這支影片走的是即時錄製，請讓畫面留在這一頁。
                  {/* 退回慢路的原因講出來：使用者有權知道自己為什麼在等，
                      而這也是唯一能從真實裝置上問出原因的管道。 */}
                  {videoFallbackReason && <><br />快速轉檔用不了：{videoFallbackReason}</>}
                </p>
              )}
              <button class="export-btn" type="button"
                onClick={() => videoAbortRef.current?.abort()}>停止</button>
            </>
          )}
        </>
      )}
      {exportErr && <div class="err" role="alert">{exportErr}</div>}

      {output && status.phase === 'ready' && (
        <div class="result">
          {output.kind === 'video' ? (
            /*
             * 影片不另外放一支播放器。卡片本身就在播這支影片，底下再擺一支長得
             * 一樣的，畫面上就是上下兩張「會動的卡片」—— 實際被回報過，看不出
             * 該對哪一個動作。檔案好了說一聲、給動作就夠。
             *
             * 圖片不一樣：iPhone 上存圖靠的是長按那張 <img>，拿掉就存不了。
             */
            <p class="result-note">
              <strong>影片好了。</strong>
              {shareSupported ? '按「分享」可以存進相簿，或直接傳出去。' : '按「下載」存成檔案。'}
            </p>
          ) : (
            <>
              {/* 上面是預覽（可以繼續調），這裡是檔案。兩個長得像，不講清楚就會
                  分不出該對哪一個動作。 */}
              <h2 class="result-head">成品圖片</h2>
              <img src={output.url} alt="產生的分享圖" />
              <p>
                {shareSupported
                  ? '可直接分享，或長按加入照片。'
                  : '可下載；在 iPhone 上也能長按加入照片。'}
              </p>
            </>
          )}
          <div class="result-actions">
            <button type="button"
              onClick={() => displayedTweet && downloadBlob(output.blob, outputName(output, displayedTweet))}>下載</button>
            {shareSupported && (
              <button type="button" disabled={busy} onClick={() => void doShare()}>分享</button>
            )}
          </div>
        </div>
      )}

      {status.phase === 'ready' && translationPlan?.hasForeignText && translationDraft && (
        <TranslationPanel
          post={status.tweet}
          plan={translationPlan}
          draft={translationDraft}
          from={translatedFrom}
          applied={translatedVersion}
          feedback={translationFeedback}
          busy={busy}
          onDraft={(draft) => { setTranslationDraft(draft); setTranslationFeedback(null) }}
          onFrom={(from) => { setTranslatedFrom(from); setTranslationFeedback(null) }}
          onApply={applyDraftTranslation}
          onView={showTranslatedVersion}
          onRestore={restoreOriginal}
        />
      )}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        {/*
          背景與畫布排版合成一區「樣式」。這兩區本來是分開的兩個收合分區，
          但它們要回答的是同一個問題 —— 這張卡片長什麼樣子 —— 使用者調完背景
          常常緊接著要調留白，中間卻隔著一次收合、一次展開。
        */}
        <Sheet title="樣式">
          <h3 class="sheet-sub">背景紙張</h3>
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

          <h3 class="sheet-sub">畫布與排版</h3>
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
          {/*
            只有固定比例且真的有圖時才出現：auto 高度不裁切圖片，這根滑桿在那裡
            動了也不會有任何變化，擺著只會讓人以為壞了。單支影片同理 —— 它整支
            呈現、沒有被裁掉的部分，也就沒有位置可以調。
          */}
          {settings.aspect !== 'auto' && displayedTweet?.media.some((m) => m.dataUrl)
            && wholeMediaOf(displayedTweet.media) === null && (
            <label>圖片位置
              <input
                type="range"
                min={0}
                max={100}
                value={settings.mediaFocusY}
                onInput={(e) => patch({ mediaFocusY: Number(e.currentTarget.value) })}
              />
              <span class="hint-inline">{settings.mediaFocusY}%</span>
            </label>
          )}
          {downloadHeight !== null && (
            <p class="hint">
              下載尺寸固定 {EXPORT_WIDTH}×{downloadHeight} px，
              不隨這台裝置的畫面寬度變動。
              {settings.aspect === '9:16' && ' 已保留 IG 限動上下安全區。'}
              預覽只是縮小顯示，不影響輸出。
            </p>
          )}
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
  return <XFrameApp />
}
