import { describe, it, expect, beforeEach, vi } from 'vitest'
import { startDetector } from '../../src/content/detector'

beforeEach(() => { document.body.innerHTML = '' })

describe('startDetector stop()', () => {
  it('取消尚未觸發的 rAF，避免 observer.disconnect() 之後仍多跑一次 inject', async () => {
    // observer.disconnect() 只擋得住「未來」的排程；一個已經排進佇列的
    // requestAnimationFrame 仍會在下一幀觸發並多跑一次 inject()，除非 stop()
    // 自己也 cancelAnimationFrame。這裡直接對 rAF/cAF 開 spy，驗證 stop()
    // 真的把待處理的那個 handle 取消掉。
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame')

    const stop = startDetector(() => {})

    // 觸發一次 DOM mutation，讓內部的 MutationObserver callback 排入 rAF。
    // MutationObserver 的 callback 是微任務，需要等待一輪才會執行。
    document.body.appendChild(document.createElement('div'))
    await new Promise((r) => setTimeout(r, 0))

    expect(rafSpy).toHaveBeenCalledTimes(1)
    const handle = rafSpy.mock.results[0]!.value as number

    stop()

    expect(cafSpy).toHaveBeenCalledWith(handle)
  })

  it('沒有待處理的 rAF 時，stop 不應呼叫 cancelAnimationFrame', () => {
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame')
    const stop = startDetector(() => {})
    stop()
    expect(cafSpy).not.toHaveBeenCalled()
  })
})
