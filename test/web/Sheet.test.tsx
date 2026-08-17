import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { Sheet } from '../../src/ui/Sheet'

function mount(node: ComponentChild) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(node as never, host)
  return host
}

describe('Sheet', () => {
  it('顯示標題', () => {
    expect(mount(<Sheet title="背景紙張">內容</Sheet>).textContent).toContain('背景紙張')
  })

  it('渲染子內容', () => {
    expect(mount(<Sheet title="t"><span data-x="1">內容</span></Sheet>).querySelector('[data-x]')).not.toBeNull()
  })

  it('預設收合', () => {
    const d = mount(<Sheet title="t">x</Sheet>).querySelector('details')!
    expect(d.hasAttribute('open')).toBe(false)
  })

  it('defaultOpen 時展開', () => {
    const d = mount(<Sheet title="t" defaultOpen>x</Sheet>).querySelector('details')!
    expect(d.hasAttribute('open')).toBe(true)
  })

  it('用原生 details/summary，展開收合與無障礙由瀏覽器負責', () => {
    const el = mount(<Sheet title="t">x</Sheet>)
    expect(el.querySelector('details > summary')).not.toBeNull()
  })
})
