export interface GlassComponentData {
  id: string
  rect: DOMRect
  borderRadius: number
  blendK: number
  locked: boolean
  /** 0 = no glass, 1 = full "regular" material. Use ~0.35 for "thin". */
  thickness: number
  /** Render layer. 0 = base (default), 1 = rendered on top of layer 0's output. */
  layer: number
  /** Whether this component is currently pressed (for blue tint in shader). */
  pressed: boolean
  /** RGB tint colour [0–1]. When set, the glass is tinted at rest; on press the tint darkens. */
  tintColor?: [number, number, number]
}

export interface GlassParams {
  blend: number
  /** Controls the width of the edge effect band. */
  dispStr: number
  /** Chromatic aberration fringe intensity at borders. */
  aberr: number
  /** Edge refraction displacement strength. */
  refr: number
  /** How often to re-capture the background (ms). */
  bgCaptureInterval: number
  /** Gaussian blur radius in CSS pixels applied to the background
   *  before glass compositing. Matches CSS backdrop-filter quality.
   *  Default 20 (≈ backdrop-filter: blur(20px)). */
  glassBlur: number
  /** When true, overlapping same-layer DOM rects animate their blendK
   *  toward 0 after contact, producing a clean SDF union (min) instead
   *  of the persistent smin bulge. Default true. */
  mergeOnOverlap: boolean
}

export interface ComponentAnimState {
  locked: boolean
  animStart: number | null
  animDir: 1 | -1
  blendK: number
}

export const DEFAULT_GLASS_PARAMS: GlassParams = {
  blend: 20,
  dispStr: 0.028,
  aberr: 0.00,
  refr: 3.5,
  bgCaptureInterval: 16,
  glassBlur: 20,
  mergeOnOverlap: true,
}

export const MAX_BTNS = 16
