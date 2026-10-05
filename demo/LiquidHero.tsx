import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RE } from 'react'
import { GlassBlob, reduceMotion, step, type Spring } from './LiquidSegmented'

// ── Liquid hero: two glass bodies that merge and split on a loop ──
// Metaball glass (own 60px blend radius, no overlap relax): the two big
// drops drift together, neck, merge into one breathing body, then tear
// apart — a small drop left in the middle turns the tear into a chain of
// pearls (A–C–B) before it pinches off. Any drop can be grabbed; the loop
// pauses while dragging and the drop springs home on release.

const BIG = 118
const SMALL = 46
const BLEND = 60 // px — long, soft liquid bridges
const APART = 0.34 // rest offset of the big drops, share of hero width
const CYCLE = 7200 // ms
// Timeline (fractions of CYCLE): apart → merge → hold (breathing) → split
const MERGE_AT = 0.22
const SPLIT_AT = 0.62

interface Drop {
  x: Spring
  y: Spring
  s: Spring
}

export function LiquidHero() {
  const boxRef = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const sizeRef = useRef(size)
  sizeRef.current = size

  // Drag state: which drop, pointer target in hero coords
  const drag = useRef<{ i: number; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = boxRef.current!
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const drops: Drop[] = [0, 1, 2].map(() => ({
      x: { x: NaN, v: 0 },
      y: { x: NaN, v: 0 },
      s: { x: 1, v: 0 },
    }))
    let clock = 0 // timeline ms; frozen while dragging
    let last = performance.now()
    let id: number

    const loop = (now: number) => {
      const dtMs = Math.min(1000 / 30, now - last)
      last = now
      const dt = dtMs / 1000
      const { w, h } = sizeRef.current
      if (w > 0) {
        if (!drag.current) clock = (clock + dtMs) % CYCLE
        const p = clock / CYCLE
        const merged = p >= MERGE_AT && p < SPLIT_AT
        const cx = w / 2
        const cy = h / 2
        const off = w * APART
        const t = now / 1000

        // Targets: apart (gentle bob) or merged into one peanut-shaped body
        const targets = [
          { x: merged ? cx - 22 : cx - off, y: cy + (merged ? 0 : Math.sin(t * 1.3) * 8), s: 1 },
          { x: merged ? cx + 22 : cx + off, y: cy + (merged ? 0 : Math.sin(t * 1.3 + 2) * 8), s: 1 },
          // the small drop stays centred — it becomes the middle pearl on split
          { x: cx, y: cy + (merged ? 0 : Math.sin(t * 2.1) * 4), s: merged ? 1.25 : 1 },
        ]
        if (merged) {
          // breathing while merged
          const b = Math.sin(((clock / CYCLE - MERGE_AT) * CYCLE) / 1000 * Math.PI * 1.6) * 0.06
          targets[0].s = targets[1].s = 1 + b
        }

        drops.forEach((d, i) => {
          const tg = targets[i]
          if (Number.isNaN(d.x.x)) {
            d.x.x = tg.x
            d.y.x = tg.y
          }
          if (drag.current?.i === i) {
            // follow the pointer closely, keep a touch of lag
            step(d.x, drag.current.x, 900, 0.8, dt)
            step(d.y, drag.current.y, 900, 0.8, dt)
          } else {
            // big drops: soft & wobbly; the small one a bit stiffer
            const k = i === 2 ? 60 : 24
            const z = i === 2 ? 0.6 : 0.5
            step(d.x, tg.x, k, z, dt)
            step(d.y, tg.y, k, z, dt)
          }
          step(d.s, tg.s, 120, 0.45, dt)
          if (reduceMotion && drag.current?.i !== i) {
            d.x.x = tg.x
            d.y.x = tg.y
            d.s.x = tg.s
          }
          const el = refs.current[i]
          if (el) {
            const dia = (i === 2 ? SMALL : BIG) * d.s.x
            el.style.width = el.style.height = `${dia}px`
            el.style.translate = `${d.x.x - dia / 2}px ${d.y.x - dia / 2}px`
          }
        })
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  const local = (e: RE) => {
    const r = boxRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (i: number) => (e: RE<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { i, ...local(e) }
  }
  const onMove = (e: RE<HTMLDivElement>) => {
    if (drag.current) Object.assign(drag.current, local(e))
  }
  const onUp = () => {
    drag.current = null
  }

  return (
    <div ref={boxRef} className="liquid-hero" aria-hidden>
      {[BIG, BIG, SMALL].map((d, i) => (
        <GlassBlob
          key={i}
          ref={(n) => {
            refs.current[i] = n
          }}
          className="hero-drop"
          radius={999}
          blend={BLEND}
          metaball
          style={{ width: d, height: d, visibility: size.w ? 'visible' : 'hidden' }}
          onPointerDown={onDown(i)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      ))}
    </div>
  )
}
