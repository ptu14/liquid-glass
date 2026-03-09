// Core (framework-agnostic)
export {
  LiquidGlassRenderer,
  type GlassComponentData,
  type GlassParams,
  type ComponentAnimState,
  DEFAULT_GLASS_PARAMS,
  MAX_BTNS,
} from './core'

// React adapter
export {
  LiquidGlassProvider,
  type LiquidGlassProviderProps,
  type BgRenderer,
  useLiquidGlass,
  type UseLiquidGlassOptions,
  type UseLiquidGlassReturn,
  LiquidGlassButton,
  type LiquidGlassButtonProps,
  LiquidGlassCard,
  type LiquidGlassCardProps,
} from './react'
