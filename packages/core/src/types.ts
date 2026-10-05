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
  /** 0–1 frosted material: blurred (by `frostBlur`) + faint milky veil. Default 0. */
  frost?: number
  /** Opt-in: when this and an overlapping same-layer component both set
   *  `fuse`, and their union is nearly rectangular (e.g. a footer docking
   *  under a same-width bar), they morph into one rounded rect — a single
   *  glass body with no pinched seam. Default false. */
  fuse?: boolean
  /** Per-component smooth-blend radius (px), overriding the global
   *  `blend`. A pair bridges with the smaller of the two radii. */
  blend?: number
  /** Metaball mode: keep the smooth smin blend even while overlapping
   *  (skip the overlap relax), for blob-like merges with a soft bulge. */
  metaball?: boolean
  /** Layer 1 only: sample the raw background instead of the layer-0
   *  composite, so the glass is a fully clear window through the glass
   *  beneath it (no refracted copy of its rim / frost). Default false. */
  clear?: boolean
}

export interface GlassParams {
  blend: number
  /** Extra broad displacement across the bezel band, on top of the
   *  physical refraction (×100 px). Default 0.028 ≈ 3 px. */
  dispStr: number
  /** Chromatic aberration fringe intensity at borders. */
  aberr: number
  /** Edge refraction strength. The bezel is a convex squircle as tall as
   *  `bezelWidth`; light refracts through it (Snell, n = 1.5) and pulls the
   *  image toward the centre near the rim. 3.5 = physical; scales linearly. */
  refr: number
  /** How often to re-capture the background (ms). */
  bgCaptureInterval: number
  /** Gaussian blur radius in CSS pixels applied to the background
   *  before glass compositing. Matches CSS backdrop-filter quality.
   *  Default 0 (off). Set to ~20 for `backdrop-filter: blur(20px)` look. */
  glassBlur: number
  /** When true, overlapping same-layer DOM rects relax their blendK
   *  toward 0 in proportion to overlap depth (full at 2× `blend` px):
   *  light contact keeps the liquid smin bridge, deep overlap becomes a
   *  clean SDF union (min) without the smin bulge. Default true. */
  mergeOnOverlap: boolean
  /** Blur radius (px) of the per-component `frost` material. Default 14. */
  frostBlur: number
  /** 0–1 blur toward the rim, like Apple's liquid glass: content under
   *  a band of 1.6× `bezelWidth` smears into the blurred bg (radius
   *  `frostBlur`), strongest at the edge. 0 = off. Default 0.85. */
  edgeBlur: number
  /** Frosted-glass noise multiplier. 0 = off (default). Increase for a
   *  diffused, sandblasted look. Per-component intensity still scales
   *  by `(1 - thickness)`. */
  frost: number
  /** Bezel band width in CSS pixels — controls how far the rim refraction
   *  + specular reach inward. Default 22. Notebook reference uses ~20–30. */
  bezelWidth: number
  /** Specular highlight angle in radians (0 = +x, π/2 = +y in DOM coords).
   *  Default π/4 ≈ 0.785, matches Chris Feijoo's notebook reference. */
  specularAngle: number
  /** Specular highlight opacity (0–1). Default 0.15 (notebook reference).
   *  Set to 0 to disable the rim specular entirely. */
  specularOpacity: number
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
  glassBlur: 0,
  mergeOnOverlap: true,
  frostBlur: 14,
  edgeBlur: 0.85,
  frost: 0,
  bezelWidth: 22,
  specularAngle: Math.PI / 4,
  specularOpacity: 0.15,
}

export const MAX_BTNS = 16
