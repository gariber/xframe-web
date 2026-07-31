import { findPermalink, findTweetRoots } from './permalink'

const MARK = 'data-xframe-injected'
const BUTTON_CLASS = 'xframe-trigger'

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
  for (const el of findTweetRoots(root)) {
    if (el.hasAttribute(MARK)) continue
    const permalink = findPermalink(el)
    if (!permalink) continue // 找不到連結就不注入，避免按了沒反應的按鈕
    el.setAttribute(MARK, '')
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
    el.appendChild(makeButton(permalink, onClick))
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
