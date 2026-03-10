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
import { snapdom } from '@zumer/snapdom'
import { LiquidGlassRenderer } from '../core/LiquidGlassRenderer'
import type { GlassParams, GlassComponentData } from '../core/types'
import { LiquidGlassService } from './liquid-glass.service'

export type BgRenderer = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void

/** Draw an image onto a canvas using CSS `background-size: cover` logic. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
): void {
  const ir = img.naturalWidth / img.naturalHeight
  const cr = w / h
  let sw: number, sh: number, sx: number, sy: number
  if (ir > cr) {
    sh = img.naturalHeight
    sw = sh * cr
    sx = (img.naturalWidth - sw) / 2
    sy = 0
  } else {
    sw = img.naturalWidth
    sh = sw / cr
    sx = 0
    sy = (img.naturalHeight - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
}

/**
 * Container component that creates the full-screen WebGL canvas, manages
 * the LiquidGlassRenderer lifecycle, and captures the background.
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
  @Input() bgRenderer?: BgRenderer
  @Input() bgElement?: HTMLElement
  @Input() bgImage?: string

  @ViewChild('glassCanvas', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>

  private renderer: LiquidGlassRenderer | null = null
  private rafId = 0
  private destroyed = false

  // Display canvas — what WebGL reads each frame
  private display = document.createElement('canvas')
  private displayCtx = this.display.getContext('2d')!

  // SnapDOM snapshot
  private snapshot = document.createElement('canvas')
  private snapshotCtx = this.snapshot.getContext('2d')!
  private capturedOffset = { x: 0, y: 0 }

  // Background image
  private bgImg: HTMLImageElement | null = null

  // Cleanup handles
  private mutObserver: MutationObserver | null = null
  private scrollTimer: ReturnType<typeof setTimeout> | null = null
  private resizeTimer: ReturnType<typeof setTimeout> | null = null
  private mutTimer: ReturnType<typeof setTimeout> | null = null
  private removeScrollListener: (() => void) | null = null
  private removeResizeListener: (() => void) | null = null

  constructor(
    private ngZone: NgZone,
    public glassService: LiquidGlassService,
  ) {}

  ngAfterViewInit(): void {
    this.loadBgImage()
    this.setupBgCapture()
    this.initRenderer()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['params'] && this.renderer && this.params) {
      this.renderer.setParams(this.params)
    }
    if (changes['bgImage']) {
      this.loadBgImage()
    }
    if (changes['bgElement']) {
      this.cleanupBgCapture()
      this.setupBgCapture()
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    cancelAnimationFrame(this.rafId)
    this.renderer?.destroy()
    this.renderer = null
    this.cleanupBgCapture()
  }

  // ── Background image ─────────────────────────────

  private loadBgImage(): void {
    if (!this.bgImage) {
      this.bgImg = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = this.bgImage
    img.onload = () => {
      this.bgImg = img
    }
  }

  // ── SnapDOM background capture ────────────────────

  private setupBgCapture(): void {
    const el = this.bgElement
    if (!el) return

    let capturing = false
    let queued = false

    const capture = async () => {
      if (capturing) {
        queued = true
        return
      }
      capturing = true
      try {
        const captureCanvas = await snapdom.toCanvas(el, {
          scale: 1,
          dpr: 1,
          backgroundColor: 'transparent',
          filter: (element: Element) => element.tagName !== 'CANVAS',
          filterMode: 'remove' as const,
        })

        if (
          this.snapshot.width !== captureCanvas.width ||
          this.snapshot.height !== captureCanvas.height
        ) {
          this.snapshot.width = captureCanvas.width
          this.snapshot.height = captureCanvas.height
        }
        this.snapshotCtx.clearRect(
          0,
          0,
          this.snapshot.width,
          this.snapshot.height,
        )
        this.snapshotCtx.drawImage(captureCanvas, 0, 0)

        const rect = el.getBoundingClientRect()
        this.capturedOffset = {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
        }
      } catch {
        // capture failed
      }
      capturing = false
      if (queued) {
        queued = false
        capture()
      }
    }

    capture()

    const onScroll = () => {
      if (this.scrollTimer) clearTimeout(this.scrollTimer)
      this.scrollTimer = setTimeout(capture, 80)
    }
    const onResize = () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer)
      this.resizeTimer = setTimeout(capture, 100)
    }

    this.mutObserver = new MutationObserver(() => {
      if (this.mutTimer) clearTimeout(this.mutTimer)
      this.mutTimer = setTimeout(capture, 100)
    })
    this.mutObserver.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    this.removeScrollListener = () =>
      window.removeEventListener('scroll', onScroll)
    this.removeResizeListener = () =>
      window.removeEventListener('resize', onResize)
  }

  private cleanupBgCapture(): void {
    this.mutObserver?.disconnect()
    this.mutObserver = null
    this.removeScrollListener?.()
    this.removeScrollListener = null
    this.removeResizeListener?.()
    this.removeResizeListener = null
    if (this.scrollTimer) clearTimeout(this.scrollTimer)
    if (this.resizeTimer) clearTimeout(this.resizeTimer)
    if (this.mutTimer) clearTimeout(this.mutTimer)
  }

  // ── Renderer init + rAF loop ──────────────────────

  private initRenderer(): void {
    const glCanvas = this.canvasRef.nativeElement

    const bgFactory = (): HTMLCanvasElement => {
      const w = glCanvas.clientWidth
      const h = glCanvas.clientHeight
      if (this.display.width !== w || this.display.height !== h) {
        this.display.width = w
        this.display.height = h
      }
      const ctx = this.displayCtx

      if (this.bgRenderer) {
        this.bgRenderer(ctx, w, h)
        return this.display
      }

      ctx.clearRect(0, 0, w, h)

      if (this.bgImg) {
        drawCover(ctx, this.bgImg, w, h)
      }

      if (this.snapshot.width > 0 && this.snapshot.height > 0) {
        const srcX = Math.max(0, window.scrollX - this.capturedOffset.x)
        const srcY = Math.max(0, window.scrollY - this.capturedOffset.y)
        ctx.drawImage(this.snapshot, srcX, srcY, w, h, 0, 0, w, h)
      }

      return this.display
    }

    try {
      this.renderer = new LiquidGlassRenderer(glCanvas, bgFactory)
    } catch {
      return
    }

    if (this.params) this.renderer.setParams(this.params)

    // Run rAF loop outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      this.renderer!.start()
      const loop = () => {
        if (this.destroyed) return
        const data: GlassComponentData[] =
          this.glassService.getAllComponentData()
        this.renderer!.setComponents(data)
        this.rafId = requestAnimationFrame(loop)
      }
      loop()
    })
  }
}
