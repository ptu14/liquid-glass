import {
  Component,
  Input,
} from '@angular/core'
import type { GlassComponentData } from '@daniluk/liquid-glass'
import { LiquidGlassBase, VARIANT_TINT, type GlassVariant } from './liquid-glass-base'

export type GlassButtonVariant = GlassVariant

/**
 * Pre-styled glass button with press-to-expand, magnetic drag,
 * and rubber-band physics.
 *
 * Usage:
 * ```html
 * <liquid-glass-button [borderRadius]="22" [pressExpand]="2" variant="primary">
 *   Click me
 * </liquid-glass-button>
 * ```
 */
@Component({
  selector: 'liquid-glass-button',
  standalone: true,
  template: '<ng-content></ng-content>',
  styles: [
    `
      :host {
        display: inline-block;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        border: 0;
        box-shadow: none;
        cursor: pointer;
        padding: 14px 32px;
        margin: 0;
        color: rgba(255, 255, 255, 0.92);
        font-size: 0.9rem;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
        position: relative;
        z-index: 20;
        user-select: none;
        transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
    `,
  ],
  // eslint-disable-next-line @angular-eslint/no-host-metadata-property
  host: {
    class: 'lg-focus-ring',
    role: 'button',
    tabindex: '0',
    '(pointerdown)': 'onPointerDown($event)',
    '(keydown.enter)': 'activate($event)',
    '(keydown.space)': 'activate($event)',
  },
})
export class LiquidGlassButtonComponent extends LiquidGlassBase {
  @Input() override borderRadius = 22
  @Input() override initialLocked = true
  @Input() override thickness = 1.0
  @Input() override layer = 0
  @Input() override pressExpand = 2
  @Input() override magnetStrength = 0.45
  @Input() override magnetMax = 5
  @Input() variant: GlassButtonVariant = 'default'
  @Input() declare tintColor?: [number, number, number]

  override ngAfterViewInit(): void {
    this.locked = this.initialLocked
    super.ngAfterViewInit()
    this.setupPressListeners()
  }

  override ngOnDestroy(): void {
    this.teardownPressListeners()
    super.ngOnDestroy()
  }

  protected override getData(): GlassComponentData {
    return {
      ...super.getData(),
      tintColor: this.tintColor ?? VARIANT_TINT[this.variant],
    }
  }

  onPointerDown(e: PointerEvent): void {
    this.onPressDown(e)
  }

  /** Enter / Space click the host, like a native `<button>`. */
  activate(e: Event): void {
    e.preventDefault()
    this.el.click()
  }
}
