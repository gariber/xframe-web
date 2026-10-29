import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: string[] = []
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    writeFile: vi.fn(async (o: { path: string; directory: string; data: string }) => {
      calls.push(`write:${o.directory}:${o.path}:${o.data.length > 0}`)
      return { uri: `file:///cache/${o.path}` }
    }),
  },
}))
const share = vi.fn(async (o: { files: string[] }) => { calls.push(`share:${o.files.join(',')}`); return {} })
vi.mock('@capacitor/share', () => ({ Share: { share: (o: { files: string[] }) => share(o) } }))

import { shareOutput } from '../../app/output'

describe('shareOutput', () => {
  beforeEach(() => { calls.length = 0; share.mockClear() })

  it('shareOutput writes to cache then opens the share sheet', async () => {
    const result = await shareOutput(new Blob(['png-bytes'], { type: 'image/png' }), 'card.png')
    expect(result).toBe('shared')
    expect(calls).toEqual(['write:CACHE:card.png:true', 'share:file:///cache/card.png'])
  })

  it('reports cancelled when the user closes the share sheet', async () => {
    share.mockImplementationOnce(async () => { throw new Error('Share canceled') })
    expect(await shareOutput(new Blob(['x']), 'card.png')).toBe('cancelled')
  })
})
