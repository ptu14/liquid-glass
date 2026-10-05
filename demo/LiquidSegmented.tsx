import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as RE,
  type ReactNode,
  type RefObject,
} from 'react'
import { FOCUS_RING_CLASS, useLiquidGlass } from '@daniluk/liquid-glass-react'

// ── Glass blob: bare div registered with the renderer ───────
// Position is written straight to style.transform from a rAF loop,
// so nothing here re-renders per frame.

interface GlassBlobProps extends HTMLAttributes<HTMLDivElement> {
  radius?: number
  thickness?: number
  layer?: number
  tint?: [number, number, number]
  frost?: number
  clear?: boolean
  /** Locked glass never bridges/merges with neighbours (blend k → 0). */
  locked?: boolean
  /** Opt-in: fuse into one body with overlapping `fuse` blobs. */
  fuse?: boolean
  /** Own smooth-blend radius (px) and metaball mode — see useLiquidGlass. */
  blend?: number
  metaball?: boolean
}

export const GlassBlob = forwardRef<HTMLDivElement, GlassBlobProps>(
  ({ radius = 999, thickness = 1, layer = 0, tint, frost, clear, locked = false, fuse, blend, metaball, style, ...props }, fwd) => {
    const { ref, setLocked } = useLiquidGlass({
      borderRadius: radius,
      thickness,
      layer,
      tintColor: tint,
      frost,
      clear,
      fuse,
      blend,
      metaball,
      initialLocked: locked,
    })
    useEffect(() => setLocked(locked), [locked, setLocked])
    return (
      <div
        ref={(n) => {
          ;(ref as React.MutableRefObject<HTMLElement | null>).current = n
          if (typeof fwd === 'function') fwd(n)
          else if (fwd) fwd.current = n
        }}
        style={{ position: 'absolute', left: 0, top: 0, borderRadius: Math.min(radius, 999), ...style }}
        {...props}
      />
    )
  },
)
GlassBlob.displayName = 'GlassBlob'

// ── Springs ─────────────────────────────────────────────────

export interface Spring { x: number; v: number }

/** Damped spring step. `zeta` < 1 overshoots (wobble), 1 = critical. */
export function step(s: Spring, target: number, k: number, zeta: number, dt: number) {
  const c = 2 * Math.sqrt(k) * zeta
  s.v += (k * (target - s.x) - c * s.v) * dt
  s.x += s.v * dt
}

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Liquid segmented control ────────────────────────────────
// The indicator is two glass droplets on springs (fast head, lazy tail)
// on layer 1: short hops stretch it into a capsule, long jumps neck it
// apart and pull it back together. Drag it to scrub.

const LENS_REST = 1.12 // icon magnification under the indicator
const LENS_LIFT = 1.3 // …while the droplet is lifted
const LIFT_WHOLE = 0.04 // whole control grows 4% on press
const LIFT_DROP = 0.35 // indicator grows 35% — past the track edges
const LIFT_MIN_MS = 200 // a quick tap still shows the lift
const LIFT_TAP = 0.35 // a tap lifts only partway; dragging lifts fully
const DRAG_SLOP = 4 // px of travel before a press counts as a drag

export interface LiquidSegmentedProps {
  items: ReactNode[]
  /** Accessible names, one per item (defaults to string items). */
  labels?: string[]
  value: number
  onChange: (i: number) => void
  height: number
  /** Inset between the track edge and the indicator. */
  pad?: number
  /** Render a glass track (layer 0). Off when the parent glass is the track. */
  track?: boolean
  className?: string
  /** Element scaled by the press "lift" (defaults to the control itself).
   *  Pass the surrounding bar when the parent glass is the track. */
  liftRef?: RefObject<HTMLElement | null>
}

