import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  forwardRef,
} from '@angular/core'
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms'
import type { GlassComponentData } from '@daniluk/liquid-glass'
import { LiquidGlassBase, VARIANT_TINT, type GlassVariant } from './liquid-glass-base'

export type GlassInputVariant = GlassVariant

/**
 * Glass-styled input field with press-to-expand, rubber-band physics,
 * and focus-activated tint.
 *
 * Supports content projection for prefix icons — projected content
 * scales and moves together with the glass host during press/drag.
 *
 * Implements `ControlValueAccessor` so it works with `ngModel`
 * and reactive forms out of the box.
 *
 * Usage:
 * ```html
 * <liquid-glass-input placeholder="Search…" variant="primary">
 *   <svg class="prefix-icon">…</svg>
 * </liquid-glass-input>
 * ```
 */
@Component({
  selector: 'liquid-glass-input',
  standalone: true,
  template: `
    <ng-content></ng-content>
    <input #inputEl
      [type]="type"
      [placeholder]="placeholder"
      [disabled]="inputDisabled"
      [readOnly]="readOnly"
      [value]="value"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (input)="onInputChange($event)" />
  `,
  styles: [
    `
      :host {
        display: inline-block;
        position: relative;
        z-index: 20;
        transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      input {
        display: block;
        width: 100%;
        box-sizing: border-box;
        background: transparent;
        border: none;
        outline: none;
        color: rgba(255, 255, 255, 0.92);
        font-family: inherit;
        font-size: 0.9rem;
        font-weight: 400;
        letter-spacing: 0.02em;
        padding: 12px 20px;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        caret-color: rgba(255, 255, 255, 0.8);
      }
      input::placeholder {
        color: rgba(255, 255, 255, 0.4);
        text-shadow: none;
      }
      input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
  // eslint-disable-next-line @angular-eslint/no-host-metadata-property
  host: {
    class: 'lg-focus-ring-within',
    '(pointerdown)': 'onPointerDown($event)',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LiquidGlassInputComponent),
      multi: true,
    },
  ],
})
export class LiquidGlassInputComponent extends LiquidGlassBase implements ControlValueAccessor {
  @ViewChild('inputEl') inputElRef!: ElementRef<HTMLInputElement>

  @Input() override borderRadius = 18
  @Input() override thickness = 1.0
  @Input() override layer = 0
  @Input() override pressExpand = 2
  @Input() override magnetStrength = 0.45
  @Input() override magnetMax = 5
  @Input() variant: GlassInputVariant = 'default'
  @Input() declare tintColor?: [number, number, number]

  @Input() type: string = 'text'
  @Input() placeholder: string = ''
  @Input() inputDisabled = false
  @Input() readOnly = false
  @Input() value: string = ''

  @Output() valueChange = new EventEmitter<string>()

  focused = false

  // ControlValueAccessor callbacks
  private onChange: (value: string) => void = () => {}
  private onTouched: () => void = () => {}

  override ngAfterViewInit(): void {
    this.locked = true
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

  /**
   * Override: after pointer release, always re-lock (SDF merge only
   * while pointer is held). Keep pressed if input is focused (tint stays).
   */
  protected override onPressRelease(): void {
    this.locked = true // always re-lock — merge only during press
    if (!this.focused) this.pressed = false
  }

  onPointerDown(e: PointerEvent): void {
    // Base onPressDown unlocks for SDF merge during press gesture
    this.onPressDown(e)
  }

  onFocus(): void {
    this.focused = true
    this.pressed = true
  }

  onBlur(): void {
    this.focused = false
    this.pressed = false
    this.locked = true
    this.onTouched()
  }

  onInputChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value
    this.value = val
    this.onChange(val)
    this.valueChange.emit(val)
  }

  /** Focus the inner input programmatically. */
  focus(): void {
    this.inputElRef?.nativeElement.focus()
  }

  // ── ControlValueAccessor ──────────────────────────

  writeValue(value: string): void {
    this.value = value ?? ''
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.inputDisabled = isDisabled
  }
}
