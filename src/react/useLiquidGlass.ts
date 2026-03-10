import { useRef, useCallback, useEffect, useId, useState } from 'react'
import type { GlassComponentData } from '../core/types'
import { useLiquidGlassRegistry } from './LiquidGlassProvider'

export interface UseLiquidGlassOptions {
  borderRadius?: number
  initialLocked?: boolean
  /** 0 = no glass, 1 = full "regular" material. ~0.35 for "thin". Default 1. */
  thickness?: number
  /** Render layer. 0 = base (default), 1 = rendered on top of layer 0. */
  layer?: number
  /** Whether this component is currently pressed (triggers blue tint in shader). */
  pressed?: boolean
  /** RGB tint colour [0–1]. Tints glass at rest; darkens on press. */
  tintColor?: [number, number, number]
}

export interface UseLiquidGlassReturn {
  ref: React.RefObject<HTMLElement | null>
  locked: boolean
  toggleLock: () => void
  setLocked: (locked: boolean) => void
}

export function useLiquidGlass(
  options: UseLiquidGlassOptions = {},
): UseLiquidGlassReturn {
  const { borderRadius = 100, initialLocked = false, thickness = 1.0, layer = 0, pressed = false, tintColor } = options
  const id = useId()
  const ref = useRef<HTMLElement | null>(null)
  const [locked, setLocked] = useState(initialLocked)
  const registry = useLiquidGlassRegistry()
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  const borderRadiusRef = useRef(borderRadius)
  borderRadiusRef.current = borderRadius

  const thicknessRef = useRef(thickness)
  thicknessRef.current = thickness

  const layerRef = useRef(layer)
  layerRef.current = layer

  const pressedRef = useRef(pressed)
  pressedRef.current = pressed

  const tintColorRef = useRef(tintColor)
  tintColorRef.current = tintColor

  const getData = useCallback((): GlassComponentData => {
    const el = ref.current
    const rect = el
      ? el.getBoundingClientRect()
      : new DOMRect(0, 0, 0, 0)
    return {
      id,
      rect,
      borderRadius: borderRadiusRef.current,
      blendK: lockedRef.current ? 0 : 60,
      locked: lockedRef.current,
      thickness: thicknessRef.current,
      layer: layerRef.current,
      pressed: pressedRef.current,
      tintColor: tintColorRef.current,
    }
  }, [id])

  useEffect(() => {
    registry.register(id, getData)
    return () => registry.unregister(id)
  }, [id, registry, getData])

  const toggleLock = useCallback(() => {
    setLocked((prev) => !prev)
  }, [])

  return { ref, locked, toggleLock, setLocked }
}
