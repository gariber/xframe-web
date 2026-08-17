export type Segment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'link'; value: string; href: string }

/**
 * 互動數的種類。
 *
 * 不是所有平台都有全部種類，也不是每個平台的順序都一樣 —— X 有瀏覽數而
 * Threads 沒有，Threads 有分享數而 X 沒有。因此卡片上放哪幾個、什麼順序，
 * 由各平台的 adapter 決定，這裡只定義有哪些可能。
 */
export type MetricKind = 'views' | 'replies' | 'reposts' | 'likes'

/** `value` 為 null 代表來源沒有提供這個數字，與「數字是零」不同。 */
export type Metric = { kind: MetricKind; value: number | null }

export type Author = {
  name: string
  handle: string
  /**
   * 卡片上顯示的帳號字串，已含平台慣用前綴。
   *
   * 前綴是平台知識，不是渲染知識：X 用 `@`，Threads 的規則不同。由 adapter
   * 產生，Card 原樣輸出，渲染層不對任何平台的命名慣例做假設。
   *
   * `handle` 保留原始值（不含前綴），檔名與比對邏輯用它。
   */
  handleDisplay: string
  avatarUrl: string
  avatarDataUrl?: string
}

export type Media = {
  url: string
  dataUrl?: string
  alt: string
}

/**
 * 目前只有 X。階段 2 加 'threads'，階段 3 加 'weibo' | 'xhs'。
 * 現在就定義這個型別而不是等到有第二個平台，是因為 Post.platform 需要它 ——
 * 而 platform 本身在單一平台時就有用：它決定匯出的檔名前綴。
 */
export type Platform = 'x'

/**
 * 這則貼文的資料從哪裡來。
 *
 * `fetch` 是正常路徑：不帶 cookie 抓取公開頁面解析結構化資料。
 * `dom` 表示公開抓取拿不到內容 —— 最常見的原因是鎖定帳號，其內容對未登入
 * 請求本來就不可見 —— 改從使用者眼前這個已登入頁面讀取。
 * `manual` 是使用者自己輸入的。
 *
 * 這個區別會一路影響 UI：來源為 `dom` 時要顯示傳播範圍的提醒，且身分遮蔽
 * 預設開啟。
 */
export type PostSource = 'fetch' | 'dom' | 'manual'

/**
 * 譯文的來源語言，用來在卡片上標示「翻譯自◯文」。
 *
 * 只有這四個值：卡片標示是給人看的一句話，不是語言資料庫。粒度對齊
 * `detectTextLanguage()` 實際分得出來的四類，多列一堆分不出來的語言只會讓
 * 手動覆蓋的下拉變長而不會更準。
 */
export type TranslatedFrom = 'ja' | 'ko' | 'en' | 'zh'

export type Post = {
  id: string
  url: string
  platform: Platform
  author: Author
  rawText: string
  text: Segment[]
  createdAt: string
  /** 有序：卡片依此順序渲染統計列。由 adapter 決定內容與順序。 */
  metrics: Metric[]
  media: Media[]
  source: PostSource
  quoted?: Omit<Post, 'quoted'>
  /**
   * 內文是否完整。
   *
   * `false` 代表**來源就沒給全文**，不是排版放不下 —— 排版永遠不截字（見
   * card.css.ts 的 canvasSizeStyle）。這個區別要傳到 UI：來源截斷換什麼比例
   * 都救不回來，不告訴使用者的話他會一直調比例。
   *
   * 因為 quoted 的型別是 Omit<Post, 'quoted'>，引用推文自動帶有自己的
   * 這個旗標 —— 正好對上「主推文完整、引用推文截斷」這個 X 實際會出現的組合。
   */
  textComplete: boolean
  /**
   * 內文已被譯文取代時，記錄**原文**的語言；未取代時是 undefined。
   *
   * 放在 Post 而不是 CardSettings，因為它描述的是「這段文字是什麼」，不是
   * 「使用者想怎麼顯示」——還原原文時整個 Post 換回去，這個標示自然跟著消失，
   * 不會殘留成一個要另外清掉的顯示開關。
   */
  translatedFrom?: TranslatedFrom
}

export type BgKind = 'mesh' | 'aurora' | 'wave' | 'split' | 'grid'

export type CardSettings = {
  background: { kind: BgKind; palette: string; seed: number }
  padding: number
  fontSize: number
  panelColor: string
  panelOpacity: number
  fontFamily: string
  textColor: string
  show: { avatar: boolean; stats: boolean; timestamp: boolean; media: boolean }
  /**
   * 遮蔽作者身分。名稱、帳號、頭像三者一起遮 —— 只遮其中一兩項是假的保護，
   * 剩下任何一項都足以認出人來，半套遮蔽只會給人錯誤的安全感。
   *
   * 鎖推來源的推文預設開啟（安全的選擇當預設），一般推文預設關閉，兩者皆可
   * 由使用者切換。
   */
  maskIdentity: boolean
  /**
   * 時間呈現方式。`relative` 是「6h」這種相對時間，跟 X 網頁一致但會隨匯出
   * 當下的時間漂移 —— 同一則推文今天匯出是「6h」，明天再匯出變「1d」。
   * `absolute` 是 `YYYY-MM-DD HH:mm`，圖片本身就帶完整資訊，適合存檔或引用。
   */
  timeFormat: 'relative' | 'absolute'
  /**
   * 固定比例卡片裁切圖片時，保留原圖縱向的哪個位置（0 = 最上緣，100 = 最下緣）。
   *
   * 固定比例下圖框的高寬比幾乎不會等於原圖，一定要捨棄一部分。捨哪一部分是
   * 美感判斷，不是能算出來的東西：照片主體常在上半部（人臉、貓臉、標題），
   * 所以預設偏上而不是置中，使用者再用滑桿修正。
   *
   * 刻意不做自動顯著性偵測：瀏覽器的 FaceDetector 只認人臉且 Safari 不支援，
   * 而塞一個模型進來會讓目前 78KB 的 bundle 膨脹好幾 MB，也違背「資料不離開
   * 裝置就不需要下載模型」這件事。這個數值的形狀已經預留給日後的自動對齊，
   * 補算法時不必改版面。
   */
  mediaFocusY: number
  /**
   * 沒有 16:9。手機上畫布只有 358×201，一則普通長度的推文面板高 438px，要縮到
   * 0.33 才裝得下 —— 那個字級在輸出圖上約 5px，等於看不見。這不是可以靠調參數
   * 解決的，是這個比例在直式螢幕上的固有問題，所以整個拿掉而不是留著讓人踩。
   */
  aspect: 'auto' | '1:1' | '4:5' | '9:16'
}
