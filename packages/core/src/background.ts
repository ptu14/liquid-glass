import { snapdom } from '@zumer/snapdom'

/** Draws a custom background each frame. Runs before the element snapshot. */
export type BgRenderer = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void

export interface BackgroundOptions {
  /** Element whose content shows through the glass (captured with SnapDOM). */
  element?: HTMLElement | null
  /** Static image drawn as the base layer (CSS `cover`). */
  image?: string | null
  /** Custom base layer drawn every frame (replaces `image`). */
  renderer?: BgRenderer | null
}

/**
 * Elements inside the background element marked with this attribute are
 * "live": their CSS hover/focus effects show up under the glass in real
 * time. They are cut out of the main snapshot and drawn every frame from
 * their own snapshot (refreshed on hover/focus changes and during CSS
 * transitions) with their *current* transform / translate / scale applied.
 * Assumes the default `transform-origin: center`. `lgtransitionrefresh`
 * (the Angular directive's attribute) is accepted too.
 */
export const LIVE_ATTR = 'data-lg-live'

/** Dispatch on `document` to force a background recapture. */
export const CAPTURE_EVENT = 'liquid-glass:capture'

const LIVE_SELECTORS = [`[${LIVE_ATTR}]`, '[lgtransitionrefresh]']
const LIVE_SELECTOR = LIVE_SELECTORS.join(',')
const TRANSFORM_PROPS = new Set(['transform', 'translate', 'scale', 'rotate'])

