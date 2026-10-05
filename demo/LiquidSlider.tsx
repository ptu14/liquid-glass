import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RE } from 'react'
import { GlassBlob, reduceMotion, step, type Spring } from './LiquidSegmented'

// ── Liquid slider ───────────────────────────────────────────
// iOS 26 style: blue fill + white pill thumb at rest. On press the pill
// fades out and the thumb swells into a clear glass lens — the track and
// fill show through it, refracted like real glass (kube.io model): flat in
// the middle, bent toward the centre in the bezel near the rim. The thumb centre
// rides the fill edge across the full track (overhanging both ends), so
// 0% is empty, 100% is full and the edge never drifts from the centre.

const THUMB_W = 38
const THUMB_H = 24
const TRACK_H = 6
const LIFT_SCALE = 0.6 // thumb grows 60% when lifted
const LENS_BEZEL = 0.5 // bezel width as a share of the lens height (= cap radius)
const LIFT_MIN_MS = 200 // a quick tap still shows the full lift

/** Parse a computed `rgb()/rgba()` colour into 0–255 rgb + 0–1 alpha. */
function rgba(css: string): [number, number, number, number] {
  const m = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1]
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Draws the track + fill as seen through the lifted capsule lens, per
 * device pixel: kube.io refraction (convex squircle bezel, Snell n = 1.5)
 * pulls each sample toward the centre near the rim, the interior is flat.
 * The track is evaluated analytically at the refracted point with 1-px
 * anti-aliasing, so the result is smooth (no displacement-map pixelation)
 * and exactly symmetric.
 */
function drawLens(
  img: ImageData,
  dpr: number,
  lens: { l: number; top: number; w: number; h: number },
  track: { cy: number; W: number; fillW: number },
  colTrack: [number, number, number, number],
  colFill: [number, number, number, number],
) {
  const { data, width: cw, height: ch } = img
  const r = lens.h / 2
  const bezel = lens.h * LENS_BEZEL
  const half = TRACK_H / 2
  for (let j = 0; j < ch; j++) {
    const py = (j + 0.5) / dpr
    const y = py - lens.h / 2
    for (let i = 0; i < cw; i++) {
      const px = (i + 0.5) / dpr
      const x = px - lens.w / 2
      // capsule SDF → depth inside the rim and outward direction
      const qx = Math.max(Math.abs(x) - (lens.w / 2 - r), 0) * Math.sign(x)
      const len = Math.hypot(qx, y)
      const depth = r - len
      let ox = 0
      let oy = 0
      if (depth > 0 && len > 1e-3) {
        const k = 1 - Math.min(1, depth / bezel)
        const k4 = k * k * k * k
        const hgt = bezel * Math.pow(Math.max(1 - k4, 0), 0.25)
        const slope = k * k * k * Math.pow(Math.max(1 - k4, 1e-4), -0.75)
        const th1 = Math.atan(slope)
        const d = hgt * Math.tan(th1 - Math.asin(Math.sin(th1) / 1.5))
        ox = (-qx / len) * d
        oy = (-y / len) * d
      }
      // refracted sample in slider coordinates
      const sx = lens.l + px + ox
      const sy = lens.top + py + oy
      const dy = Math.abs(sy - track.cy)
      const cov =
        clamp01((half - dy) * dpr + 0.5) * clamp01(Math.min(sx, track.W - sx) * dpr + 0.5)
      // fill with a rounded leading edge
      const edgeX = track.fillW - half + Math.sqrt(Math.max(0, half * half - dy * dy))
      const f = clamp01((edgeX - sx) * dpr + 0.5)
      const o = (j * cw + i) * 4
      const a = (colTrack[3] + (colFill[3] - colTrack[3]) * f) * cov
      data[o] = colTrack[0] + (colFill[0] - colTrack[0]) * f
      data[o + 1] = colTrack[1] + (colFill[1] - colTrack[1]) * f
      data[o + 2] = colTrack[2] + (colFill[2] - colTrack[2]) * f
      data[o + 3] = a * 255
    }
  }
}

export interface LiquidSliderProps {
  value: number // 0..1
  onChange: (v: number) => void
  label: string
  height?: number
}

