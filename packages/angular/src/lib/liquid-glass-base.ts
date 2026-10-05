import {
  Directive,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  NgZone,
  inject,
} from '@angular/core'
import {
  createGlassId,
  rubberBand,
  VARIANT_TINT,
  type GlassComponentData,
  type GlassVariant,
} from '@daniluk/liquid-glass'
import { LiquidGlassService } from './liquid-glass.service'

export { rubberBand, VARIANT_TINT, type GlassVariant }

/**
 * Abstract base class for all Liquid Glass Angular components / directives.
 *
 * Handles:
 * - Unique component ID generation
 * - Registration / unregistration with `LiquidGlassService`
 * - Building `GlassComponentData` from the host element
 * - `borderRadius` sync to the host element's style
 * - Press-to-expand with rubber-band physics (opt-in via `pressExpand > 0`)
 *
 * Subclasses may override `getData()` to enrich the component data
 * (e.g. button adds `tintColor` resolved from `variant`).
 *
 * Uses `inject()` so subclasses don't need to forward constructor params.
 */
@Directive()
export abstract class LiquidGlassBase implements AfterViewInit, OnDestroy {
  protected id = createGlassId()
  protected el: HTMLElement = inject(ElementRef).nativeElement
  protected glassService = inject(LiquidGlassService)
  protected ngZone = inject(NgZone)

  borderRadius = 100
  thickness = 1.0
  layer = 0
  locked = false
  pressed = false
  tintColor?: [number, number, number]
  /** 0–1 frosted material (blurred + milky). */
  frost = 0
  /** Layer 1: clear window through the glass beneath. */
  clear = false
  /** Fuse into one body with overlapping `fuse` components. */
  fuse = false
  /** Own smooth-blend radius in px (overrides the global `blend`). */
  blend?: number
  /** Keep the smooth blob merge while overlapping. */
  metaball = false

  // ── Press-to-expand + rubber-band (opt-in) ──────────────
  /** Expand by this many CSS px on each side when pressed. 0 = disabled. */
  pressExpand = 0
  /** Rubber-band magnetic strength. */
  magnetStrength = 0.45
  /** Rubber-band max displacement in px. */
  magnetMax = 5
  /** Whether the component starts locked. */
  initialLocked = true

  /** Whether a press gesture is currently active (pointer is down). */
  protected pressActive = false
  private wasLockedBeforePress = false
  private startPos = { x: 0, y: 0 }
  private userTransform = ''
  /** Computed scale factors for the current press, based on element size. */
  private pressScaleX = 1
  private pressScaleY = 1

  private boundOnPressUp = this._onPressUp.bind(this)
  private boundOnPressMove = this._onPressMove.bind(this)
  private pressListenersAttached = false

  ngAfterViewInit(): void {
    this.el.style.borderRadius = `${this.borderRadius}px`
    this.glassService.register(this.id, () => this.getData())
  }

  ngOnDestroy(): void {
    this.glassService.unregister(this.id)
    this.teardownPressListeners()
  }

  protected getData(): GlassComponentData {
    return {
      id: this.id,
      rect: this.el.getBoundingClientRect(),
      borderRadius: this.borderRadius,
      blendK: this.locked ? 0 : 60,
      locked: this.locked,
      thickness: this.thickness,
      layer: this.layer,
      pressed: this.pressed,
      tintColor: this.tintColor,
      frost: this.frost,
      clear: this.clear,
      fuse: this.fuse,
      blend: this.blend,
      metaball: this.metaball,
    }
  }

  toggleLock(): void {
    this.locked = !this.locked
  }

  setLocked(locked: boolean): void {
    this.locked = locked
  }

  // ── Press interaction ───────────────────────────────────

  /** Attach window-level pointer listeners. Call from subclass ngAfterViewInit. */
  protected setupPressListeners(): void {
    if (this.pressListenersAttached) return
    this.pressListenersAttached = true
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('pointerup', this.boundOnPressUp)
      window.addEventListener('pointermove', this.boundOnPressMove)
    })
  }

  /** Remove window-level pointer listeners. Called automatically in ngOnDestroy. */
  protected teardownPressListeners(): void {
    if (!this.pressListenersAttached) return
    this.pressListenersAttached = false
    window.removeEventListener('pointerup', this.boundOnPressUp)
    window.removeEventListener('pointermove', this.boundOnPressMove)
  }

  /** Call from host (pointerdown) binding. */
  protected onPressDown(e: PointerEvent): void {
    if (this.pressExpand <= 0) return

    this.startPos = { x: e.clientX, y: e.clientY }
    this.pressActive = true
    this.pressed = true

    // Unlock for SDF smin merge
    this.wasLockedBeforePress = this.locked
    if (this.locked) this.locked = false

    // Read current transform set by the consumer (e.g. translate(-50%, -50%))
    this.userTransform =
      this.el.style.transform?.replace(/\s*scale\([^)]*\)/g, '').trim() ?? ''

    // Compute per-axis scale so the element grows by exactly pressExpand px on each side
    const rect = this.el.getBoundingClientRect()
    const px = this.pressExpand * 2 // total growth = 2 × per-side
    this.pressScaleX = rect.width > 0 ? (rect.width + px) / rect.width : 1
    this.pressScaleY = rect.height > 0 ? (rect.height + px) / rect.height : 1

    // Apply scale
    const t = `scale(${this.pressScaleX}, ${this.pressScaleY})`
    this.el.style.transform = this.userTransform
      ? `${this.userTransform} ${t}`
      : t
  }

  /**
   * Hook called when the pointer is released after a press.
   * Default: restore pressed=false and re-lock if it was locked before.
   * Subclasses may override (e.g. input stays pressed while focused).
   */
  protected onPressRelease(): void {
    this.pressed = false
    if (this.wasLockedBeforePress) this.locked = true
  }

  private _onPressUp(): void {
    if (!this.pressActive) return
    this.pressActive = false
    this.onPressRelease()

    const t = 'scale(1)'
    this.el.style.transition =
      'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'
    this.el.style.transform = this.userTransform
      ? `${this.userTransform} ${t}`
      : t
  }

  private _onPressMove(e: PointerEvent): void {
    if (!this.pressActive) return
    const dx = rubberBand(
      e.clientX - this.startPos.x,
      this.magnetStrength,
      this.magnetMax,
    )
    const dy = rubberBand(
      e.clientY - this.startPos.y,
      this.magnetStrength,
      this.magnetMax,
    )
    const t = `translate(${dx}px, ${dy}px) scale(${this.pressScaleX}, ${this.pressScaleY})`
    this.el.style.transition = 'none'
    this.el.style.transform = this.userTransform
      ? `${this.userTransform} ${t}`
      : t
  }
}
