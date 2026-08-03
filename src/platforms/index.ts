import type { Adapter } from './types'
import { xAdapter } from './x'

export type { Adapter } from './types'

/** 註冊表。新增平台 = 在這裡多一個項目。 */
export const ADAPTERS: readonly Adapter[] = [xAdapter]

/**
 * 由網址找出負責的 adapter。
 *
 * 比對 hostname 而非用 includes 掃字串：後者會讓
 * `https://evil.com/?x=x.com/a/status/1` 這種網址比對成功。
 */
export function adapterFor(url: string): Adapter | undefined {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return undefined
  }
  const bare = host.replace(/^www\.|^mobile\./, '')
  return ADAPTERS.find((a) => a.hosts.includes(bare))
}
