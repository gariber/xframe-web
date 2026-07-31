import type { BgKind } from '../types'

type Quad = readonly [string, string, string, string]

/** 每組四色：前三色為主色，第四色為底色。 */
export const PALETTES: Record<string, Quad> = {
  sunset:   ['#ff7a45', '#ff3d71', '#ffb347', '#2b0f14'],
  ocean:    ['#0ea5e9', '#06b6d4', '#3b82f6', '#04182b'],
  violet:   ['#8b5cf6', '#d946ef', '#6366f1', '#150b2e'],
  forest:   ['#10b981', '#84cc16', '#14b8a6', '#04231a'],
  candy:    ['#f472b6', '#fb923c', '#facc15', '#2a0f1e'],
  midnight: ['#4c1d95', '#1d4ed8', '#0891b2', '#080b1f'],
  sand:     ['#d4a373', '#e9c46a', '#f4a261', '#3b2416'],
  mono:     ['#71717a', '#a1a1aa', '#3f3f46', '#0c0c0e'],
}

const DEFAULT_PALETTE = 'sunset'

/** 線性同餘產生器。同 seed 必得同序列，確保使用者收藏的背景不會變樣。 */
function rng(seed: number): () => number {
  let x = (Math.abs(Math.trunc(seed)) % 233280) + 1
  return () => {
    x = (x * 9301 + 49297) % 233280
    return x / 233280
  }
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function paletteOf(name: string): Quad {
  return PALETTES[name] ?? PALETTES[DEFAULT_PALETTE]
}

function mesh(c: Quad, seed: number): string {
  const r = rng(seed)
  const layers: string[] = []
  for (let i = 0; i < 4; i++) {
    const x = (12 + r() * 76).toFixed(0)
    const y = (12 + r() * 76).toFixed(0)
    const spread = (45 + r() * 20).toFixed(0)
    const col = c[i % 3]
    layers.push(
      `radial-gradient(circle at ${x}% ${y}%, ${rgba(col, 0.95)} 0%, ${rgba(col, 0)} ${spread}%)`,
    )
  }
  layers.push(`linear-gradient(140deg, ${c[3]}, ${rgba(c[2], 0.6)})`)
  return layers.join(',')
}

function aurora(c: Quad, seed: number): string {
  const r = rng(seed)
  const x1 = (20 + r() * 60).toFixed(0)
  const x2 = (20 + r() * 60).toFixed(0)
  return [
    `radial-gradient(ellipse 70% 45% at ${x1}% 20%, ${rgba(c[0], 0.85)} 0%, transparent 70%)`,
    `radial-gradient(ellipse 80% 40% at ${x2}% 78%, ${rgba(c[1], 0.75)} 0%, transparent 72%)`,
    `radial-gradient(circle at 50% 50%, ${rgba(c[2], 0.45)} 0%, transparent 60%)`,
    c[3],
  ].join(',')
}

function wave(c: Quad, seed: number): string {
  const r = rng(seed)
  const lift = 70 + r() * 15
  return [
    `radial-gradient(ellipse 120% 60% at 50% 115%, ${c[0]} 0%, transparent 60%)`,
    `radial-gradient(ellipse 120% 55% at 50% 95%, ${c[1]} 0%, transparent 60%)`,
    `radial-gradient(ellipse 120% 50% at 50% ${lift.toFixed(0)}%, ${c[2]} 0%, transparent 60%)`,
    c[3],
  ].join(',')
}

function split(c: Quad, seed: number): string {
  const angle = (160 + rng(seed)() * 60).toFixed(0)
  return `linear-gradient(${angle}deg, ${c[0]} 0%, ${c[0]} 48%, ${c[1]} 48%, ${c[1]} 100%)`
}

function grid(c: Quad, seed: number): string {
  const gap = (16 + rng(seed)() * 14).toFixed(0)
  return [
    `repeating-linear-gradient(0deg, ${rgba(c[0], 0.5)} 0 1px, transparent 1px ${gap}px)`,
    `repeating-linear-gradient(90deg, ${rgba(c[0], 0.5)} 0 1px, transparent 1px ${gap}px)`,
    `linear-gradient(160deg, ${c[1]}, ${c[3]})`,
  ].join(',')
}

const GENERATORS: Record<BgKind, (c: Quad, seed: number) => string> = {
  mesh, aurora, wave, split, grid,
}

export function generate(kind: BgKind, palette: string, seed: number): string {
  return GENERATORS[kind](paletteOf(palette), seed)
}

/**
 * 顆粒層。疊在漸層之上以 overlay 混合，是讓程式漸層擺脫廉價感的關鍵，不可省略。
 */
export const GRAIN_DATA_URI =
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3"/></filter>` +
    `<rect width="140" height="140" filter="url(#n)" opacity=".5"/></svg>`,
  )}")`

export const KINDS: BgKind[] = ['mesh', 'aurora', 'wave', 'split', 'grid']

export const PRESETS = KINDS.flatMap((kind) =>
  Object.keys(PALETTES).map((palette, i) => ({ kind, palette, seed: i + kind.length * 7 })),
)

export function randomPreset() {
  const names = Object.keys(PALETTES)
  return {
    kind: KINDS[Math.floor(Math.random() * KINDS.length)],
    palette: names[Math.floor(Math.random() * names.length)],
    seed: Math.floor(Math.random() * 9999),
  }
}
