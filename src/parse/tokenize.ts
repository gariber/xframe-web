import type { Segment } from '../types'

// 連結結尾常見的標點不應併入網址
const TRAILING = /[.,;:!?)\]}'"，。！？；：）】」』]+$/

const PATTERN = /(https?:\/\/[^\s]+)|(#[\p{L}\p{N}_]+)|(@\w{1,15})/gu

export function tokenize(raw: string): Segment[] {
  if (!raw) return []

  const out: Segment[] = []
  let cursor = 0

  const pushText = (value: string) => {
    if (value) out.push({ type: 'text', value })
  }

  for (const m of raw.matchAll(PATTERN)) {
    const start = m.index!
    pushText(raw.slice(cursor, start))

    const [full, link, hashtag, mention] = m

    if (link) {
      const trailing = link.match(TRAILING)?.[0] ?? ''
      const clean = trailing ? link.slice(0, -trailing.length) : link
      out.push({ type: 'link', value: clean, href: clean })
      if (trailing) pushText(trailing)
    } else if (hashtag) {
      out.push({ type: 'hashtag', value: hashtag })
    } else if (mention) {
      out.push({ type: 'mention', value: mention })
    }

    cursor = start + full.length
  }

  pushText(raw.slice(cursor))
  return out
}
