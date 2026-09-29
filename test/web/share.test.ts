import { describe, expect, it, vi } from 'vitest'
import {
  canShareFile,
  createShareFile,
  shareFile,
  type ShareNavigator,
} from '../../web/share'

const png = () => createShareFile(new Blob(['png'], { type: 'image/png' }), 'x-op7418-1.png')

describe('createShareFile', () => {
  it('保留下載檔名並強制使用 PNG MIME type', () => {
    const file = png()
    expect(file.name).toBe('x-op7418-1.png')
    expect(file.type).toBe('image/png')
  })
})

describe('canShareFile', () => {
  it('必須同時支援 share、canShare 與這個 PNG file', () => {
    expect(canShareFile(png(), { share: vi.fn() })).toBe(false)
    expect(canShareFile(png(), { canShare: () => true })).toBe(false)
    expect(canShareFile(png(), { canShare: () => false, share: vi.fn() })).toBe(false)
    expect(canShareFile(png(), { canShare: () => true, share: vi.fn() })).toBe(true)
  })

  it('瀏覽器的 canShare 丟例外時安全降級', () => {
    const nav: ShareNavigator = {
      canShare: () => { throw new TypeError('unsupported payload') },
      share: vi.fn(),
    }
    expect(canShareFile(png(), nav)).toBe(false)
  })
})

describe('shareFile', () => {
  it('把 PNG File 直接交給原生分享表', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const file = png()
    const result = await shareFile(file, { canShare: () => true, share })
    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file] })
  })

  it('使用者關閉分享表時視為取消而不是錯誤', async () => {
    const error = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const result = await shareFile(png(), {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(error),
    })
    expect(result).toBe('cancelled')
  })

  it('不支援檔案分享時不呼叫 navigator.share', async () => {
    const share = vi.fn()
    const result = await shareFile(png(), { canShare: () => false, share })
    expect(result).toBe('unsupported')
    expect(share).not.toHaveBeenCalled()
  })
})
