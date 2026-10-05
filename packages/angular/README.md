# @daniluk/liquid-glass-angular

Angular standalone components for [`@daniluk/liquid-glass`](https://www.npmjs.com/package/@daniluk/liquid-glass): Apple-style liquid glass rendered with WebGL. The glass refracts your live page, merges like liquid when elements touch, and your components stay plain, interactive DOM.

## Install

```bash
npm install @daniluk/liquid-glass-angular
```

Requires Angular 17+ (`@angular/core`, `@angular/common`, `@angular/forms`). The core package is installed automatically. Ships in Angular Package Format (partial Ivy compilation), so it works in AOT builds.

## Quick start

```ts
import { Component } from '@angular/core'
import {
  LiquidGlassContainerComponent,
  LiquidGlassButtonComponent,
  LiquidGlassCardComponent,
} from '@daniluk/liquid-glass-angular'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LiquidGlassContainerComponent, LiquidGlassButtonComponent, LiquidGlassCardComponent],
  template: `
    <div #page><!-- page content the glass refracts --></div>

    <liquid-glass-container [bgElement]="page" bgImage="/wallpaper.jpg">
      <liquid-glass-card style="position: fixed; bottom: 24px; left: 24px; padding: 24px">
        <h2>Now playing</h2>
        <liquid-glass-button variant="primary">Play</liquid-glass-button>
      </liquid-glass-card>
    </liquid-glass-container>
  `,
})
export class AppComponent {}
```

The container renders one full-screen WebGL canvas (`position: fixed`, `z-index: 10`, `pointer-events: none`) and runs its frame loop **outside the Angular zone**, so it never triggers change detection. Glass components sit at `z-index: 20` with a transparent background.

## `<liquid-glass-container>`

| Input | Type | Description |
| --- | --- | --- |
| `bgElement` | `HTMLElement` | Element captured with SnapDOM as the background; re-captured on scroll, resize and mutations. |
| `bgImage` | `string` | Static image drawn every frame as the base layer (`cover`). |
| `bgRenderer` | `(ctx, w, h) => void` | Draw your own base layer each frame; the `bgElement` snapshot goes on top. |
| `params` | `Partial<GlassParams>` | Shader tunables. See the [core README](https://www.npmjs.com/package/@daniluk/liquid-glass#glassparams). |

Methods (via `@ViewChild`):
- `setLiveParams(partial)`: push params straight to the renderer, without change detection. Use it for 60 fps updates such as device-tilt → `specularAngle`.
- `capture()`: force a background re-capture.

## Components

Every component has `borderRadius`, `thickness` (1 = regular, ~0.35 = thin) and `layer` (0, or 1 to sit on top of layer 0 without merging).

**`<liquid-glass-button>`**: `variant` (`'default' | 'primary' | 'secondary' | 'danger'`), `borderRadius` = 22, `initialLocked` = true, `pressExpand` = 2 (px growth on press), `magnetStrength` = 0.45, `magnetMax` = 5, `tintColor` (RGB 0–1, overrides `variant`).

**`<liquid-glass-card>`**: `borderRadius` = 32, `initialLocked` = false, `frost`, `fuse`.

**`<liquid-glass-input>`**: a text field that implements `ControlValueAccessor` (works with `ngModel` and reactive forms). Inputs: `type`, `placeholder`, `value` / `(valueChange)`, `inputDisabled`, `readOnly`, `variant`, `borderRadius` = 18. Tints while focused.

**`[liquidGlass]` directive** turns any element into glass: `lgBorderRadius`, `lgThickness`, `lgLayer`, `lgLocked` / `(lgLockedChange)`, `lgPressed`, `lgTintColor`, `lgFrost`, `lgClear`, `lgFuse`, `lgBlend`, `lgMetaball`.

```html
<div liquidGlass [lgBorderRadius]="999" [lgFrost]="0.3"
     style="position: relative; z-index: 20; border-radius: 999px; padding: 8px 16px">
  Pill
</div>
```

**`[lgTransitionRefresh]` directive** marks an element inside `bgElement` as *live*. Its `:hover` / focus effects, transitions and transforms show under the glass in real time. Same as `data-lg-live`.

## Also exported

`LiquidGlassService` (per-container registry), `LiquidGlassBase` (base class for your own glass components), `DEFAULT_GLASS_PARAMS`, `LIVE_ATTR`, `CAPTURE_EVENT`, `VARIANT_TINT`, `rubberBand` and the types `GlassParams`, `BgRenderer`, `GlassVariant`.

## License

MIT
