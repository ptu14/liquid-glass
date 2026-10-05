import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  BLUR_FRAGMENT_SHADER,
  COMPOSITE_FRAGMENT_SHADER,
} from './shaders'
import {
  type GlassComponentData,
  type GlassParams,
  type ComponentAnimState,
  DEFAULT_GLASS_PARAMS,
  MAX_BTNS,
} from './types'
import { tickBlendK } from './utils'

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }
  return shader
}

function linkProgram(
  gl: WebGLRenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.bindAttribLocation(program, 0, 'a_position')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${info}`)
  }
  return program
}

export class LiquidGlassRenderer {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private compositeProgram: WebGLProgram
  private bgTexture: WebGLTexture
  private bgSource: () => HTMLCanvasElement
  private params: GlassParams
  private components: GlassComponentData[] = []
  private animStates: Map<string, ComponentAnimState> = new Map()
  private rafId: number | null = null
  private startTime: number = 0
  private lastBgCapture: number = 0
  private lastTickTime: number = 0
  private canvas: HTMLCanvasElement
  private destroyed = false

  // SDF union relaxation: when overlapping DOM rects are detected,
  // blendK animates to 0 so smin becomes min() = clean shape union.
  private mergeRelaxT: Map<string, number> = new Map() // 0 = smin, 1 = hard min

  // Fuse-on-overlap: per-component morph progress toward the group's
  // bounding rect, plus the partners it is fused with (kept while
  // separating so the shape stretches back instead of popping).
  private fuseState: Map<string, { t: number; partners: Set<string> }> = new Map()
  // Rects actually sent to the shader this frame (morphed when fused)
  private shaderRects: Map<string, DOMRect> = new Map()

  // Animated pressed intensity per component (0..1, smoothly interpolated)
  private pressedT: Map<string, number> = new Map()

  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private compositeUniforms: Record<string, WebGLUniformLocation | null> = {}
  private blurProgram: WebGLProgram
  private blurUniforms: Record<string, WebGLUniformLocation | null> = {}

  // FBO for multi-pass rendering
  private glassFbo: WebGLFramebuffer | null = null
  private glassFboTex: WebGLTexture | null = null
  private compositeFbo: WebGLFramebuffer | null = null
  private compositeFboTex: WebGLTexture | null = null
  private fboWidth = 0
  private fboHeight = 0

  // FBOs for two-pass Gaussian blur
  private blurFboA: WebGLFramebuffer | null = null
  private blurFboTexA: WebGLTexture | null = null
  private blurFboB: WebGLFramebuffer | null = null
  private blurFboTexB: WebGLTexture | null = null
  // Third target: per-component frost blur (independent of glassBlur)
  private blurFboC: WebGLFramebuffer | null = null
  private blurFboTexC: WebGLTexture | null = null
  private blurFboWidth = 0
  private blurFboHeight = 0

  constructor(canvas: HTMLCanvasElement, bgSource: () => HTMLCanvasElement) {
    this.canvas = canvas
    this.bgSource = bgSource
    this.params = { ...DEFAULT_GLASS_PARAMS }

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl

    gl.getExtension('OES_standard_derivatives')

    // Glass program
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    this.program = linkProgram(gl, vs, fs)
    gl.deleteShader(fs)

    // Composite program (reuses same vertex shader)
    const cfs = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      COMPOSITE_FRAGMENT_SHADER,
    )
    this.compositeProgram = linkProgram(gl, vs, cfs)
    gl.deleteShader(cfs)

    // Blur program (reuses same vertex shader)
    const bfs = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      BLUR_FRAGMENT_SHADER,
    )
    this.blurProgram = linkProgram(gl, vs, bfs)
    gl.deleteShader(vs)
    gl.deleteShader(bfs)

    // Fullscreen quad (shared by both programs via attrib location 0)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // Cache glass uniform locations
    gl.useProgram(this.program)
    const uniformNames = [
      'u_bg',
      'u_res',
      'u_btnCount',
      'u_dispStr',
      'u_aberr',
      'u_refr',
      'u_flipBg',
      'u_time',
      'u_frost',
      'u_bezelW',
      'u_specAngle',
      'u_specOpacity',
      'u_bgRaw',
      'u_bgFrost',
      'u_flipAux',
      'u_edgeBlur',
      'u_auxIsBg',
    ]
    for (const name of uniformNames) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name)
    }
    for (let i = 0; i < MAX_BTNS; i++) {
      this.uniforms[`u_btns[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_btns[${i}]`,
      )
      this.uniforms[`u_blendK[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_blendK[${i}]`,
      )
      this.uniforms[`u_radii[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_radii[${i}]`,
      )
      this.uniforms[`u_thickness[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_thickness[${i}]`,
      )
      this.uniforms[`u_pressed[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_pressed[${i}]`,
      )
      this.uniforms[`u_tintColor[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_tintColor[${i}]`,
      )
      this.uniforms[`u_material[${i}]`] = gl.getUniformLocation(
        this.program,
        `u_material[${i}]`,
      )
    }

    // Cache composite uniform locations
    gl.useProgram(this.compositeProgram)
    this.compositeUniforms['u_bg'] = gl.getUniformLocation(
      this.compositeProgram,
      'u_bg',
    )
    this.compositeUniforms['u_glass'] = gl.getUniformLocation(
      this.compositeProgram,
      'u_glass',
    )

    // Cache blur uniform locations
    gl.useProgram(this.blurProgram)
    this.blurUniforms['u_tex'] = gl.getUniformLocation(this.blurProgram, 'u_tex')
    this.blurUniforms['u_dir'] = gl.getUniformLocation(this.blurProgram, 'u_dir')
    this.blurUniforms['u_radius'] = gl.getUniformLocation(this.blurProgram, 'u_radius')

    // Background texture
    this.bgTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.bgTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    // Blending
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  // ── FBO management ───────────────────────────────────────

  private ensureFboSize(w: number, h: number): void {
    if (this.fboWidth === w && this.fboHeight === h) return
    const gl = this.gl

    // Helper to create/resize an FBO with a color texture
    const setupFbo = (
      fbo: WebGLFramebuffer | null,
      tex: WebGLTexture | null,
    ): [WebGLFramebuffer, WebGLTexture] => {
      const f = fbo ?? gl.createFramebuffer()!
      const t = tex ?? gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      )
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        t,
        0,
      )
      return [f, t]
    }

    ;[this.glassFbo, this.glassFboTex] = setupFbo(
      this.glassFbo,
      this.glassFboTex,
    )
    ;[this.compositeFbo, this.compositeFboTex] = setupFbo(
      this.compositeFbo,
      this.compositeFboTex,
    )

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.fboWidth = w
    this.fboHeight = h
  }

  // ── Blur FBO management ─────────────────────────────────

  private ensureBlurFboSize(w: number, h: number): void {
    if (this.blurFboWidth === w && this.blurFboHeight === h) return
    const gl = this.gl

    const setupFbo = (
      fbo: WebGLFramebuffer | null,
      tex: WebGLTexture | null,
    ): [WebGLFramebuffer, WebGLTexture] => {
      const f = fbo ?? gl.createFramebuffer()!
      const t = tex ?? gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      return [f, t]
    }

    ;[this.blurFboA, this.blurFboTexA] = setupFbo(this.blurFboA, this.blurFboTexA)
    ;[this.blurFboB, this.blurFboTexB] = setupFbo(this.blurFboB, this.blurFboTexB)
    ;[this.blurFboC, this.blurFboTexC] = setupFbo(this.blurFboC, this.blurFboTexC)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.blurFboWidth = w
    this.blurFboHeight = h
  }

  // ── Two-pass Gaussian blur ─────────────────────────────

  private blurBackground(
    w: number,
    h: number,
    radius = this.params.glassBlur,
    out: 'B' | 'C' = 'B',
  ): WebGLTexture {
    const gl = this.gl

    this.ensureBlurFboSize(w, h)
    gl.useProgram(this.blurProgram)
    gl.uniform1f(this.blurUniforms['u_radius']!, radius)
    gl.uniform1i(this.blurUniforms['u_tex']!, 0)

    // Pass 1: Horizontal blur — bgTexture → blurFboA
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFboA)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.bgTexture)
    gl.uniform2f(this.blurUniforms['u_dir']!, 1.0 / w, 0.0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Pass 2: Vertical blur — blurFboA → blurFboB (or C)
    gl.bindFramebuffer(gl.FRAMEBUFFER, out === 'B' ? this.blurFboB : this.blurFboC)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindTexture(gl.TEXTURE_2D, this.blurFboTexA!)
    gl.uniform2f(this.blurUniforms['u_dir']!, 0.0, 1.0 / h)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return out === 'B' ? this.blurFboTexB! : this.blurFboTexC!
  }

  // ── Glass render pass ────────────────────────────────────

  private renderGlassPass(
    components: GlassComponentData[],
    bgTex: WebGLTexture,
    flipBg: number,
    target: WebGLFramebuffer | null,
    w: number,
    h: number,
    now: number,
    clear = true,
    rawTex: WebGLTexture = bgTex,
    frostTex: WebGLTexture = bgTex,
  ): void {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    gl.viewport(0, 0, w, h)
    if (clear) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    if (components.length === 0) return

    gl.useProgram(this.program)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.uniform1i(this.uniforms['u_bg']!, 0)
    // Raw / frost sources always have the bg texture's orientation
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, rawTex)
    gl.uniform1i(this.uniforms['u_bgRaw']!, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, frostTex)
    gl.uniform1i(this.uniforms['u_bgFrost']!, 2)
    gl.uniform1f(this.uniforms['u_flipAux']!, 1.0)
    gl.uniform1f(this.uniforms['u_edgeBlur']!, this.params.edgeBlur)
    gl.uniform1f(this.uniforms['u_auxIsBg']!, flipBg)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform2f(this.uniforms['u_res']!, w, h)
    gl.uniform1i(this.uniforms['u_btnCount']!, components.length)
    gl.uniform1f(this.uniforms['u_dispStr']!, this.params.dispStr)
    gl.uniform1f(this.uniforms['u_aberr']!, this.params.aberr)
    gl.uniform1f(this.uniforms['u_refr']!, this.params.refr)
    gl.uniform1f(this.uniforms['u_flipBg']!, flipBg)
    gl.uniform1f(this.uniforms['u_time']!, now * 0.001)
    gl.uniform1f(this.uniforms['u_frost']!, this.params.frost)
    gl.uniform1f(this.uniforms['u_bezelW']!, this.params.bezelWidth)
    gl.uniform1f(this.uniforms['u_specAngle']!, this.params.specularAngle)
    gl.uniform1f(this.uniforms['u_specOpacity']!, this.params.specularOpacity)

    for (let i = 0; i < components.length; i++) {
      const comp = components[i]
      const rect = this.shaderRects.get(comp.id) ?? comp.rect
      const state = this.animStates.get(comp.id)

      gl.uniform4f(
        this.uniforms[`u_btns[${i}]`]!,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      )

      let animatedK = state
        ? tickBlendK(state, comp.blend ?? this.params.blend, now)
        : comp.blendK
      // SDF union: decay blendK → 0 after overlap (min instead of smin)
      const relaxT = this.mergeRelaxT.get(comp.id) ?? 0
      if (relaxT > 0) animatedK *= 1 - relaxT
      gl.uniform1f(this.uniforms[`u_blendK[${i}]`]!, animatedK)
      // Clamp borderRadius so it never exceeds half the smallest dimension,
      // otherwise the SDF inverts and the glass disappears.
      const maxR = Math.min(rect.width, rect.height) / 2
      gl.uniform1f(this.uniforms[`u_radii[${i}]`]!, Math.min(comp.borderRadius, maxR))
      gl.uniform1f(
        this.uniforms[`u_thickness[${i}]`]!,
        comp.thickness ?? 1.0,
      )
      gl.uniform1f(
        this.uniforms[`u_pressed[${i}]`]!,
        this.pressedT.get(comp.id) ?? 0,
      )
      const tc = comp.tintColor ?? [0, 0, 0]
      gl.uniform3f(this.uniforms[`u_tintColor[${i}]`]!, tc[0], tc[1], tc[2])
      gl.uniform2f(
        this.uniforms[`u_material[${i}]`]!,
        comp.frost ?? 0,
        comp.clear ? 1 : 0,
      )
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  // ── Composite pass (blend original bg + glass FBO) ───────

  private renderCompositePass(
    bgTex: WebGLTexture,
    glassTex: WebGLTexture,
    target: WebGLFramebuffer | null,
    w: number,
    h: number,
  ): void {
    const gl = this.gl

    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this.compositeProgram)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.uniform1i(this.compositeUniforms['u_bg']!, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, glassTex)
    gl.uniform1i(this.compositeUniforms['u_glass']!, 1)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  // ── Public API ───────────────────────────────────────────

  setComponents(components: GlassComponentData[]): void {
    this.components = components.slice(0, MAX_BTNS)

    for (const comp of this.components) {
      if (!this.animStates.has(comp.id)) {
        this.animStates.set(comp.id, {
          locked: comp.locked,
          animStart: null,
          animDir: comp.locked ? -1 : 1,
          blendK: comp.locked ? 0 : comp.blend ?? this.params.blend,
        })
      } else {
        const state = this.animStates.get(comp.id)!
        if (state.locked !== comp.locked) {
          state.locked = comp.locked
          state.animStart = performance.now()
          state.animDir = comp.locked ? -1 : 1
        }
      }
    }

    const activeIds = new Set(this.components.map((c) => c.id))
    for (const id of this.animStates.keys()) {
      if (!activeIds.has(id)) this.animStates.delete(id)
    }
  }

  setParams(params: Partial<GlassParams>): void {
    Object.assign(this.params, params)
  }

  start(): void {
    this.startTime = performance.now()
    this.lastBgCapture = 0
    this.tick()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  destroy(): void {
    this.destroyed = true
    this.stop()
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteProgram(this.compositeProgram)
    gl.deleteProgram(this.blurProgram)
    gl.deleteTexture(this.bgTexture)
    if (this.glassFboTex) gl.deleteTexture(this.glassFboTex)
    if (this.compositeFboTex) gl.deleteTexture(this.compositeFboTex)
    if (this.glassFbo) gl.deleteFramebuffer(this.glassFbo)
    if (this.compositeFbo) gl.deleteFramebuffer(this.compositeFbo)
    if (this.blurFboTexA) gl.deleteTexture(this.blurFboTexA)
    if (this.blurFboTexB) gl.deleteTexture(this.blurFboTexB)
    if (this.blurFboA) gl.deleteFramebuffer(this.blurFboA)
    if (this.blurFboB) gl.deleteFramebuffer(this.blurFboB)
  }

  // ── Render loop ──────────────────────────────────────────

  // ── Fuse on overlap ─────────────────────────────────────
  // A hard min() union of two rounded rects leaves a pinched notch (and a
  // refraction seam) where they meet, so two docked panels still read as
  // two pieces. Each component in an overlapping same-layer group morphs
  // its shader rect toward the group's bounding box, weighted by how well
  // the union fills that box: a footer docked under a same-width card
  // (fill ≈ 1) becomes one rounded rect, a diagonal overlap (low fill)
  // keeps its own shape. Partners are remembered after separation, and
  // since the fill drops continuously as the gap opens, the body stretches
  // and pinches apart instead of popping.
  private tickFuse(dt: number): void {
    const FILL_LO = 0.78 // below: no fuse
    const FILL_HI = 0.94 // above: fully fused
    const follow = Math.min(1, dt / 60) // ~60ms smoothing
    const GAP_FADE = this.params.blend * 0.4 // px of gap where fusing ends

    const comps = this.components
    const byId = new Map(comps.map((c) => [c.id, c]))
    const groupOf = new Map<string, Set<string>>()

    {
      // Opt-in per component: only `fuse` components that are unlocked
      const eligible = comps.filter((c) => c.fuse && c.blendK >= 0.5)
      const inset = this.params.blend * 0.5
      // Contained shapes are hidden inside their host — fusing them would
      // only morph them into the host's box (and inflate it via smin).
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom &&
        !contains(a, b, inset) && !contains(b, a, inset)

      // Connected groups of overlapping same-layer components
      const seen = new Set<string>()
      for (const start of eligible) {
        if (seen.has(start.id)) continue
        const group: GlassComponentData[] = []
        const stack = [start]
        seen.add(start.id)
        while (stack.length) {
          const c = stack.pop()!
          group.push(c)
          for (const o of eligible) {
            if (seen.has(o.id) || (o.layer ?? 0) !== (c.layer ?? 0)) continue
            if (overlaps(c.rect, o.rect)) {
              seen.add(o.id)
              stack.push(o)
            }
          }
        }
        if (group.length < 2) continue
        for (const c of group) {
          groupOf.set(c.id, new Set(group.filter((o) => o !== c).map((o) => o.id)))
        }
      }
    }

    // Overlapping now → adopt the live group; otherwise keep fading with
    // the last partners (fill falls as they drift apart).
    for (const [id, partners] of groupOf) {
      const st = this.fuseState.get(id)
      if (st) st.partners = partners
      else this.fuseState.set(id, { t: 0, partners })
    }

    this.shaderRects.clear()
    for (const [id, st] of this.fuseState) {
      const comp = byId.get(id)
      const rects = comp ? [comp.rect] : []
      if (comp) {
        for (const pid of st.partners) {
          const p = byId.get(pid)
          if (p && p.fuse && (p.layer ?? 0) === (comp.layer ?? 0)) rects.push(p.rect)
        }
      }
      let target = 0
      let box: DOMRect | null = null
      if (comp && comp.fuse && rects.length > 1) {
        box = boundingRect(rects)
        const fill = unionArea(rects) / Math.max(1, box.width * box.height)
        const u = Math.min(1, Math.max(0, (fill - FILL_LO) / (FILL_HI - FILL_LO)))
        // Fill alone stays high for long shapes with a small gap (a wide
        // pill + a button 12px away), so also fade out with the actual gap:
        // touching → fused, a few px apart → just the smin bridge.
        let gap = Infinity
        for (let k = 1; k < rects.length; k++) gap = Math.min(gap, rectGap(comp.rect, rects[k]))
        const g = Math.min(1, gap / GAP_FADE)
        target = u * u * (3 - 2 * u) * (1 - g * g * (3 - 2 * g)) // smoothsteps
      }
      st.t += (target - st.t) * follow
      if (!comp || !box || (st.t < 0.002 && !groupOf.has(id))) {
        this.fuseState.delete(id)
        continue
      }
      // Rise smoothly, but never exceed the current geometric target: when
      // the group changes (a new partner joins), the box jumps — a lagging
      // t would briefly stretch the shape over the whole new box.
      const e = Math.min(st.t, target)
      const r = comp.rect
      this.shaderRects.set(
        id,
        new DOMRect(
          r.x + (box.x - r.x) * e,
          r.y + (box.y - r.y) * e,
          r.width + (box.width - r.width) * e,
          r.height + (box.height - r.height) * e,
        ),
      )
    }
  }

  private tick = (): void => {
    if (this.destroyed) return
    this.rafId = requestAnimationFrame(this.tick)
    const now = performance.now()
    const gl = this.gl
    const canvas = this.canvas

    // Resize canvas 1:1 with CSS pixels
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    // Capture background
    if (now - this.lastBgCapture >= this.params.bgCaptureInterval) {
      this.lastBgCapture = now
      try {
        const bgCanvas = this.bgSource()
        gl.bindTexture(gl.TEXTURE_2D, this.bgTexture)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bgCanvas,
        )
      } catch {
        // bg source not ready yet
      }
    }

    if (this.components.length === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      this.lastTickTime = now
      return
    }

    const dt = this.lastTickTime > 0 ? now - this.lastTickTime : 16
    this.lastTickTime = now

    // ── SDF union on overlap ──────────────────────────
    // When mergeOnOverlap is enabled, unlocked same-layer components relax
    // their blendK toward 0 (smin → min) in proportion to how deeply their
    // DOM rects interpenetrate. Light contact keeps the liquid smin bridge,
    // so shapes visibly neck and pinch off as they separate; deep overlap
    // gives a clean union without the persistent smin bulge.
    if (this.params.mergeOnOverlap) {
      const fullDepth = Math.max(1, this.params.blend * 2) // px of overlap for a hard union
      const follow = Math.min(1, dt / 50) // ~50ms smoothing against rect jitter
      for (const comp of this.components) {
        if (comp.blendK < 0.5 || comp.metaball) continue
        let depth = 0
        for (const other of this.components) {
          if (other.id === comp.id || other.blendK < 0.5) continue
          if ((comp.layer ?? 0) !== (other.layer ?? 0)) continue
          const a = comp.rect
          const b = other.rect
          // A shape tucked fully inside another is invisible — it must not
          // switch off the outer shape's liquid bridge to its neighbours.
          const m = this.params.blend * 0.5
          if (contains(a, b, m) || contains(b, a, m)) continue
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (ox > 0 && oy > 0) depth = Math.max(depth, Math.min(ox, oy))
        }
        const target = Math.min(1, depth / fullDepth)
        const cur = this.mergeRelaxT.get(comp.id) ?? 0
        const next = cur + (target - cur) * follow
        if (next > 0.001) this.mergeRelaxT.set(comp.id, next)
        else this.mergeRelaxT.delete(comp.id)
      }
    }

    this.tickFuse(dt)

    // ── Animate pressed tint (smooth 0↔1) ────────
    const PRESS_IN = 1 / 120   // reach 1.0 in ~120ms
    const PRESS_OUT = 1 / 200  // fade out in ~200ms
    for (const comp of this.components) {
      const cur = this.pressedT.get(comp.id) ?? 0
      const target = comp.pressed ? 1 : 0
      if (target > cur) {
        this.pressedT.set(comp.id, Math.min(1, cur + PRESS_IN * dt))
      } else if (target < cur) {
        const next = Math.max(0, cur - PRESS_OUT * dt)
        if (next > 0) this.pressedT.set(comp.id, next)
        else this.pressedT.delete(comp.id)
      }
    }

    // ── Pre-blur background (two-pass Gaussian) ────────
    // Skip the blur pass when radius is 0 — bgTexture has the same orientation,
    // so flipBg=1.0 stays correct downstream.
    const blurredBg =
      this.params.glassBlur > 0 ? this.blurBackground(w, h) : this.bgTexture
    // Blurred source for frost + rim blur — only computed when used
    const frostTex =
      this.params.frostBlur > 0 &&
      (this.params.edgeBlur > 0 || this.components.some((c) => (c.frost ?? 0) > 0))
      ? this.blurBackground(w, h, this.params.frostBlur, 'C')
      : blurredBg

    // Split components by layer
    const layer0 = this.components.filter((c) => (c.layer ?? 0) === 0)
    const layer1 = this.components.filter((c) => (c.layer ?? 0) === 1)

    if (layer1.length === 0) {
      // Single pass — all components on layer 0
      this.renderGlassPass(
        layer0,
        blurredBg,
        1.0,
        null,
        w,
        h,
        now,
        true,
        blurredBg,
        frostTex,
      )
    } else {
      // Multi-pass: layer 0 → composite → layer 1
      this.ensureFboSize(w, h)

      // Pass 1a: Render layer 0 to FBO (for compositing into layer 1's bg)
      this.renderGlassPass(
        layer0,
        blurredBg,
        1.0,
        this.glassFbo,
        w,
        h,
        now,
        true,
        blurredBg,
        frostTex,
      )

      // Pass 1b: Render layer 0 to screen (so the card is visible)
      this.renderGlassPass(
        layer0,
        blurredBg,
        1.0,
        null,
        w,
        h,
        now,
        true,
        blurredBg,
        frostTex,
      )

      // Composite: blend blurred bg + layer 0 glass → FBO B
      this.renderCompositePass(
        blurredBg,
        this.glassFboTex!,
        this.compositeFbo,
        w,
        h,
      )

      // Pass 2: Render layer 1 to screen on top (bg = composite FBO, no flip, no clear)
      this.renderGlassPass(
        layer1,
        this.compositeFboTex!,
        0.0,
        null,
        w,
        h,
        now,
        false,
        blurredBg,
        frostTex,
      )
    }
  }
}

function boundingRect(rects: DOMRect[]): DOMRect {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
  for (const x of rects) {
    l = Math.min(l, x.left)
    t = Math.min(t, x.top)
    r = Math.max(r, x.right)
    b = Math.max(b, x.bottom)
  }
  return new DOMRect(l, t, r - l, b - t)
}

/** Exact area of a union of axis-aligned rects (coordinate compression). */
function unionArea(rects: DOMRect[]): number {
  const xs: number[] = []
  const ys: number[] = []
  for (const r of rects) xs.push(r.left, r.right), ys.push(r.top, r.bottom)
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  let area = 0
  for (let i = 0; i < xs.length - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2
    for (let j = 0; j < ys.length - 1; j++) {
      const cy = (ys[j] + ys[j + 1]) / 2
      if (rects.some((r) => cx > r.left && cx < r.right && cy > r.top && cy < r.bottom)) {
        area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
      }
    }
  }
  return area
}

/** True when `inner` lies within `outer`, at least `margin` px from every
 *  edge. The margin keeps coincident shapes (e.g. two stacked droplets)
 *  out — their smin would inflate, so they still need relax/fuse. */
function contains(outer: DOMRect, inner: DOMRect, margin: number): boolean {
  return (
    inner.left >= outer.left + margin &&
    inner.right <= outer.right - margin &&
    inner.top >= outer.top + margin &&
    inner.bottom <= outer.bottom - margin
  )
}

/** Shortest distance between two rects (0 when they touch or overlap). */
function rectGap(a: DOMRect, b: DOMRect): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right)
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom)
  return Math.hypot(dx, dy)
}
