import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  NgZone,
  SimpleChanges,
} from '@angular/core'
import { LiquidGlassHost, type BgRenderer, type GlassParams } from '@daniluk/liquid-glass'
import { LiquidGlassService } from './liquid-glass.service'

export type { BgRenderer }

/**
 * Container component that creates the full-screen WebGL canvas, manages
 * the renderer lifecycle, and captures the background.
 *
 * Provides `LiquidGlassService` to its children so they can register
 * themselves with the renderer.
 *
 * Usage:
 * ```html
 * <liquid-glass-container [bgElement]="bgDiv" [bgImage]="'./bg.jpg'">
 *   <liquid-glass-button>Click me</liquid-glass-button>
 * </liquid-glass-container>
 * ```
 */
@Component({
  selector: 'liquid-glass-container',
  standalone: true,
  providers: [LiquidGlassService],
  template: `
    <canvas #glassCanvas
      style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10">
    </canvas>
    <ng-content></ng-content>
  `,
  styles: [':host { display: contents; }'],
})
export class LiquidGlassContainerComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() params?: Partial<GlassParams>
  /** Custom base layer drawn every frame; the bgElement snapshot goes on top. */
  @Input() bgRenderer?: BgRenderer
  /**
   * Element captured with SnapDOM as the background. Elements inside marked
   * `lgTransitionRefresh` (or `data-lg-live`) show hover/focus effects live.
   */
  @Input() bgElement?: HTMLElement
  /** Static background image URL, drawn with CSS `cover` positioning. */
  @Input() bgImage?: string

  @ViewChild('glassCanvas', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>

  private host: LiquidGlassHost | null = null

  constructor(
    private ngZone: NgZone,
    public glassService: LiquidGlassService,
  ) {}

  ngAfterViewInit(): void {
    // Frame loop, scroll/mutation listeners and SnapDOM run outside the
    // zone so they don't trigger change detection.
    this.ngZone.runOutsideAngular(() => {
      try {
        this.host = new LiquidGlassHost(this.canvasRef.nativeElement, {
          params: this.params,
          image: this.bgImage,
          element: this.bgElement,
          renderer: this.wrapRenderer(),
        })
      } catch {
        return // no WebGL — children render as plain DOM
      }
      this.glassService.attach(this.host)
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    const host = this.host
    if (!host) return
    this.ngZone.runOutsideAngular(() => {
      if (changes['params'] && this.params) host.setParams(this.params)
      if (changes['bgImage']) host.background.setImage(this.bgImage ?? null)
      if (changes['bgElement']) host.background.setElement(this.bgElement ?? null)
      if (changes['bgRenderer']) host.background.setRenderer(this.wrapRenderer())
    })
  }

  /**
   * Push a partial param update directly to the WebGL renderer, bypassing
   * Angular change detection. Use for high-frequency live updates (e.g.
   * device-orientation tilt → `specularAngle`) so we don't fire 60×/s CD.
   */
  setLiveParams(partial: Partial<GlassParams>): void {
    this.host?.setParams(partial)
  }

  /** Force a background recapture. */
  capture(): void {
    this.host?.background.capture()
  }

  ngOnDestroy(): void {
    this.glassService.attach(null)
    this.host?.destroy()
    this.host = null
  }

  private wrapRenderer(): BgRenderer | null {
    return this.bgRenderer ? (ctx, w, h) => this.bgRenderer?.(ctx, w, h) : null
  }
}
