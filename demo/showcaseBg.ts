import type { BgRenderer } from '@daniluk/liquid-glass-react'

/**
 * Showcase backgrounds — all drawn straight into the glass bg canvas every frame
 * (bgRenderer mode), so motion and video refract live through the glass.
 * Detail and contrast are what make refraction read: sharp edges, text, stripes,
 * point lights. Smooth gradients hide it.
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const now = () => (reduceMotion ? 0 : performance.now() / 1000)
const TAU = Math.PI * 2

// ── Media (photo / video) ───────────────────────────────────

type Media = HTMLImageElement | HTMLVideoElement

const cache = new Map<string, Media>()

function image(src: string) {
  let img = cache.get(src) as HTMLImageElement | undefined
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = src
    cache.set(src, img)
  }
  return img
}

function video(src: string) {
  let v = cache.get(src) as HTMLVideoElement | undefined
  if (!v) {
    v = document.createElement('video')
    v.src = src
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.autoplay = !reduceMotion
    v.preload = 'auto'
    if (!reduceMotion) v.play().catch(() => {})
    cache.set(src, v)
  }
  return v
}

/** Draw media with CSS `cover` fit, optionally zoomed + panned (Ken Burns). */
function cover(
  ctx: CanvasRenderingContext2D,
  m: Media,
  w: number,
  h: number,
  zoom = 1,
  panX = 0,
  panY = 0,
) {
  const mw = m instanceof HTMLVideoElement ? m.videoWidth : m.naturalWidth
  const mh = m instanceof HTMLVideoElement ? m.videoHeight : m.naturalHeight
  if (!mw || !mh) return false
  const s = Math.max(w / mw, h / mh) * zoom
  const dw = mw * s
  const dh = mh * s
  const x = (w - dw) / 2 + panX * (dw - w) / 2
  const y = (h - dh) / 2 + panY * (dh - h) / 2
  ctx.drawImage(m, x, y, dw, dh)
  return true
}

function placeholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#0b0b10'
  ctx.fillRect(0, 0, w, h)
}

/** Photo with a slow drift so refraction is never static. */
function photo(src: string): BgRenderer {
  return (ctx, w, h) => {
    const t = now()
    const ok = cover(ctx, image(src), w, h, 1.12, Math.sin((t / 40) * TAU), Math.cos((t / 53) * TAU))
    if (!ok) placeholder(ctx, w, h)
  }
}

function clip(src: string): BgRenderer {
  return (ctx, w, h) => {
    const v = video(src)
    if (v.paused && !reduceMotion) v.play().catch(() => {})
    if (v.readyState < 2 || !cover(ctx, v, w, h)) placeholder(ctx, w, h)
  }
}

// ── Aurora: drifting colour blobs over a fine line screen ───

let lines: CanvasPattern | null = null

const AURORA = ['#ff2d95', '#7a5cff', '#00d4ff', '#00ffa3', '#ffb800']

