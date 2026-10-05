/** Colour variants shared by the adapters' buttons and inputs. */
export type GlassVariant = 'default' | 'primary' | 'secondary' | 'danger'

/** Variant → RGB tint [0–1]. `default` is untinted. */
export const VARIANT_TINT: Record<GlassVariant, [number, number, number] | undefined> = {
  default: undefined,
  primary: [0.18, 0.42, 0.95],
  secondary: [0.55, 0.55, 0.6],
  danger: [0.92, 0.22, 0.2],
}

/** Rubber-band dampening: linear near 0, asymptotically approaches maxPx. */
export function rubberBand(delta: number, strength: number, maxPx: number): number {
  const raw = delta * strength
  return (raw * maxPx) / (maxPx + Math.abs(raw))
}

let nextId = 0

/** Unique id for a glass component. */
export function createGlassId(): string {
  return `lg-${nextId++}`
}
