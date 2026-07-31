import { render } from 'preact'
import { startDetector } from './detector'
import { Panel } from '../editor/Panel'
import panelCss from '../editor/panel.css?inline'

const HOST_ID = 'xframe-host'

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

startDetector(open)