const drawAurora: BgRenderer = (ctx, w, h) => {
  const t = now()
  const m = Math.max(w, h)
  ctx.fillStyle = '#05060f'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  AURORA.forEach((c, i) => {
    const a = t * (0.07 + i * 0.013) + i * 1.7
    const x = w * (0.5 + 0.38 * Math.sin(a * 1.3 + i))
    const y = h * (0.5 + 0.34 * Math.cos(a + i * 2.1))
    const r = m * (0.32 + 0.06 * Math.sin(a * 2))
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, c)
    g.addColorStop(1, 'transparent')
    ctx.globalAlpha = 0.75
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  // Thin horizontal rules: they bend visibly under the bezel
  if (!lines) {
    const tile = document.createElement('canvas')
    tile.width = 4
    tile.height = 9
    const c = tile.getContext('2d')!
    c.fillStyle = 'rgba(0,0,0,0.38)'
    c.fillRect(0, 0, 4, 3)
    lines = ctx.createPattern(tile, 'repeat')
  }
  ctx.fillStyle = lines!
  ctx.fillRect(0, 0, w, h)
}

// ── Op-art: rings radiating from a wandering centre ─────────

const drawRings: BgRenderer = (ctx, w, h) => {
  const t = now()
  const cx = w * (0.5 + 0.25 * Math.sin(t * 0.21))
  const cy = h * (0.5 + 0.22 * Math.cos(t * 0.17))
  const band = Math.max(18, Math.min(w, h) / 22)
  const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + band * 2

  const conic = ctx.createConicGradient(t * 0.25, cx, cy)
  ;['#ff375f', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#5e5ce6', '#bf5af2', '#ff375f'].forEach(
    (c, i, a) => conic.addColorStop(i / (a.length - 1), c),
  )
  ctx.fillStyle = conic
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#08080c'
  const off = (t * band * 0.9) % (band * 2)
  ctx.beginPath()
  for (let r = maxR + off; r > 0; r -= band * 2) {
    ctx.moveTo(cx + r, cy)
    ctx.arc(cx, cy, r, 0, TAU)
    const inner = r - band
    if (inner > 0) {
      ctx.moveTo(cx + inner, cy)
      ctx.arc(cx, cy, inner, 0, TAU, true)
    }
  }
  ctx.fill()
}

// ── Kinetic type: marquee rows sliding in opposite directions

const ROWS = [
  ['LIQUID GLASS ', '#ff375f'],
  ['REFRACTION ', '#f5f5f7'],
  ['SNELL · BEZEL · SQUIRCLE ', '#ffd60a'],
  ['METABALLS ', '#64d2ff'],
  ['CHROMATIC ABERRATION ', '#f5f5f7'],
  ['WEBGL ', '#30d158'],
  ['LIQUID GLASS ', '#bf5af2'],
] as const

const drawType: BgRenderer = (ctx, w, h) => {
  const t = now()
  ctx.fillStyle = '#0a0a0c'
  ctx.fillRect(0, 0, w, h)
  const rowH = h / 5.2
  const fs = rowH * 0.92
  ctx.font = `900 ${fs}px -apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, sans-serif`
  ctx.letterSpacing = `${-0.04 * fs}px`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const rows = Math.ceil(h / rowH) + 1
  for (let i = 0; i < rows; i++) {
    const [text, color] = ROWS[i % ROWS.length]
    const tw = ctx.measureText(text).width
    const speed = (40 + (i % 3) * 22) * (i % 2 ? -1 : 1)
    let x = ((t * speed) % tw) - tw
    if (x > 0) x -= tw
    ctx.fillStyle = color
    const y = (i + 0.5) * rowH - rowH * 0.15
    for (; x < w; x += tw) ctx.fillText(text, x, y)
  }
  ctx.letterSpacing = '0px'
}

// ── Bokeh: drifting city lights ─────────────────────────────

const LIGHTS = Array.from({ length: 50 }, (_, i) => {
  const r = (n: number) => {
    const s = Math.sin(i * 127.1 + n * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  return {
    x: r(1),
    y: r(2),
    size: 0.015 + r(3) ** 2 * 0.07,
    hue: [25, 40, 200, 330, 280, 170][Math.floor(r(4) * 6)],
    speed: 0.004 + r(5) * 0.012,
    phase: r(6) * TAU,
  }
})

const drawBokeh: BgRenderer = (ctx, w, h) => {
  const t = now()
  const m = Math.max(w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0b0820')
  g.addColorStop(1, '#1a0b14')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  for (const l of LIGHTS) {
    const x = (((l.x + t * l.speed) % 1.2) - 0.1) * w
    const y = l.y * h + Math.sin(t * 0.4 + l.phase) * 0.02 * h
    const r = l.size * m
    const a = 0.35 + 0.25 * Math.sin(t * 0.9 + l.phase)
    const rg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r)
    rg.addColorStop(0, `hsla(${l.hue}, 95%, 62%, ${a})`)
    rg.addColorStop(0.85, `hsla(${l.hue}, 95%, 70%, ${a * 1.3})`)
    rg.addColorStop(1, `hsla(${l.hue}, 95%, 60%, 0)`)
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

// ── Registry ────────────────────────────────────────────────

export const SHOWCASE_BGS = {
  aurora: drawAurora,
  rings: drawRings,
  type: drawType,
  bokeh: drawBokeh,
  city: photo('./images/photo-city.jpg'),
  flowers: photo('./images/photo-flowers.jpg'),
  lake: photo('./images/photo-lake.jpg'),
  ink: photo('./images/photo-ink.jpg'),
  marble: photo('./images/photo-fluid.jpg'),
  'ink video': clip('./images/video-ink.mp4'),
  'neon video': clip('./images/video-neon.mp4'),
} satisfies Record<string, BgRenderer>

export type ShowcaseBg = keyof typeof SHOWCASE_BGS
