import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  LiquidGlassHost,
  type BgRenderer,
  type GlassComponentData,
  type GlassParams,
} from '@daniluk/liquid-glass'

export { LIVE_ATTR, type BgRenderer } from '@daniluk/liquid-glass'

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

export interface LiquidGlassProviderProps {
  children: ReactNode
  params?: Partial<GlassParams>
  /**
   * Manual mode — you draw the background yourself each frame.
   * Combined with bgElement, it is the base layer under the DOM snapshot.
   */
  bgRenderer?: BgRenderer
  /**
   * Auto mode — captures the DOM element via SnapDOM (SVG foreignObject),
   * re-captured on scroll, resize and mutations. Elements inside marked
   * with `data-lg-live` (`LIVE_ATTR`) show hover/focus effects live.
   */
  bgElement?: RefObject<HTMLElement | null>
  /**
   * Static background image URL, drawn every frame with CSS `cover`
   * positioning. Combine with bgElement: the image stays crisp and the
   * HTML overlay shifts smoothly between captures.
   */
  bgImage?: string
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
  const hostRef = useRef<LiquidGlassHost | null>(null)
  // Children register in their effects, which run before ours — keep the
  // registry here and hand it to the host once it exists.
  const registryMap = useRef(new Map<string, () => GlassComponentData>())
  const bgRendererRef = useRef(bgRenderer)
  bgRendererRef.current = bgRenderer
  // Latest props, read once on mount — later changes go through the
  // effects below so the WebGL context isn't torn down on every update.
  const initial = useRef({ params, bgImage, bgElement })
  initial.current = { params, bgImage, bgElement }

  // ── Mount host ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { params, bgImage, bgElement } = initial.current
    let host: LiquidGlassHost
    try {
      host = new LiquidGlassHost(canvas, {
        params,
        image: bgImage,
        element: bgElement?.current,
        renderer: bgRendererRef.current
          ? (ctx, w, h) => bgRendererRef.current?.(ctx, w, h)
          : null,
      })
    } catch {
      return // no WebGL — children render as plain DOM
    }
    for (const [id, getData] of registryMap.current) host.register(id, getData)
    hostRef.current = host
    return () => {
      host.destroy()
      hostRef.current = null
    }
  }, [])

  useEffect(() => {
    if (params) hostRef.current?.setParams(params)
  }, [params])

  useEffect(() => {
    hostRef.current?.background.setImage(bgImage ?? null)
  }, [bgImage])

  useEffect(() => {
    hostRef.current?.background.setElement(bgElement?.current ?? null)
  }, [bgElement])

  const hasRenderer = !!bgRenderer
  useEffect(() => {
    hostRef.current?.background.setRenderer(
      hasRenderer ? (ctx, w, h) => bgRendererRef.current?.(ctx, w, h) : null,
    )
  }, [hasRenderer])

  const registry: GlassRegistry = useMemo(
    () => ({
      register(id, getData) {
        registryMap.current.set(id, getData)
        hostRef.current?.register(id, getData)
      },
      unregister(id) {
        registryMap.current.delete(id)
        hostRef.current?.unregister(id)
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
      {children}
    </LiquidGlassContext.Provider>
  )
}
