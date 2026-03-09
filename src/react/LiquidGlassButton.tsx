import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { useLiquidGlass, type UseLiquidGlassOptions } from './useLiquidGlass'

export interface LiquidGlassButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  borderRadius?: number
  initialLocked?: boolean
  /** 0–1 glass material thickness. 1 = regular, ~0.35 = thin. */
  thickness?: number
  /** Render layer. 0 = base, 1 = on top of layer 0. */
  layer?: number
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
      className,
      style,
      onDoubleClick,
      children,
      ...props
    },
    forwardedRef,
  ) => {
    const glassOptions: UseLiquidGlassOptions = {
      borderRadius,
      initialLocked,
      thickness,
      layer,
    }
    const { ref: glassRef, locked, toggleLock } = useLiquidGlass(glassOptions)

    const classes = ['liquid-glass-btn', className].filter(Boolean).join(' ')

    return (
      <button
        ref={(node) => {
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
          outline: 'none',
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
          ...style,
        }}
        onDoubleClick={(e) => {
          toggleLock()
          onDoubleClick?.(e)
        }}
        data-locked={locked}
        {...props}
      >
        {children}
      </button>
    )
  },
)

LiquidGlassButton.displayName = 'LiquidGlassButton'
