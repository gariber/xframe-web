import { ADAPTERS } from '../platforms'

/**
 * 注入標記寫在**頁面自己的 DOM** 上，而頁面 DOM 是所有擴充功能共用的。
 *
 * 這一點曾經造成一個極難察覺的狀況：同時裝著商店版與開發用的未封裝版時，兩份
 * content script 都會跑，但先跑到的那份會把 anchor 標記起來，後跑的那份看到標記
 * 就整個跳過 —— 頁面上只會有一顆 ◪ 按鈕，而它屬於誰完全看載入順序。輸的那份
 * 從此收不到任何點擊，連它的 service worker 都不會被喚醒（chrome://extensions
 * 會顯示成閒置／無法使用）。結果是：明明裝了新版，用到的卻始終是舊版的程式碼，
 * 而且沒有任何錯誤訊息。
 *
 * 把擴充功能自己的 ID 併進標記，兩份副本就各自獨立：各自注入、各自運作。同時
 * 裝兩份時會看到兩顆按鈕 —— 那是刻意的，寧可一眼看出「裝了兩份」，也不要靜悄悄
 * 地用到不知道哪一份。
 */
// 在頂層讀取要能容忍 `chrome` 不存在（單元測試環境、以及任何非擴充功能的
// 執行情境）。取不到就用固定字串，行為與從前的共用標記相同。
const EXTENSION_ID =
  typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'dev'
const MARK = `data-xframe-injected-${EXTENSION_ID}`
const BUTTON_CLASS = `xframe-trigger-${EXTENSION_ID}`

function makeButton(permalink: string, onClick: (p: string) => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = BUTTON_CLASS
  btn.type = 'button'
  btn.title = '生成分享圖'
  btn.textContent = '◪'
  btn.setAttribute('aria-label', '生成分享圖')
  Object.assign(btn.style, {
    position: 'absolute', top: '8px', right: '8px', zIndex: '9999',
    width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer',
    border: '1px solid rgba(127,127,127,.35)', background: 'rgba(20,20,20,.55)',
    color: '#fff', fontSize: '13px', lineHeight: '1', backdropFilter: 'blur(8px)',
  } satisfies Partial<CSSStyleDeclaration>)
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick(permalink)
  })
  return btn
}

function inject(root: ParentNode, onClick: (p: string) => void): void {
  // 走註冊表而非直接呼叫某個平台的偵測函式 —— 這是本檔案與「有哪些平台」
  // 唯一的耦合點，新增平台不必再改這裡。anchor 是不是找得到連結、是不是
  // 巢狀引用推文，都是平台知識，交給各 adapter 的 findPermalinks 決定。
  for (const adapter of ADAPTERS) {
    for (const { url, anchor } of adapter.findPermalinks(root)) {
      if (anchor.hasAttribute(MARK)) continue
      anchor.setAttribute(MARK, '')
      // anchor 的靜態型別是 Adapter 介面裡的 Element（跨平台的最小公倍數），
      // 但注入按鈕本來就要求它是頁面上真實的 HTMLElement。
      const htmlAnchor = anchor as HTMLElement
      if (getComputedStyle(htmlAnchor).position === 'static') htmlAnchor.style.position = 'relative'
      htmlAnchor.appendChild(makeButton(url, onClick))
    }
  }
}

/** 開始監看 timeline 並注入按鈕。回傳停止函式。 */
export function startDetector(onClick: (permalink: string) => void): () => void {
  inject(document, onClick)

  let queued = false
  let rafHandle: number | null = null
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    rafHandle = requestAnimationFrame(() => {
      queued = false
      rafHandle = null
      inject(document, onClick)
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    // observer.disconnect() 只阻止「未來」的排程；一個已經排入佇列的
    // requestAnimationFrame 仍會在下一幀觸發，跑出呼叫端以為已經停止之後的
    // 一次 inject()。必須主動 cancelAnimationFrame 才能讓 stop 真正停止。
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
  }
}
