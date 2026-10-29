import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CardSettings, Post, TranslatedFrom } from '../src/types'
import { Card, cardMedia, mixesPhotosAndVideo } from '../src/render/Card'
import { findPaper } from '../src/render/papers'
import { exportPng, buildFilename } from '../src/render/export'
import { buildVideoFilename, exportVideo, type VideoExportMode } from '../src/render/video'
import { acquireComment } from '../src/platforms/threads'
import { Sheet } from '../src/ui/Sheet'
import { TranslationPanel } from '../src/ui/TranslationPanel'
import {
  applyPastedTranslation,
  buildTranslationPlan,
  emptyTranslationDraft,
  type TranslatedVersion,
  type TranslationDraft,
} from '../src/translate/translation'
import { APP_DEFAULT_SETTINGS } from './settings'
import { appAdapterFor, extractShareUrl } from './adapters'
import { MOODS, applyMood, reshufflePaper, type Mood } from './moods'
import { APP_TYPE } from './typography'
import { fetchAppVideo, hydrateApp } from './hydrate'
import { shareOutput } from './output'

/** 取文與載圖。測試換成假的，app 用真的（原生 fetch，沒有 CORS）。 */
export type AppDeps = {
  acquire: (url: string) => Promise<Post>
  acquireComment: (postUrl: string, commentUrl: string) => Promise<Post>
  hydrate: (post: Post) => Promise<Post>
}

const REAL_DEPS: AppDeps = {
  acquire: (url) => {
    const adapter = appAdapterFor(url)
    if (!adapter) return Promise.reject(Object.assign(new Error('badurl'), { kind: 'badurl' }))
    return adapter.acquire(url)
  },
  // Threads 的留言頁不帶原文，兩則分開抓再接起來；X 的回覆頁本來就帶著被回覆的那一則。
  acquireComment: (postUrl, commentUrl) => appAdapterFor(commentUrl)?.platform === 'threads'
    ? acquireComment(postUrl, commentUrl)
    : REAL_DEPS.acquire(commentUrl),
  hydrate: hydrateApp,
}

const ERROR_TEXT: Record<string, string> = {
  refused: 'Threads 不讓未登入讀取這則貼文（可能是敏感內容、私人帳號或已刪除）。可以改用複製貼文文字貼上。',
  'not-found': '這則貼文已不存在',
  'rate-limited': '平台暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  cors: '網路錯誤，請重試',
  parse: '讀不到這則貼文的內容',
  badurl: '這看起來不是 X 或 Threads 的貼文網址',
}

const errorText = (e: unknown) => ERROR_TEXT[(e as { kind?: string })?.kind ?? ''] ?? ERROR_TEXT.network

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; post: Post }
  | { phase: 'error'; message: string }

function playableVideo(post: Post | null, settings: CardSettings) {
  if (!post || !settings.show.media) return null
  return cardMedia(post.media, settings.show.photosWithVideo).find((m) => m.kind !== 'photo')?.video ?? null
}

/** Threads 的頁面不一定給影片長度；不知道就不寫秒數，寫錯比不寫糟。 */
function videoLabel(durationMs: number): string {
  return durationMs > 0 ? `分享影片（${Math.max(1, Math.round(durationMs / 1000))} 秒）` : '分享影片'
}

