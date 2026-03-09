import { useRef, useEffect, type RefObject } from 'react'
import {
  LiquidGlassProvider,
  LiquidGlassButton,
  LiquidGlassCard,
} from '../src'

const TABS = ['Info', 'InSight', 'Continue Watching']

/** [name, local image filename] */
const SHOWS: [string, string][] = [
  ['Stellar Horizons', 'show-1069.jpg'],
  ['Neon Tides', 'show-984.jpg'],
  ['The Last Signal', 'show-1036.jpg'],
  ['Orbit Zero', 'show-1054.jpg'],
  ['Crimson Atlas', 'show-1080.jpg'],
  ['Echo Valley', 'show-1039.jpg'],
]

/** [name, local image filename, watch progress 0–1] */
const CONTINUE: [string, string, number][] = [
  ['Dark Matter S2 E4', 'show-901.jpg', 0.65],
  ['Severance S1 E7', 'show-669.jpg', 0.82],
  ['Foundation S3 E1', 'show-600.jpg', 0.12],
  ['Silo S2 E5', 'show-376.jpg', 0.55],
]

const IMG = (file: string) =>
  `url(./images/${file}) center/cover no-repeat`

/**
 * Full-width glass footer that tracks a marker at the end of the page.
 * Uses position:fixed + rAF to follow the marker at 60fps.
 * Merges with the fixed bottom card when scrolled to the end.
 */
function ScrollableGlassFooter({
  markerRef,
}: {
  markerRef: RefObject<HTMLDivElement | null>
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let rafId: number
    const update = () => {
      if (markerRef.current && wrapperRef.current) {
        const r = markerRef.current.getBoundingClientRect()
        const w = wrapperRef.current
        w.style.top = `${r.top}px`
        // Match the card-area padding (0 48px) so footer aligns with the main card
        w.style.left = '48px'
        w.style.right = '48px'
      }
      rafId = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(rafId)
  }, [markerRef])

  return (
    <div ref={wrapperRef} className="footer-glass">
      <LiquidGlassCard borderRadius={20} thickness={1.0}>
        <div className="footer-inner">
          Explore more shows, movies, and exclusive content on Apple TV+
        </div>
      </LiquidGlassCard>
    </div>
  )
}

export function AppleTVApp() {
  const bgRef = useRef<HTMLDivElement>(null)
  const footerMarkerRef = useRef<HTMLDivElement>(null)

  return (
    <>
      {/* Fixed background image */}
      <div id="scene-bg" />

      {/* Scrollable page content (observed for mutations) */}
      <div className="page-content" ref={bgRef}>
        <h1>Friday Night</h1>
        <p className="subtitle">
          Discover new shows, continue watching where you left off, or explore
          curated collections just for you.
        </p>

        <h3 className="section-title">Trending Now</h3>
        <div className="show-grid">
          {SHOWS.map(([name, file]) => (
            <div key={name} className="show-card" style={{ background: IMG(file) }}>
              <span className="show-label">{name}</span>
            </div>
          ))}
        </div>

        <h3 className="section-title">Continue Watching</h3>
        <div className="show-grid">
          {CONTINUE.map(([name, file, progress]) => (
            <div key={name} className="show-card" style={{ background: IMG(file) }}>
              <span className="show-label">{name}</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        <h3 className="section-title">For You</h3>
        <div className="show-grid">
          {[...SHOWS].reverse().map(([name, file]) => (
            <div key={name} className="show-card" style={{ background: IMG(file) }}>
              <span className="show-label">{name}</span>
            </div>
          ))}
        </div>

        {/* Footer marker — at the very end of content */}
        <div ref={footerMarkerRef} className="footer-marker" />
      </div>

      {/* Glass overlay */}
      <LiquidGlassProvider bgElement={bgRef} bgImage="./images/bg.jpg">
        {/* Full-width footer — merges with bottom card when scrolled to end */}
        <ScrollableGlassFooter markerRef={footerMarkerRef} />

        <div className="card-area">
          {/* Tab buttons — thin material, layer 1 (isolated from merge) */}
          <div className="tabs-row">
            {TABS.map((tab, i) => (
              <LiquidGlassButton
                key={tab}
                borderRadius={18}
                thickness={0.35}
                layer={1}
                initialLocked
                style={{
                  padding: '10px 24px',
                  fontSize: '0.8rem',
                  fontWeight: i === 0 ? 700 : 500,
                  opacity: i === 0 ? 1 : 0.75,
                }}
              >
                {tab}
              </LiquidGlassButton>
            ))}
          </div>

          {/* Main info card — regular material, UNLOCKED for merge */}
          <LiquidGlassCard borderRadius={24} thickness={1.0}>
            <div className="info-card-inner">
              {/* Thumbnail */}
              <div className="thumbnail" />

              {/* Meta */}
              <div className="meta">
                <h2>Stellar Horizons</h2>
                <p>
                  An epic journey through uncharted galaxies, where a lone
                  explorer discovers ancient alien civilizations and must choose
                  between saving humanity or preserving the cosmic balance...
                </p>
                <span className="genre">
                  Science Fiction &nbsp; 2h 14min
                </span>
              </div>

              {/* Action buttons — thin material, layer 1 */}
              <div className="actions">
                <LiquidGlassButton
                  borderRadius={20}
                  thickness={0.35}
                  layer={1}
                  initialLocked
                  style={{ padding: '12px 28px', fontSize: '0.82rem' }}
                >
                  <span className="action-icon">&#9654;</span>
                  From Beginning
                </LiquidGlassButton>
                <LiquidGlassButton
                  borderRadius={20}
                  thickness={0.35}
                  layer={1}
                  initialLocked
                  style={{ padding: '12px 28px', fontSize: '0.82rem' }}
                >
                  <span className="action-icon">&#8505;</span>
                  Go to Show
                </LiquidGlassButton>
              </div>
            </div>
          </LiquidGlassCard>
        </div>
      </LiquidGlassProvider>
    </>
  )
}
