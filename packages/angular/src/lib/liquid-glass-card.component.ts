import {
  Component,
  Input,
} from '@angular/core'
import { LiquidGlassBase } from './liquid-glass-base'

/**
 * Pre-styled glass card wrapper.
 *
 * Usage:
 * ```html
 * <liquid-glass-card [borderRadius]="32" [thickness]="1.0">
 *   Card content
 * </liquid-glass-card>
 * ```
 */
@Component({
  selector: 'liquid-glass-card',
  standalone: true,
  template: '<ng-content></ng-content>',
  styles: [
    `
      :host {
        display: block;
        position: relative;
        z-index: 20;
      }
    `,
  ],
})
export class LiquidGlassCardComponent extends LiquidGlassBase {
  @Input() override borderRadius = 32
  @Input() override initialLocked = false
  @Input() override thickness = 1.0
  @Input() override layer = 0
  @Input() override frost = 0
  @Input() override fuse = false

  override ngAfterViewInit(): void {
    this.locked = this.initialLocked
    super.ngAfterViewInit()
  }
}
