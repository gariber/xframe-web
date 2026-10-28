import type { Post } from '../src/types'
import { Card, DEFAULT_SETTINGS } from '../src/render/Card'

/** 外殼驗證用的佔位貼文；主畫面在 Task 8 取代這個檔案的內容。 */
const SAMPLE: Post = {
  id: 'sample',
  url: 'https://x.com/xframe/status/1',
  platform: 'x',
  author: { name: 'XFrame', handle: 'xframe', handleDisplay: '@xframe', avatarUrl: '' },
  rawText: 'app 外殼跑起來了。',
  text: [{ type: 'text', value: 'app 外殼跑起來了。' }],
  createdAt: '2026-10-28T12:00:00.000Z',
  metrics: [],
  media: [],
  source: 'manual',
  textComplete: true,
}

export function App() {
  return <Card post={SAMPLE} settings={{ ...DEFAULT_SETTINGS, aspect: '9:16' }} />
}
