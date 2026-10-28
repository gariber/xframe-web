import { useEffect, useState } from 'preact/hooks'
import type { Post } from '../src/types'
import { Card } from '../src/render/Card'
import { hydrateAssets } from '../web/fetch'
import { APP_DEFAULT_SETTINGS } from './settings'
import { appAdapterFor } from './adapters'

/** 暫時的取文探針：驗證 app 的原生 fetch 抓得到 X 與 Threads。Task 8 換成主畫面。 */
const PROBES = [
  'https://x.com/Guanksy/status/2083061426923475451',
  'https://www.threads.com/@mm791019/post/DfADzgzkyqC',
  'https://www.threads.com/@foodlove_0810/post/Db579SgE2br',
]

export function App() {
  const [log, setLog] = useState<string[]>([])
  const [post, setPost] = useState<Post | null>(null)
  useEffect(() => {
    ;(async () => {
      for (const url of PROBES) {
        try {
          const p = await hydrateAssets(await appAdapterFor(url)!.acquire(url))
          setLog((l) => [...l, `OK ${p.platform} ${p.author.handle} likes=${p.metrics.find((m) => m.kind === 'likes')?.value}`])
          if (p.platform === 'x') setPost(p)
        } catch (e) {
          setLog((l) => [...l, `ERR ${url.slice(8, 40)} ${(e as { kind?: string }).kind ?? ''} ${String(e)}`])
        }
      }
    })()
  }, [])
  return (
    <div>
      <pre id="probe" style={{ whiteSpace: 'pre-wrap', fontSize: 11, padding: 8 }}>{log.join('\n')}</pre>
      {post && <Card post={post} settings={APP_DEFAULT_SETTINGS} />}
    </div>
  )
}
