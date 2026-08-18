import { render } from 'preact'
import { startDetector } from './detector'
import { Panel } from '../editor/Panel'
import panelCss from '../editor/panel.css?inline'

// 同理於 detector 的注入標記：shadow host 掛在共用的頁面 DOM 上，兩份副本用
// 同一個 id 會互相接管對方的容器。併進擴充功能 ID 讓各自獨立。
const EXTENSION_ID =
  typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'dev'
const HOST_ID = `xframe-host-${EXTENSION_ID}`

function ensureHost(): ShadowRoot {
  let host = document.getElementById(HOST_ID)
  if (!host) {
    host = document.createElement('div')
    host.id = HOST_ID
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = panelCss
    shadow.appendChild(style)
    shadow.appendChild(document.createElement('div'))
  }
  return host.shadowRoot!
}

function open(permalink: string): void {
  const shadow = ensureHost()
  const mount = shadow.lastElementChild as HTMLElement
  render(<Panel permalink={permalink} onClose={() => render(null, mount)} />, mount)
}

// 版本標記。同時裝著商店版與未封裝版時，光看畫面分不出正在用哪一份 —— 這行
// 讓「你現在跑的是哪個版本」變成一秒就能確認的事。
console.info(
  `[XFrame] v${chrome.runtime.getManifest?.().version ?? '?'} 已載入（id: ${EXTENSION_ID}）`,
)

startDetector(open)
