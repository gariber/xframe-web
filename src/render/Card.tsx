import { Fragment } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Post, CardSettings, Segment, Media, Metric } from '../types'
import { generate, GRAIN_DATA_URI } from './backgrounds'
import {
  ASPECT_VALUE,
  canvasPaddingY,
  canvasPaddingYStyle,
  canvasSizeStyle,
  fitPanelScale,
  accentFrom,
} from './card.css'
import { METRIC_META } from './metrics'

export const DEFAULT_SETTINGS: CardSettings = {
  background: { kind: 'mesh', palette: 'sunset', seed: 1 },
  padding: 72,
  fontSize: 20,
  panelColor: '#1c1816',
  panelOpacity: 0.5,
  fontFamily: '-apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif',
  textColor: '#ffffff',
  show: { avatar: true, stats: true, timestamp: true, media: true },
  // 一般推文預設不遮。鎖推來源的推文由 Panel 在載入完成時改為預設開啟 ——
  // 那是安全的預設，但仍然是使用者可以關掉的選擇。
  maskIdentity: false,
  timeFormat: 'relative',
  aspect: 'auto',
}

/**
 * 互動數的縮寫。用 K/M 而非「萬」：卡片上其餘元素都沒有語言相依的字串，
 * 中文單位在英文推文上突兀，而且「18.4 萬」在窄卡片上會從數字和單位之間
 * 斷行（實測窄卡片上就會）。K/M 是單一 token，不會被拆開。
 */
function fmt(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1_000_000) return trimZero(n / 1_000_000) + 'M'
  if (n >= 1_000) return trimZero(n / 1_000) + 'K'
  return String(n)
}

function trimZero(v: number): string {
  return v.toFixed(1).replace(/\.0$/, '')
}

/**
 * 絕對發文時間。刻意用語言中性的 `YYYY-MM-DD HH:mm`：卡片會被分享到各種
 * 語境，中文的「年月日」在英文推文上不搭，而 Intl 的在地化格式會隨觀看者
 * 的系統語言變動，同一張圖在不同機器上匯出結果會不一樣。
 *
 * 用推文的當地時區呈現沒有意義（我們拿不到作者時區），所以以觀看者的本地
 * 時區呈現，與 X 網頁本身的行為一致。
 */
function absTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function relTime(iso: string): string {
  if (!iso) return ''
  const created = new Date(iso).getTime()
  if (!Number.isFinite(created)) return ''
  const diff = Date.now() - created
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function Stat({ metric }: { metric: Metric }) {
  const meta = METRIC_META[metric.kind]
  return (
    // nowrap：數字與圖示是一個語意單位，窄卡片上不該被拆到兩行
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap' }}>
      {/* 圖示尺寸綁 1em，跟著統計列的字級走，使用者拉「文字尺寸」時不會脫節 */}
      <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" role="img" aria-label={meta.label}
           style={{ fill: 'currentColor', flex: '0 0 auto' }}>
        <path d={meta.icon} />
      </svg>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(metric.value)}</span>
    </span>
  )
}

/** 圖 2 的視覺語言：數字之間用中點分隔，比純空白更緊湊也更有節奏 */
function Sep() {
  return <span aria-hidden="true" style={{ opacity: 0.45 }}>·</span>
}

function Text({ segments, accent }: { segments: Segment[]; accent: string }) {
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.value}</span>
        ) : (
          <span key={i} data-seg={s.type} style={{ color: accent }}>
            {s.value}
          </span>
        ),
      )}
    </>
  )
}

export const MASKED_NAME = '匿名'
export const MASKED_HANDLE = '•••••'

/**
 * 遮蔽後的作者資料。
 *
 * 三項一起處理是刻意的：顯示名稱、帳號、頭像任何一項單獨留著都足以認出人，
 * 只遮其中一兩項等於給使用者錯誤的安全感。
 *
 * 首字母色塊也要一併處理 —— Avatar 在沒有頭像時會拿名稱首字當字母，若不換掉
 * 名稱，遮蔽後的色塊仍會洩漏姓氏。改用 MASKED_NAME 後首字自然變成「匿」。
 */
const MASKED_AUTHOR: Post['author'] = {
  name: MASKED_NAME,
  handle: MASKED_HANDLE,
  /**
   * 遮蔽後仍保留平台前綴：遮的是身分，不是「這是哪個平台」。X 的遮蔽結果
   * 應該仍然看得出是一則 X 貼文。
   */
  handleDisplay: '@' + MASKED_HANDLE,
  avatarUrl: '',
  avatarDataUrl: undefined,
}

