import { describe, it, expect, vi, afterEach } from 'vitest'
import { guardStall } from '../../src/render/video'

afterEach(() => { vi.useRealTimers() })

describe('guardStall', () => {
  it('rejects when the work stops reporting progress', async () => {
    vi.useFakeTimers()
    const stuck = guardStall(() => new Promise<string>(() => {}), 8000)
    const settled = expect(stuck).rejects.toThrow('快速轉檔停住了')
    await vi.advanceTimersByTimeAsync(8001)
    await settled
  })

  it('keeps waiting while progress keeps coming', async () => {
    vi.useFakeTimers()
    const result = guardStall(async (beat) => {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        beat()
      }
      return 'done'
    }, 8000)
    await vi.advanceTimersByTimeAsync(25_000)
    await expect(result).resolves.toBe('done')
  })

  it('passes through the work\'s own failure', async () => {
    await expect(guardStall(async () => { throw new Error('解不開') }, 8000)).rejects.toThrow('解不開')
  })
})