/** Draw an image onto a canvas using CSS `background-size: cover` logic. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { naturalWidth: number; naturalHeight: number },
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

/** Draw a live element's snapshot at its current on-screen transform. */
function drawLive(ctx: CanvasRenderingContext2D, el: HTMLElement, pic: HTMLCanvasElement) {
  const w = el.offsetWidth
  const h = el.offsetHeight
  if (!w || !h) return
  const cs = getComputedStyle(el)
  const m = cs.transform && cs.transform !== 'none' ? new DOMMatrix(cs.transform) : new DOMMatrix()
  // Individual transform properties (applied before `transform`)
  const tr = cs.translate && cs.translate !== 'none' ? cs.translate.split(' ').map(parseFloat) : [0, 0]
  const sc = cs.scale && cs.scale !== 'none' ? cs.scale.split(' ').map(parseFloat) : [1]
  const tx = tr[0] || 0
  const ty = tr[1] || 0
  const sx = sc[0] ?? 1
  const sy = sc[1] ?? sx
  // Transformed box centre = layout centre + translate + scale·(e, f)
  // (transform-origin: center), so recover the layout centre from the rect.
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2 - tx - sx * m.e
  const cy = r.top + r.height / 2 - ty - sy * m.f
  ctx.save()
  ctx.translate(cx + tx, cy + ty)
  ctx.scale(sx, sy)
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
  ctx.globalAlpha = parseFloat(cs.opacity) || 1
  ctx.drawImage(pic, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/**
 * Builds the background texture the glass refracts. Composites, in order:
 * the `renderer` (or `image`), a SnapDOM snapshot of `element` shifted by
 * scroll since capture, and live elements at their current transform.
 *
 * The element is re-captured on scroll, resize, DOM mutations, web-font
 * load and `CAPTURE_EVENT`; call `capture()` to force it.
 */
export class BackgroundCapture {
  private display = document.createElement('canvas')
  private displayCtx = this.display.getContext('2d')!
  private snapshot = document.createElement('canvas')
  private snapshotCtx = this.snapshot.getContext('2d')!
  /** Element's document-space offset at time of last capture */
  private offset = { x: 0, y: 0 }
  private live = new Map<HTMLElement, HTMLCanvasElement>()
  private img: HTMLImageElement | null = null
  private renderer: BgRenderer | null = null
  private element: HTMLElement | null = null
  private detach: (() => void) | null = null
  private requestCapture: () => void = () => {}

  constructor(opts: BackgroundOptions = {}) {
    this.setRenderer(opts.renderer ?? null)
    this.setImage(opts.image ?? null)
    this.setElement(opts.element ?? null)
  }

  setRenderer(renderer: BgRenderer | null): void {
    this.renderer = renderer
  }

  setImage(url: string | null): void {
    this.img = null
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.img = img
    }
    img.src = url
  }

  setElement(el: HTMLElement | null): void {
    if (el === this.element) return
    this.detach?.()
    this.detach = null
    this.element = el
    if (el) this.detach = this.watch(el)
  }

  /** Re-capture the background element now. */
  capture(): void {
    this.requestCapture()
  }

  /** Composite the background for a `w × h` viewport. */
  draw(w: number, h: number): HTMLCanvasElement {
    const d = this.display
    if (d.width !== w || d.height !== h) {
      d.width = w
      d.height = h
    }
    const ctx = this.displayCtx

    if (this.renderer) {
      this.renderer(ctx, w, h)
    } else {
      ctx.clearRect(0, 0, w, h)
      if (this.img) drawCover(ctx, this.img, w, h)
    }

    // Draw the snapshot where the element is now: document offset at
    // capture time minus current scroll.
    const snap = this.snapshot
    if (snap.width > 0 && snap.height > 0) {
      ctx.drawImage(snap, this.offset.x - window.scrollX, this.offset.y - window.scrollY)
    }

    // Live elements: their own pixels with the *current* transform, so
    // hover lifts / scales track the DOM frame by frame.
    for (const [le, pic] of this.live) {
      if (le.isConnected) drawLive(ctx, le, pic)
    }

    return d
  }

  destroy(): void {
    this.setElement(null)
    this.renderer = null
    this.img = null
  }

  // ── Element capture ──────────────────────────────────────

  private watch(el: HTMLElement): () => void {
    let disposed = false
    let capturing = false
    let queued = false

    const capture = async () => {
      if (disposed) return
      if (capturing) {
        queued = true
        return
      }
      capturing = true
      try {
        // SnapDOM: captures via SVG foreignObject — works with cross-origin
        // images (CORS). Selectors (not a predicate) keep v3 capture reuse +
        // differential recapture enabled. Live elements are hidden (space
        // kept) and drawn per frame.
        const c = await snapdom.toCanvas(el, {
          scale: 1,
          dpr: 1, // match CSS pixels, not physical pixels
          backgroundColor: 'transparent',
          exclude: ['canvas', ...LIVE_SELECTORS],
          excludeMode: 'hide',
        })
        if (disposed) return

        const snap = this.snapshot
        if (snap.width !== c.width || snap.height !== c.height) {
          snap.width = c.width
          snap.height = c.height
        }
        this.snapshotCtx.clearRect(0, 0, snap.width, snap.height)
        this.snapshotCtx.drawImage(c, 0, 0)

        const rect = el.getBoundingClientRect()
        this.offset = { x: rect.left + window.scrollX, y: rect.top + window.scrollY }

        // (Re)snapshot every live element; drop ones that are gone
        const live = new Set(el.querySelectorAll<HTMLElement>(LIVE_SELECTOR))
        for (const k of this.live.keys()) if (!live.has(k)) this.live.delete(k)
        live.forEach((le) => captureLive(le))
      } catch {
        // keep the previous snapshot
      }
      capturing = false
      if (queued) {
        queued = false
        capture()
      }
    }

    // ── Live elements: own snapshot, refreshed on state changes ──
    const liveBusy = new Set<HTMLElement>()
    const liveQueued = new Set<HTMLElement>()
    const captureLive = async (le: HTMLElement) => {
      if (disposed) return
      if (liveBusy.has(le)) {
        liveQueued.add(le)
        return
      }
      liveBusy.add(le)
      try {
        const c = await snapdom.toCanvas(le, {
          scale: 1,
          dpr: 1,
          backgroundColor: 'transparent',
          exclude: ['canvas'],
          excludeMode: 'remove',
        })
        if (!disposed && le.isConnected) this.live.set(le, c)
      } catch {
        // keep the previous snapshot
      }
      liveBusy.delete(le)
      if (liveQueued.delete(le)) captureLive(le)
    }

    // Non-transform CSS transitions (colour, shadow, …) need fresh pixels
    // while they run; transforms are applied live by the compositor.
    const running = new Map<HTMLElement, number>()
    let liveTimer: ReturnType<typeof setInterval> | null = null
    const tickRunning = () => {
      running.forEach((_, le) => captureLive(le))
      if (running.size === 0 && liveTimer) {
        clearInterval(liveTimer)
        liveTimer = null
      }
    }
    const liveOf = (t: EventTarget | null) =>
      t instanceof Element ? (t.closest(LIVE_SELECTOR) as HTMLElement | null) : null
    const onState = (e: Event) => {
      const le = liveOf(e.target)
      if (!le) return
      captureLive(le)
      // :hover styles apply after the event — grab the settled frame too
      requestAnimationFrame(() => captureLive(le))
    }
    const isTransformProp = (e: Event) =>
      e instanceof TransitionEvent && TRANSFORM_PROPS.has(e.propertyName)
    const onRun = (e: Event) => {
      const le = liveOf(e.target)
      if (!le || isTransformProp(e)) return
      running.set(le, (running.get(le) ?? 0) + 1)
      if (!liveTimer) liveTimer = setInterval(tickRunning, 40)
    }
    const onEnd = (e: Event) => {
      const le = liveOf(e.target)
      if (!le || isTransformProp(e)) return
      const n = (running.get(le) ?? 1) - 1
      if (n <= 0) running.delete(le)
      else running.set(le, n)
      captureLive(le) // final state
    }
    const stateEvents = ['pointerover', 'pointerout', 'focusin', 'focusout']
    const runEvents = ['transitionrun', 'animationstart']
    const endEvents = ['transitionend', 'transitioncancel', 'animationend']
    stateEvents.forEach((t) => el.addEventListener(t, onState))
    runEvents.forEach((t) => el.addEventListener(t, onRun))
    endEvents.forEach((t) => el.addEventListener(t, onEnd))

    // ── Recapture triggers (debounced) ──
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const debounced = (ms: number) => {
      let t: ReturnType<typeof setTimeout> | null = null
      return () => {
        if (t) {
          clearTimeout(t)
          timers.delete(t)
        }
        t = setTimeout(capture, ms)
        timers.add(t)
      }
    }
    const onScroll = debounced(80)
    const onResize = debounced(100)
    const observer = new MutationObserver(debounced(100))
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true })
    const onCaptureEvent = () => capture()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    document.addEventListener(CAPTURE_EVENT, onCaptureEvent)
    // Web fonts change layout after first paint
    document.fonts?.ready.then(() => capture())

    this.requestCapture = capture
    capture()

    return () => {
      disposed = true
      this.requestCapture = () => {}
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener(CAPTURE_EVENT, onCaptureEvent)
      stateEvents.forEach((t) => el.removeEventListener(t, onState))
      runEvents.forEach((t) => el.removeEventListener(t, onRun))
      endEvents.forEach((t) => el.removeEventListener(t, onEnd))
      if (liveTimer) clearInterval(liveTimer)
      timers.forEach(clearTimeout)
      // Don't leave a stale snapshot behind when capture stops
      this.snapshot.width = 0
      this.live.clear()
    }
  }
}
