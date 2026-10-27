/**
 * 背景紙張：跟 ThreadsFrame 同一套。
 *
 * 名稱、顏色、構圖參數一個字都不改，直接照抄 ThreadsFrame 的 backgrounds.ts ——
 * 兩個產品掛同一個品牌，同一張「午夜」在兩邊長得不一樣的話，使用者會以為
 * 其中一邊壞了。
 *
 * 唯一不同的是畫法。ThreadsFrame 的卡片整張是 canvas，所以紙張也用 canvas 畫；
 * XFrame 的卡片是 DOM，這裡把同一組構圖寫成 CSS 漸層：在任何縮放倍率下都是
 * 清楚的（匯出是把版面放大三倍光柵化），也不必先畫出一張好幾 MB 的圖再塞給
 * 卡片當背景。
 *
 * 需要絕對尺寸的那幾種（方格、斜紋、光暈、圓）吃實際的畫布寬高 —— 比例都是
 * 相對畫布短邊或長邊算的，跟 ThreadsFrame 一樣，所以縮圖與卡片是同一個構圖。
 */
export type Paper = {
  id: string
  name: string
  /** 這張紙搭配的底板色與文字色，選紙時會成對套用。 */
  panel: string
  ink: string
  /** 給定畫布寬高（px），回傳 CSS `background` 的值。 */
  css: (w: number, h: number) => string
}

type Stop = [number, string]

const px = (n: number) => `${Math.round(n * 100) / 100}px`

/** 角度以順時針、0 度為由下往上，與 CSS linear-gradient 一致（ThreadsFrame 也是這樣定義的）。 */
function linear(angle: number, stops: Stop[]) {
  const list = stops.map(([at, color]) => `${color} ${at * 100}%`).join(', ')
  return () => `linear-gradient(${angle}deg, ${list})`
}

function solid(color: string) {
  return () => color
}

/**
 * 對角一刀切成兩色：左上那個三角形是 a。
 *
 * `to bottom right` 的 50% 線剛好通過右上角與左下角 —— 這是 CSS 對角方向的
 * 定義，不必自己算角度。
 */
function split(a: string, b: string) {
  return () => `linear-gradient(to bottom right, ${a} 50%, ${b} 50%)`
}

/** 方格紙。cells 是短邊要切幾格。 */
function grid(base: string, line: string, cells: number) {
  return (w: number, h: number) => {
    const step = Math.min(w, h) / cells
    const width = Math.max(0.5, step * 0.04)
    const half = -width / 2
    return [
      `linear-gradient(to right, ${line} ${px(width)}, transparent ${px(width)}) ${px(half)} 0 / ${px(step)} 100%`,
      `linear-gradient(to bottom, ${line} ${px(width)}, transparent ${px(width)}) 0 ${px(half)} / 100% ${px(step)}`,
      base,
    ].join(', ')
  }
}

type Blob = { x: number; y: number; r: number; color: string }

/** 底色加上幾團徑向光暈，座標與半徑都是相對長邊的比例。後畫的疊在上面。 */
function blobs(base: string, list: Blob[]) {
  return (w: number, h: number) => {
    const unit = Math.max(w, h)
    const layers = list.map((b) =>
      `radial-gradient(circle ${px(b.r * unit)} at ${b.x * 100}% ${b.y * 100}%, ${b.color}, rgba(0, 0, 0, 0))`)
    return [...layers.reverse(), base].join(', ')
  }
}

/** 等距斜紋：從左下往右上，間距與粗細相對短邊。 */
function stripes(base: string, line: string, thickness: number, gap: number) {
  return (w: number, h: number) => {
    const unit = Math.min(w, h)
    const width = unit * thickness
    // ThreadsFrame 的間距量的是水平方向；斜 45 度之後，垂直於紋路的間距是它的 1/√2
    const period = (unit * gap) / Math.SQRT2
    return `repeating-linear-gradient(135deg, ${line} 0 ${px(width)}, transparent ${px(width)} ${px(period)}), ${base}`
  }
}

/** 一條從左下穿到右上、通過畫面中心的粗斜帶。 */
function band(base: string, color: string, thickness: number) {
  return (w: number, h: number) => {
    const half = px((Math.min(w, h) * thickness) / 2)
    return `linear-gradient(to bottom right, ${base} calc(50% - ${half}), ${color} calc(50% - ${half}), `
      + `${color} calc(50% + ${half}), ${base} calc(50% + ${half}))`
  }
}

type Disc = { x: number; y: number; r: number; color: string }

/** 底色加上幾個實心圓，用來做疊圓造型。後畫的疊在上面。 */
function discs(base: string, list: Disc[]) {
  return (w: number, h: number) => {
    const unit = Math.max(w, h)
    const layers = list.map((d) => {
      const r = d.r * unit
      // 邊緣留半個像素做反鋸齒，否則硬邊在斜線上會是鋸齒
      return `radial-gradient(circle ${px(r)} at ${d.x * 100}% ${d.y * 100}%, ${d.color} ${px(r - 0.5)}, rgba(0, 0, 0, 0) ${px(r)})`
    })
    return [...layers.reverse(), base].join(', ')
  }
}