export function LiquidSlider({ value, onChange, label, height = 48 }: LiquidSliderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)
  const lensCanvasRef = useRef<HTMLCanvasElement>(null)

  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  widthRef.current = width
  const target = useRef(value)
  const drag = useRef<{ dx: number } | null>(null)
  const liftUntil = useRef(0)

  useLayoutEffect(() => {
    const el = rootRef.current!
    const measure = () => setWidth(el.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!drag.current) target.current = value
  }, [value])

  useEffect(() => {
    const pos: Spring = { x: target.current, v: 0 }
    const lift: Spring = { x: 0, v: 0 }
    let last = performance.now()
    let id: number
    const loop = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000)
      last = now
      const W = widthRef.current
      if (W > 0) {
        step(pos, target.current, drag.current ? 1200 : 500, 0.8, dt)
        step(lift, drag.current || now < liftUntil.current ? 1 : 0, 380, 0.5, dt)
        if (reduceMotion) {
          pos.x = target.current
          lift.x = drag.current ? 1 : 0
        }
        const v = Math.min(1, Math.max(0, pos.x))
        // Thumb centre travels the full track and overhangs the ends by half
        // its width, so the fill edge always sits right under its centre.
        const cx = v * W
        const fillW = cx
        const cy = height / 2
        const s = 1 + LIFT_SCALE * Math.max(0, lift.x)
        const tw = THUMB_W * s
        const th = THUMB_H * s

        // Glass thumb (translate + scale so it grows in place)
        const thumb = thumbRef.current
        if (thumb) {
          thumb.style.translate = `${cx - THUMB_W / 2}px ${cy - THUMB_H / 2}px`
          thumb.style.scale = `${s}`
        }
        // White pill fades out as the lens fades in — at rest the pill
        // fully covers the thumb (the lens copy is hidden under it)
        const knob = Math.min(1, Math.max(0, 1 - lift.x * 1.6))
        if (knobRef.current) knobRef.current.style.opacity = `${knob}`
        if (lensRef.current) lensRef.current.style.opacity = `${1 - knob}`

        if (fillRef.current) fillRef.current.style.width = `${fillW}px`

        // Cut the real track out under the lens…
        const l = cx - tw / 2
        const r = cx + tw / 2
        const m = `linear-gradient(90deg, #000 ${l}px, transparent ${l + 2}px, transparent ${r - 2}px, #000 ${r}px)`
        if (trackRef.current) {
          trackRef.current.style.maskImage = m
          trackRef.current.style.webkitMaskImage = m
        }
        // …and draw it inside the lens, refracted at the rim by the map
        // (stretched to the current lens size, scaled with it).
        const lens = lensRef.current
        if (lens) {
          lens.style.translate = `${l}px ${cy - th / 2}px`
          lens.style.width = `${tw}px`
          lens.style.height = `${th}px`
          lens.style.borderRadius = `${th / 2}px`
        }
        // Lens pixels are only computed while it is visible
        const canvas = lensCanvasRef.current
        if (canvas && knob < 1 && trackRef.current && fillRef.current) {
          const dpr = Math.min(3, window.devicePixelRatio || 1)
          const cw = Math.max(1, Math.round(tw * dpr))
          const ch = Math.max(1, Math.round(th * dpr))
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
          }
          const ctx = canvas.getContext('2d')!
          const img = ctx.createImageData(cw, ch)
          drawLens(
            img,
            dpr,
            { l, top: cy - th / 2, w: tw, h: th },
            { cy, W, fillW },
            rgba(getComputedStyle(trackRef.current).backgroundColor),
            rgba(getComputedStyle(fillRef.current).backgroundColor),
          )
          ctx.putImageData(img, 0, 0)
        }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [height])

  const valueAt = (clientX: number, dx = 0) => {
    const rect = rootRef.current!.getBoundingClientRect()
    const W = widthRef.current
    return Math.min(1, Math.max(0, (clientX - rect.left - dx) / W))
  }

  const onDown = (e: RE<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    liftUntil.current = performance.now() + LIFT_MIN_MS
    const rect = rootRef.current!.getBoundingClientRect()
    const cx = target.current * widthRef.current
    const x = e.clientX - rect.left
    // Grab the thumb where touched; on the track, jump there first
    const onThumb = Math.abs(x - cx) < THUMB_W * 0.75
    drag.current = { dx: onThumb ? x - cx : 0 }
    if (!onThumb) {
      target.current = valueAt(e.clientX)
      onChange(target.current)
    }
  }
  const onMove = (e: RE<HTMLDivElement>) => {
    if (!drag.current) return
    target.current = valueAt(e.clientX, drag.current.dx)
    onChange(target.current)
  }
  const onUp = () => {
    drag.current = null
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0
    if (!d) return
    e.preventDefault()
    target.current = Math.min(1, Math.max(0, target.current + d))
    onChange(target.current)
  }

  const trackStyle = { top: height / 2 - TRACK_H / 2, height: TRACK_H, borderRadius: TRACK_H / 2 }

  return (
    <div
      ref={rootRef}
      className="lsl"
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <div ref={trackRef} className="lsl-track" style={trackStyle}>
        <div ref={fillRef} className="lsl-fill" />
      </div>

      <GlassBlob
        ref={thumbRef}
        radius={999} // always a full pill, also when scaled up
        style={{ width: THUMB_W, height: THUMB_H, visibility: width ? 'visible' : 'hidden' }}
      >
        <div ref={knobRef} className="lsl-knob" />
      </GlassBlob>

      {/* Lens: the DOM track isn't in the WebGL bg, so its refraction is
          rendered here per pixel (see drawLens). */}
      <div ref={lensRef} className="lsl-lens" aria-hidden>
        <canvas ref={lensCanvasRef} className="lsl-lens-canvas" />
      </div>
    </div>
  )
}
