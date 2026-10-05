import { useRef, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import {
  LiquidGlassProvider,
  LiquidGlassButton,
  LiquidGlassCard,
  DEFAULT_GLASS_PARAMS,
  FOCUS_RING_WITHIN_CLASS,
  type GlassParams,
  type BgRenderer,
  type GlassButtonVariant,
} from '@daniluk/liquid-glass-react'
import { drawModernBg } from './modernBg'
import { SHOWCASE_BGS, type ShowcaseBg } from './showcaseBg'
import { LiquidScene } from './LiquidScene'
import { LiquidSegmented } from './LiquidSegmented'
import {
  BackwardIcon,
  BluetoothIcon,
  CheckIcon,
  ForwardIcon,
  HomeIcon,
  MoonIcon,
  MusicIcon,
  PauseIcon,
  PersonIcon,
  PlayIcon,
  RecordIcon,
  SearchIcon,
  SunIcon,
  WifiIcon,
} from './icons'

// ── Scenes ──────────────────────────────────────────────────

const SCENES = ['Liquid', 'Player', 'Dock', 'Widgets', 'Feed'] as const
type Scene = (typeof SCENES)[number]

// ── Player: now-playing card ────────────────────────────────

const TRACK_LEN = 214

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function PlayerScene() {
  const [playing, setPlaying] = useState(true)
  const [pos, setPos] = useState(71)

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setPos((p) => (p + 1) % TRACK_LEN), 1000)
    return () => clearInterval(t)
  }, [playing])

  const ctrl = { borderRadius: 30, thickness: 0.35, layer: 1, initialLocked: true }
  const ctrlStyle = { width: 60, height: 60, padding: 0, fontSize: '1.1rem', textTransform: 'none' as const }

  return (
    <div className="center">
      <LiquidGlassCard borderRadius={36} className="player">
        <div className="cover" style={{ backgroundImage: 'url(./images/show-1069.jpg)' }} />
        <div className="track">
          <div>
            <h2>Bioluminescence</h2>
            <p>Deep Water Ensemble</p>
          </div>
          <span className="badge">LIVE</span>
        </div>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${(pos / TRACK_LEN) * 100}%` }} />
        </div>
        <div className="times">
          <span>{fmt(pos)}</span>
          <span>-{fmt(TRACK_LEN - pos)}</span>
        </div>
        <div className="controls">
          <LiquidGlassButton {...ctrl} style={ctrlStyle} onClick={() => setPos(0)} aria-label="Previous">
            <BackwardIcon size={22} />
          </LiquidGlassButton>
          <LiquidGlassButton
            {...ctrl}
            borderRadius={38}
            variant="primary"
            style={{ ...ctrlStyle, width: 76, height: 76, fontSize: '1.5rem' }}
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </LiquidGlassButton>
          <LiquidGlassButton
            {...ctrl}
            style={ctrlStyle}
            onClick={() => setPos((p) => Math.min(TRACK_LEN - 1, p + 15))}
            aria-label="Skip 15 seconds"
          >
            <ForwardIcon size={22} />
          </LiquidGlassButton>
        </div>
      </LiquidGlassCard>
    </div>
  )
}

// ── Dock: spotlight + dock ───────────────────────

const APPS: [string, string][] = [
  ['Finder', 'linear-gradient(160deg,#5ac8fa,#007aff)'],
  ['Mail', 'linear-gradient(160deg,#64d2ff,#0a84ff)'],
  ['Music', 'linear-gradient(160deg,#ff6482,#ff2d55)'],
  ['Photos', 'conic-gradient(#ff9f0a,#ffd60a,#30d158,#64d2ff,#bf5af2,#ff375f,#ff9f0a)'],
  ['Notes', 'linear-gradient(160deg,#ffe066,#ffcc00)'],
  ['Maps', 'linear-gradient(160deg,#30d158,#0a84ff)'],
  ['Settings', 'linear-gradient(160deg,#aeaeb2,#636366)'],
]

/** Eases a number toward `target` over `ms` (easeOutCubic), re-rendering each frame. */
function useTween(target: number, ms: number) {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  valueRef.current = value

  useEffect(() => {
    const from = valueRef.current
    if (from === target) return
    const start = performance.now()
    let id: number
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(from + (target - from) * (1 - Math.pow(1 - t, 3)))
      if (t < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [target, ms])

  return value
}

function DockScene() {
  const [query, setQuery] = useState('')
  const hits = query
    ? APPS.filter(([n]) => n.toLowerCase().includes(query.toLowerCase()))
    : []
  const open = hits.length > 0

  // Keep the last results rendered while the panel collapses
  const lastHits = useRef(hits)
  if (open) lastHits.current = hits
  const shown = open ? hits : lastHits.current

  // Animate height to the list's measured size — the glass reads the
  // element rect every frame, so the SDF shape follows the CSS transition.
  const listRef = useRef<HTMLUListElement>(null)
  const [listH, setListH] = useState(0)
  const shownKey = shown.map(([n]) => n).join()
  useLayoutEffect(() => {
    if (listRef.current) setListH(listRef.current.offsetHeight)
  }, [shownKey])

  const radius = useTween(open ? 24 : 30, 300)

  return (
    <>
      <div className="spotlight-wrap">
        <LiquidGlassCard borderRadius={radius} className={`spotlight ${FOCUS_RING_WITHIN_CLASS}${open ? ' open' : ''}`}>
          <span className="spot-icon">
            <SearchIcon size={22} />
          </span>
          <input
            autoFocus
            placeholder="Spotlight Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="spot-results" style={{ height: open ? listH : 0 }}>
            <ul ref={listRef}>
              {shown.map(([name, bg], i) => (
                <li key={name} style={{ ['--i' as string]: i }}>
                  <i style={{ background: bg }} />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </LiquidGlassCard>
      </div>

      <div className="dock-wrap">
        <LiquidGlassCard borderRadius={28} className="dock">
          {APPS.map(([name, bg]) => (
            <button key={name} className="app" title={name} style={{ background: bg }}>
              {name[0]}
            </button>
          ))}
        </LiquidGlassCard>
      </div>
    </>
  )
}

// ── Widgets: control-center style grid ─────────────────────

const TOGGLES: [string, ReactNode, GlassButtonVariant][] = [
  ['Wi-Fi', <WifiIcon key="w" />, 'primary'],
  ['Bluetooth', <BluetoothIcon key="b" />, 'primary'],
  ['Focus', <MoonIcon key="f" />, 'secondary'],
  ['Record', <RecordIcon key="r" />, 'danger'],
]

function WidgetsScene() {
  const [on, setOn] = useState([true, true, false, false])
  const [brightness, setBrightness] = useState(70)
  const today = new Date()

  return (
    <div className="center">
      <div className="widgets">
        <LiquidGlassCard borderRadius={28} className="widget weather">
          <span className="w-label">Kraków</span>
          <span className="temp">18°</span>
          <span className="w-sub">
            <SunIcon size={13} /> Mostly sunny
          </span>
          <span className="w-sub dim">H:21° L:11°</span>
        </LiquidGlassCard>

        <LiquidGlassCard borderRadius={28} className="widget calendar">
          <span className="w-label red">{today.toLocaleDateString([], { weekday: 'long' })}</span>
          <span className="day">{today.getDate()}</span>
          <span className="w-sub">Design review · 14:00</span>
          <span className="w-sub dim">Ship v0.2 · 17:30</span>
        </LiquidGlassCard>

        <LiquidGlassCard borderRadius={28} className="widget controls-widget">
          <div className="toggles">
            {TOGGLES.map(([label, icon, variant], i) => (
              <div key={label} className="toggle">
                <LiquidGlassButton
                  borderRadius={28}
                  thickness={0.35}
                  layer={1}
                  initialLocked
                  variant={on[i] ? variant : 'default'}
                  style={{ width: 56, height: 56, padding: 0, fontSize: '1.2rem', textTransform: 'none' }}
                  onClick={() => setOn((p) => p.map((v, j) => (j === i ? !v : v)))}
                  aria-pressed={on[i]}
                >
                  {icon}
                </LiquidGlassButton>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <label className="slider">
            <SunIcon size={18} />
            <input
              type="range"
              min={0}
              max={100}
              value={brightness}
              onChange={(e) => setBrightness(+e.target.value)}
              style={{ ['--v' as string]: `${brightness}%` }}
            />
          </label>
        </LiquidGlassCard>
      </div>
    </div>
  )
}

// ── Feed: scrolling footer docks into the tab bar ──────────

const POSTS: [string, string, string][] = [
  ['show-1069.jpg', 'Bioluminescence', 'Deep-sea footage from the Monterey canyon.'],
  ['show-984.jpg', 'Neon Tides', 'Long exposure of the harbour after midnight.'],
  ['show-1036.jpg', 'The Last Signal', 'Abandoned radio towers along the coast.'],
  ['show-1054.jpg', 'Orbit Zero', 'A week of night skies, stacked into one frame.'],
  ['show-1080.jpg', 'Crimson Atlas', 'Red dunes, shot at the very edge of sunset.'],
  ['show-1039.jpg', 'Echo Valley', 'Fog rolling over the valley floor at dawn.'],
]

// Geometry shared by CSS and the footer slot so the two glass panels
// overlap by FEED_OVERLAP at max scroll — enough to fuse into one body.
const FEED_TABS: [ReactNode, string][] = [
  [<HomeIcon key="h" size={22} />, 'Home'],
  [<SearchIcon key="s" size={22} />, 'Search'],
  [<MusicIcon key="m" size={22} />, 'Library'],
  [<PersonIcon key="p" size={22} />, 'Profile'],
]

const BAR_H = 72
const BAR_BOTTOM = 20
const FOOTER_H = 150
const FEED_OVERLAP = 40

function FeedScene() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)

  // Footer glass lives in the fixed stage (above the masked scroller) and
  // follows its in-flow slot every frame.
  useLayoutEffect(() => {
    let id: number
    const follow = () => {
      const slot = slotRef.current
      const f = footerRef.current
      if (slot && f) {
        const r = slot.getBoundingClientRect()
        f.style.transform = `translate(${r.left}px, ${r.top}px)`
        f.style.width = `${r.width}px`
      }
      id = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <>
      <div ref={scrollRef} className="feed-scroll">
        <div className="feed-col">
          <header className="feed-head">
            <h2>Feed</h2>
            <p>Scroll to the end — the footer docks into the tab bar and they fuse into one sheet of glass.</p>
          </header>
          {POSTS.map(([img, title, text]) => (
            <article key={title} className="post">
              <div className="post-img" style={{ backgroundImage: `url(./images/${img})` }} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
          <div ref={slotRef} style={{ height: FOOTER_H }} />
          <div style={{ height: BAR_BOTTOM + BAR_H - FEED_OVERLAP }} />
        </div>
      </div>

      <div ref={footerRef} className="feed-footer">
        <LiquidGlassCard borderRadius={28} frost={1} fuse style={{ height: FOOTER_H }}>
          <div className="feed-footer-inner" style={{ height: FOOTER_H - FEED_OVERLAP }}>
            <span className="check">
              <CheckIcon size={18} />
            </span>
            <div>
              <strong>You're all caught up</strong>
              <p>{POSTS.length} new posts since yesterday</p>
            </div>
            <button
              className="pill"
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Back to top
            </button>
          </div>
        </LiquidGlassCard>
      </div>

      <div ref={barRef} className="feed-bar-wrap" style={{ bottom: BAR_BOTTOM }}>
        <LiquidGlassCard borderRadius={28} frost={1} fuse className="feed-bar" style={{ height: BAR_H }}>
          {/* Same liquid switch as the Liquid scene; the bar itself is the track */}
          <LiquidSegmented
            track={false}
            liftRef={barRef}
            height={BAR_H}
            pad={8}
            value={tab}
            onChange={setTab}
            labels={FEED_TABS.map(([, label]) => label)}
            items={FEED_TABS.map(([icon, label]) => (
              <>
                <span>{icon}</span>
                {label}
              </>
            ))}
          />
        </LiquidGlassCard>
      </div>
    </>
  )
}

// ── Dev panel: live GlassParams tuning ──────────────────────

type NumKey = { [K in keyof GlassParams]: GlassParams[K] extends number ? K : never }[keyof GlassParams]

const SLIDERS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'refr',            label: 'Refraction',  min: 0, max: 10,      step: 0.1 },
  { key: 'dispStr',         label: 'Edge band',   min: 0, max: 0.1,     step: 0.001 },
  { key: 'bezelWidth',      label: 'Bezel px',    min: 4, max: 60,      step: 1 },
  { key: 'aberr',           label: 'Aberration',  min: 0, max: 0.05,    step: 0.001 },
  { key: 'glassBlur',       label: 'Blur px',     min: 0, max: 40,      step: 1 },
  { key: 'frost',           label: 'Frost',       min: 0, max: 3,       step: 0.05 },
  { key: 'edgeBlur',        label: 'Edge blur',   min: 0, max: 1,       step: 0.01 },
  { key: 'frostBlur',       label: 'Frost px',    min: 0, max: 40,      step: 1 },
  { key: 'blend',           label: 'Merge blend', min: 0, max: 60,      step: 1 },
  { key: 'specularOpacity', label: 'Specular',    min: 0, max: 1,       step: 0.01 },
  { key: 'specularAngle',   label: 'Light angle', min: 0, max: Math.PI * 2, step: 0.01 },
]

const PRESETS: Record<string, Partial<GlassParams>> = {
  Default: {},
  Crystal: { refr: 6, dispStr: 0.04, aberr: 0.012, glassBlur: 0, frost: 0, specularOpacity: 0.35 },
  Frosted: { refr: 2.5, glassBlur: 18, frost: 1.2, specularOpacity: 0.2 },
  Liquid:  { refr: 9, dispStr: 0.07, bezelWidth: 40, blend: 45, aberr: 0.02 },
}

const BACKGROUNDS = ['modern', 'neon', 'paper', ...(Object.keys(SHOWCASE_BGS) as ShowcaseBg[])] as const
type Bg = (typeof BACKGROUNDS)[number]

/** Canvas-drawn backgrounds (animated / photo / video); the rest are captured DOM. */
const CANVAS_BGS: Partial<Record<Bg, BgRenderer>> = { modern: drawModernBg, ...SHOWCASE_BGS }

function initialBg(): Bg {
  const q = new URLSearchParams(location.search).get('bg')
  return (BACKGROUNDS as readonly string[]).includes(q ?? '') ? (q as Bg) : 'modern'
}

function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let id: number
    const tick = (now: number) => {
      frames++
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
  return fps
}

function DevPanel({
  params,
  onChange,
  bg,
  onBgChange,
}: {
  params: GlassParams
  onChange: (p: GlassParams) => void
  bg: Bg
  onBgChange: (bg: Bg) => void
}) {
  const [open, setOpen] = useState(() => window.innerWidth > 720)
  const [copied, setCopied] = useState(false)
  const fps = useFps()

  const diff = Object.fromEntries(
    Object.entries(params).filter(
      ([k, v]) => DEFAULT_GLASS_PARAMS[k as keyof GlassParams] !== v,
    ),
  )
  const snippet = `<LiquidGlassProvider params={${JSON.stringify(diff, (_, v) =>
    typeof v === 'number' ? +v.toFixed(3) : v,
  )}}>`

  const copy = () => {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <aside className={`dev-panel${open ? '' : ' closed'}`}>
      <button className="dev-head" onClick={() => setOpen((o) => !o)}>
        <span>⚙ Glass params</span>
        <span className={`fps${fps < 50 ? ' warn' : ''}`}>{fps} fps</span>
      </button>
      {open && (
        <div className="dev-body">
          <span className="dev-label">Background</span>
          <div className="presets bgs">
            {BACKGROUNDS.map((b) => (
              <button key={b} className={b === bg ? 'on' : undefined} onClick={() => onBgChange(b)}>
                {b}
              </button>
            ))}
          </div>
          <span className="dev-label">Presets</span>
          <div className="presets">
            {Object.entries(PRESETS).map(([name, p]) => (
              <button key={name} onClick={() => onChange({ ...DEFAULT_GLASS_PARAMS, ...p })}>
                {name}
              </button>
            ))}
          </div>
          {SLIDERS.map((s) => (
            <label key={s.key} className="dev-row">
              <span>{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={params[s.key]}
                onChange={(e) => onChange({ ...params, [s.key]: +e.target.value })}
              />
              <output>{params[s.key].toFixed(s.step < 0.01 ? 3 : s.step < 1 ? 2 : 0)}</output>
            </label>
          ))}
          {(['mergeOnOverlap'] as const).map((k) => (
            <label key={k} className="dev-check">
              <input
                type="checkbox"
                checked={params[k]}
                onChange={(e) => onChange({ ...params, [k]: e.target.checked })}
              />
              {k}
            </label>
          ))}
          <button className="snippet" onClick={copy} title="Copy to clipboard">
            <code>{snippet}</code>
            <span>{copied ? 'copied' : 'copy'}</span>
          </button>
        </div>
      )}
    </aside>
  )
}

/** Visible copy of a canvas background — same draw fn and clock as the glass bg. */
function BgCanvas({ draw }: { draw: BgRenderer }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let id: number
    const loop = () => {
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth
      const h = c.clientHeight
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr
        c.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(ctx, w, h)
      id = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(id)
  }, [draw])
  return <canvas ref={ref} className="bg-canvas" />
}

// ── App ─────────────────────────────────────────────────────

export function App() {
  const bgRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<Scene>(() => {
    const h = decodeURIComponent(location.hash.slice(1))
    return (SCENES as readonly string[]).includes(h) ? (h as Scene) : 'Liquid'
  })
  const [params, setParams] = useState<GlassParams>(DEFAULT_GLASS_PARAMS)
  const [bg, setBg] = useState<Bg>(initialBg)
  const drawBg = CANVAS_BGS[bg]

  useEffect(() => {
    history.replaceState(null, '', `#${scene}`)
  }, [scene])

  // Glass UI lives outside #html-bg, so expose the theme on <body> for text colour
  useEffect(() => {
    document.body.dataset.bg = bg
    const url = new URL(location.href)
    url.searchParams.set('bg', bg)
    history.replaceState(null, '', url)
  }, [bg])

  return (
    <>
      {/* HTML background — captured by SnapDOM (data-bg change triggers re-capture) */}
      <div id="html-bg" ref={bgRef} data-bg={bg} className={drawBg ? 'canvas-mode' : undefined}>
        {drawBg && <BgCanvas draw={drawBg} />}
        <div className="bg-grid" />
        <div className="bg-typography">
          <h1>Liquid</h1>
          <h1 className="right">Glass</h1>
        </div>
      </div>

      <LiquidGlassProvider
        // canvas bgs are drawn per-frame (animated / video) as the base;
        // the DOM in #html-bg is always captured on top
        bgRenderer={drawBg}
        bgElement={bgRef}
        params={params}
      >
        <div className="stage">
          <nav className="tabs">
            {SCENES.map((s) => (
              <LiquidGlassButton
                key={s}
                borderRadius={18}
                thickness={0.35}
                layer={1}
                initialLocked
                variant={s === scene ? 'primary' : 'default'}
                style={{ padding: '10px 20px', fontSize: '0.75rem', opacity: s === scene ? 1 : 0.8 }}
                onClick={() => setScene(s)}
              >
                {s}
              </LiquidGlassButton>
            ))}
          </nav>

          <div key={scene} className="scene">
            {scene === 'Liquid' && <LiquidScene />}
            {scene === 'Player' && <PlayerScene />}
            {scene === 'Dock' && <DockScene />}
            {scene === 'Widgets' && <WidgetsScene />}
            {scene === 'Feed' && <FeedScene />}
          </div>
        </div>
      </LiquidGlassProvider>

      <DevPanel params={params} onChange={setParams} bg={bg} onBgChange={setBg} />
    </>
  )
}
