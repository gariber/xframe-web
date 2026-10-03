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
 * 小畫布仍要讓四組互動數維持單列。
 *
 * 這裡吃的是**實際量到的**自然列寬，不是估算值。先前用 `baseFontSize * 14`
 * 猜一個寬度，那個係數是配著當時的統計字級調出來的：字級一改、或四個數字
 * 同時很長時，估算就會低估真實寬度，縮放不啟動，整列於是溢出容器右緣——
 * 畫面上的症狀是統計列比它上方那條分隔線還寬，右下角看起來破了一角。
 *
 * 改吃量測值之後，這條線由「量得到的事實」決定，不再由一個需要人工維護的
 * 係數決定。分隔線本身永遠是容器滿寬，所以只要統計列不溢出，線就不會比
 * 數字短。
 */
export function statsFitScale(availableWidth: number, naturalWidth: number): number {
  if (availableWidth <= 0 || naturalWidth <= 0) return 1
  return Math.min(1, availableWidth / naturalWidth)
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
  const pick = (normal: number, tight: number) => Math.round(size * (compact ? tight : normal))
  return {
    /*
     * 標誌刻意比 ThreadsFrame 的 1.5em 小。倍數本身不是可比的量：ThreadsFrame
     * 的內容寬度是 856/34 ≈ 25em，XFrame 只有約 15em——同樣 1.5em 的標誌放在
     * 比較窄（以 em 計）的卡片上就是會顯得大。改看「佔內容寬度的比例」才對得
     * 起來，1.1em 在並排比較時最接近 ThreadsFrame 的視覺重量。
     */
    logo: pick(0.95, 0.8),
    /*
     * 標誌下方留得比面板上緣的留白多一些，標誌才會讀成「貼在卡片頂端的平台
     * 標記」而不是壓在作者列頭上的一個東西。曾經拉到 2.0em，但那在固定比例下
     * 太奢侈——那些高度是要留給圖片與頁尾的，而且整張卡看起來鬆散。
     */
    logoGap: pick(1.2, 0.8),
    /*
     * 作者列維持 X 的兩行排法：顯示名稱一行、@帳號一行。ThreadsFrame 收成單行
     * 只標帳號是跟著 Threads 的預設走，但 X 兩者都顯示，卡片照搬過去會不像 X。
     * 頭像因此要夠高，才壓得住兩行文字。
     */
    avatar: pick(2.6, 2.0),
    avatarGap: pick(0.6, 0.6),
    headGap: pick(0.9, 0.5),
    name: size * 0.9,
    handle: size * 0.8,
    time: size * 0.8,
    stat: size * 0.8,
    brand: size * 0.62,
    gap: pick(0.6, 0.4),
    timeGap: pick(0.7, 0.4),
    ruleGap: pick(0.5, 0.35),
    /*
     * 品牌與統計列之間略鬆即可。它是整張卡片的收尾，貼著上一列會讀成統計列的
     * 一部分；但固定比例下整個頁尾會被釘在面板底部（見 Card 的 footer-meta），
     * 站得住靠的是那個定位，不需要在這裡再撐開一大塊。
     */
    brandGap: pick(0.5, 0.35),
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
  /*
   * 標誌維持實心亮白。ThreadsFrame 把它壓到半透明，但 X 的標誌本身就是一個
   * 高對比的實心字符，淡化之後會顯得髒而不是安靜——這一項刻意不跟 ThreadsFrame。
   */
  logo: 0.9,
  handle: 0.55,
  time: 0.45,
  divider: 0.13,
  /*
   * 對話串的連接線。比分隔線重一點——那條線是「這兩則是同一串」的唯一視覺
   * 訊號，看不見就等於沒有；但也不能重到跟內容爭注意力，所以仍在統計之下。
   */
  thread: 0.2,
  stats: 0.45,
  brand: 0.3,
} as const

/**
 * 固定比例卡片裡，圖框佔面板高度的固定份額。
 *
 * 先前圖片是 `flex: 1 1 0`——只拿文字用剩的空間。內容一多剩餘就趨近零，圖片
 * 跟著塌掉：實測 1:1 下圖片高度是 **0px**，整張圖消失，而面板同時被撐破，
 * 頁尾（時間、統計、品牌）整組被 overflow:hidden 裁掉。4:5 也只剩 44×79 的縮圖。
 *
 * 改成固定份額之後，圖框不再參與搶空間，排版變成可預測的：圖片永遠看得見、
 * 也永遠不會吃掉文字的位置。圖框比例幾乎不會等於原圖比例，差額用 cover 裁掉，
 * 捨棄哪一部分由 `CardSettings.mediaFocusY` 決定。
 */
export const MEDIA_SHARE = 0.45

/**
 * 圖框高度的上下限，以面板可用高度的比例表示。
 *
 * 上限的意義是「圖再大也不能把文字擠光」，下限是「圖再扁也還看得出是一張圖」。
 * 兩者之間交給媒體自己的比例決定。
 */
export const MEDIA_SHARE_MIN = 0.3
export const MEDIA_SHARE_MAX = 0.6

/**
 * 圖框的高度，由量到的可用高度算出——回傳 px，不是百分比。
 *
 * 百分比在這裡行不通：面板為了「內容多就長高」用的是 minHeight 而非 height，
 * 高度因此是不確定的，而 CSS 的百分比高度在不確定容器裡會退回 auto——圖框就
 * 變成原圖的自然高度（實測一張 670×1200 的照片撐出 419px），內容整個暴增，
 * 面板被 fitPanelScale 縮到 0.4。算成 px 才是確定值。
 *
 * ## 為什麼不是固定份額
 *
 * 原本固定佔 45%，不管媒體本身是什麼形狀。那對橫幅照片剛好，對直式影片是災難：
 * 9:16 的卡片在 390px 寬下圖框是 322×257，而一支 9:16 的直式影片用 cover 填滿
 * 寬度之後是 322×572 —— **只有 45% 的高度看得到**，中間一條橫帶，而且怎麼調
 * 「圖片位置」都只是在那條帶子裡上下移動，看不到全貌。實際被回報過。
 *
 * 改成由媒體自己的比例決定，再夾在上下限裡：橫幅與方形媒體因此完整顯示
 * （框的比例就等於媒體的比例，cover 不裁任何東西），直式媒體從只看得到 45%
 * 提高到 68%。還是裝不下的那種極端直式，留給「圖片位置」與 auto 比例。
 *
 * 量不到媒體比例時（還沒載入、或多張圖的格狀排版）退回原本的固定份額。
 */
export function mediaBoxHeight(
  availableHeight: number,
  boxWidth = 0,
  mediaAspect = 0,
): number {
  if (availableHeight <= 0) return 0
  if (boxWidth <= 0 || mediaAspect <= 0) return availableHeight * MEDIA_SHARE
  const ideal = boxWidth / mediaAspect
  return Math.min(
    Math.max(ideal, availableHeight * MEDIA_SHARE_MIN),
    availableHeight * MEDIA_SHARE_MAX,
  )
}

/**
 * 影片與 GIF 的圖框：整支放進去，不裁切。
 *
 * 照片可以裁：裁掉的那一塊是靜止的，「圖片位置」挑一次就定了。影片不行 ——
 * 主體會在畫面裡移動，這一秒在上面、下一秒在下面，挑哪個位置都會在某些時候
 * 切掉它。X 自己也是整支呈現的。實際被回報過：9:16 的卡片配一支直式影片，
 * 圖框是滿寬，影片被 cover 裁掉一大截，把「圖片位置」拉到底也看不全。
 *
 * 所以圖框的比例就是影片的比例，高度與照片共用同一個上限（那個上限是在保護
 * 文字，對影片一樣成立）。直式影片因此比面板窄、置中擺放 —— 寧可小一點，
 * 也要是完整的。
 *
 * 量不到比例時回 null，交給 mediaBoxHeight 先用固定份額頂著。
 */
export function wholeMediaBox(
  availableHeight: number,
  boxWidth: number,
  mediaAspect: number,
): { width: number; height: number } | null {
  if (availableHeight <= 0 || boxWidth <= 0 || mediaAspect <= 0) return null
  // 高度取整數、而且往下取：圖框高度在版面上就是整數 px，寬度再由它乘回去，
  // 比例才剛好。四捨五入會讓很扁的影片多出一兩 px，比面板還寬而被切掉邊。
  const height = Math.floor(Math.min(boxWidth / mediaAspect, availableHeight * MEDIA_SHARE_MAX))
  return height > 0 ? { width: height * mediaAspect, height } : null
}

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
