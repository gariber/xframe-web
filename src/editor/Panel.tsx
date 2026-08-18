import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CardSettings, Post } from '../types'
import { Card, DEFAULT_SETTINGS } from '../render/Card'
import { PRESETS, generate, randomPreset } from '../render/backgrounds'
import { exportPng, buildFilename, downloadBlob, exportWidthBelowTarget, EXPORT_WIDTH } from '../render/export'
import { loadSettings, saveSettings } from './store'
import { parseTweet, extractTweetId, explainParseFailure } from '../parse/microdata'
import { buildManualTweet, type ManualInput } from './manual'
import { extractFromDom } from '../content/dom-fallback'
// 只有純函式，沒有任何 side effect —— 與下面那個 type-only 的 background/index
// 匯入不同，這個可以安全地打進內容腳本。
import { fetchTweetHtml, TweetFetchError } from '../background/fetch-tweet'
import { hydrateAssets } from '../background/asset-proxy'
import { Sheet } from '../ui/Sheet'
import { TranslationPanel } from '../ui/TranslationPanel'
import {
  applyPastedTranslation,
  buildTranslationPlan,
  emptyTranslationDraft,
  type TranslatedVersion,
  type TranslationDraft,
} from '../translate/translation'
import type { TranslatedFrom } from '../types'
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

/**
 * 取得推文頁 HTML。先自己抓，抓不到才請 service worker 代抓。
 *
 * 面板跑在 x.com 的頁面上，而要抓的也是 x.com 的網址 —— 那是**同源請求**，
 * 內容腳本自己就能發，不需要任何跨來源權限。原本一律繞 service worker，等於
 * 讓整個功能的關鍵路徑依賴一個隨時可能被回收的東西：MV3 的 service worker 會
 * 在閒置後被終止，喚醒與回應之間任何一步出問題，訊息通道就會關閉，使用者只看到
 * 「網路錯誤，請重試」。實測就是這樣壞的（console 會出現 "A listener indicated
 * an asynchronous response by returning true, but the message channel closed
 * before a response was received"）。
 *
 * 仍保留 service worker 這條路當備援：頁面在 twitter.com、而永久連結是 x.com
 * 時就是跨來源，內容腳本抓不到，得靠 manifest 的 host_permissions 由背景代抓。
 */
async function fetchHtml(permalink: string): Promise<string> {
  try {
    return await fetchTweetHtml(permalink)
  } catch (direct) {
    // 404 / 429 是 X 給出的明確答覆，換個管道再問一次只會得到同樣的答案 ——
    // 直接往上拋，不必為此喚醒 service worker。會退到背景的只有「這個管道
    // 送不出去」這類傳輸失敗（跨來源被擋、離線）。
    if (direct instanceof TweetFetchError && (direct.kind === 'not-found' || direct.kind === 'rate-limited')) {
      throw new Error(direct.kind)
    }
    const res = await chrome.runtime.sendMessage<Request, Response>({
      type: 'fetch-tweet-html', url: permalink,
    }).catch(() => undefined)
    // 背景那條也不通就把「自己抓」的失敗原因往上拋 —— 它比訊息通道的錯誤
    // 更接近真正的問題（404、429、離線）。
    // 一律normalise 成「訊息就是 ERROR_TEXT 的鍵」的 Error，讓每種失敗都保有
    // 自己的文案 —— 尤其 unknown-request（版本不相符）不該被籠統說成網路錯誤。
    if (!res) throw new Error(direct instanceof TweetFetchError ? direct.kind : 'network')
    if (!res.ok) throw new Error(res.kind)
    if (res.type !== 'fetch-tweet-html') throw new Error('unknown-request')
    return res.html
  }
}

async function loadTweet(permalink: string): Promise<Post> {
  const id = extractTweetId(permalink)
  if (!id) throw new Error('parse')
  const html = await fetchHtml(permalink)
  let tweet = parseTweet(html, id)
  if (!tweet) {
    // 公開抓取拿不到內容，最常見的原因是鎖推帳號 —— 其貼文對未登入請求本來
    // 就不可見。使用者的瀏覽器看得到（登入且獲核准），所以改從眼前的 DOM 讀。
    //
    // 降級後的卡片看起來是「正常但資訊少」，使用者無從得知是哪一關失敗，我們
    // 也無從遠端重現（X 給不同地區、語系、登入狀態的頁面並不一樣）。把診斷印
    // 到 console，讓「請把這一行貼給我」成為可能。
    console.warn(
      '[XFrame] 公開抓取解析失敗，改用頁面 DOM。診斷：',
      { version: chrome.runtime.getManifest().version, ...explainParseFailure(html, id) },
    )
    tweet = extractFromDom(permalink)
  }
  if (!tweet) throw new Error('parse')
  return hydrate(tweet)
}

