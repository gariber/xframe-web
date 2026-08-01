export type Segment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string }
  | { type: 'mention'; value: string }
  | { type: 'link'; value: string; href: string }

export type Stats = {
  replies: number | null
  reposts: number | null
  quotes: number | null
  likes: number | null
  views: number | null
}

export type Author = {
  name: string
  handle: string
  avatarUrl: string
  avatarDataUrl?: string
}

export type Media = {
  url: string
  dataUrl?: string
  alt: string
}

/**
 * 這則推文的資料從哪裡來。
 *
 * `microdata` 是正常路徑：不帶 cookie 抓取公開頁面解析 schema.org 資料。
 * `dom-fallback` 表示公開抓取拿不到內容 —— 最常見的原因是鎖推帳號，
 * 其內容對未登入請求本來就不可見 —— 改從使用者眼前這個已登入頁面讀取。
 *
 * 這個區別會一路影響 UI：來源為 `dom-fallback` 時要顯示傳播範圍的提醒，
 * 且身分遮蔽預設開啟。
 */
export type TweetSource = 'microdata' | 'dom-fallback'

export type TweetData = {
  id: string
  url: string
  author: Author
  rawText: string
  text: Segment[]
  createdAt: string
  stats: Stats
  media: Media[]
  source: TweetSource
  quoted?: Omit<TweetData, 'quoted'>
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
  aspect: 'auto' | '1:1' | '4:5' | '16:9'
  scale: 2 | 3
}
