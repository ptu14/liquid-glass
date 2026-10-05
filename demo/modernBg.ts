import type { BgRenderer } from '@daniluk/liquid-glass-react'

/**
 * "Modern" background drawn straight into the glass bg canvas every frame
 * (bgRenderer mode), so the floating shapes refract live through the glass.
 * A SnapDOM capture would only see a frozen frame of a CSS animation.
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let dotPattern: CanvasPattern | null = null

function dots(ctx: CanvasRenderingContext2D) {
  if (dotPattern) return dotPattern
  const tile = document.createElement('canvas')
  tile.width = tile.height = 22
  const t = tile.getContext('2d')!
  t.fillStyle = 'rgba(255,255,255,0.10)'
  t.beginPath()
  t.arc(1.5, 1.5, 1, 0, Math.PI * 2)
  t.fill()
  dotPattern = ctx.createPattern(tile, 'repeat')
  return dotPattern
}

/** Gentle levitation: vertical bob + slight sway and tilt, each shape on its own period. */
function float(t: number, period: number, phase: number, amp: number) {
  const a = (t / period) * Math.PI * 2 + phase
  return {
    dx: Math.cos(a * 0.5) * amp * 0.35,
    dy: Math.sin(a) * amp,
    rot: Math.sin(a + 1) * 0.035,
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export const drawModernBg: BgRenderer = (ctx, w, h) => {
  const t = reduceMotion ? 0 : performance.now() / 1000
  const vmax = Math.max(w, h) / 100

  // Base + top glow + dot grid
  ctx.fillStyle = '#0c0c10'
  ctx.fillRect(0, 0, w, h)
  const glow = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, Math.max(w, h) * 0.6)
  glow.addColorStop(0, '#1c1d26')
  glow.addColorStop(1, 'rgba(12,12,16,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = dots(ctx)!
  ctx.fillRect(0, 0, w, h)

  // Faint typography
  const fs = Math.min(224, Math.max(64, w * 0.15))
  ctx.font = `900 ${fs}px -apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, sans-serif`
  ctx.letterSpacing = `${-0.05 * fs}px`
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText('Liquid', w * 0.05, h * 0.09)
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'right'
  ctx.fillText('Glass', w * 0.95, h * 0.94)
  ctx.letterSpacing = '0px'

  // Each shape is drawn around its own centre so tilt rotates in place
  const shape = (
    cx: number,
    cy: number,
    baseRot: number,
    f: ReturnType<typeof float>,
    draw: () => void,
  ) => {
    ctx.save()
    ctx.translate(cx + f.dx, cy + f.dy)
    ctx.rotate(baseRot + f.rot)
    draw()
    ctx.restore()
  }

  // Sun disc
  {
    const d = 34 * vmax
    shape(w * 0.08 + d / 2, h * 0.26 + d / 2, 0, float(t, 11, 0, 1.4 * vmax), () => {
      const g = ctx.createLinearGradient(-d / 2, -d / 2, d / 2, d / 2)
      g.addColorStop(0, '#ffb347')
      g.addColorStop(0.55, '#ff5f6d')
      g.addColorStop(1, '#c2185b')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, d / 2, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // Tall pill
  {
    const pw = 13 * vmax
    const ph = 46 * vmax
    shape(w * 0.82 - pw / 2, -h * 0.08 + ph / 2, (28 * Math.PI) / 180, float(t, 14, 2.1, 1.8 * vmax), () => {
      const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2)
      g.addColorStop(0, '#5ee7ff')
      g.addColorStop(0.6, '#2b6cff')
      g.addColorStop(1, '#4c1dff')
      ctx.fillStyle = g
      roundRect(ctx, -pw / 2, -ph / 2, pw, ph, pw / 2)
      ctx.fill()
    })
  }

  // Rounded square
  {
    const s = 18 * vmax
    shape(w * 0.94 - s / 2, h * 1.06 - s / 2, (-14 * Math.PI) / 180, float(t, 9.5, 4.2, 1.2 * vmax), () => {
      const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2)
      g.addColorStop(0, '#d4ff4f')
      g.addColorStop(1, '#22c55e')
      ctx.fillStyle = g
      roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.22)
      ctx.fill()
    })
  }

  // Small violet dot
  {
    const d = 5 * vmax
    shape(w * 0.52 + d / 2, h * 0.7 + d / 2, 0, float(t, 7, 1.3, 2.4 * vmax), () => {
      ctx.fillStyle = '#a78bfa'
      ctx.beginPath()
      ctx.arc(0, 0, d / 2, 0, Math.PI * 2)
      ctx.fill()
    })
  }
}
