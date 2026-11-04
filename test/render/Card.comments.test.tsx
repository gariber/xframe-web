import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { Card, DEFAULT_SETTINGS } from '../../src/render/Card'
import type { Post, QuotedPost } from '../../src/types'

function post(id: string, text: string): Post {
  return {
    id,
    url: `https://www.threads.com/@a/post/${id}`,
    platform: 'threads',
    author: { name: `名${id}`, handle: `h${id}`, handleDisplay: `h${id}`, avatarUrl: '' },
    rawText: text,
    text: [{ type: 'text', value: text }],
    createdAt: '2026-10-28T12:00:00.000Z',
    metrics: [{ kind: 'likes', value: 12 }],
    media: [],
    source: 'fetch',
    textComplete: true,
  }
}

function mount(p: Post, comments?: QuotedPost[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(<Card post={p} settings={DEFAULT_SETTINGS} comments={comments} />, host)
  return host
}

describe('Card comments', () => {
  it('renders the given comments below the post body, in order', () => {
    const el = mount(post('MAIN', '主貼文'), [post('C1', '第一則留言'), post('C2', '第二則留言')])
    const items = [...el.querySelectorAll('[data-part="comment"]')]
    expect(items.map((i) => i.querySelector('[data-part="comment-body"]')!.textContent)).toEqual(['第一則留言', '第二則留言'])
    expect(items[0].textContent).toContain('hC1')
    const body = el.querySelector('[data-part="body"]')!
    expect(body.compareDocumentPosition(items[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no comment block without comments', () => {
    expect(mount(post('MAIN', '主貼文')).querySelector('[data-part="comments"]')).toBeNull()
    expect(mount(post('MAIN', '主貼文'), []).querySelector('[data-part="comments"]')).toBeNull()
  })

  it('masks comment authors when identity is masked', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    render(<Card post={post('MAIN', '主貼文')} settings={{ ...DEFAULT_SETTINGS, maskIdentity: true }} comments={[post('C1', '留言')]} />, host)
    expect(host.querySelector('[data-part="comment"]')!.textContent).not.toContain('hC1')
  })
})
