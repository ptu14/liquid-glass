import {
  Directive,
  Input,
  Output,
  EventEmitter,
} from '@angular/core'
import { LiquidGlassBase } from './liquid-glass-base'

/**
 * Attribute directive that registers a DOM element with the Liquid Glass
 * renderer.  Attach to any element to make it part of the glass SDF field.
 *
 * Usage:
 * ```html
 * <div liquidGlass [lgBorderRadius]="32" [lgThickness]="0.35"
 *      [(lgLocked)]="isLocked">
 *   Content
 * </div>
 * ```
 */
@Directive({
  selector: '[liquidGlass]',
  standalone: true,
})
export class LiquidGlassDirective extends LiquidGlassBase {
  @Input() set lgBorderRadius(v: number) { this.borderRadius = v }
  @Input() set lgThickness(v: number) { this.thickness = v }
  @Input() set lgLayer(v: number) { this.layer = v }
  @Input() set lgLocked(v: boolean) { this.locked = v }
  @Input() set lgPressed(v: boolean) { this.pressed = v }
  @Input() set lgTintColor(v: [number, number, number] | undefined) { this.tintColor = v }
  @Input() set lgFrost(v: number) { this.frost = v }
  @Input() set lgClear(v: boolean) { this.clear = v }
  @Input() set lgFuse(v: boolean) { this.fuse = v }
  @Input() set lgBlend(v: number | undefined) { this.blend = v }
  @Input() set lgMetaball(v: boolean) { this.metaball = v }

  @Output() lgLockedChange = new EventEmitter<boolean>()

  override toggleLock(): void {
    super.toggleLock()
    this.lgLockedChange.emit(this.locked)
  }

  override setLocked(locked: boolean): void {
    super.setLocked(locked)
    this.lgLockedChange.emit(this.locked)
  }
}
