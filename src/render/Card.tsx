import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { TweetData, CardSettings, Segment, Media } from '../types'
import { generate, GRAIN_DATA_URI } from './backgrounds'
import { ASPECT_VALUE, canvasSizeStyle, accentFrom } from './card.css'

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

/**
 * 互動數的圖示。用 inline SVG 而非 emoji：emoji 在不同系統上字形差異極大，
 * 而且光柵化時得靠系統 emoji 字型，很容易變豆腐字或尺寸跑掉。SVG path 是
 * 純向量、跟著 currentColor 走，匯出結果在任何機器上都一致。
 */
const ICON = {
  views: 'M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  replies: 'M12 3c-5 0-9 3.3-9 7.4 0 2.3 1.3 4.4 3.3 5.7L5.6 20a.4.4 0 0 0 .6.45l4-2.3c.6.1 1.2.15 1.8.15 5 0 9-3.3 9-7.4S17 3 12 3Z',
  reposts: 'M7 7h9.2l-2.1-2.1 1.4-1.4L19.5 8l-4 4-1.4-1.4L16.2 9H5V7h2Zm10 10H7.8l2.1 2.1-1.4 1.4L4.5 16l4-4 1.4 1.4L7.8 15H19v2h-2Z',
  likes: 'M12 20.7 10.5 19.3C5.4 14.7 2 11.7 2 8.1 2 5.4 4.2 3.2 6.9 3.2c1.5 0 3 .7 4 1.9l1.1 1.3 1.1-1.3c1-1.2 2.5-1.9 4-1.9 2.7 0 4.9 2.2 4.9 4.9 0 3.6-3.4 6.6-8.5 11.2L12 20.7Z',
} as const

