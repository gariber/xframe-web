/**
 * width / height，供 JS 直接算出定值 height 用。
 * CSS 的 `aspect-ratio` 在「畫布是 flex 容器、面板是內容驅動高度的 flex item」
 * 這個組合下不保證贏過內容的 min-content 貢獻（實測過：16:9 在真瀏覽器下可以
 * 撐高 14%）。這份數值表讓 Card 量測目前寬度後直接算出定值 px 高度，讓比例
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
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

/**
 * 這些比例只保證「最小高度」，不鎖死高度 —— 內容更長時畫布繼續變高，不裁切。
 * 與其餘固定比例的差別在此：那些是「就是這麼高，多的切掉」，這個是
 * 「至少這麼高，不夠再長」。短推文也能填滿直式畫面（限時動態），長推文不被切。
 */
export const MIN_HEIGHT_ASPECTS: ReadonlySet<string> = new Set(['9:16'])

/**
 * 決定畫布要用固定高度還是最小高度。
 *
 * 抽成純函式而非留在 JSX 的三元運算式裡，是為了讓這個決策本身可測。
 * 渲染後的樣式在 happy-dom 讀不到（沒有版面引擎，且 useLayoutEffect 裡的
 * setState 在測試同步讀取樣式時尚未 flush），但「給定模式與量測值，應該
 * 產生什麼樣式」是純邏輯，與環境無關。
 *
 * 這個區別很重要：測不到有兩種，一種是環境真的做不到（實際幾何），一種是
 * 程式碼的形狀讓它測不到（決策埋在 JSX 裡）。後者不是限制，是設計問題。
 */
export function canvasSizeStyle(
  isMinHeight: boolean,
  fixedHeight: number | undefined,
): { height: string | undefined; minHeight: string | number } {
  const px = fixedHeight !== undefined ? `${fixedHeight}px` : undefined
  return {
    height: !isMinHeight ? px : undefined,
    minHeight: isMinHeight && px !== undefined ? px : 0,
  }
}

/**
 * 內容是否溢出畫布，決定要不要套漸層淡出。
 *
 * 最小高度模式永遠回傳 false：那些模式不鎖死高度，畫布會跟著內容變高，
 * 本來就不會有超出的部分。若照一般模式計算，available 會是用「最小」高度
 * 算出來的，任何比最小值長的推文都會被誤判為溢出，然後在自己完整顯示的
 * 內容上蓋一層淡出 —— 那正是這個模式要避免的事。
 */
export function isOverflowing(
  isMinHeight: boolean,
  contentHeight: number,
  availableHeight: number,
): boolean {
  if (isMinHeight) return false
  return contentHeight > availableHeight
}

/** 由文字色推導強調色：同色相、提高彩度。避免使用者要調四個顏色。 */
export function accentFrom(textColor: string): string {
  return textColor === '#ffffff' ? '#7cc4ff' : '#1d6fd0'
}
