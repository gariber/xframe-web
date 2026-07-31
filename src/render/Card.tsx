import type { TweetData, CardSettings, Segment, Media } from '../types'
import { generate, GRAIN_DATA_URI } from './backgrounds'
import { ASPECT_RATIO, accentFrom } from './card.css'

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
  const diff = Date.now() - new Date(iso).getTime()
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
 * 推文過長時自動縮字級。
 * 以字元數估算：中日韓文字寬度約為拉丁字母兩倍，故加權計算。
 */
function fitFontSize(base: number, raw: string): number {
  const cjk = (raw.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length
  const weighted = raw.length + cjk
  if (weighted <= 140) return base
  if (weighted <= 240) return Math.max(13, base * 0.85)
  if (weighted <= 380) return Math.max(12, base * 0.7)
  return Math.max(11, base * 0.58)
}

const MAX_CHARS = 900

export function Card({ tweet, settings }: { tweet: TweetData; settings: CardSettings }) {
  const s = settings
  const accent = accentFrom(s.textColor)
  const panelBg = s.panelColor + Math.round(s.panelOpacity * 255).toString(16).padStart(2, '0')
  const fontSize = fitFontSize(s.fontSize, tweet.rawText)
  const truncated = tweet.rawText.length > MAX_CHARS
  const background = generate(s.background.kind, s.background.palette, s.background.seed)

  return (
    <div
      data-part="canvas"
      // data-bg 鏡射同一組運算結果，僅供測試讀取：happy-dom 的
      // CSSStyleDeclaration 對多層 background（逗號分隔的漸層堆疊）shorthand
      // 會整筆丟棄寫入（style.background 讀回空字串、cssText 也不含它），
      // 但同一個 style 物件裡的其他屬性（padding、display…）不受影響——
      // 因為 Preact 是逐一 key 呼叫 dom.style[key] = value，只有 background
      // 這個 key 被 happy-dom 的 parser 拒收。真實瀏覽器不受影響。
      data-bg={background}
      style={{
        position: 'relative',
        padding: s.padding,
        background,
        aspectRatio: ASPECT_RATIO[s.aspect],
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
