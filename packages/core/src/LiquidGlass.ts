import type { BgRenderer } from './background'
import { createGlassId } from './helpers'
import { FOCUS_RING_CLASS } from './focus'
import { LiquidGlassHost } from './host'
import type { GlassParams } from './types'

export interface LiquidGlassOptions {
  /** Element whose content shows through the glass (captured with SnapDOM). */
  bgElement?: HTMLElement | null
  /** Static image drawn as the base layer (CSS `cover`). */
  bgImage?: string | null
  /** Custom base layer drawn every frame (replaces `bgImage`). */
  bgRenderer?: BgRenderer | null
  /** Shader tunables. */
  params?: Partial<GlassParams>
  /** Use this canvas instead of creating a fixed full-screen one. */
  canvas?: HTMLCanvasElement
  /** z-index of the created canvas. Default 10. */
  zIndex?: number
}

export interface GlassOptions {
  /** Corner radius in px. Default: the element's computed `border-top-left-radius`. */
  radius?: number
  /** 0 = no glass, 1 = full material, ~0.35 = thin. Default 1. */
  thickness?: number
  /** 0 = base layer, 1 = rendered on top of layer 0. Default 0. */
  layer?: number
  /** RGB tint [0–1]. Darkens while pressed. */
  tint?: [number, number, number]
  /** 0–1 frosted material (blurred + milky). Default 0. */
  frost?: number
  /** Layer 1: clear window through the glass beneath. Default false. */
  clear?: boolean
  /** Fuse into one body with overlapping `fuse` components. Default false. */
  fuse?: boolean
  /** Own smooth-blend radius in px (overrides the global `blend`). */
  blend?: number
  /** Keep the smooth blob merge while overlapping. Default false. */
  metaball?: boolean
  /** Opt out of merging with neighbours (animates over 500 ms). Default false. */
  locked?: boolean
  /** Tint/darken while the pointer is down. Default: true for `<button>` and `<a>`. */
  pressable?: boolean
}

export interface GlassHandle {
  /** Merge new options; takes effect next frame. */
  update(options: Partial<GlassOptions>): void
  /** Stop rendering glass for this element. */
  remove(): void
}

/**
 * Framework-free entry point. Creates a full-screen WebGL canvas and turns
 * DOM elements into liquid glass.
 *
 * ```js
 * const glass = new LiquidGlass({ bgElement: document.querySelector('main') })
 * glass.add(document.querySelector('nav'))
 * ```
 */
export class LiquidGlass {
  readonly canvas: HTMLCanvasElement
  private host: LiquidGlassHost
  private ownsCanvas: boolean
  private handles = new Set<GlassHandle>()

  constructor(opts: LiquidGlassOptions = {}) {
    this.ownsCanvas = !opts.canvas
    const canvas = opts.canvas ?? document.createElement('canvas')
    if (this.ownsCanvas) {
      Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: String(opts.zIndex ?? 10),
      })
      document.body.appendChild(canvas)
    }
    this.canvas = canvas

    try {
      this.host = new LiquidGlassHost(canvas, {
        element: opts.bgElement,
        image: opts.bgImage,
        renderer: opts.bgRenderer,
        params: opts.params,
      })
    } catch (e) {
      if (this.ownsCanvas) canvas.remove()
      throw e
    }
  }

  /** Turn a DOM element into glass. The element itself should be transparent. */
  add(el: HTMLElement, options: GlassOptions = {}): GlassHandle {
    const id = createGlassId()
    let o = { ...options }
    let pressed = false
    const pressable = o.pressable ?? (el.tagName === 'BUTTON' || el.tagName === 'A')
    const addedRing = !el.classList.contains(FOCUS_RING_CLASS)
    el.classList.add(FOCUS_RING_CLASS)
    const down = () => {
      pressed = true
    }
    const up = () => {
      pressed = false
    }
    if (pressable) {
      el.addEventListener('pointerdown', down)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    }

    this.host.register(id, () => {
      const locked = o.locked ?? false
      return {
        id,
        rect: el.getBoundingClientRect(),
        borderRadius: o.radius ?? (parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0),
        blendK: locked ? 0 : 60,
        locked,
        thickness: o.thickness ?? 1,
        layer: o.layer ?? 0,
        pressed,
        tintColor: o.tint,
        frost: o.frost ?? 0,
        clear: o.clear ?? false,
        fuse: o.fuse ?? false,
        blend: o.blend,
        metaball: o.metaball ?? false,
      }
    })

    const handle: GlassHandle = {
      update: (next) => {
        o = { ...o, ...next }
      },
      remove: () => {
        this.host.unregister(id)
        if (addedRing) el.classList.remove(FOCUS_RING_CLASS)
        el.removeEventListener('pointerdown', down)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        this.handles.delete(handle)
      },
    }
    this.handles.add(handle)
    return handle
  }

  setParams(params: Partial<GlassParams>): void {
    this.host.setParams(params)
  }

  setBgImage(url: string | null): void {
    this.host.background.setImage(url)
  }

  setBgElement(el: HTMLElement | null): void {
    this.host.background.setElement(el)
  }

  setBgRenderer(renderer: BgRenderer | null): void {
    this.host.background.setRenderer(renderer)
  }

  /** Force a background re-capture (e.g. after a canvas/video changed). */
  capture(): void {
    this.host.background.capture()
  }

  destroy(): void {
    this.handles.forEach((h) => h.remove())
    this.host.destroy()
    if (this.ownsCanvas) this.canvas.remove()
  }
}
