import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { CardSettings, Post } from '../types'
import { Card, DEFAULT_SETTINGS } from '../render/Card'
import { PRESETS, generate, randomPreset } from '../render/backgrounds'
import { exportPng, buildFilename, downloadBlob, exportWidthBelowTarget, EXPORT_WIDTH } from '../render/export'
import { loadSettings, saveSettings } from './store'
import { parseTweet, extractTweetId } from '../parse/microdata'
import { buildManualTweet, type ManualInput } from './manual'
import { extractFromDom } from '../content/dom-fallback'
// type-only：只要背景模組的型別，不能把 `addListener` 的側作用拉進內容腳本的
// bundle。混進值匯入的話，vite 會把整個 background/index.ts（包含它 import
// 的 fetch-tweet、asset-proxy）一起打進 content script。
import type { Request, Response } from '../background/index'

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; tweet: Post }
  | { phase: 'error'; message: string }
  // 手動輸入。spec §4.0 把它列為「X 停止對未登入請求提供 microdata」這個
  // 殘餘風險的唯一緩解手段：屆時每一則推文都會解析失敗，沒有這條路擴充功能
  // 就完全沒有可用的降級模式。
  | { phase: 'manual' }

const ERROR_TEXT: Record<string, string> = {
  'not-found': '這則推文已不存在',
  'rate-limited': 'X 暫時限制了請求，請稍後再試',
  network: '網路錯誤，請重試',
  cors: '瀏覽器擋下了這個請求',
  parse: '無法讀取這則推文',
  badurl: '這看起來不是推文網址',
  export: '產生圖片失敗，請重試',
  'unknown-request': '擴充功能版本不相符，請重新載入頁面',
}

