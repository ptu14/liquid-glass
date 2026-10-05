// Vanilla API
export {
  LiquidGlass,
  type LiquidGlassOptions,
  type GlassOptions,
  type GlassHandle,
} from './LiquidGlass'

// Building blocks for framework adapters
export { LiquidGlassHost, type LiquidGlassHostOptions } from './host'
export {
  BackgroundCapture,
  drawCover,
  LIVE_ATTR,
  CAPTURE_EVENT,
  type BgRenderer,
  type BackgroundOptions,
} from './background'
export { VARIANT_TINT, rubberBand, createGlassId, type GlassVariant } from './helpers'
export { FOCUS_RING_CLASS, FOCUS_RING_WITHIN_CLASS, ensureFocusRingStyles } from './focus'

// Low-level renderer
export { LiquidGlassRenderer } from './LiquidGlassRenderer'
export { tickBlendK, easeOutCubic, easeInQuad } from './utils'
export {
  type GlassComponentData,
  type GlassParams,
  type ComponentAnimState,
  DEFAULT_GLASS_PARAMS,
  MAX_BTNS,
} from './types'