export function LiquidSegmented({
  items,
  labels,
  value,
  onChange,
  height,
  pad = 4,
  track = true,
  className,
  liftRef,
}: LiquidSegmentedProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)
  const lensRowRef = useRef<HTMLDivElement>(null)
  const [segW, setSegW] = useState(0)
  const segWRef = useRef(0)
  segWRef.current = segW

  const n = items.length
  const segX = (i: number) => pad + i * segWRef.current
  const target = useRef<number | null>(null)
  const drag = useRef<{ dx: number; x0: number } | null>(null)
  const liftUntil = useRef(0)
  const liftAmt = useRef(LIFT_TAP)
  const wholeScale = useRef(1)

  // Segment width follows the control's width (e.g. a responsive tab bar)
  useLayoutEffect(() => {
    const el = rootRef.current!
    const measure = () => setSegW((el.clientWidth - pad * 2) / n)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [n, pad])

  // Keep the target on the selected segment unless the user is dragging
  useEffect(() => {
    if (!drag.current && segW > 0) target.current = segX(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, segW])

  useEffect(() => {
    const head: Spring = { x: NaN, v: 0 }
    const tail: Spring = { x: NaN, v: 0 }
    const lift: Spring = { x: 0, v: 0 }
    let last = performance.now()
    let id: number
    const loop = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000)
      last = now
      const t = target.current
      if (t !== null) {
        if (Number.isNaN(head.x)) head.x = tail.x = t // first frame: no fly-in
        const dragging = !!drag.current
        step(head, t, dragging ? 900 : 520, 0.72, dt)
        step(tail, t, dragging ? 260 : 150, 0.8, dt)

        // Press lift: the whole control swells a little, the droplet a lot
        // (past the track) — and springs back with a wobble on release.
        const lifted = dragging || now < liftUntil.current
        step(lift, lifted ? liftAmt.current : 0, 420, 0.5, dt)
        if (reduceMotion) {
          head.x = tail.x = t
          lift.x = 0
        }
        const whole = 1 + LIFT_WHOLE * lift.x
        const drop = 1 + LIFT_DROP * lift.x
        wholeScale.current = whole
        const liftEl = liftRef?.current ?? rootRef.current
        if (liftEl) liftEl.style.scale = `${whole}`

        for (const [el, x] of [[headRef.current, head.x], [tailRef.current, tail.x]] as const) {
          if (!el) continue
          // `translate` (not transform) so `scale` grows the droplet in place
          el.style.translate = `${x}px 0`
          el.style.scale = `${drop}`
        }

        // Lens: content under the droplets is redrawn inside them with each
        // icon magnified about its *own* centre, so nothing slides — the
        // "refraction" of DOM icons the WebGL glass can't see. The lens box
        // is the scaled droplets' union; originals are masked out under it.
        const w = segWRef.current
        const indH = height - pad * 2
        const growX = (w * (drop - 1)) / 2
        const growY = (indH * (drop - 1)) / 2
        const l = Math.min(head.x, tail.x) - growX
        const r = Math.max(head.x, tail.x) + w + growX
        const top = pad - growY
        const lens = lensRef.current
        const row = lensRowRef.current
        if (lens && row) {
          lens.style.transform = `translate(${l}px, ${top}px)`
          lens.style.width = `${r - l}px`
          lens.style.height = `${indH * drop}px`
          lens.style.borderRadius = `${(indH * drop) / 2}px`
          row.style.transform = `translate(${-l}px, ${-top}px)`
          row.style.setProperty('--zoom', `${LENS_REST + (LENS_LIFT - LENS_REST) * lift.x}`)
        }
        const items = itemsRef.current
        if (items) {
          const f = 3 // px feather
          const m = `linear-gradient(90deg, #000 ${l}px, transparent ${l + f}px, transparent ${r - f}px, #000 ${r}px)`
          items.style.maskImage = m
          items.style.webkitMaskImage = m
        }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  // Pointer → unscaled control coordinates (the lift scales the control)
  const pointerX = (e: RE) =>
    (e.clientX - rootRef.current!.getBoundingClientRect().left) / wholeScale.current
  const nearest = (x: number) =>
    Math.max(0, Math.min(n - 1, Math.round((x - pad) / segWRef.current)))

  const onDown = (e: RE<HTMLDivElement>) => {
    if (e.button !== 0 || target.current === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    liftUntil.current = performance.now() + LIFT_MIN_MS
    liftAmt.current = LIFT_TAP
    const x = pointerX(e)
    const w = segWRef.current
    // Grab the indicator where it was touched; elsewhere, jump to that segment
    const onIndicator = Math.abs(x - (target.current + w / 2)) < w / 2
    drag.current = { dx: onIndicator ? x - target.current : w / 2, x0: x }
    if (!onIndicator) {
      const i = nearest(x - w / 2)
      target.current = segX(i)
      onChange(i)
    }
  }
  const onMove = (e: RE<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const px = pointerX(e)
    if (Math.abs(px - d.x0) > DRAG_SLOP) liftAmt.current = 1
    const x = Math.max(segX(0), Math.min(segX(n - 1), px - d.dx))
    target.current = x
    const i = nearest(x)
    if (i !== value) onChange(i)
  }
  const onUp = () => {
    if (!drag.current || target.current === null) return
    drag.current = null
    const i = nearest(target.current)
    target.current = segX(i)
    onChange(i)
  }

  const indH = height - pad * 2
  const blob = { top: pad, width: segW, height: indH, visibility: segW ? 'visible' : 'hidden' } as const

  return (
    <div
      ref={rootRef}
      className={`lseg${className ? ` ${className}` : ''}`}
      style={{ height }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {track && (
        <GlassBlob radius={height / 2} frost={1} style={{ width: '100%', height: '100%' }} />
      )}
      {/* Clear droplets: a see-through window over the frosted track */}
      <GlassBlob ref={tailRef} layer={1} radius={indH / 2} clear fuse style={blob} />
      <GlassBlob ref={headRef} layer={1} radius={indH / 2} clear fuse style={blob} />
      <div ref={itemsRef} className="lseg-items" role="tablist" style={{ padding: `0 ${pad}px` }}>
        {items.map((item, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === value}
            aria-label={labels?.[i] ?? (typeof item === 'string' ? item : undefined)}
            className={i === value ? `on ${FOCUS_RING_CLASS}` : FOCUS_RING_CLASS}
            // Pointer input is handled on the root; click covers keyboard/AT
            onClick={() => !drag.current && onChange(i)}
          >
            {item}
          </button>
        ))}
      </div>
      {/* Magnified copy of the items, clipped to the indicator capsule */}
      <div
        ref={lensRef}
        className="lseg-lens"
        aria-hidden
        style={{ top: 0, visibility: segW ? 'visible' : 'hidden' }}
      >
        <div
          ref={lensRowRef}
          className="lseg-items"
          style={{ top: 0, height, width: segW * n + pad * 2, padding: `0 ${pad}px` }}
        >
          {items.map((item, i) => (
            <div key={i} className={i === value ? 'on' : undefined}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
