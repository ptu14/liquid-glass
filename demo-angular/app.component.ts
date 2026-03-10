import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core'
import {
  LiquidGlassContainerComponent,
  LiquidGlassButtonComponent,
  LiquidGlassInputComponent,
} from '../src/angular'

import type { GlassButtonVariant } from '../src/angular'

interface BtnDef {
  label: string
  x: number
  y: number
  variant: GlassButtonVariant
}

const INIT_BUTTONS: BtnDef[] = [
  { label: 'Primary', x: 0.25, y: 0.35, variant: 'primary' },
  { label: 'Secondary', x: 0.50, y: 0.35, variant: 'secondary' },
  { label: 'Danger', x: 0.75, y: 0.35, variant: 'danger' },
  { label: 'Default', x: 0.50, y: 0.48, variant: 'default' },
]

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LiquidGlassContainerComponent, LiquidGlassButtonComponent, LiquidGlassInputComponent],
  template: `
    <!-- HTML/CSS background -->
    <div id="html-bg" #htmlBg>
      <div class="bg-stripes"></div>
      <div class="bg-grid"></div>
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
      <div class="orb orb-4"></div>
      <div class="bg-typography">
        <h1>Liquid</h1>
        <h1 class="right">Glass</h1>
        <h1>WebGL</h1>
      </div>
    </div>

    <!-- Glass overlay -->
    @if (bgDiv) {
      <liquid-glass-container [bgElement]="bgDiv">
        @for (btn of buttons; track btn.label; let i = $index) {
          <liquid-glass-button
            [borderRadius]="22"
            [variant]="btn.variant"
            [style.position]="'fixed'"
            [style.left.px]="positions[i].x"
            [style.top.px]="positions[i].y"
            [style.transform]="'translate(-50%, -50%)'"
            [style.touchAction]="'none'"
            [style.zIndex]="dragIdx === i ? 30 : 20"
            (pointerdown)="onPointerDown(i, $event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp()">
            {{ btn.label }}
          </liquid-glass-button>
        }

        <!-- Inputs row -->
        <liquid-glass-input
          placeholder="Search…"
          variant="primary"
          [style.position]="'fixed'"
          [style.left.%]="25"
          [style.top.%]="65"
          [style.width.px]="220"
          [style.transform]="'translate(-50%, -50%)'"
        ></liquid-glass-input>

        <liquid-glass-input
          placeholder="Email"
          variant="default"
          [style.position]="'fixed'"
          [style.left.%]="50"
          [style.top.%]="65"
          [style.width.px]="220"
          [style.transform]="'translate(-50%, -50%)'"
        ></liquid-glass-input>

        <liquid-glass-input
          placeholder="Password"
          type="password"
          variant="danger"
          [style.position]="'fixed'"
          [style.left.%]="75"
          [style.top.%]="65"
          [style.width.px]="220"
          [style.transform]="'translate(-50%, -50%)'"
        ></liquid-glass-input>
      </liquid-glass-container>
    }

    <div class="hint">drag buttons &middot; click = expand &amp; merge &middot; click input = focus tint</div>
  `,
})
export class AppComponent implements AfterViewInit {
  @ViewChild('htmlBg') htmlBgRef!: ElementRef<HTMLDivElement>
  bgDiv: HTMLElement | undefined

  buttons = INIT_BUTTONS
  positions: Array<{ x: number; y: number }> = INIT_BUTTONS.map((b) => ({
    x: b.x * window.innerWidth,
    y: b.y * window.innerHeight,
  }))

  dragIdx: number | null = null
  private dragStart = { mx: 0, my: 0, bx: 0, by: 0 }

  ngAfterViewInit(): void {
    // Delay one tick so @if picks up bgDiv
    setTimeout(() => {
      this.bgDiv = this.htmlBgRef.nativeElement
    })
  }

  onPointerDown(idx: number, e: PointerEvent): void {
    this.dragIdx = idx
    this.dragStart = {
      mx: e.clientX,
      my: e.clientY,
      bx: this.positions[idx].x,
      by: this.positions[idx].y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  onPointerMove(e: PointerEvent): void {
    if (this.dragIdx === null) return
    this.positions = this.positions.map((p, i) =>
      i === this.dragIdx
        ? {
            x: this.dragStart.bx + (e.clientX - this.dragStart.mx),
            y: this.dragStart.by + (e.clientY - this.dragStart.my),
          }
        : p,
    )
  }

  onPointerUp(): void {
    this.dragIdx = null
  }
}
