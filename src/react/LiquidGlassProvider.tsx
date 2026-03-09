import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
  type RefObject,
} from 'react'
import { snapdom } from '@zumer/snapdom'
import { LiquidGlassRenderer } from '../core/LiquidGlassRenderer'
import type { GlassComponentData, GlassParams } from '../core/types'

// ── Registry context ────────────────────────────────────────

interface GlassRegistry {
  register(id: string, getData: () => GlassComponentData): void
  unregister(id: string): void
}

const LiquidGlassContext = createContext<GlassRegistry | null>(null)

export function useLiquidGlassRegistry(): GlassRegistry {
  const ctx = useContext(LiquidGlassContext)
  if (!ctx) {
    throw new Error(
      'useLiquidGlass must be used within a <LiquidGlassProvider>',
    )
  }
  return ctx
}

// ── Types ───────────────────────────────────────────────────

export type BgRenderer = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void

export interface LiquidGlassProviderProps {
  children: ReactNode
  params?: Partial<GlassParams>
  /**
   * Manual mode — you draw the background snapshot yourself each frame.
   * Fast, no dependencies, but you must replicate the visual background.
   */
  bgRenderer?: BgRenderer
  /**
   * Auto mode — captures the DOM element via SnapDOM (SVG foreignObject).
   * Pass a ref to any DOM element to observe for mutations and capture.
   * When combined with bgImage, only the scrollable HTML overlay
   * is captured; the static image is drawn at 60fps separately.
   */
  bgElement?: RefObject<HTMLElement | null>
  /**
   * Static background image URL. Drawn at 60fps with CSS `cover`
   * positioning. Combine with bgElement for smooth scroll performance:
   * the image is always crisp, and the HTML overlay shifts smoothly
   * between SnapDOM recaptures.
   */
  bgImage?: string
}

// ── Helpers ─────────────────────────────────────────────────

/** Draw an image onto a canvas using CSS `background-size: cover` logic. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
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

// ── Provider ────────────────────────────────────────────────

export function LiquidGlassProvider({
  children,
  bgRenderer,
  bgElement,
  bgImage,
  params,
}: LiquidGlassProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<LiquidGlassRenderer | null>(null)
  const registryMap = useRef<Map<string, () => GlassComponentData>>(new Map())
  const bgRendererRef = useRef(bgRenderer)
  bgRendererRef.current = bgRenderer
  const overlayRef = useRef<HTMLDivElement>(null)

  // Display canvas — what WebGL reads each frame
  const displayRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const displayCtxRef = useRef<CanvasRenderingContext2D>(
    displayRef.current.getContext('2d')!,
  )

  // SnapDOM snapshot (captures full element including scrolled-out content)
  const snapshotRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const snapshotCtxRef = useRef<CanvasRenderingContext2D>(
    snapshotRef.current.getContext('2d')!,
  )

  // Element's document-space offset at time of last capture
  const capturedOffsetRef = useRef({ x: 0, y: 0 })

  // Loaded background image
  const bgImgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (rendererRef.current && params) {
      rendererRef.current.setParams(params)
    }
  }, [params])

  // ── Load bgImage ──────────────────────────────────────────
  useEffect(() => {
    if (!bgImage) {
      bgImgRef.current = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = bgImage
    img.onload = () => {
      bgImgRef.current = img
    }
  }, [bgImage])

  // ── bgElement auto-capture mode (SnapDOM) ─────────────────
  useEffect(() => {
    if (!bgElement) return
    const el = bgElement.current
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
        // SnapDOM: captures via SVG foreignObject — works in Chrome with
        // cross-origin images (CORS), unlike html2canvas.
        const captureCanvas = await snapdom.toCanvas(el, {
          scale: 1,
          dpr: 1, // match CSS pixels, not physical pixels
          backgroundColor: 'transparent',
          filter: (element: Element) => element.tagName !== 'CANVAS',
          filterMode: 'remove',
        })

        const snap = snapshotRef.current
        if (
          snap.width !== captureCanvas.width ||
          snap.height !== captureCanvas.height
        ) {
          snap.width = captureCanvas.width
          snap.height = captureCanvas.height
        }
        snapshotCtxRef.current.clearRect(0, 0, snap.width, snap.height)
        snapshotCtxRef.current.drawImage(captureCanvas, 0, 0)

        // Store element's document-space offset for viewport slicing
        const rect = el.getBoundingClientRect()
        capturedOffsetRef.current = {
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

    // Re-capture on scroll (debounced)
    let scrollTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      scrollTimer = setTimeout(capture, 80)
    }

    // Re-capture on resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(capture, 100)
    }

    // Re-capture on DOM mutations (debounced)
    let mutTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (mutTimer) clearTimeout(mutTimer)
      mutTimer = setTimeout(capture, 100)
    })
    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (scrollTimer) clearTimeout(scrollTimer)
      if (resizeTimer) clearTimeout(resizeTimer)
      if (mutTimer) clearTimeout(mutTimer)
    }
  }, [bgElement])

  // ── Mount renderer ──────────────────────────────────────
  useEffect(() => {
    const glCanvas = canvasRef.current
    if (!glCanvas) return

    const bgFactory = () => {
      const w = glCanvas.clientWidth
      const h = glCanvas.clientHeight
      const display = displayRef.current
      if (display.width !== w || display.height !== h) {
        display.width = w
        display.height = h
      }
      const ctx = displayCtxRef.current

      // Manual bgRenderer mode
      if (bgRendererRef.current) {
        bgRendererRef.current(ctx, w, h)
        return display
      }

      ctx.clearRect(0, 0, w, h)

      // Draw static background image (60fps, always correct)
      const img = bgImgRef.current
      if (img) {
        drawCover(ctx, img, w, h)
      }

      // Draw scrollable HTML overlay from SnapDOM snapshot.
      // The snapshot covers the full captured element. We extract
      // the viewport-visible slice using the current scroll position
      // minus the element's document-space offset.
      const snap = snapshotRef.current
      if (snap.width > 0 && snap.height > 0) {
        const srcX = Math.max(0, window.scrollX - capturedOffsetRef.current.x)
        const srcY = Math.max(0, window.scrollY - capturedOffsetRef.current.y)
        ctx.drawImage(snap, srcX, srcY, w, h, 0, 0, w, h)
      }

      return display
    }

    let renderer: LiquidGlassRenderer
    try {
      renderer = new LiquidGlassRenderer(glCanvas, bgFactory)
    } catch {
      return
    }

    if (params) renderer.setParams(params)
    rendererRef.current = renderer

    let rafId: number
    let stopped = false
    const loop = () => {
      if (stopped) return
      const data: GlassComponentData[] = []
      for (const getData of registryMap.current.values()) {
        data.push(getData())
      }
      renderer.setComponents(data)
      rafId = requestAnimationFrame(loop)
    }
    renderer.start()
    loop()

    return () => {
      stopped = true
      cancelAnimationFrame(rafId)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [params])

  const registry: GlassRegistry = useMemo(
    () => ({
      register(id: string, getData: () => GlassComponentData) {
        registryMap.current.set(id, getData)
      },
      unregister(id: string) {
        registryMap.current.delete(id)
      },
    }),
    [],
  )

  return (
    <LiquidGlassContext.Provider value={registry}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
      <div ref={overlayRef} style={{ display: 'contents' }}>
        {children}
      </div>
    </LiquidGlassContext.Provider>
  )
}
