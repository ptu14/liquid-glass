import type { ComponentAnimState } from './types'

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function easeInQuad(t: number): number {
  return t * t
}

const ANIM_DURATION = 500

export function tickBlendK(
  state: ComponentAnimState,
  targetK: number,
  now: number,
): number {
  if (state.animStart === null) return state.locked ? 0 : targetK

  const t = Math.min((now - state.animStart) / ANIM_DURATION, 1)
  const eased = state.animDir === 1 ? easeOutCubic(t) : 1 - easeInQuad(t)
  if (t >= 1) state.animStart = null
  return eased * targetK
}
