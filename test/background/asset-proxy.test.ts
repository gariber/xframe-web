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
  it('name=orig 是比 large 更高階的畫質，不應被降級', () => {
    expect(upgradeMediaUrl('https://pbs.twimg.com/media/ABC?format=webp&name=orig'))
      .toBe('https://pbs.twimg.com/media/ABC?format=webp&name=orig')
  })
})

describe('upgradeAvatarUrl 的其他尺寸後綴（實測登入版 DOM 回傳 _x96）', () => {
  const real = 'https://pbs.twimg.com/profile_images/1797436415435018240/78IKI5Gj_x96.jpg'

  it('_x96 升級為 _400x400（真實網址）', () => {
    expect(upgradeAvatarUrl(real)).toBe(
      'https://pbs.twimg.com/profile_images/1797436415435018240/78IKI5Gj_400x400.jpg',
    )
  })

  it.each(['_normal', '_bigger', '_mini', '_x96', '_200x200'])('%s 皆升級', (suffix) => {
    expect(upgradeAvatarUrl(`https://p/a${suffix}.jpg`)).toBe('https://p/a_400x400.jpg')
  })

  it('已是 _400x400 時結果不變（重複套用安全）', () => {
    const u = 'https://p/a_400x400.jpg'
    expect(upgradeAvatarUrl(upgradeAvatarUrl(u))).toBe(u)
  })

  it('不含尺寸後綴的網址原樣返回', () => {
    const u = 'https://p/plain.jpg'
    expect(upgradeAvatarUrl(u)).toBe(u)
  })
})
