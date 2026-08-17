import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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

/*
 * 版本號寫在兩個地方（package.json 與 manifest.config.ts），而只有 manifest 那個
 * 會被 Chrome 看到。兩邊漂開不會有任何測試變紅，但上架時就會出現「package.json
 * 說 0.3.0、商店收到 0.2.1」這種對不上的狀況 —— 而且 Chrome Web Store 不允許
 * 重複上傳同一個版本號，發現時已經在上傳頁面卡住了。
 */
describe('版本號', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

  it('package.json 與 manifest 的版本一致', () => {
    expect(manifest.version).toBe(pkg.version)
  })

  // Chrome 只接受 1–4 段、每段 0–65535 的純數字版本號，不吃 semver 的 -beta 之類後綴。
  it('是 Chrome 接受的格式（純數字、1–4 段）', () => {
    expect(manifest.version).toMatch(/^\d+(\.\d+){0,3}$/)
    for (const part of manifest.version!.split('.')) {
      expect(Number(part)).toBeLessThanOrEqual(65535)
    }
  })
})
