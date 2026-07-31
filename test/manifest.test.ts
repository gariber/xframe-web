import { describe, it, expect } from 'vitest'
import manifest from '../manifest.config'

describe('manifest 權限守則', () => {
  it('permissions 只有 storage', () => {
    expect(manifest.permissions).toEqual(['storage'])
  })

  it('host_permissions 恰為四項且一字不差', () => {
    expect(manifest.host_permissions).toEqual([
      '*://x.com/*',
      '*://twitter.com/*',
      '*://pbs.twimg.com/*',
      '*://abs.twimg.com/*',
    ])
  })

  it('絕不出現高風險權限', () => {
    const all = JSON.stringify(manifest)
    for (const banned of ['<all_urls>', '"tabs"', 'webRequest', '"cookies"']) {
      expect(all).not.toContain(banned)
    }
  })

  it('是 manifest v3', () => {
    expect(manifest.manifest_version).toBe(3)
  })
})
