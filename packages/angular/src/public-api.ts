// Angular adapter
export { LiquidGlassBase, VARIANT_TINT, rubberBand, type GlassVariant } from './lib/liquid-glass-base'
export { LiquidGlassService, generateGlassId } from './lib/liquid-glass.service'
export { LiquidGlassDirective } from './lib/liquid-glass.directive'
export { LiquidGlassTransitionRefreshDirective } from './lib/liquid-glass-transition-refresh.directive'
export {
  LiquidGlassContainerComponent,
  type BgRenderer,
} from './lib/liquid-glass-container.component'
export {
  LiquidGlassButtonComponent,
  type GlassButtonVariant,
} from './lib/liquid-glass-button.component'
export { LiquidGlassCardComponent } from './lib/liquid-glass-card.component'
export {
  LiquidGlassInputComponent,
  type GlassInputVariant,
} from './lib/liquid-glass-input.component'

// Re-exported from core so apps need a single import
export {
  DEFAULT_GLASS_PARAMS,
  LIVE_ATTR,
  CAPTURE_EVENT,
  FOCUS_RING_CLASS,
  FOCUS_RING_WITHIN_CLASS,
  type GlassParams,
} from '@daniluk/liquid-glass'
