/**
 * width / height，供 JS 算出固定 height 用。
 * CSS 的 `aspect-ratio` 在「畫布是 flex 容器、面板是內容驅動高度的 flex item」
 * 這個組合下不保證贏過內容的 min-content 貢獻（實測過：16:9 在真瀏覽器下可以
 * 撐高 14%）。這份數值表讓 Card 量測目前寬度後算出 height 的 px 值，讓比例
 * 由「這是一個具體的長度」這件事本身保證成立，不再參與那場輸贏未定的自動
 * 定size演算法。
 *
 * 曾經同時保留過字串版的 `aspect-ratio` CSS 值（例如 '4 / 5'）當作 JS 算出
 * height 之前的視覺 fallback，但兩者同時存在時，height 定案後 aspect-ratio
 * 會用「新 height × ratio」反過來改 width，改動後的 width 又觸發重新量測、
 * 重新算 height，如此反覆——4:5 實測會一路收斂到明顯偏小的框（576×720 而非
 * 正確的 720×900）。已移除該字串版，只留這份數值版；aspect-ratio 的 CSS
 * fallback 本來就是多餘的，因為量測發生在 useLayoutEffect，保證在瀏覽器真正
 * 畫出東西之前完成，使用者從來沒有機會看到 CSS 版本的中間結果。
 */
export const ASPECT_VALUE: Record<string, number | undefined> = {
  auto: undefined,
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
}

/** 由文字色推導強調色：同色相、提高彩度。避免使用者要調四個顏色。 */
export function accentFrom(textColor: string): string {
  return textColor === '#ffffff' ? '#7cc4ff' : '#1d6fd0'
}

/**
 * 畫布的高度樣式。非 auto 比例必須是固定高度；只設 minHeight 會讓圖片或長文
 * 把框撐高，導致使用者選 1:1、4:5 或 9:16 最後都得到近似同一張長圖。
 *
 * 抽成純函式而非留在 JSX 的三元運算式裡，是為了讓這個決策本身可測：
 * 渲染後的樣式在 happy-dom 讀不到（沒有版面引擎），但「給定量測值，應該
 * 產生什麼樣式」是純邏輯，與環境無關。
 *
 * `minHeight: 0` 仍保留，避免 flex item 的預設最小尺寸反過來撐開固定高度。
 */
export function canvasSizeStyle(
  heightPx: number | undefined,
): { height: string; minHeight: number } {
  return { height: heightPx !== undefined ? `${heightPx}px` : 'auto', minHeight: 0 }
}

/**
 * 固定比例容器塞不下完整面板時，等比縮小整張面板而不是裁掉內容。
 * auto 模式不呼叫這個函式；無效量測則維持 1，避免測試環境或隱藏節點把內容
 * 縮成 0。
 */
export function fitPanelScale(availableHeight: number, panelHeight: number): number {
  if (availableHeight <= 0 || panelHeight <= 0) return 1
  return Math.min(1, availableHeight / panelHeight)
}
