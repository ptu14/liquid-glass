import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  NgZone,
  OnDestroy,
} from '@angular/core'
import {
  LiquidGlassContainerComponent,
  LiquidGlassButtonComponent,
  LiquidGlassCardComponent,
  LiquidGlassInputComponent,
} from '../src/angular'

interface Show {
  name: string
  file: string
}

interface ContinueShow extends Show {
  progress: number
}

const TABS = ['Info', 'InSight', 'Continue Watching']

const SHOWS: Show[] = [
  { name: 'Stellar Horizons', file: 'show-1069.jpg' },
  { name: 'Neon Tides', file: 'show-984.jpg' },
  { name: 'The Last Signal', file: 'show-1036.jpg' },
  { name: 'Orbit Zero', file: 'show-1054.jpg' },
  { name: 'Crimson Atlas', file: 'show-1080.jpg' },
  { name: 'Echo Valley', file: 'show-1039.jpg' },
]

const CONTINUE: ContinueShow[] = [
  { name: 'Dark Matter S2 E4', file: 'show-901.jpg', progress: 0.65 },
  { name: 'Severance S1 E7', file: 'show-669.jpg', progress: 0.82 },
  { name: 'Foundation S3 E1', file: 'show-600.jpg', progress: 0.12 },
  { name: 'Silo S2 E5', file: 'show-376.jpg', progress: 0.55 },
]

@Component({
  selector: 'app-apple-tv',
  standalone: true,
  imports: [
    LiquidGlassContainerComponent,
    LiquidGlassButtonComponent,
    LiquidGlassCardComponent,
    LiquidGlassInputComponent,
  ],
  template: `
    <!-- Fixed background image -->
    <div id="scene-bg"></div>

    <!-- Scrollable page content -->
    <div class="page-content" #pageBg>
      <h1>Friday Night</h1>
      <p class="subtitle">
        Discover new shows, continue watching where you left off, or explore
        curated collections just for you.
      </p>

      <h3 class="section-title">Trending Now</h3>
      <div class="show-grid">
        @for (show of shows; track show.name) {
          <div class="show-card" [style.background]="img(show.file)">
            <span class="show-label">{{ show.name }}</span>
          </div>
        }
      </div>

      <h3 class="section-title">Continue Watching</h3>
      <div class="show-grid">
        @for (show of continueShows; track show.name) {
          <div class="show-card" [style.background]="img(show.file)">
            <span class="show-label">{{ show.name }}</span>
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="show.progress * 100"></div>
            </div>
          </div>
        }
      </div>

      <h3 class="section-title">For You</h3>
      <div class="show-grid">
        @for (show of showsReversed; track show.name) {
          <div class="show-card" [style.background]="img(show.file)">
            <span class="show-label">{{ show.name }}</span>
          </div>
        }
      </div>

      <!-- Footer marker -->
      <div #footerMarker class="footer-marker"></div>
    </div>

    <!-- Glass overlay -->
    @if (bgDiv) {
      <liquid-glass-container [bgElement]="bgDiv" bgImage="./images/bg.jpg">
        <!-- Footer that tracks the marker -->
        <div #footerGlass class="footer-glass">
          <liquid-glass-card [borderRadius]="20" [thickness]="1.0">
            <div class="footer-inner">
              Explore more shows, movies, and exclusive content on Apple TV+
            </div>
          </liquid-glass-card>
        </div>

        <!-- Search bar + settings -->
        <div class="search-area">
          <liquid-glass-input
            [borderRadius]="22"
            [thickness]="0.35"
            [layer]="1"
            placeholder="Search shows, movies, and more…"
            [style.width.px]="360">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </liquid-glass-input>
          <liquid-glass-button
            [borderRadius]="100"
            [thickness]="0.35"
            [layer]="1"
            [initialLocked]="true"
            class="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 style="display:block">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </liquid-glass-button>
        </div>

        <div class="card-area">
          <!-- Tab buttons -->
          <div class="tabs-row">
            @for (tab of tabs; track tab; let i = $index) {
              <liquid-glass-button
                [borderRadius]="18"
                [thickness]="0.35"
                [layer]="1"
                [initialLocked]="true"
                [style.padding]="'10px 24px'"
                [style.fontSize]="'0.8rem'"
                [style.fontWeight]="i === 0 ? '700' : '500'"
                [style.opacity]="i === 0 ? 1 : 0.75">
                {{ tab }}
              </liquid-glass-button>
            }
          </div>

          <!-- Main info card -->
          <liquid-glass-card [borderRadius]="24" [thickness]="1.0">
            <div class="info-card-inner">
              <div class="thumbnail"></div>
              <div class="meta">
                <h2>Stellar Horizons</h2>
                <p>
                  An epic journey through uncharted galaxies, where a lone
                  explorer discovers ancient alien civilizations and must choose
                  between saving humanity or preserving the cosmic balance...
                </p>
                <span class="genre">Science Fiction &nbsp; 2h 14min</span>
              </div>
              <div class="actions">
                <liquid-glass-button
                  [borderRadius]="20"
                  [thickness]="0.35"
                  [layer]="1"
                  variant="primary"
                  [initialLocked]="true"
                  [style.padding]="'12px 28px'"
                  [style.fontSize]="'0.82rem'">
                  <span class="action-icon">&#9654;</span>
                  From Beginning
                </liquid-glass-button>
                <liquid-glass-button
                  [borderRadius]="20"
                  [thickness]="0.35"
                  [layer]="1"
                  variant="secondary"
                  [initialLocked]="true"
                  [style.padding]="'12px 28px'"
                  [style.fontSize]="'0.82rem'">
                  <span class="action-icon">&#8505;</span>
                  Go to Show
                </liquid-glass-button>
              </div>
            </div>
          </liquid-glass-card>
        </div>
      </liquid-glass-container>
    }
  `,
})
export class AppleTVComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pageBg') pageBgRef!: ElementRef<HTMLDivElement>
  @ViewChild('footerMarker') footerMarkerRef!: ElementRef<HTMLDivElement>
  @ViewChild('footerGlass') footerGlassRef?: ElementRef<HTMLDivElement>

  bgDiv: HTMLElement | undefined

  tabs = TABS
  shows = SHOWS
  continueShows = CONTINUE
  showsReversed = [...SHOWS].reverse()

  private rafId = 0

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.bgDiv = this.pageBgRef.nativeElement
    })

    // Track footer marker position at 60fps
    this.ngZone.runOutsideAngular(() => {
      const update = () => {
        const marker = this.footerMarkerRef?.nativeElement
        const glass = this.footerGlassRef?.nativeElement
        if (marker && glass) {
          const r = marker.getBoundingClientRect()
          glass.style.top = `${r.top}px`
          glass.style.left = '48px'
          glass.style.right = '48px'
        }
        this.rafId = requestAnimationFrame(update)
      }
      update()
    })
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId)
  }

  img(file: string): string {
    return `url(./images/${file}) center/cover no-repeat`
  }
}
