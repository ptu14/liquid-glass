import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RE } from 'react'
import { GlassBlob, reduceMotion, step, type Spring } from './LiquidSegmented'
import { ArrowUpIcon, CloseIcon, MicIcon, SearchIcon } from './icons'
import { FOCUS_RING_WITHIN_CLASS } from '@daniluk/liquid-glass-react'

// ── Liquid search: a search pill and a round button that interact ──
// Both are layer-0 glass, so the renderer's smin treats them as one
// liquid: a small gap shows a bridge, contact joins them, separation necks
// and pinches off (no `fuse` — morphing into one box looked wrong here). Choreography:
//   rest   — pill + mic button side by side, separate
//   focus  — pill stretches to full width; the button is kicked *into* it
//            (joins it), then springs out to the far end as a close button
//   typing — close becomes send and the button pulses on every keystroke
//   drag   — pull the button away (bridge stretches) or press it into the
//            pill (joins it); it snaps back on release
// At rest and while typing both are *locked* (no bridge, no attraction);
// they only turn liquid while dragged and during the focus/blur transition.

const H = 52 // pill + button height
const GAP = 12
const REST_PILL = 0.72 // rest pill width as a share of (row − button − gap)
const KICK = 800 // px/s toward the pill on focus/blur — makes them collide
const DRAG_MAX = 90 // rubber-band reach of the button
const SETTLE_MS = 700 // liquid window for the focus/blur transition and after a drag

function rubber(d: number, max: number) {
  return (d * max) / (max + Math.abs(d))
}

export function LiquidSearch() {
  const rowRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [rowW, setRowW] = useState(0)
  const rowWRef = useRef(0)
  rowWRef.current = rowW
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const focusedRef = useRef(false)
  // Liquid (unlocked) only while dragging or during the focus/blur
  // transition — locked at rest and while typing
  const [dragging, setDragging] = useState(false)
  const [liquid, setLiquid] = useState(false)
  const prevState = useRef({ focused: false, dragging: false })
  useEffect(() => {
    // React only to real changes (StrictMode re-runs effects on mount)
    const prev = prevState.current
    if (prev.focused === focused && prev.dragging === dragging) return
    prevState.current = { focused, dragging }
    if (dragging) {
      setLiquid(true)
      return
    }
    setLiquid(true)
    const t = setTimeout(() => setLiquid(false), SETTLE_MS)
    return () => clearTimeout(t)
  }, [focused, dragging])

  // Impulses / drag shared with the rAF loop
  const kick = useRef(0) // pending velocity added to the button
  const pulse = useRef(0) // pending scale velocity
  const drag = useRef<{ sx: number; sy: number; dx: number; dy: number; moved: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = rowRef.current!
    const measure = () => setRowW(el.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (focusedRef.current === focused) return
    focusedRef.current = focused
    // Throw the button at the pill so they visibly merge before settling
    kick.current = -KICK
  }, [focused])

  useEffect(() => {
    if (query) pulse.current = 2.2
  }, [query])

  useEffect(() => {
    const pillL: Spring = { x: NaN, v: 0 }
    const pillR: Spring = { x: NaN, v: 0 }
    const btnX: Spring = { x: NaN, v: 0 }
    const btnY: Spring = { x: 0, v: 0 }
    const btnS: Spring = { x: 1, v: 0 }
    let last = performance.now()
    let id: number

    const loop = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000)
      last = now
      const W = rowWRef.current
      if (W > 0) {
        // Targets for the current state
        const open = focusedRef.current
        const restPill = (W - H - GAP) * REST_PILL
        const restLeft = (W - (restPill + GAP + H)) / 2
        const tL = open ? 0 : restLeft
        const tR = open ? W - H - GAP : restLeft + restPill
        const tBtn = tR + GAP // button's left edge

        if (Number.isNaN(pillL.x)) {
          pillL.x = tL
          pillR.x = tR
          btnX.x = tBtn
        }
        if (kick.current) {
          btnX.v += kick.current
          kick.current = 0
        }
        if (pulse.current) {
          btnS.v += pulse.current
          pulse.current = 0
        }

        // Pill is stiff and quick; the button is softer and wobblier, so it
        // lags, collides with the pill edge and pinches back off.
        step(pillL, tL, 260, 0.75, dt)
        step(pillR, tR, 260, 0.75, dt)
        const d = drag.current
        if (d && d.moved) {
          btnX.x = tBtn + rubber(d.dx, DRAG_MAX)
          btnY.x = rubber(d.dy, DRAG_MAX * 0.6)
          btnX.v = btnY.v = 0
        } else {
          step(btnX, tBtn, 170, 0.5, dt)
          step(btnY, 0, 170, 0.5, dt)
        }
        step(btnS, 1, 300, 0.45, dt)
        if (reduceMotion) {
          pillL.x = tL
          pillR.x = tR
          if (!d?.moved) {
            btnX.x = tBtn
            btnY.x = 0
          }
          btnS.x = 1
        }

        const pill = pillRef.current
        if (pill) {
          pill.style.translate = `${pillL.x}px 0`
          pill.style.width = `${Math.max(H, pillR.x - pillL.x)}px`
        }
        const btn = btnRef.current
        if (btn) {
          btn.style.translate = `${btnX.x}px ${btnY.x}px`
          btn.style.scale = `${btnS.x}`
        }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  // ── Button: tap acts, drag rubber-bands ──────────────────
  const onBtnDown = (e: RE<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false }
    setDragging(true)
  }
  const onBtnMove = (e: RE<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    d.dx = e.clientX - d.sx
    d.dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(d.dx, d.dy) > 5) d.moved = true
  }
  const suppressClick = useRef(false)
  const onBtnUp = () => {
    suppressClick.current = !!drag.current?.moved
    drag.current = null
    setDragging(false)
  }
  const onBtnClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (!focused) {
      inputRef.current?.focus()
    } else if (query) {
      // "send": pulse and clear
      pulse.current = 3
      setQuery('')
    } else {
      setFocused(false)
      inputRef.current?.blur()
    }
  }

  const mode = !focused ? 'mic' : query ? 'send' : 'close'
  const icon =
    mode === 'mic' ? <MicIcon /> : mode === 'send' ? <ArrowUpIcon /> : <CloseIcon />
  const btnLabel = !focused ? 'Voice search' : query ? 'Search' : 'Cancel'

  return (
    <div ref={rowRef} className="lsearch" style={{ height: H }}>
      <GlassBlob ref={pillRef} radius={999} locked={!liquid} className={FOCUS_RING_WITHIN_CLASS} style={{ height: H, visibility: rowW ? 'visible' : 'hidden' }}>
        <label className="lsearch-pill">
          <span className="lsearch-glass">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => !query && setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                setFocused(false)
                e.currentTarget.blur()
              }
            }}
          />
        </label>
      </GlassBlob>

      <GlassBlob
        ref={btnRef}
        radius={999}
        locked={!liquid}
        className={FOCUS_RING_WITHIN_CLASS}
        style={{ width: H, height: H, visibility: rowW ? 'visible' : 'hidden' }}
      >
        <button
          className={`lsearch-btn${focused && query ? ' send' : ''}`}
          aria-label={btnLabel}
          // keep input focus when tapping the button
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={onBtnDown}
          onPointerMove={onBtnMove}
          onPointerUp={onBtnUp}
          onPointerCancel={onBtnUp}
          onClick={onBtnClick}
        >
          <span key={mode}>{icon}</span>
        </button>
      </GlassBlob>
    </div>
  )
}
