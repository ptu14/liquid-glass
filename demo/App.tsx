import { useRef, useCallback, useState, type PointerEvent as RE } from 'react'
import { LiquidGlassProvider, LiquidGlassButton } from '../src'

interface BtnPos { x: number; y: number }

const INIT_BUTTONS = [
  { label: 'Primary',   x: 0.28, y: 0.45 },
  { label: 'Secondary', x: 0.45, y: 0.45 },
  { label: 'Confirm',   x: 0.62, y: 0.45 },
  { label: 'Cancel',    x: 0.45, y: 0.58 },
]

export function App() {
  const bgRef = useRef<HTMLDivElement>(null)

  const [positions, setPositions] = useState<BtnPos[]>(() =>
    INIT_BUTTONS.map((b) => ({
      x: b.x * window.innerWidth,
      y: b.y * window.innerHeight,
    })),
  )

  const dragRef = useRef<{
    idx: number
    startMx: number
    startMy: number
    startBx: number
    startBy: number
  } | null>(null)

  const onPointerDown = useCallback((idx: number, e: RE<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      idx,
      startMx: e.clientX,
      startMy: e.clientY,
      startBx: rect.left + rect.width / 2,
      startBy: rect.top + rect.height / 2,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onPointerMove = useCallback((e: RE<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    setPositions((prev) => {
      const next = [...prev]
      next[d.idx] = {
        x: d.startBx + (e.clientX - d.startMx),
        y: d.startBy + (e.clientY - d.startMy),
      }
      return next
    })
  }, [])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
    <>
      {/* HTML/CSS background — the glass auto-captures this via html2canvas */}
      <div id="html-bg" ref={bgRef}>
        <div className="bg-stripes" />
        <div className="bg-grid" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
        <div className="bg-typography">
          <h1>Liquid</h1>
          <h1 className="right">Glass</h1>
          <h1>WebGL</h1>
        </div>
      </div>

      {/* Single WebGL canvas — captures bgElement automatically */}
      <LiquidGlassProvider bgElement={bgRef}>
        {INIT_BUTTONS.map((btn, i) => (
          <LiquidGlassButton
            key={btn.label}
            borderRadius={22}
            style={{
              position: 'fixed',
              left: positions[i].x,
              top: positions[i].y,
              transform: 'translate(-50%, -50%)',
              zIndex: dragRef.current?.idx === i ? 30 : 20,
              touchAction: 'none',
            }}
            onPointerDown={(e) => onPointerDown(i, e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {btn.label}
          </LiquidGlassButton>
        ))}
      </LiquidGlassProvider>

      <div className="hint">
        drag buttons &middot; click = expand &amp; merge
      </div>
    </>
  )
}