function Avatar({ author, size }: { author: Post['author']; size: number }) {
  // 只用 data URL。退回原始跨域網址會污染 canvas 導致匯出整個失敗，
  // 寧可退化成首字母色塊也不能讓匯出爆掉。
  const src = author.avatarDataUrl
  const style = { width: size, height: size, borderRadius: size * 0.28, flex: '0 0 auto' }
  if (src) return <img src={src} alt="" style={{ ...style, objectFit: 'cover' }} />
  return (
    <div
      data-part="monogram"
      style={{
        ...style,
        background: 'linear-gradient(140deg,#5b7cfa,#2a3a6b)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.44,
      }}
    >
      {author.name.trim().charAt(0).toUpperCase()}
    </div>
  )
}

function MediaGrid({
  media,
  constrained = false,
}: {
  media: Media[]
  constrained?: boolean
}) {
  // 同 Avatar：抓取失敗（無 dataUrl）的圖位直接隱藏，不可退回跨域網址
  const usable = media.filter((m) => m.dataUrl)
  if (usable.length === 0) return null
  return (
    <div
      data-part="media"
      style={{
        display: 'grid',
        gridTemplateColumns: usable.length > 1 ? '1fr 1fr' : '1fr',
        gridTemplateRows: constrained
          ? usable.length > 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)'
          : undefined,
        gap: 6,
        marginTop: constrained ? 8 : 12,
        borderRadius: 12,
        overflow: 'hidden',
        flex: constrained ? '1 1 0' : undefined,
        minHeight: constrained ? 0 : undefined,
      }}
    >
      {usable.slice(0, 4).map((m, i) => constrained ? (
        <div
          key={i}
          data-part="media-tile"
          style={{
            position: 'relative',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
          }}
        >
          <img
            data-part="media-image"
            src={m.dataUrl}
            alt={m.alt}
            style={{
              position: 'relative',
              zIndex: 1,
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              minHeight: 0,
              display: 'block',
              objectFit: 'contain',
              objectPosition: 'center center',
              borderRadius: 12,
            }}
          />
        </div>
      ) : (
        <img
          key={i}
          data-part="media-image"
          src={m.dataUrl}
          alt={m.alt}
          style={{ width: '100%', display: 'block' }}
        />
      ))}
    </div>
  )
}

/**
 * 中等長度貼文的字級微調。
 *
 * 固定比例下，這個係數先把中等長度貼文的字級略為收斂：有圖片時可留更多
 * 高度給圖片，純文字或引用內容過高時也能減少整張面板需要縮小的幅度。
 *
 * 4:5 是三種比例裡最高的（height = width × 1.25），1:1 較矮，同一份內容
 * 在兩者可用的高度差很多，所以係數分開給。這是手動調校的經驗值。
 */
const ASPECT_SHRINK: Record<CardSettings['aspect'], number> = {
  auto: 1,
  '1:1': 0.85,
  '4:5': 0.92,
  // 9:16 是三者最高（height = width × 16/9），同一份內容在這個比例下可用的
  // 高度本就比 1:1／4:5 寬裕，中等長度貼文不太需要收縮字級就能留在精確比例
  // 上，故跟 auto 一樣不套收縮係數。
  '9:16': 1,
}

/**
 * 推文過長時自動縮字級。
 * 以字元數估算：中日韓文字寬度約為拉丁字母兩倍，故加權計算。
 *
 * `aspect` 也是輸入之一：不同比例的可用高度不同，先依係數調整 base，能讓
 * 常見長度在固定比例裡保持較大的實際字級（作用在 base 上，不動 floor）。
 */