async function loadTweet(permalink: string): Promise<Post> {
  const id = extractTweetId(permalink)
  if (!id) throw new Error('parse')
  const res = await chrome.runtime.sendMessage<Request, Response>({ type: 'fetch-tweet-html', url: permalink })
  if (!res.ok) throw new Error(res.kind)
  if (res.type !== 'fetch-tweet-html') throw new Error('unknown-request')
  let tweet = parseTweet(res.html, id)
  if (!tweet) {
    // 公開抓取拿不到內容，最常見的原因是鎖推帳號 —— 其貼文對未登入請求本來
    // 就不可見。使用者的瀏覽器看得到（登入且獲核准），所以改從眼前的 DOM 讀。
    tweet = extractFromDom(permalink)
  }
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
  const [manualInput, setManualInput] = useState<ManualInput>({ name: '', handle: '', text: '' })
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
      .then((tweet) => {
        if (cancelled) return
        setStatus({ phase: 'ready', tweet })
        // 鎖推來源預設開啟身分遮蔽：安全的選擇當預設，但仍可由使用者關掉。
        // 刻意不寫進 chrome.storage —— 這是針對「這一則」的保護性預設，
        // 若持久化，下一則公開推文會莫名其妙也被遮起來。
        if (tweet.source === 'dom') {
          setSettings((prev) => (prev.maskIdentity ? prev : { ...prev, maskIdentity: true }))
        }
      })
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
      downloadBlob(await exportPng(node), buildFilename(status.tweet))
    } catch {
      // doExport 是裸 onClick、沒有任何東西 await 它 —— 若不在這裡自己接住，
      // 光柵化失敗時按鈕只會默默從「產生中…」變回「下載 PNG」，使用者不會
      // 知道下載其實沒發生。
      setExportError(ERROR_TEXT.export)
    } finally {
      setBusy(false)
    }
  }

  // 跟 doExport 量的是同一個節點——這裡只是讀不是光柵化，用來預先判斷輸出
  // 寬度會不會撞上 MAX_EXPORT_PIXELS 而被 exportScale 悄悄縮小。
  //
  // 不能在 render body 裡同步讀 cardRef.current：cardRef 掛在跨所有
  // status.phase 都存在的外層 .xf-preview，所以 status.phase 從 'loading'
  // 翻成 'ready' 的那一次 render，cardRef.current 仍指向上一次 commit 的節點
  // （loading 佔位符），不是這次剛渲染出來的 Card。跟 Card.tsx 量 minHeight
  // 同一手法：在 useLayoutEffect 裡量，保證量到的是已經 commit 的 DOM。
  // 相依陣列涵蓋 status（tweet 隨它變動）與 settings——兩者都可能改變卡片
  // 的版面尺寸。
  const [exportSize, setExportSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const node = status.phase === 'ready' ? (cardRef.current?.firstElementChild as HTMLElement | null) : null
    if (!node) {
      setExportSize(null)
      return
    }
    const measure = () => setExportSize({ width: node.offsetWidth, height: node.offsetHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [status, settings])

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
            <button type="button" class="xf-retry" onClick={() => setStatus({ phase: 'manual' })}>
              手動輸入
            </button>
          </div>
        )}
        {status.phase === 'manual' && (
          <form
            class="xf-manual"
            onSubmit={(e) => {
              e.preventDefault()
              const tweet = buildManualTweet(manualInput)
              // 必填欄位不齊時 buildManualTweet 回傳 null。停在原地讓 required
              // 屬性提示使用者，絕不產出殘缺圖（spec §7）。
              if (tweet) setStatus({ phase: 'ready', tweet })
            }}
          >
            <label>
              作者名稱
              <input
                type="text" required value={manualInput.name}
                onInput={(e) => setManualInput({ ...manualInput, name: e.currentTarget.value })}
              />
            </label>
            <label>
              帳號
              <input
                type="text" required placeholder="thsottiaux" value={manualInput.handle}
                onInput={(e) => setManualInput({ ...manualInput, handle: e.currentTarget.value })}
              />
            </label>
            <label class="xf-manual-text">
              推文內文
              <textarea
                required rows={6} value={manualInput.text}
                onInput={(e) => setManualInput({ ...manualInput, text: e.currentTarget.value })}
              />
            </label>
            <div class="xf-manual-note">
              手動模式不含頭像、圖片、互動數與引用推文 —— 這些無法由你補上，
              卡片會以既有的降級樣式呈現。
            </div>
            <div class="xf-manual-actions">
              <button type="submit">套用</button>
              <button type="button" onClick={() => setRetryCount((n) => n + 1)}>取消</button>
            </div>
          </form>
        )}
        {status.phase === 'ready' && <Card post={status.tweet} settings={settings} />}
      </div>

      {status.phase === 'ready' && status.tweet.source === 'dom' && (
        <div class="xf-protected" role="note">
          <strong>這是鎖推帳號的內容</strong>
          <p>
            對方限制了誰能看到這則貼文。要分享出去前，請想一下傳播範圍是不是超出對方的預期。
          </p>
          <p class="xf-protected-caveat">
            身分遮蔽已預設開啟，會一併蓋掉名稱、帳號與頭像。但它只處理作者資訊 ——
            <strong>內文本身若提到人名、地點或其他線索，仍然可能被認出來</strong>，那部分要你自己判斷。
          </p>
        </div>
      )}

      <button class="xf-export" type="button" disabled={status.phase !== 'ready' || busy} onClick={doExport}>
        {busy ? '產生中…' : '下載 PNG'}
      </button>
      {exportError && <div class="xf-export-error">{exportError}</div>}
      {exportSize && exportWidthBelowTarget(exportSize.width, exportSize.height) && (
        <p class="xf-hint">
          這則貼文很長，圖片高度已達上限，輸出寬度會低於 {EXPORT_WIDTH}px。
        </p>
      )}

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
          </select>
        </label>
        {/*
          「顯示項目」裡也有一個叫「時間」的核取方塊（控制顯不顯示）。兩個
          控制項同名會讓人找不到，所以這裡明確叫「時間格式」。
        */}
        <label>時間格式
          <select value={settings.timeFormat}
            onChange={(e) => patch({ timeFormat: e.currentTarget.value as CardSettings['timeFormat'] })}>
            <option value="relative">相對（6h）</option>
            <option value="absolute">絕對（2026-08-01 05:54）</option>
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

      <section class="xf-group">
        <h3>隱私</h3>
        <label>
          <input type="checkbox" checked={settings.maskIdentity}
            onChange={(e) => patch({ maskIdentity: e.currentTarget.checked })} />
          遮蔽作者身分
        </label>
        <p class="xf-hint">
          名稱、帳號、頭像會一起蓋掉 —— 只遮其中一項等於沒遮，剩下任何一項都能認出人。
          內文若含可識別線索則不在處理範圍。
        </p>
      </section>
      </fieldset>
    </div>
  )
}