/** 內建紙張：ThreadsFrame 的十四款。 */
export const PAPERS: Paper[] = [
  { id: 'noir', name: '純黑', panel: '#191919', ink: '#f4f1ec', css: solid('#0b0b0b') },
  { id: 'paper', name: '米白', panel: '#ffffff', ink: '#16130f', css: solid('#e9e5db') },
  { id: 'citrus', name: '柑橘', panel: '#ffffff', ink: '#2b1608', css: split('#ff6a1f', '#ffc61f') },
  { id: 'graph', name: '格線', panel: '#ffffff', ink: '#1e2a08', css: grid('#c9f542', 'rgba(60, 90, 10, 0.45)', 9) },
  { id: 'midnight', name: '午夜', panel: '#141c33', ink: '#e8ecf7', css: linear(180, [[0, '#080d1c'], [1, '#1e2f5e']]) },
  {
    id: 'lagoon', name: '潟湖', panel: '#0f2422', ink: '#e6f6f0',
    css: blobs('#0c1f1e', [
      { x: 0.72, y: 0.24, r: 0.42, color: 'rgba(90, 214, 160, 0.75)' },
      { x: 0.22, y: 0.7, r: 0.5, color: 'rgba(38, 128, 138, 0.7)' },
    ]),
  },
  { id: 'teal', name: '青碧', panel: '#0d2f33', ink: '#e6f6f4', css: linear(150, [[0, '#0b2a2e'], [1, '#26a596']]) },
  {
    id: 'plum', name: '李', panel: '#25101f', ink: '#f7e9f1',
    css: blobs('#1a0b16', [{ x: 0.5, y: 0.42, r: 0.55, color: 'rgba(150, 42, 104, 0.8)' }]),
  },
  {
    id: 'forest', name: '森', panel: '#122016', ink: '#e9f3e8',
    css: blobs('#0d1a11', [{ x: 0.6, y: 0.55, r: 0.6, color: 'rgba(46, 110, 62, 0.75)' }]),
  },
  { id: 'flare', name: '焰', panel: '#3a1410', ink: '#fdeee8', css: linear(150, [[0, '#ff8a3d'], [1, '#c9241f']]) },
  {
    id: 'violet', name: '紫暈', panel: '#241b3d', ink: '#efeaff',
    css: blobs('#4c3fa0', [
      { x: 0.28, y: 0.3, r: 0.4, color: 'rgba(196, 172, 255, 0.85)' },
      { x: 0.74, y: 0.72, r: 0.42, color: 'rgba(150, 130, 240, 0.85)' },
    ]),
  },
  { id: 'denim', name: '丹寧', panel: '#10265c', ink: '#eaf0ff', css: stripes('#1749c4', 'rgba(10, 40, 120, 0.55)', 0.055, 0.16) },
  {
    id: 'dune', name: '沙丘', panel: '#ffffff', ink: '#3a2716',
    css: discs('#f0cf9c', [
      { x: 0.72, y: 0.82, r: 0.3, color: '#c98b4b' },
      { x: 0.3, y: 0.95, r: 0.34, color: '#8a5524' },
    ]),
  },
  { id: 'slash', name: '斜線', panel: '#1c1c1c', ink: '#f2f2f2', css: band('#111111', '#f2f2f2', 0.13) },
]