function fitFontSize(base: number, raw: string, aspect: CardSettings['aspect']): number {
  const effectiveBase = base * ASPECT_SHRINK[aspect]
  const cjk = (raw.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length
  const weighted = raw.length + cjk
  if (weighted <= 140) return effectiveBase
  if (weighted <= 240) return Math.max(13, effectiveBase * 0.85)
  if (weighted <= 380) return Math.max(12, effectiveBase * 0.7)
  return Math.max(11, effectiveBase * 0.58)
}

export function Card({ post, settings }: { post: Post; settings: CardSettings }) {
  const s = settings
  const accent = accentFrom(s.textColor)
  const panelBg = s.panelColor + Math.round(s.panelOpacity * 255).toString(16).padStart(2, '0')
  // 外層與被引用貼文的作者一起遮。遮蔽時卡片上不該出現任何帳號資訊 ——
  // 留著引用推文的帳號雖然那通常是另一個人，仍會提供辨識線索。
  const author = s.maskIdentity ? MASKED_AUTHOR : post.author
  const quotedAuthor =
    post.quoted && (s.maskIdentity ? MASKED_AUTHOR : post.quoted.author)
  const fontSize = fitFontSize(s.fontSize, post.rawText, s.aspect)

  const canvasRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const ratio = ASPECT_VALUE[s.aspect]
  const paddingY = canvasPaddingYStyle(s.aspect, s.padding)
  const constrainedMedia = ratio !== undefined &&
    s.show.media &&
    post.media.some((media) => Boolean(media.dataUrl))
  const [canvasHeight, setCanvasHeight] = useState<number | undefined>(undefined)
  const [panelScale, setPanelScale] = useState(1)

  // CSS aspect-ratio 會被 flex item 的 min-content 高度撐開，所以非 auto 模式
  // 直接由 offsetWidth 算固定 px height。有主圖時面板維持滿寬滿高，讓完整
  // 原圖置中並以底板純色承接剩餘空間；沒有主圖時才等比縮小過高面板。
  useLayoutEffect(() => {
    const el = canvasRef.current
    const panel = panelRef.current
    if (!el || ratio === undefined) {
      setCanvasHeight(undefined)
      setPanelScale(1)
      return
    }
    const measure = () => {
      // offsetWidth 而非 getBoundingClientRect().width：後者會被祖先的 transform
      // 縮放。行動網頁版把卡片包在 .preview-fit 的 scale() 裡塞進預覽框，量到的
      // 是縮放後的寬度，算出的高度就跟著縮。offsetWidth 是版面寬度，同樣是
      // border-box，不受任何 transform 影響。
      const width = el.offsetWidth
      if (width <= 0) {
        setCanvasHeight(undefined)
        setPanelScale(1)
        return
      }
      const height = width / ratio
      const measuredPaddingY = canvasPaddingY(s.aspect, s.padding, width)
      setCanvasHeight(height)
      setPanelScale(constrainedMedia
        ? 1
        : panel ? fitPanelScale(height - measuredPaddingY * 2, panel.offsetHeight) : 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (panel) ro.observe(panel)
    return () => ro.disconnect()
  }, [ratio, s.aspect, s.padding, constrainedMedia, settings, post])

  return (
    <div
      ref={canvasRef}
      data-part="canvas"
      data-aspect={s.aspect}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        // 定值 height 是對 border-box 算的（見上面量測邏輯：offsetWidth
        // 量到的就是 border-box 寬度）。沒有 box-sizing:border-box 的話，
        // height 只會指定 content-box，padding 會疊加在外面把實際框撐得
        // 比目標比例更高。
        padding: `${paddingY} ${s.padding}px`,
        background: generate(s.background.kind, s.background.palette, s.background.seed),
        // 不設定 CSS 的 aspect-ratio。實測過：把它跟下面這個量測出來的定值
        // height 同時留著，兩者會互相打架——height 定案後，aspect-ratio
        // 因為 width 仍是 auto，會反過來用「新 height × ratio」去改 width，
        // 改動後的 width 又觸發下面 ResizeObserver 重新量測、重新算高度……
        // 在 4:5 上實測會一路收斂到明顯偏小的框（576×720 而不是正確的
        // 720×900）。aspect-ratio 在這裡本來就是多餘的：useLayoutEffect
        // 保證在瀏覽器真正畫出東西之前就把固定 height 定案，CSS 版本從來沒有
        // 機會被使用者看到。
        // 非 auto 比例鎖定固定高度；有主圖時由圖片裁切填滿，否則必要時縮面板。
        // 決策抽在 card.css.ts 的 canvasSizeStyle 裡，因為留在這裡就測不到 ——
        // 展開的位置必須維持在原本兩行的位置，往後挪會被後面的屬性蓋掉。
        ...canvasSizeStyle(canvasHeight),
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: s.fontFamily,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN_DATA_URI,
          mixBlendMode: 'overlay',
          opacity: 0.3,
          pointerEvents: 'none',
        }}
      />
      <div
        ref={panelRef}
        data-part="panel"
        style={{
          position: 'relative',
          width: '100%',
          background: panelBg,
          backdropFilter: 'blur(28px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 18,
          padding: constrainedMedia ? '12px 14px' : '20px 24px',
          color: s.textColor,
          boxShadow: '0 24px 60px rgba(0,0,0,.28)',
          transform: panelScale < 1 ? `scale(${panelScale})` : undefined,
          transformOrigin: 'center center',
          flex: '0 0 auto',
          boxSizing: 'border-box',
          height: constrainedMedia ? '100%' : undefined,
          minHeight: constrainedMedia ? 0 : undefined,
          overflow: constrainedMedia ? 'hidden' : undefined,
          display: constrainedMedia ? 'flex' : undefined,
          flexDirection: constrainedMedia ? 'column' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: constrainedMedia ? 8 : 12, flex: '0 0 auto' }}>
          {s.show.avatar && <Avatar author={author} size={constrainedMedia ? 36 : 44} />}
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: s.fontSize * 0.9 }}>{author.name}</div>
            <div style={{ opacity: 0.55, fontSize: s.fontSize * 0.8 }}>{author.handleDisplay}</div>
          </div>
          {s.show.timestamp && (
            // 只有相對時間放標頭右上角。絕對時間長 8 倍（'1h' vs
            // '2026-08-01 10:21'），擺在這裡會跟作者名爭視覺重量、把標頭撐得
            // 左右失衡，改放內文下方獨立一行 —— 這也是 X 單篇詳情頁的做法。
            s.timeFormat === 'relative' && (
              <div
                data-part="time"
                style={{
                  marginLeft: 'auto',
                  opacity: 0.45,
                  fontSize: s.fontSize * 0.75,
                  whiteSpace: 'nowrap',
                  flex: '0 0 auto',
                }}
              >
                {relTime(post.createdAt)}
              </div>
            )
          )}
        </div>

        <div
          data-part="body"
          style={{
            fontSize,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            position: 'relative',
            flex: '0 0 auto',
          }}
        >
          <Text segments={post.text} accent={accent} />
        </div>

        {!post.textComplete && (
          <div
            data-part="incomplete"
            style={{
              marginTop: 8,
              opacity: 0.5,
              fontSize: s.fontSize * 0.72,
              flex: '0 0 auto',
            }}
          >
            內文未完整取得
          </div>
        )}

        {s.show.media && (
          <MediaGrid media={post.media} constrained={constrainedMedia} />
        )}

        {post.quoted && (
          <div
            data-part="quoted"
            style={{
              marginTop: 14,
              padding: '12px 14px',
              border: '1px solid rgba(255,255,255,.16)',
              borderRadius: 12,
              fontSize: s.fontSize * 0.85,
              flex: '0 0 auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Avatar author={quotedAuthor!} size={22} />
              <span style={{ fontWeight: 600 }}>{quotedAuthor!.name}</span>
              <span style={{ opacity: 0.5 }}>{quotedAuthor!.handleDisplay}</span>
            </div>
            <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              <Text segments={post.quoted.text} accent={accent} />
            </div>
            {!post.quoted.textComplete && (
              <div
                data-part="incomplete"
                style={{
                  marginTop: 8,
                  opacity: 0.5,
                  fontSize: s.fontSize * 0.72,
                }}
              >
                內文未完整取得
              </div>
            )}
            {s.show.media && <MediaGrid media={post.quoted.media} />}
          </div>
        )}

        {/*
          絕對時間的落點：內文（與圖片、被引用貼文）之後、統計列之前，獨立成行。
          與統計列共用同一組低對比樣式，讓「時間 + 數據」讀起來是同一個資訊層，
          而不是兩個互相競爭的元素。
        */}
        {s.show.timestamp && s.timeFormat === 'absolute' && absTime(post.createdAt) && (
          <div
            data-part="time"
            style={{
              marginTop: constrainedMedia ? 8 : 14,
              opacity: 0.45,
              fontSize: s.fontSize * 0.72,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.01em',
              flex: '0 0 auto',
            }}
          >
            {absTime(post.createdAt)}
          </div>
        )}

        {s.show.stats && (
          <div
            data-part="stats"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              rowGap: '0.35em',
              gap: '0.6em',
              marginTop: constrainedMedia ? 8 : 14,
              paddingTop: constrainedMedia ? 8 : 12,
              borderTop: '1px solid rgba(255,255,255,.1)',
              opacity: 0.55,
              fontSize: s.fontSize * 0.72,
              flex: '0 0 auto',
            }}
          >
            {post.metrics.map((m, i) => (
              <Fragment key={m.kind}>
                {i > 0 && <Sep />}
                <Stat metric={m} />
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
