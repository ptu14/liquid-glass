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
}

export interface GlassParams {
  blend: number
  dispStr: number
  aberr: number
  refr: number
  bgCaptureInterval: number
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
  blend: 50,
  dispStr: 0.028,
  aberr: 0.006,
  refr: 3.5,
  bgCaptureInterval: 16,
  mergeOnOverlap: true,
}

export const MAX_BTNS = 8
