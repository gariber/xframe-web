import type { ComponentChildren } from 'preact'

/**
 * 可收合的設定分區。
 *
 * 用原生 <details>/<summary> 而非自刻狀態：展開收合、鍵盤操作、螢幕閱讀器的
 * expanded 狀態全部由瀏覽器提供，不需要維護 aria 屬性，也不會有狀態與 DOM
 * 不同步的問題。
 */
export function Sheet({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ComponentChildren
}) {
  return (
    <details class="sheet" open={defaultOpen}>
      <summary class="sheet-head">{title}</summary>
      <div class="sheet-body">{children}</div>
    </details>
  )
}
