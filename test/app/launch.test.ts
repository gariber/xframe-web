import { describe, it, expect, vi } from 'vitest'
import { listenForShares, parseLaunchUrl, type LaunchApi } from '../../app/launch'

const launch = (shared: string) => `xframe://card?url=${encodeURIComponent(shared)}`

function fakeApi(launchUrl?: string) {
  let handler: ((e: { url: string }) => void) | undefined
  const api: LaunchApi = {
    getLaunchUrl: async () => (launchUrl ? { url: launchUrl } : undefined),
    addListener: async (_event, cb) => { handler = cb; return { remove: async () => {} } },
  }
  return { api, open: (url: string) => handler?.({ url }) }
}

describe('parseLaunchUrl', () => {
  it('parseLaunchUrl decodes the shared url', () => {
    expect(parseLaunchUrl(launch('看這則 https://x.com/a/status/123?s=46&t=abc'))).toBe('https://x.com/a/status/123')
    expect(parseLaunchUrl(launch('https://www.threads.com/share/_2Tm1nlch/'))).toBe('https://www.threads.com/share/_2Tm1nlch/')
  })

  it('parseLaunchUrl ignores other schemes and hosts', () => {
    expect(parseLaunchUrl('https://x.com/a/status/1')).toBeNull()
    expect(parseLaunchUrl('xframe://other?url=https%3A%2F%2Fx.com%2Fa%2Fstatus%2F1')).toBeNull()
    expect(parseLaunchUrl(launch('沒有網址的文字'))).toBeNull()
    expect(parseLaunchUrl('not a url')).toBeNull()
  })
})

describe('listenForShares', () => {
  it('listenForShares handles cold start launch url', async () => {
    const { api } = fakeApi(launch('https://x.com/a/status/1'))
    const onUrl = vi.fn()
    await listenForShares(onUrl, api)
    expect(onUrl).toHaveBeenCalledWith('https://x.com/a/status/1')
  })

  it('handles warm opens and ignores the same url twice within 2 seconds', async () => {
    let now = 0
    const { api, open } = fakeApi()
    const onUrl = vi.fn()
    await listenForShares(onUrl, api, () => now)
    open(launch('https://x.com/a/status/1'))
    now = 1500
    open(launch('https://x.com/a/status/1'))
    expect(onUrl).toHaveBeenCalledTimes(1)
    now = 4000
    open(launch('https://x.com/a/status/1'))
    open(launch('https://x.com/b/status/2'))
    expect(onUrl.mock.calls.map((c) => c[0])).toEqual([
      'https://x.com/a/status/1', 'https://x.com/a/status/1', 'https://x.com/b/status/2',
    ])
  })
})
