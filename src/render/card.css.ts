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

/**
 * 小畫布仍要讓四組互動數維持單列。這個估算包含四組圖示／短數字、三個
 * 分隔點與列間距；實際列寬不足時只縮小統計列，品牌則留在自己的右對齊行。
 */
export function statsFitScale(availableWidth: number, baseFontSize: number, hasStats: boolean): number {
  if (!hasStats || availableWidth <= 0 || baseFontSize <= 0) return 1
  return Math.min(1, availableWidth / (baseFontSize * 14))
}

/**
 * 卡片版式比例 —— 與 ThreadsFrame 同一套規格。
 *
 * 每一項都由使用者的「文字尺寸」推導，而不是寫死 px。先前平台標誌固定 28px、
 * 頭像固定 52px：使用者把字級拉大時這兩個元素不會跟著長，標頭的重量關係就
 * 跑掉了——標誌相對內文顯得越來越小，頭像則在小字級下顯得突兀地大。綁上字級
 * 之後，整張卡片在任何字級設定下都維持同一組比例。
 *
 * 係數取自 ThreadsFrame 的 `src/render.ts`。該版以 canvas 繪製，但數值同樣是
 * 基準字級的倍數（`Math.round(size * 1.5)` 之類），所以可以逐項對應過來；
 * 兩個產品輸出的卡片放在一起，會讀成同一套設計而不是兩套相似的設計。
 *
 * `compact` 是固定比例又有主圖時的收斂模式：只縮「家具」——標誌、頭像與區塊
 * 間距，字級一律不動。讓出高度是為了給圖片，不該連帶讓文字變得難讀。
 */
export function cardScale(size: number, compact: boolean) {
  const k = compact ? 0.8 : 1
  return {
    logo: Math.round(size * 1.5 * k),
    logoGap: Math.round(size * 0.5 * k),
    avatar: Math.round(size * 1.75 * k),
    avatarGap: Math.round(size * 0.5 * k),
    name: size * 0.95,
    time: size * 0.8,
    stat: size * 0.8,
    brand: size * 0.62,
    gap: Math.round(size * 0.7 * k),
    ruleGap: Math.round(size * 0.5 * k),
  }
}

/**
 * 統計圖示相對於統計數字的字級。ThreadsFrame 是 `0.85 · size` 的圖示配
 * `0.8 · size` 的數字，換算成 em 就是這個值。綁 em 而非固定 px，是為了讓圖示
 * 跟著統計列一起縮放——包含窄卡片上整列等比縮小的那條路徑。
 */
export const STAT_ICON_EM = 0.85 / 0.8

/**
 * 次要元素的透明度，與 ThreadsFrame `softInk()` 的 alpha 一一對應。
 *
 * 集中成一份表而不是散在 JSX 裡，是因為這些值彼此之間是有關係的：時間與統計
 * 必須相同（它們是同一個資訊層），品牌必須是全卡片最輕的一項，分隔線又要比
 * 品牌更輕。分開寫時這些關係看不出來，改動其中一個就會悄悄破壞整體層次——
 * 先前品牌 0.36 比分隔線 0.14 重得多，右下角就浮了出來。
 */
export const CARD_ALPHA = {
  logo: 0.5,
  time: 0.45,
  divider: 0.13,
  stats: 0.45,
  brand: 0.3,
} as const

/**
 * IG 限動編輯器會在畫面上、下疊放返回／文字工具與說明文字控制列。9:16 的
 * 畫布本身仍是精確 1080×1920，只把內容安全區往內收；使用者若主動把留白拉得
 * 更大，仍尊重其設定。安全區使用畫布寬度的 15.625%，因此不論手機或桌面
 * 產生，固定 1080px 輸出寬度下都約為 169px。
 */
export const STORY_SAFE_PADDING_RATIO = 5 / 32

export function canvasPaddingY(aspect: string, padding: number, canvasWidth: number): number {
  return aspect === '9:16' && canvasWidth > 0
    ? Math.max(canvasWidth * STORY_SAFE_PADDING_RATIO, padding)
    : padding
}

export function canvasPaddingYStyle(aspect: string, padding: number): string {
  return aspect === '9:16'
    ? `max(${padding}px, ${STORY_SAFE_PADDING_RATIO * 100}%)`
    : `${padding}px`
}