/** 該抓的資產是不是都抓到了。抓不到的圖會被卡片直接藏起來，所以這很要緊。 */
function fullyHydrated(out: Post, input: Post): boolean {
  if (input.author.avatarUrl && !out.author.avatarDataUrl) return false
  return out.media.every((m) => Boolean(m.dataUrl))
}

/**
 * 把頭像與圖片轉成 data URL。同樣先自己來，不成才請 service worker。
 *
 * 圖片在 pbs.twimg.com，從 x.com 看是跨來源 —— 但它明確回
 * `access-control-allow-origin: https://x.com`，所以內容腳本抓得到（網頁版
 * 就是這樣做的）。轉 data URL 的理由是跨域圖片會污染 canvas，匯出會整個失敗。
 *
 * 這一步失敗不會讓卡片消失，但卡片會把抓不到的圖直接藏起來（見 Card 的
 * `media.filter(m => m.dataUrl)`）——「明明有圖卻沒有圖」就是這樣來的，所以
 * 這裡同樣不讓它單獨吊在 service worker 上。
 */
async function hydrate(tweet: Post): Promise<Post> {
  const direct = await hydrateAssets(tweet).catch(() => tweet)
  if (fullyHydrated(direct, tweet)) return direct

  const res = await chrome.runtime.sendMessage<Request, Response>({ type: 'hydrate-assets', tweet })
    .catch(() => undefined)
  if (res?.ok && res.type === 'hydrate-assets' && fullyHydrated(res.tweet, tweet)) return res.tweet
  // 兩條都沒抓齊時取自己那份：至少頭像或部分圖片可能已經到手。
  return direct
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
  const [translated, setTranslated] = useState<TranslatedVersion | null>(null)
  const [draft, setDraft] = useState<TranslationDraft | null>(null)
  const [translationFeedback, setTranslationFeedback] = useState<string | null>(null)
  const [translatedFrom, setTranslatedFrom] = useState<TranslatedFrom>('en')
  const cardRef = useRef<HTMLDivElement>(null)

  // 原文永遠是抓下來的那一份 —— 譯文是疊在它上面的一層，不是取代它。
  const original = status.phase === 'ready' ? status.tweet : null
  const plan = useMemo(
    () => (original ? buildTranslationPlan(original) : null),
    [original],
  )
  // 卡片實際渲染哪一份：套用譯文後看 view，否則就是原文。
  const shown = translated
    ? (translated.view === 'translated' ? translated.translated : translated.original)
    : original

  // 換一則推文（或重試）就把翻譯狀態整個重來，否則上一則的譯文會殘留。
  useEffect(() => {
    setTranslated(null)
    setTranslationFeedback(null)
    setDraft(plan?.hasForeignText ? emptyTranslationDraft() : null)
    if (plan) setTranslatedFrom(plan.from)
  }, [plan])

  function applyDraftTranslation() {
    if (!original || !plan || !draft) return
    const next = applyPastedTranslation(original, plan, draft, translatedFrom)
    if (!next) {
      setTranslationFeedback('貼上框是空的，或內容和原文相同。請貼上 X 翻好的譯文。')
      return
    }
    setTranslated({ original, translated: next, view: 'translated' })
    setTranslationFeedback('譯文已套用到卡片。')
  }

  function showTranslatedVersion(view: TranslatedVersion['view']) {
    if (!translated || translated.view === view) return
    setTranslated({ ...translated, view })
    setTranslationFeedback(null)
  }

  function restoreOriginal() {
    if (!plan) return
    setTranslated(null)
    setDraft(plan.hasForeignText ? emptyTranslationDraft() : null)
    setTranslatedFrom(plan.from)
    setTranslationFeedback(null)
  }

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
  }, [status, settings, shown])

  return (
    <div class="xf-panel">
      <header class="xf-head">
        <strong>XFrame</strong>
        <button type="button" onClick={onClose} aria-label="關閉">✕</button>
      </header>

      <div class="xf-preview" ref={cardRef}>
        {status.phase === 'loading' && <div class="msg" role="status">讀取推文中…</div>}
        {status.phase === 'error' && (
          <div class="msg">
            <div class="err" role="alert">{status.message}</div>
            <div class="xf-msg-actions">
              {/* xf-retry 沒有樣式，是給測試用的語意掛鉤 —— 外觀走共用按鈕。 */}
              <button class="xf-retry" type="button" onClick={() => setRetryCount((n) => n + 1)}>
                重試
              </button>
              <button type="button" onClick={() => setStatus({ phase: 'manual' })}>
                手動輸入
              </button>
            </div>
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
            <p class="hint">
              手動模式不含頭像、圖片、互動數與引用推文 —— 這些無法由你補上，
              卡片會以既有的降級樣式呈現。
            </p>
            <div class="xf-manual-actions">
              <button class="primary" type="submit">套用</button>
              <button type="button" onClick={() => setRetryCount((n) => n + 1)}>取消</button>
            </div>
          </form>
        )}
        {shown && <Card post={shown} settings={settings} />}
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

      <button class="primary xf-export" type="button" disabled={status.phase !== 'ready' || busy} onClick={doExport}>
        {busy ? '產生中…' : '下載 PNG'}
      </button>
      {exportError && <div class="err xf-export-error" role="alert">{exportError}</div>}
      {original && plan?.hasForeignText && draft && (
        <TranslationPanel
          post={original}
          plan={plan}
          draft={draft}
          from={translatedFrom}
          applied={translated}
          feedback={translationFeedback}
          busy={busy}
          onDraft={(next) => { setDraft(next); setTranslationFeedback(null) }}
          onFrom={(next) => { setTranslatedFrom(next); setTranslationFeedback(null) }}
          onApply={applyDraftTranslation}
          onView={showTranslatedVersion}
          onRestore={restoreOriginal}
        />
      )}

      {/* 這是「你即將下載的圖會比預期小」的提醒，必須留在下載鍵旁邊。設定分區
          預設收合，塞進去就等於沒有提醒。 */}
      {exportSize && exportWidthBelowTarget(exportSize.width, exportSize.height) && (
        <p class="hint">
          這則貼文很長，圖片高度已達上限，輸出寬度會低於 {EXPORT_WIDTH}px。
        </p>
      )}

      {/*
        exportPng 是直接對 cardRef 底下這個活生生的 DOM 節點做光柵化，光柵化
        期間若任何設定控制項還能操作，就會在 domToBlob 還在走訪同一個節點時
        即時 live-patch 它 —— 產生的圖可能是新舊設定混雜的畫面。用一個
        fieldset 包住所有設定控制項，busy 時整批 disabled，是最簡單、不需要
        自己刻鎖的做法。

        分區的組成、標題與順序都跟著網頁版走（背景紙張 → 畫布與排版 → 顯示項目
        → 隱私），用的是同一個 Sheet 元件。兩邊是同一個產品，設定面板不該長成
        兩個樣子。
      */}
      <fieldset class="xf-fieldset" disabled={busy}>
        <Sheet title="背景紙張">
          <button type="button" onClick={() => patch({ background: randomPreset() })}>隨機生成一張</button>
          <div class="swatches">
            {PRESETS.map((p) => (
              <button key={`${p.kind}-${p.palette}`} type="button"
                aria-label={`${p.kind} ${p.palette}`}
                aria-pressed={settings.background.kind === p.kind && settings.background.palette === p.palette}
                style={{ background: generate(p.kind, p.palette, p.seed) }}
                onClick={() => patch({ background: { ...p } })} />
            ))}
          </div>
        </Sheet>

        <Sheet title="畫布與排版">
          <label>留白
            <input type="range" min={16} max={120} value={settings.padding}
              onInput={(e) => patch({ padding: +e.currentTarget.value })} />
            <span class="hint-inline">{settings.padding}</span>
          </label>
          <label>文字尺寸
            <input type="range" min={13} max={40} value={settings.fontSize}
              onInput={(e) => patch({ fontSize: +e.currentTarget.value })} />
            <span class="hint-inline">{settings.fontSize}</span>
          </label>
          <label>底板透明度
            <input type="range" min={0} max={100} value={settings.panelOpacity * 100}
              onInput={(e) => patch({ panelOpacity: +e.currentTarget.value / 100 })} />
            <span class="hint-inline">{Math.round(settings.panelOpacity * 100)}%</span>
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
              <option value="9:16">9:16 IG 限動</option>
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
          {/*
            固定比例會把圖片裁成圖框的比例，捨棄哪一部分要由使用者決定——照片主體
            常在上半部，預設偏上只是個好猜測，不是答案。auto 高度不裁切，這根滑桿
            在那裡動了也不會有變化，所以只在固定比例且真的有圖時出現。
          */}
          {settings.aspect !== 'auto' && status.phase === 'ready'
            && status.tweet.media.some((m) => m.dataUrl) && (
            <label>圖片位置
              <input type="range" min={0} max={100} value={settings.mediaFocusY}
                onInput={(e) => patch({ mediaFocusY: +e.currentTarget.value })} />
              <span class="hint-inline">{settings.mediaFocusY}%</span>
            </label>
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
          <p class="hint">
            名稱、帳號、頭像會一起蓋掉 —— 只遮其中一項等於沒遮，剩下任何一項都能認出人。
            內文若含可識別線索則不在處理範圍。
          </p>
        </Sheet>
      </fieldset>
    </div>
  )
}
