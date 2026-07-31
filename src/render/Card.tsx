import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { TweetData, CardSettings, Segment, Media } from '../types'
import { generate, GRAIN_DATA_URI } from './backgrounds'
import { ASPECT_VALUE, accentFrom } from './card.css'

export const DEFAULT_SETTINGS: CardSettings = {
  background: { kind: 'mesh', palette: 'sunset', seed: 1 },
  padding: 72,
  fontSize: 20,
  panelColor: '#1c1816',
  panelOpacity: 0.5,
  fontFamily: '-apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif',
  textColor: '#ffffff',
  show: { avatar: true, stats: true, timestamp: true, media: true },
  aspect: 'auto',
  scale: 2,
}

function fmt(n: number | null): string {
  if (n === null) return '—'
  if (n >= 10_000) return (n / 10_000).toFixed(1).replace(/\.0$/, '') + '萬'
  return String(n)
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
 * 固定比例模式下，同一份寬度能分到的高度差異很大：4:5 是三種固定比例裡最高的
 * （height = width × 1.25），1:1 居中（height = width），16:9 最矮
 * （height = width × 0.5625，只有 4:5 的約 45%）。用同一個縮小係數對待三者，
 * 16:9 會嚴重不夠、4:5 又可能縮過頭，所以按比例分開調。這些是手動調校的經驗
 * 值，不是量測後反覆逼近——量測寬度只用於 Card 元件下面的定值 height 計算。
 */
const ASPECT_SHRINK: Record<CardSettings['aspect'], number> = {
  auto: 1,
  '1:1': 0.85,
  '4:5': 0.92,
  '16:9': 0.6,
}

const ASPECT_MAX_CHARS: Record<CardSettings['aspect'], number> = {
  auto: 900,
  '1:1': 640,
  '4:5': 760,
  '16:9': 300,
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

/** 固定比例模式可用高度遠小於 auto，同一份文字要更早被截斷；16:9 又比 4:5 緊得多。 */
function maxCharsFor(aspect: CardSettings['aspect']): number {
  return ASPECT_MAX_CHARS[aspect]
}

export function Card({ tweet, settings }: { tweet: TweetData; settings: CardSettings }) {
  const s = settings
  const accent = accentFrom(s.textColor)
  const panelBg = s.panelColor + Math.round(s.panelOpacity * 255).toString(16).padStart(2, '0')
  const fontSize = fitFontSize(s.fontSize, tweet.rawText, s.aspect)
  const truncated = tweet.rawText.length > maxCharsFor(s.aspect)

  const canvasRef = useRef<HTMLDivElement>(null)
  const ratio = ASPECT_VALUE[s.aspect]
  const [fixedHeight, setFixedHeight] = useState<number | undefined>(undefined)

  // CSS 的 aspect-ratio 在真瀏覽器下實測會輸給內容：畫布是 flex 容器、面板是
  // 內容驅動高度的 flex item，兩者對「auto 高度該怎麼算」互相打架時，
  // aspect-ratio 不保證贏（16:9 撐高達 14%）。改成量測目前寬度、直接算出一個
  // 定值 px 高度指定給 height——一個具體的長度不會再參與那場輸贏未定的
  // 自動定size演算法，比例由建構方式保證成立。只在非 auto 時量測；量到 0
  // （例如測試環境沒有真正的排版引擎、或元素還沒被插入 DOM）就會得到
  // height:0，這是量測值本身的極限，不是這段邏輯的 bug。
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el || ratio === undefined) {
      setFixedHeight(undefined)
      return
    }
    const measure = () => setFixedHeight(el.getBoundingClientRect().width / ratio)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ratio])

  return (
    <div
      ref={canvasRef}
      data-part="canvas"
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        // 定值 height 是對 border-box 算的（見上面量測邏輯：getBoundingClientRect
        // 量到的就是 border-box 寬度）。沒有 box-sizing:border-box 的話，height
        // 只會指定 content-box，padding 會疊加在外面把實際框撐得比目標比例更高。
        padding: s.padding,
        background: generate(s.background.kind, s.background.palette, s.background.seed),
        // 不再同時設定 CSS 的 aspect-ratio。實測過：把它跟下面這個量測出來的定值
        // height 同時留著，兩者會互相打架——height 定案後，aspect-ratio 因為
        // width 仍是 auto，會反過來用「新 height × ratio」去改 width，改動後的
        // width 又觸發下面 ResizeObserver 重新量測、重新算 height……在 4:5 上
        // 實測會一路收斂到明顯偏小的框（576×720 而不是正確的 720×900）。
        // aspect-ratio 在這裡本來就是多餘的：useLayoutEffect 保證在瀏覽器真正
        // 畫出東西之前就把 height 定案，CSS 版本從來沒有機會被使用者看到。
        height: fixedHeight !== undefined ? `${fixedHeight}px` : undefined,
        // aspect-ratio 盒子在 Chrome 的預設 min-height:auto 下會被內容撐高、
        // 蓋過比例限制；固定 minHeight:0 並隱藏溢出，讓上面的定值 height（或
        // auto 模式下單純的內容高度）說了算。
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        // 內容撐爆固定比例畫布時，靠頂對齊只會截掉底部（跟本檔案原本就有的
        // 內文截斷淡出同一個方向），置中對齊則會上下各截一半、連一定會有的
        // 頭像／作者名都可能被切掉一半，體驗差很多。auto 模式因為畫布高度本
        // 來就等於內容高度，永遠沒有多餘空間可置中，改這個值視覺上沒有差別。
        alignItems: 'flex-start',
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
          {s.show.avatar && <Avatar author={tweet.author} size={44} />}
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: s.fontSize * 0.9 }}>{tweet.author.name}</div>
            <div style={{ opacity: 0.55, fontSize: s.fontSize * 0.8 }}>@{tweet.author.handle}</div>
          </div>
          {s.show.timestamp && (
            <div style={{ marginLeft: 'auto', opacity: 0.45, fontSize: s.fontSize * 0.75 }}>
              {relTime(tweet.createdAt)}
            </div>
          )}
        </div>

        <div
          data-part="body"
          style={{
            fontSize,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            position: 'relative',
            maxHeight: truncated ? '46em' : undefined,
            overflow: truncated ? 'hidden' : undefined,
            // 截斷處以漸層淡出，避免文字被硬切
            maskImage: truncated
              ? 'linear-gradient(180deg, #000 0%, #000 88%, transparent 100%)'
              : undefined,
            WebkitMaskImage: truncated
              ? 'linear-gradient(180deg, #000 0%, #000 88%, transparent 100%)'
              : undefined,
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
              <Avatar author={tweet.quoted.author} size={22} />
              <span style={{ fontWeight: 600 }}>{tweet.quoted.author.name}</span>
              <span style={{ opacity: 0.5 }}>@{tweet.quoted.author.handle}</span>
            </div>
            <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              <Text segments={tweet.quoted.text} accent={accent} />
            </div>
            {s.show.media && <MediaGrid media={tweet.quoted.media} />}
          </div>
        )}

        {s.show.stats && (
          <div
            data-part="stats"
            style={{
              display: 'flex',
              gap: 14,
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,.1)',
              opacity: 0.55,
              fontSize: s.fontSize * 0.72,
            }}
          >
            <span>{fmt(tweet.stats.replies)} 回覆</span>
            <span>{fmt(tweet.stats.reposts)} 轉推</span>
            <span>{fmt(tweet.stats.likes)} 讚</span>
            <span>{fmt(tweet.stats.views)} 瀏覽</span>
          </div>
        )}
      </div>
    </div>
  )
}
