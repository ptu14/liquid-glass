import { forwardRef, useState, useRef, useCallback, useEffect, type ButtonHTMLAttributes } from 'react'
import { FOCUS_RING_CLASS, rubberBand, VARIANT_TINT, type GlassVariant } from '@daniluk/liquid-glass'
import { useLiquidGlass, type UseLiquidGlassOptions } from './useLiquidGlass'

export type GlassButtonVariant = GlassVariant

export interface LiquidGlassButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  borderRadius?: number
  initialLocked?: boolean
  /** 0–1 glass material thickness. 1 = regular, ~0.35 = thin. */
  thickness?: number
  /** Render layer. 0 = base, 1 = on top of layer 0. */
  layer?: number
  /** CSS scale applied on press. 0 = disabled. Default 1.02. */
  pressScale?: number
  /** Magnetic drag dampening. 0 = no movement, 1 = follows cursor 1:1. Default 0.45. */
  magnetStrength?: number
  /** Max magnetic offset in px before rubber-band caps out. Default 8. */
  magnetMax?: number
  /** Button colour variant. Default = no tint. */
  variant?: GlassButtonVariant
  /** Custom tint colour [r,g,b] 0–1. Overrides variant. */
  tintColor?: [number, number, number]
}

export const LiquidGlassButton = forwardRef<
  HTMLButtonElement,
  LiquidGlassButtonProps
>(
  (
    {
      borderRadius = 22,
      initialLocked = false,
      thickness = 1.0,
      layer = 0,
      pressScale = 1.02,
      magnetStrength = 0.45,
      magnetMax = 8,
      variant = 'default',
      tintColor: tintColorProp,
      className,
      style,
      onPointerDown,
      children,
      ...props
    },
    forwardedRef,
  ) => {
    const btnRef = useRef<HTMLButtonElement | null>(null)
    const [pressed, setPressed] = useState(false)

    const resolvedTint = tintColorProp ?? VARIANT_TINT[variant]
    const glassOptions: UseLiquidGlassOptions = {
      borderRadius,
      initialLocked,
      thickness,
      layer,
      pressed,
      tintColor: resolvedTint,
    }
    const { ref: glassRef, locked, setLocked } =
      useLiquidGlass(glassOptions)
    const pressedRef = useRef(false)
    const wasLockedRef = useRef(initialLocked)
    const startPosRef = useRef({ x: 0, y: 0 })

    const restore = useCallback(() => {
      const el = btnRef.current
      if (el) {
        const base = style?.transform ?? ''
        el.style.transition = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'
        el.style.transform = base ? `${base} scale(1)` : 'scale(1)'
      }
      setPressed(false)
      pressedRef.current = false
      if (wasLockedRef.current) setLocked(true)
    }, [setLocked, style?.transform])

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        onPointerDown?.(e)
        if (!pressScale || pressScale <= 1) return

        startPosRef.current = { x: e.clientX, y: e.clientY }
        setPressed(true)
        pressedRef.current = true

        // Unlock so SDF smin merge can happen
        wasLockedRef.current = locked
        if (locked) setLocked(false)
      },
      [pressScale, locked, setLocked, onPointerDown],
    )

    // Listen on window for pointerup + pointermove so they work outside the button
    useEffect(() => {
      const onUp = () => {
        if (!pressedRef.current) return
        restore()
      }

      const onMove = (e: PointerEvent) => {
        if (!pressedRef.current) return
        const el = btnRef.current
        if (!el) return
        const dx = rubberBand(e.clientX - startPosRef.current.x, magnetStrength, magnetMax)
        const dy = rubberBand(e.clientY - startPosRef.current.y, magnetStrength, magnetMax)
        const base = style?.transform ?? ''
        const t = `translate(${dx}px, ${dy}px) scale(${pressScale})`
        el.style.transition = 'none'
        el.style.transform = base ? `${base} ${t}` : t
      }

      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointermove', onMove)
      return () => {
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointermove', onMove)
      }
    }, [magnetStrength, magnetMax, pressScale, style?.transform, restore])

    const classes = ['liquid-glass-btn', FOCUS_RING_CLASS, className].filter(Boolean).join(' ')

    // Merge user transform with press scale (only for React-controlled renders)
    const userTransform = style?.transform ?? ''
    const scaleTransform = pressed ? `scale(${pressScale})` : 'scale(1)'
    const mergedTransform = userTransform
      ? `${userTransform} ${scaleTransform}`
      : scaleTransform

    return (
      <button
        ref={(node) => {
          btnRef.current = node
          ;(glassRef as React.MutableRefObject<HTMLElement | null>).current =
            node
          if (typeof forwardedRef === 'function') forwardedRef(node)
          else if (forwardedRef)
            (
              forwardedRef as React.MutableRefObject<HTMLButtonElement | null>
            ).current = node
        }}
        className={classes}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: 'transparent',
          border: 0,
          boxShadow: 'none',
          borderRadius,
          cursor: 'pointer',
          padding: '14px 32px',
          margin: 0,
          color: 'rgba(255,255,255,0.92)',
          fontSize: '0.9rem',
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          whiteSpace: 'nowrap',
          textShadow: '0 1px 8px rgba(0,0,0,0.4)',
          position: 'relative',
          zIndex: 20,
          userSelect: 'none',
          transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          ...style,
          transform: mergedTransform,
        }}
        onPointerDown={handlePointerDown}
        data-locked={locked}
        {...props}
      >
        {children}
      </button>
    )
  },
)

LiquidGlassButton.displayName = 'LiquidGlassButton'
