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

export type TweetData = {
  id: string
  url: string
  author: Author
  rawText: string
  text: Segment[]
  createdAt: string
  stats: Stats
  media: Media[]
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
  aspect: 'auto' | '1:1' | '4:5' | '16:9'
  scale: 2 | 3
}
