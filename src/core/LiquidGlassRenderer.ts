import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
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

  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private compositeUniforms: Record<string, WebGLUniformLocation | null> = {}

  // FBO for multi-pass rendering
  private glassFbo: WebGLFramebuffer | null = null
  private glassFboTex: WebGLTexture | null = null
  private compositeFbo: WebGLFramebuffer | null = null
  private compositeFboTex: WebGLTexture | null = null
  private fboWidth = 0
  private fboHeight = 0

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
    gl.deleteShader(vs)
    gl.deleteShader(cfs)

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
      'u_time',
      'u_btnCount',
      'u_blend',
      'u_dispStr',
      'u_aberr',
      'u_refr',
      'u_flipBg',
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
    gl.uniform2f(this.uniforms['u_res']!, w, h)
    gl.uniform1f(this.uniforms['u_time']!, (now - this.startTime) / 1000)
    gl.uniform1i(this.uniforms['u_btnCount']!, components.length)
    gl.uniform1f(this.uniforms['u_blend']!, this.params.blend)
    gl.uniform1f(this.uniforms['u_dispStr']!, this.params.dispStr)
    gl.uniform1f(this.uniforms['u_aberr']!, this.params.aberr)
    gl.uniform1f(this.uniforms['u_refr']!, this.params.refr)
    gl.uniform1f(this.uniforms['u_flipBg']!, flipBg)

    for (let i = 0; i < components.length; i++) {
      const comp = components[i]
      const rect = comp.rect
      const state = this.animStates.get(comp.id)

      gl.uniform4f(
        this.uniforms[`u_btns[${i}]`]!,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      )

      let animatedK = state
        ? tickBlendK(state, this.params.blend, now)
        : comp.blendK
      // SDF union: decay blendK → 0 after overlap (min instead of smin)
      const relaxT = this.mergeRelaxT.get(comp.id) ?? 0
      if (relaxT > 0) animatedK *= 1 - relaxT
      gl.uniform1f(this.uniforms[`u_blendK[${i}]`]!, animatedK)
      gl.uniform1f(this.uniforms[`u_radii[${i}]`]!, comp.borderRadius)
      gl.uniform1f(
        this.uniforms[`u_thickness[${i}]`]!,
        comp.thickness ?? 1.0,
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
          blendK: comp.locked ? 0 : this.params.blend,
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
    gl.deleteTexture(this.bgTexture)
    if (this.glassFboTex) gl.deleteTexture(this.glassFboTex)
    if (this.compositeFboTex) gl.deleteTexture(this.compositeFboTex)
    if (this.glassFbo) gl.deleteFramebuffer(this.glassFbo)
    if (this.compositeFbo) gl.deleteFramebuffer(this.compositeFbo)
  }

  // ── Render loop ──────────────────────────────────────────

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
    // When mergeOnOverlap is enabled and unlocked same-layer DOM rects
    // physically overlap, animate their blendK → 0 so the shader's
    // smin becomes min() — a clean union of individual shapes.
    if (this.params.mergeOnOverlap) {
      const RELAX_SPEED = 1 / 400 // fully merged in 400ms
      const RESTORE_SPEED = 1 / 200 // restored in 200ms
      for (const comp of this.components) {
        if (comp.blendK < 0.5) continue
        let isOverlapping = false
        for (const other of this.components) {
          if (other.id === comp.id || other.blendK < 0.5) continue
          if ((comp.layer ?? 0) !== (other.layer ?? 0)) continue
          const a = comp.rect
          const b = other.rect
          if (
            a.left < b.right &&
            b.left < a.right &&
            a.top < b.bottom &&
            b.top < a.bottom
          ) {
            isOverlapping = true
            break
          }
        }
        const cur = this.mergeRelaxT.get(comp.id) ?? 0
        if (isOverlapping) {
          this.mergeRelaxT.set(comp.id, Math.min(1, cur + RELAX_SPEED * dt))
        } else {
          const next = Math.max(0, cur - RESTORE_SPEED * dt)
          if (next > 0) this.mergeRelaxT.set(comp.id, next)
          else this.mergeRelaxT.delete(comp.id)
        }
      }
    }

    // Split components by layer
    const layer0 = this.components.filter((c) => (c.layer ?? 0) === 0)
    const layer1 = this.components.filter((c) => (c.layer ?? 0) === 1)

    if (layer1.length === 0) {
      // Single pass — all components on layer 0
      this.renderGlassPass(
        layer0,
        this.bgTexture,
        1.0,
        null,
        w,
        h,
        now,
      )
    } else {
      // Multi-pass: layer 0 → composite → layer 1
      this.ensureFboSize(w, h)

      // Pass 1a: Render layer 0 to FBO (for compositing into layer 1's bg)
      this.renderGlassPass(
        layer0,
        this.bgTexture,
        1.0,
        this.glassFbo,
        w,
        h,
        now,
      )

      // Pass 1b: Render layer 0 to screen (so the card is visible)
      this.renderGlassPass(
        layer0,
        this.bgTexture,
        1.0,
        null,
        w,
        h,
        now,
      )

      // Composite: blend original bg + layer 0 glass → FBO B
      this.renderCompositePass(
        this.bgTexture,
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
      )
    }
  }
}