function Stat({ icon, value, label }: { icon: string; value: number | null; label: string }) {
  return (
    // nowrap：數字與圖示是一個語意單位，窄卡片上不該被拆到兩行
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap' }}>
      {/* 圖示尺寸綁 1em，跟著統計列的字級走，使用者拉「文字尺寸」時不會脫節 */}
      <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" role="img" aria-label={label}
           style={{ fill: 'currentColor', flex: '0 0 auto' }}>
        <path d={icon} />
      </svg>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
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
const MASKED_AUTHOR: TweetData['author'] = {
  name: MASKED_NAME,
  handle: MASKED_HANDLE,
  avatarUrl: '',
  avatarDataUrl: undefined,
}

function Avatar({ author, size }: { author: TweetData['author']; size: number }) {
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

function MediaGrid({ media }: { media: Media[] }) {
  // 同 Avatar：抓取失敗（無 dataUrl）的圖位直接隱藏，不可退回跨域網址
  const usable = media.filter((m) => m.dataUrl)
  if (usable.length === 0) return null
  return (
    <div
      data-part="media"
      style={{
        display: 'grid',
        gridTemplateColumns: usable.length > 1 ? '1fr 1fr' : '1fr',
        gap: 6,
        marginTop: 12,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {usable.slice(0, 4).map((m, i) => (
        <img key={i} src={m.dataUrl} alt={m.alt} style={{ width: '100%', display: 'block' }} />
      ))}
    </div>
  )
}

/**
 * 中等長度貼文的字級微調。
 *
 * 畫布改成最小高度後，這個係數不再負責「把內容擠進固定高度」—— 塞不下時
 * 畫布會自己長高，完整性由那個機制保證。它現在只做一件事：讓中等長度的
 * 貼文盡量仍然落在使用者選的那個精確比例上，而不是動輒長成 1:1.4。
 *
 * 4:5 是三種比例裡最高的（height = width × 1.25），1:1 較矮，同一份內容
 * 在兩者可用的高度差很多，所以係數分開給。這是手動調校的經驗值。
 */
const ASPECT_SHRINK: Record<CardSettings['aspect'], number> = {
  auto: 1,
  '1:1': 0.85,
  '4:5': 0.92,
  // 不鎖死高度，內容長就讓畫布變高，沒有塞不下的問題
  '9:16': 1,
}

/**
 * 推文過長時自動縮字級。
 * 以字元數估算：中日韓文字寬度約為拉丁字母兩倍，故加權計算。
 *
 * `aspect` 也是輸入之一：固定比例模式下畫布高度是量測寬度後算出的定值，不會
 * 像 auto 模式隨內容長高，可用的內容高度遠小於 auto，且三種固定比例彼此差異
 * 很大（見 ASPECT_SHRINK 說明）。因此非 auto 比例依各自可用高度套上不同的
 * 縮小係數（作用在 base 上，不動下面既有的 floor 鎖定值），讓固定比例模式
 * 傾向縮字級而不是把內容撐出畫布。
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

export function Card({ tweet, settings }: { tweet: TweetData; settings: CardSettings }) {
  const s = settings
  const accent = accentFrom(s.textColor)
  const panelBg = s.panelColor + Math.round(s.panelOpacity * 255).toString(16).padStart(2, '0')
  // 外層與引用推文的作者一起遮。遮蔽時卡片上不該出現任何帳號資訊 ——
  // 留著引用推文的帳號雖然那通常是另一個人，仍會提供辨識線索。
  const author = s.maskIdentity ? MASKED_AUTHOR : tweet.author
  const quotedAuthor =
    tweet.quoted && (s.maskIdentity ? MASKED_AUTHOR : tweet.quoted.author)
  const fontSize = fitFontSize(s.fontSize, tweet.rawText, s.aspect)

  const canvasRef = useRef<HTMLDivElement>(null)
  const ratio = ASPECT_VALUE[s.aspect]
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)

  // CSS 的 aspect-ratio 在真瀏覽器下實測會輸給內容：畫布是 flex 容器、面板是
  // 內容驅動高度的 flex item，兩者對「auto 高度該怎麼算」互相打架時，
  // aspect-ratio 不保證贏（實測撐高達 14%）。改成量測目前寬度、直接算出一個
  // 定值 px 高度指定給 minHeight——一個具體的長度不會再參與那場輸贏未定的
  // 自動定size演算法，比例由建構方式保證成立。只在非 auto 時量測；量到 0
  // （例如測試環境沒有真正的排版引擎、或元素還沒被插入 DOM）就會得到
  // minHeight:0，這是量測值本身的極限，不是這段邏輯的 bug。
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el || ratio === undefined) {
      setMinHeight(undefined)
      return
    }
    const measure = () => {
      // offsetWidth 而非 getBoundingClientRect().width：後者會被祖先的 transform
      // 縮放。行動網頁版把卡片包在 .preview-fit 的 scale() 裡塞進預覽框，量到的
      // 是縮放後的寬度，算出的高度就跟著縮。offsetWidth 是版面寬度，同樣是
      // border-box，不受任何 transform 影響。
      setMinHeight(el.offsetWidth / ratio)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ratio, settings, tweet])

  return (
    <div
      ref={canvasRef}
      data-part="canvas"
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        // 定值 minHeight 是對 border-box 算的（見上面量測邏輯：offsetWidth
        // 量到的就是 border-box 寬度）。沒有 box-sizing:border-box 的話，
        // minHeight 只會指定 content-box，padding 會疊加在外面把實際框撐得
        // 比目標比例更高。
        padding: s.padding,
        background: generate(s.background.kind, s.background.palette, s.background.seed),
        // 不設定 CSS 的 aspect-ratio。實測過：把它跟下面這個量測出來的定值
        // minHeight 同時留著，兩者會互相打架——minHeight 定案後，aspect-ratio
        // 因為 width 仍是 auto，會反過來用「新 height × ratio」去改 width，
        // 改動後的 width 又觸發下面 ResizeObserver 重新量測、重新算高度……
        // 在 4:5 上實測會一路收斂到明顯偏小的框（576×720 而不是正確的
        // 720×900）。aspect-ratio 在這裡本來就是多餘的：useLayoutEffect
        // 保證在瀏覽器真正畫出東西之前就把 minHeight 定案，CSS 版本從來沒有
        // 機會被使用者看到。
        // 所有比例都只給下限，不鎖死高度，內容更長時畫布自然變高、不裁切。
        // 決策抽在 card.css.ts 的 canvasSizeStyle 裡，因為留在這裡就測不到 ——
        // 展開的位置必須維持在原本兩行的位置，往後挪會被後面的屬性蓋掉。
        ...canvasSizeStyle(minHeight),
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
        data-part="panel"
        style={{
          position: 'relative',
          width: '100%',
          background: panelBg,
          backdropFilter: 'blur(28px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 18,
          padding: '20px 24px',
          color: s.textColor,
          boxShadow: '0 24px 60px rgba(0,0,0,.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {s.show.avatar && <Avatar author={author} size={44} />}
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: s.fontSize * 0.9 }}>{author.name}</div>
            <div style={{ opacity: 0.55, fontSize: s.fontSize * 0.8 }}>@{author.handle}</div>
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
                {relTime(tweet.createdAt)}
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
          }}
        >
          <Text segments={tweet.text} accent={accent} />
        </div>

        {s.show.media && <MediaGrid media={tweet.media} />}

        {tweet.quoted && (
          <div
            data-part="quoted"
            style={{
              marginTop: 14,
              padding: '12px 14px',
              border: '1px solid rgba(255,255,255,.16)',
              borderRadius: 12,
              fontSize: s.fontSize * 0.85,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Avatar author={quotedAuthor!} size={22} />
              <span style={{ fontWeight: 600 }}>{quotedAuthor!.name}</span>
              <span style={{ opacity: 0.5 }}>@{quotedAuthor!.handle}</span>
            </div>
            <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              <Text segments={tweet.quoted.text} accent={accent} />
            </div>
            {s.show.media && <MediaGrid media={tweet.quoted.media} />}
          </div>
        )}

        {/*
          絕對時間的落點：內文（與圖片、引用推文）之後、統計列之前，獨立成行。
          與統計列共用同一組低對比樣式，讓「時間 + 數據」讀起來是同一個資訊層，
          而不是兩個互相競爭的元素。
        */}
        {s.show.timestamp && s.timeFormat === 'absolute' && absTime(tweet.createdAt) && (
          <div
            data-part="time"
            style={{
              marginTop: 14,
              opacity: 0.45,
              fontSize: s.fontSize * 0.72,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.01em',
            }}
          >
            {absTime(tweet.createdAt)}
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
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,.1)',
              opacity: 0.55,
              fontSize: s.fontSize * 0.72,
            }}
          >
            <Stat icon={ICON.views} value={tweet.stats.views} label="瀏覽" />
            <Sep />
            <Stat icon={ICON.replies} value={tweet.stats.replies} label="回覆" />
            <Sep />
            <Stat icon={ICON.reposts} value={tweet.stats.reposts} label="轉推" />
            <Sep />
            <Stat icon={ICON.likes} value={tweet.stats.likes} label="讚" />
          </div>
        )}
      </div>
    </div>
  )
}
