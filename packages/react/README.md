# @daniluk/liquid-glass-react

React bindings for [`@daniluk/liquid-glass`](https://www.npmjs.com/package/@daniluk/liquid-glass): Apple-style liquid glass rendered with WebGL. The glass refracts your live page, merges like liquid when elements touch, and your components stay plain, interactive DOM.

## Install

```bash
npm install @daniluk/liquid-glass-react
```

Requires React 18+. The core package is installed automatically.

## Quick start

```tsx
import { useRef } from 'react'
import { LiquidGlassProvider, LiquidGlassButton, LiquidGlassCard } from '@daniluk/liquid-glass-react'

export function App() {
  const pageRef = useRef<HTMLDivElement>(null)

  return (
    <LiquidGlassProvider bgElement={pageRef} bgImage="/wallpaper.jpg">
      <div ref={pageRef}>{/* page content the glass refracts */}</div>

      <LiquidGlassCard style={{ position: 'fixed', bottom: 24, left: 24, padding: 24 }}>
        <h2>Now playing</h2>
        <LiquidGlassButton variant="primary">Play</LiquidGlassButton>
      </LiquidGlassCard>
    </LiquidGlassProvider>
  )
}
```

`LiquidGlassProvider` renders one full-screen WebGL canvas (`position: fixed`, `z-index: 10`, `pointer-events: none`). Glass components render at `z-index: 20` with a transparent background. Without WebGL, children still render as plain DOM.

The bundle is marked `'use client'` for React Server Components setups (e.g. the Next.js App Router); the renderer only starts inside effects.

## `<LiquidGlassProvider>`

| Prop | Type | Description |
| --- | --- | --- |
| `bgElement` | `RefObject<HTMLElement>` | Element captured with SnapDOM as the background; re-captured on scroll, resize and mutations. |
| `bgImage` | `string` | Static image drawn every frame as the base layer (`cover`). |
| `bgRenderer` | `(ctx, w, h) => void` | Draw your own base layer each frame; the `bgElement` snapshot goes on top. |
| `params` | `Partial<GlassParams>` | Shader tunables (`blend`, `refr`, `bezelWidth`, `edgeBlur`, …). See the [core README](https://www.npmjs.com/package/@daniluk/liquid-glass#glassparams). Changing it doesn't recreate the WebGL context. |

Mark elements inside `bgElement` with `data-lg-live` (exported as `LIVE_ATTR`) to see their `:hover` / focus effects and transitions under the glass in real time.

## `<LiquidGlassButton>`

A `<button>` (all native props pass through, `ref` is forwarded) that presses in with a slight scale and a rubber-band "magnetic" drag.

| Prop | Default | Description |
| --- | --- | --- |
| `variant` | `'default'` | `'default' \| 'primary' \| 'secondary' \| 'danger'` tint. |
| `tintColor` | — | Custom RGB `[0–1]`, overrides `variant`. |
| `borderRadius` | `22` | Corner radius in px. |
| `thickness` | `1` | `1` = regular material, `~0.35` = thin. |
| `layer` | `0` | `1` = on top of layer 0 (e.g. inside a card) without merging. |
| `initialLocked` | `false` | Start opted out of merging. |
| `pressScale` | `1.02` | Scale while pressed; `≤ 1` disables the press effect. |
| `magnetStrength` | `0.45` | How much the button follows the pointer while pressed. |
| `magnetMax` | `8` | Max drag offset in px. |

## `<LiquidGlassCard>`

A `<div>` glass panel (native props pass through, `ref` is forwarded).

| Prop | Default | Description |
| --- | --- | --- |
| `borderRadius` | `32` | Corner radius in px. |
| `thickness` | `1` | Material thickness. |
| `frost` | `0` | `0–1` frosted material. |
| `fuse` | `false` | Fuse with an overlapping `fuse` element into one body. |
| `initialLocked` | `false` | Start opted out of merging. |

## `useLiquidGlass(options)`

Turn any element into glass:

```tsx
function Pill() {
  const { ref, locked, toggleLock } = useLiquidGlass({ borderRadius: 999, frost: 0.3 })
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} onDoubleClick={toggleLock}
         style={{ position: 'relative', zIndex: 20, borderRadius: 999, padding: '8px 16px' }}>
      {locked ? 'solo' : 'merging'}
    </div>
  )
}
```

Options: `borderRadius` (100), `thickness` (1), `layer` (0), `pressed`, `tintColor`, `frost` (0), `clear`, `fuse`, `blend`, `metaball`, `initialLocked`. Returns `{ ref, locked, toggleLock, setLocked }`.

Options are read every frame, so animating them through state is fine.

## Also exported

`DEFAULT_GLASS_PARAMS`, `LIVE_ATTR`, `CAPTURE_EVENT` and the types `GlassParams`, `BgRenderer`, `GlassVariant` / `GlassButtonVariant`. For the vanilla API and low-level renderer, import from `@daniluk/liquid-glass`.

## License

MIT
