import { describe, it, expect } from 'vitest'
import { upgradeAvatarUrl, upgradeMediaUrl } from '../../src/background/asset-proxy'

describe('upgradeAvatarUrl', () => {
  it('_normal.jpg 升級為 _400x400.jpg', () => {
    expect(upgradeAvatarUrl('https://pbs.twimg.com/profile_images/123/abc_normal.jpg'))
      .toBe('https://pbs.twimg.com/profile_images/123/abc_400x400.jpg')
  })
  it('支援 png 與 webp', () => {
    expect(upgradeAvatarUrl('https://p/a_normal.png')).toBe('https://p/a_400x400.png')
    expect(upgradeAvatarUrl('https://p/a_normal.webp')).toBe('https://p/a_400x400.webp')
  })
  it('已是大圖則原樣返回', () => {
    const u = 'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg'
    expect(upgradeAvatarUrl(u)).toBe(u)
  })
  it('空字串原樣返回', () => expect(upgradeAvatarUrl('')).toBe(''))
})

describe('upgradeMediaUrl', () => {
  it('name=medium 升級為 name=large', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp&name=medium'))
      .toBe('https://pbs.twimg.com/media/ABC?format=webp&name=large')
  })
  it('name=small 也升級', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=jpg&name=small'))
      .toBe('https://pbs.twimg.com/media/ABC?format=jpg&name=large')
  })
  it('無 name 參數則附加', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp'))
      .toBe('https://pbs.twimg.com/media/ABC?format=webp&name=large')
  })
  it('保留 format 參數', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp&name=medium'))
      .toContain('format=webp')
  })
})