/** 紙庫：ThreadsFrame 的二十六款，都是用上面那組畫法組出來的，沒有任何外部素材。 */
export const LIBRARY: Paper[] = [
  {
    id: 'sunset', name: '夕燒', panel: '#2b1512', ink: '#fdeee8',
    css: linear(175, [[0, '#1a0d0c'], [0.45, '#8f2f1f'], [0.75, '#e8623c'], [1, '#f98f86']]),
  },
  {
    id: 'aurora', name: '極光', panel: '#101d24', ink: '#e8f6f4',
    css: linear(150, [[0, '#0d1a22'], [0.5, '#1f5f66'], [1, '#6fd6b4']]),
  },
  { id: 'linen', name: '亞麻', panel: '#ffffff', ink: '#2b2521', css: linear(200, [[0, '#efe7db'], [1, '#d9cbb8']]) },
  { id: 'sand', name: '砂', panel: '#fffdf6', ink: '#3b2f24', css: linear(150, [[0, '#f3e3cc'], [1, '#d8b892']]) },
  { id: 'peach', name: '蜜桃', panel: '#ffffff', ink: '#4a2a24', css: linear(145, [[0, '#ffe3d3'], [1, '#f7b7a3']]) },
  { id: 'rose', name: '玫瑰', panel: '#ffffff', ink: '#4a2130', css: linear(155, [[0, '#ffd9e2'], [1, '#e79bb4']]) },
  { id: 'lilac', name: '紫丁香', panel: '#ffffff', ink: '#332a4d', css: linear(165, [[0, '#e6ddff'], [1, '#b7a6ee']]) },
  { id: 'sky', name: '晴空', panel: '#ffffff', ink: '#17324a', css: linear(170, [[0, '#d9ecff'], [1, '#a3c9ee']]) },
  { id: 'mint', name: '薄荷', panel: '#ffffff', ink: '#17402f', css: linear(150, [[0, '#d8f3e5'], [1, '#a3ddc4']]) },
  { id: 'moss', name: '苔', panel: '#ffffff', ink: '#22301c', css: linear(160, [[0, '#dfe8cf'], [1, '#b3c49b']]) },
  { id: 'dusk', name: '暮色', panel: '#2a2438', ink: '#f6efe9', css: linear(155, [[0, '#6b5b7b'], [1, '#3a3350']]) },
  { id: 'ember', name: '餘燼', panel: '#3a1d1a', ink: '#fdeee4', css: linear(150, [[0, '#b3583c'], [1, '#5e2a26']]) },
  { id: 'ocean', name: '深海', panel: '#12222f', ink: '#e9f2fa', css: linear(165, [[0, '#2b5c7e'], [1, '#14283d']]) },
  { id: 'ink', name: '墨', panel: '#1d1916', ink: '#f2ece6', css: linear(160, [[0, '#2a2320'], [1, '#141010']]) },
  { id: 'carbon', name: '石墨', panel: '#23282b', ink: '#eceff1', css: linear(180, [[0, '#3d4348'], [1, '#1b1f22']]) },
  {
    id: 'candy', name: '糖霧', panel: '#ffffff', ink: '#3d1f3a',
    css: blobs('#f4d9ec', [
      { x: 0.25, y: 0.25, r: 0.45, color: 'rgba(255, 190, 220, 0.9)' },
      { x: 0.8, y: 0.75, r: 0.45, color: 'rgba(190, 210, 255, 0.9)' },
    ]),
  },
  {
    id: 'nebula', name: '星雲', panel: '#141029', ink: '#ecebff',
    css: blobs('#0a0820', [
      { x: 0.3, y: 0.28, r: 0.42, color: 'rgba(120, 80, 220, 0.85)' },
      { x: 0.75, y: 0.66, r: 0.4, color: 'rgba(220, 70, 150, 0.7)' },
    ]),
  },
  { id: 'cobalt', name: '鈷藍', panel: '#0d1b3d', ink: '#e9efff', css: linear(160, [[0, '#0a1430'], [1, '#2f5fd0']]) },
  { id: 'lime-split', name: '萊姆', panel: '#ffffff', ink: '#14260a', css: split('#8fd431', '#e4f77f') },
  { id: 'mono-grid', name: '灰格', panel: '#ffffff', ink: '#1d1d1d', css: grid('#e6e4df', 'rgba(0, 0, 0, 0.16)', 11) },
  { id: 'night-grid', name: '夜格', panel: '#1a1d21', ink: '#eef1f4', css: grid('#12151a', 'rgba(150, 190, 255, 0.16)', 11) },
  { id: 'coral-stripe', name: '珊瑚紋', panel: '#ffffff', ink: '#42150f', css: stripes('#ff8f6b', 'rgba(190, 60, 40, 0.35)', 0.05, 0.15) },
  {
    id: 'steel', name: '鋼', panel: '#20262b', ink: '#eef2f6',
    css: linear(140, [[0, '#59636d'], [0.5, '#2b3238'], [1, '#6b7480']]),
  },
  {
    id: 'clay', name: '陶土', panel: '#ffffff', ink: '#3d2118',
    css: discs('#e8b48d', [
      { x: 0.25, y: 0.2, r: 0.26, color: '#d18f63' },
      { x: 0.78, y: 0.68, r: 0.34, color: '#a9603a' },
    ]),
  },
  {
    id: 'abyss', name: '深淵', panel: '#0e1418', ink: '#e6eef2',
    css: blobs('#070b0e', [{ x: 0.5, y: 0.15, r: 0.6, color: 'rgba(40, 90, 120, 0.8)' }]),
  },
  { id: 'gold-band', name: '金帶', panel: '#241c0c', ink: '#fdf4e0', css: band('#141008', '#e8b62c', 0.12) },
]

export const ALL_PAPERS: Paper[] = [...PAPERS, ...LIBRARY]

export const DEFAULT_PAPER = PAPERS[0]

/** 認不得的 id（舊存檔、改過名的紙）退回預設，不會留下一張畫不出來的背景。 */
export function findPaper(id: string): Paper {
  return ALL_PAPERS.find((p) => p.id === id) ?? DEFAULT_PAPER
}

/** 隨機一張，但不會抽到現在這一張 —— 按了沒變化會以為按鈕壞了。 */
export function randomPaper(currentId: string, random = Math.random): Paper {
  const pool = ALL_PAPERS.filter((p) => p.id !== currentId)
  return pool[Math.floor(random() * pool.length)] ?? DEFAULT_PAPER
}
