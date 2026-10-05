/** Keyboard focus ring on the element itself (`:focus-visible`). */
export const FOCUS_RING_CLASS = 'lg-focus-ring'
/** Focus ring on the element while a descendant is focused (e.g. an inner `<input>`). */
export const FOCUS_RING_WITHIN_CLASS = 'lg-focus-ring-within'

const STYLE_ID = 'lg-focus-ring-styles'
const MODALITY_ATTR = 'data-lg-modality'

// :where() keeps specificity at a single pseudo-class, so any app rule wins.
// Tokens: --lg-focus-ring-color / -width / -offset.
// Text inputs match :focus-visible on click too, so the "within" ring also
// requires keyboard navigation (Tab) as the last input modality.
const CSS = `
:where(.${FOCUS_RING_CLASS}):focus-visible,
:where([${MODALITY_ATTR}='keyboard']) :where(.${FOCUS_RING_WITHIN_CLASS}):has(:focus-visible) {
  outline: var(--lg-focus-ring-width, 2px) solid var(--lg-focus-ring-color, #0a84ff);
  outline-offset: var(--lg-focus-ring-offset, 3px);
}
:where(.${FOCUS_RING_WITHIN_CLASS}) :focus-visible { outline: none; }
`

/**
 * Inject the focus-ring stylesheet once per document and start tracking the
 * input modality (no-op outside the browser).
 */
export function ensureFocusRingStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  // First in <head> so app stylesheets override it
  document.head.prepend(style)

  // Only Tab counts as keyboard navigation: typing into a clicked input
  // must not bring the ring back.
  const root = document.documentElement
  const set = (m: string) => root.setAttribute(MODALITY_ATTR, m)
  document.addEventListener('keydown', (e) => e.key === 'Tab' && set('keyboard'), true)
  document.addEventListener('pointerdown', () => set('pointer'), true)
}
