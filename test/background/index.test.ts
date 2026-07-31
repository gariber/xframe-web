import { describe, it, expect, vi } from 'vitest'

describe('background message router', () => {
  it('responds even for an unrecognized request type (does not hang the channel)', async () => {
    let listener:
      | ((req: unknown, sender: unknown, sendResponse: (res: unknown) => void) => boolean)
      | undefined
    const addListener = vi.fn((fn) => {
      listener = fn
    })
    vi.stubGlobal('chrome', {
      runtime: { onMessage: { addListener } },
    })

    await import('../../src/background/index')

    expect(listener).toBeTypeOf('function')

    const sendResponse = vi.fn()
    const keepChannelOpen = listener!({ type: 'nonexistent-type' }, {}, sendResponse)
    expect(keepChannelOpen).toBe(true)

    // flush the async IIFE inside the listener
    await new Promise((r) => setTimeout(r, 0))

    expect(sendResponse).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, kind: 'unknown-request' })
    )
  })
})
