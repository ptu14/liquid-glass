import { BackgroundCapture, type BackgroundOptions } from './background'
import { ensureFocusRingStyles } from './focus'
import { LiquidGlassRenderer } from './LiquidGlassRenderer'
import type { GlassComponentData, GlassParams } from './types'

export interface LiquidGlassHostOptions extends BackgroundOptions {
  params?: Partial<GlassParams>
}

/**
 * Wires a WebGL canvas, the renderer, background capture and a registry of
 * glass components together, and runs the frame loop. Framework adapters
 * (React provider, Angular container) and the vanilla `LiquidGlass` class
 * are thin wrappers around this.
 *
 * Throws if WebGL (with `OES_standard_derivatives`) is unavailable.
 */
export class LiquidGlassHost {
  readonly background: BackgroundCapture
  private renderer: LiquidGlassRenderer
  private registry = new Map<string, () => GlassComponentData>()
  private rafId = 0
  private destroyed = false

  constructor(readonly canvas: HTMLCanvasElement, opts: LiquidGlassHostOptions = {}) {
    ensureFocusRingStyles()
    this.background = new BackgroundCapture(opts)
    try {
      this.renderer = new LiquidGlassRenderer(canvas, () =>
        this.background.draw(canvas.clientWidth, canvas.clientHeight),
      )
    } catch (e) {
      this.background.destroy()
      throw e
    }
    if (opts.params) this.renderer.setParams(opts.params)

    // Registered before the renderer's own rAF, so each frame renders the
    // component rects read in that same frame.
    const loop = () => {
      if (this.destroyed) return
      const data: GlassComponentData[] = []
      for (const getData of this.registry.values()) data.push(getData())
      this.renderer.setComponents(data)
      this.rafId = requestAnimationFrame(loop)
    }
    loop()
    this.renderer.start()
  }

  /** Register a component; `getData` is read every frame. Returns unregister. */
  register(id: string, getData: () => GlassComponentData): () => void {
    this.registry.set(id, getData)
    return () => this.unregister(id)
  }

  unregister(id: string): void {
    this.registry.delete(id)
  }

  setParams(params: Partial<GlassParams>): void {
    this.renderer.setParams(params)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.rafId)
    this.renderer.destroy()
    this.background.destroy()
    this.registry.clear()
  }
}