/** 把卡片縮進一個框裡。量的是版面尺寸（offset*），不受自己的 transform 影響。 */
function useFit(deps: unknown[]) {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  useLayoutEffect(() => {
    const box = boxRef.current
    const card = innerRef.current?.firstElementChild as HTMLElement | null
    if (!box || !card) return
    const measure = () => {
      if (!card.offsetWidth || !card.offsetHeight) return setFit(1)
      setFit(Math.min(1, box.clientWidth / card.offsetWidth, box.clientHeight / card.offsetHeight) || 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(card)
    return () => ro.disconnect()
  }, deps)
  return { boxRef, innerRef, fit }
}

function MoodThumb({ mood, post, settings, active, onPick }: {
  mood: Mood; post: Post; settings: CardSettings; active: boolean; onPick: () => void
}) {
  const { boxRef, innerRef, fit } = useFit([post, settings])
  return (
    <button type="button" class="mood" data-mood={mood.id} aria-pressed={active} onClick={onPick}>
      <div class="mood-card" ref={boxRef} aria-hidden="true">
        <div class="fit" ref={innerRef} style={{ transform: `scale(${fit})` }}>
          <Card post={post} settings={settings} typeTuning={APP_TYPE[mood.font]} />
        </div>
      </div>
      <span>{mood.name}</span>
    </button>
  )
}

export function App({ deps = REAL_DEPS, initialUrl, subscribe }: {
  deps?: AppDeps
  initialUrl?: string
  /** 分享進來的網址（Task 9 的分享擴充功能）。回傳取消訂閱。 */
  subscribe?: (load: (url: string) => void) => (() => void) | void
}) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [moodId, setMoodId] = useState<Mood['id']>('serious')
  const mood = MOODS.find((m) => m.id === moodId)!
  const [settings, setSettings] = useState<CardSettings>(() => applyMood(APP_DEFAULT_SETTINGS, mood, () => 0))
  const [commentUrl, setCommentUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ mode: VideoExportMode | null; fraction: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [translatedVersion, setTranslatedVersion] = useState<TranslatedVersion | null>(null)
  const [translationDraft, setTranslationDraft] = useState<TranslationDraft | null>(null)
  const [translationFeedback, setTranslationFeedback] = useState<string | null>(null)
  const [translatedFrom, setTranslatedFrom] = useState<TranslatedFrom>('en')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const videoRef = useRef<{ source: string; blob: Blob; url: string } | null>(null)
  const requestRef = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const source = status.phase === 'ready' ? status.post : null
  const post = translatedVersion
    ? translatedVersion.view === 'translated' ? translatedVersion.translated : translatedVersion.original
    : source
  const plan = useMemo(() => source ? buildTranslationPlan(source) : null, [source])

  const releaseVideo = () => {
    if (videoRef.current) URL.revokeObjectURL(videoRef.current.url)
    videoRef.current = null
    setVideoUrl(null)
  }

  async function ensureVideo(sourceUrl: string): Promise<Blob> {
    if (videoRef.current?.source === sourceUrl) return videoRef.current.blob
    releaseVideo()
    const blob = await fetchAppVideo(sourceUrl)
    const objectUrl = URL.createObjectURL(blob)
    videoRef.current = { source: sourceUrl, blob, url: objectUrl }
    setVideoUrl(objectUrl)
    return blob
  }

  async function show(load: () => Promise<Post>) {
    const request = ++requestRef.current
    setStatus({ phase: 'loading' })
    setMessage(null)
    releaseVideo()
    setTranslatedVersion(null)
    try {
      const next = await deps.hydrate(await load())
      if (request === requestRef.current) setStatus({ phase: 'ready', post: next })
    } catch (e) {
      if (request === requestRef.current) setStatus({ phase: 'error', message: errorText(e) })
    }
  }

  /** 載入一則貼文。分享擴充功能也走這裡：新的分享直接取代目前的卡片。 */
  function loadUrl(raw: string) {
    const target = extractShareUrl(raw) ?? raw.trim()
    setUrl(target)
    setCommentUrl('')
    void show(() => deps.acquire(target))
  }

  function addComment() {
    const target = extractShareUrl(commentUrl) ?? commentUrl.trim()
    if (!target || !source) return
    setSettings((s) => ({ ...s, show: { ...s.show, parent: true } }))
    void show(() => deps.acquireComment(source.url, target))
  }

  useEffect(() => {
    if (initialUrl) loadUrl(initialUrl)
    const off = subscribe?.(loadUrl)
    return () => { off?.(); releaseVideo() }
  }, [])

  useEffect(() => {
    if (!plan?.hasForeignText) return setTranslationDraft(null)
    setTranslationDraft(emptyTranslationDraft())
    setTranslatedFrom(plan.from)
  }, [plan])

  const patch = (p: Partial<CardSettings>) => setSettings((s) => ({ ...s, ...p }))
  const pickMood = (m: Mood) => { setMoodId(m.id); setSettings((s) => applyMood(s, m)) }
  const { boxRef, innerRef, fit } = useFit([post, settings])
  const video = playableVideo(post, settings)

  async function share() {
    const node = cardRef.current?.querySelector<HTMLElement>('[data-part="canvas"]')
    if (!node || !post) return
    setBusy(true)
    setMessage(null)
    try {
      const png = buildFilename(post)
      if (video) {
        setProgress({ mode: null, fraction: 0 })
        const blob = await exportVideo(node, await ensureVideo(video.url), {
          focusY: settings.mediaFocusY,
          onProgress: (fraction) => setProgress((p) => ({ mode: p?.mode ?? null, fraction })),
          onMode: (mode) => setProgress((p) => ({ mode, fraction: p?.fraction ?? 0 })),
        })
        await shareOutput(blob, buildVideoFilename(png, blob.type))
      } else {
        await shareOutput(await exportPng(node), png)
      }
    } catch (e) {
      setMessage(video ? `影片輸出失敗：${String(e)}` : `圖片輸出失敗：${String(e)}`)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  return (
    <div class="screen">
      <div class="urlbar">
        <input type="url" inputMode="url" placeholder="貼上 X 或 Threads 的貼文網址" value={url}
          onInput={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadUrl(url) }} />
        <button type="button" disabled={!url.trim() || status.phase === 'loading'} onClick={() => loadUrl(url)}>讀取</button>
      </div>

      <div class="stage" ref={boxRef}>
        {status.phase === 'idle' && <p class="msg">在 X 或 Threads 按「分享」選 XFrame，或在上面貼上網址。</p>}
        {status.phase === 'loading' && <p class="msg" role="status">讀取中…</p>}
        {status.phase === 'error' && <p class="msg err" role="alert">{status.message}</p>}
        {post && (
          <div class="fit" ref={innerRef} style={{ transform: `scale(${fit})` }}>
            <div ref={cardRef} data-part="main-card" data-bg-id={settings.bgId}>
              <Card post={post} settings={settings} typeTuning={APP_TYPE[mood.font]}
                videoUrl={videoUrl ?? undefined}
                onPlayVideo={video ? () => { void ensureVideo(video.url) } : undefined}
                onVideoError={() => setVideoUrl(null)} />
            </div>
          </div>
        )}
      </div>

      {post && (
        <>
          <div class="moods" role="group" aria-label="氛圍">
            {MOODS.map((m) => (
              <MoodThumb key={m.id} mood={m} post={post} active={m.id === moodId}
                settings={m.id === moodId ? settings : applyMood(settings, m, () => 0)}
                onPick={() => pickMood(m)} />
            ))}
          </div>

          <div class="actions">
            <button type="button" data-action="reshuffle" disabled={busy}
              onClick={() => setSettings((s) => reshufflePaper(s, mood))}>換一張</button>
            <button type="button" class="primary" data-action="share" disabled={busy} onClick={() => void share()}>
              {progress
                ? `${progress.mode === 'realtime' ? '錄製中' : '轉檔中'}… ${Math.round(progress.fraction * 100)}%`
                : busy ? '產生中…' : video ? videoLabel(video.durationMs) : '分享'}
            </button>
          </div>
          {progress?.mode === 'realtime' && <p class="hint">這支影片走即時錄製，請讓畫面留在這裡。</p>}
          {message && <p class="err" role="alert">{message}</p>}
        </>
      )}

      <fieldset class="drawer" data-part="tweak-drawer" disabled={busy}>
        <Sheet title="細調">
          <div data-control="paper" class="papers" role="group" aria-label="紙張">
            {mood.paperIds.map((id) => {
              const paper = findPaper(id)
              return (
                <button type="button" key={id} aria-label={paper.name} aria-pressed={settings.bgId === id}
                  style={{ background: paper.css(48, 48) }}
                  onClick={() => patch({ bgId: id, panelColor: paper.panel, textColor: paper.ink })} />
              )
            })}
          </div>
          <label>留白<input type="range" data-control="padding" min={0} max={54} value={settings.padding}
            onInput={(e) => patch({ padding: +e.currentTarget.value })} /></label>
          <label>文字尺寸<input type="range" data-control="font-size" min={13} max={40} value={settings.fontSize}
            onInput={(e) => patch({ fontSize: +e.currentTarget.value })} /></label>
          <label>底板顏色<input type="color" data-control="panel-color" value={settings.panelColor}
            onInput={(e) => patch({ panelColor: e.currentTarget.value })} /></label>
          <label>底板透明度<input type="range" data-control="panel-opacity" min={0} max={100} step={5}
            value={Math.round(settings.panelOpacity * 100)}
            onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} /></label>
        </Sheet>

        <Sheet title="顯示與隱私">
          <label class="check"><input type="checkbox" checked={settings.maskIdentity}
            onChange={(e) => patch({ maskIdentity: e.currentTarget.checked })} />遮蔽作者身分</label>
          {post?.replyTo && (
            <label class="check"><input type="checkbox" checked={settings.show.parent}
              onChange={(e) => patch({ show: { ...settings.show, parent: e.currentTarget.checked } })} />一起帶上被回覆的那一則</label>
          )}
          {post?.quoted && (
            <label class="check"><input type="checkbox" checked={settings.show.quoted}
              onChange={(e) => patch({ show: { ...settings.show, quoted: e.currentTarget.checked } })} />一起帶上被引用的那一則</label>
          )}
          {post && mixesPhotosAndVideo(post.media) && (
            <label class="check"><input type="checkbox" checked={settings.show.photosWithVideo}
              onChange={(e) => patch({ show: { ...settings.show, photosWithVideo: e.currentTarget.checked } })} />同時分享照片</label>
          )}
        </Sheet>

        <Sheet title="加上留言">
          <p class="hint">貼上一則留言的連結，卡片會把原文放在上面、留言接在下面。</p>
          <div class="urlbar">
            <input type="url" data-control="comment-url" placeholder="留言的網址" value={commentUrl}
              onInput={(e) => setCommentUrl(e.currentTarget.value)} />
            <button type="button" data-action="add-comment" disabled={!commentUrl.trim() || !source} onClick={addComment}>加上</button>
          </div>
        </Sheet>

        {source && plan?.hasForeignText && translationDraft && (
          <Sheet title="翻譯">
            <TranslationPanel
              post={source} plan={plan} draft={translationDraft} from={translatedFrom}
              applied={translatedVersion} feedback={translationFeedback} busy={busy}
              onDraft={(d) => { setTranslationDraft(d); setTranslationFeedback(null) }}
              onFrom={(f) => { setTranslatedFrom(f); setTranslationFeedback(null) }}
              onApply={() => {
                const translated = applyPastedTranslation(source, plan, translationDraft, translatedFrom)
                if (!translated) return setTranslationFeedback('貼上框是空的，或內容和原文相同。')
                setTranslatedVersion({ original: source, translated, view: 'translated' })
                setTranslationFeedback('譯文已套用到卡片。')
              }}
              onView={(view) => translatedVersion && setTranslatedVersion({ ...translatedVersion, view })}
              onRestore={() => {
                setTranslatedVersion(null)
                setTranslationDraft(emptyTranslationDraft())
                setTranslationFeedback('已還原原文。')
              }}
            />
          </Sheet>
        )}
      </fieldset>
    </div>
  )
}
