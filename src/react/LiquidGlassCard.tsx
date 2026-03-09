import { forwardRef, type HTMLAttributes } from 'react'
import { useLiquidGlass, type UseLiquidGlassOptions } from './useLiquidGlass'

export interface LiquidGlassCardProps extends HTMLAttributes<HTMLDivElement> {
  borderRadius?: number
  initialLocked?: boolean
  /** 0–1 glass material thickness. 1 = regular (default), ~0.35 = thin. */
  thickness?: number
}

export const LiquidGlassCard = forwardRef<HTMLDivElement, LiquidGlassCardProps>(
  (
    {
      borderRadius = 32,
      initialLocked = false,
      thickness = 1.0,
      className,
      style,
      children,
      ...props
    },
    forwardedRef,
  ) => {
    const glassOptions: UseLiquidGlassOptions = {
      borderRadius,
      initialLocked,
      thickness,
    }
    const { ref: glassRef } = useLiquidGlass(glassOptions)

    const classes = ['liquid-glass-card', className].filter(Boolean).join(' ')

    return (
      <div
        ref={(node) => {
          ;(glassRef as React.MutableRefObject<HTMLElement | null>).current =
            node
          if (typeof forwardedRef === 'function') forwardedRef(node)
          else if (forwardedRef)
            (
              forwardedRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node
        }}
        className={classes}
        style={{
          position: 'relative',
          borderRadius,
          zIndex: 20,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    )
  },
)

LiquidGlassCard.displayName = 'LiquidGlassCard'
