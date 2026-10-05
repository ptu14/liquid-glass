# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build            # core (tsup) → react (tsup) → angular (ng-packagr); core must build first
npm run build:core       # core only (also produces dist/liquid-glass.browser.js for CDNs)
npm run typecheck        # tsc --noEmit over packages/*/src (paths → sources)
npm run demo             # React demo, vite, port 5173
npm run demo:angular     # Angular demo, vite + analog, port 5174
npm run example:vanilla  # builds core, serves examples/vanilla (no-bundler CDN-style page)
npx changeset            # record a change; `npm run version-packages`, `npm run release` to publish
```

Dev servers are configured in `.claude/launch.json` (`--host 127.0.0.1`; use `--host` to reach them from a phone).

## Layout

npm-workspaces monorepo, three packages versioned together (changesets `fixed`):

```
packages/core     @daniluk/liquid-glass          framework-free; tsup ESM+CJS+d.ts + minified browser bundle (snapdom inlined)
packages/react    @daniluk/liquid-glass-react    tsup, 'use client' banner
packages/angular  @daniluk/liquid-glass-angular  ng-packagr (APF, partial Ivy) → packages/angular/dist, published from there
demo/, demo-angular/, examples/vanilla
```

Demos import packages by name; `vite.aliases.ts` maps them to `packages/*/src` (HMR without rebuild). The root `tsconfig.json` does the same via `paths`. Package builds resolve `@daniluk/liquid-glass` through the workspace symlink to `packages/core/dist`, hence the build order.

Angular components must be AOT-compilable: abstract base classes using Angular features need `@Directive()` (ng-packagr fails otherwise).

## Architecture

**Core-Adapter pattern**: everything except framework glue lives in core. Adapters are thin wrappers over `LiquidGlassHost`.

**Rendering stack** (z-order):
```
z:0   HTML background     – DOM content behind the glass
z:10  WebGL canvas         – full-screen overlay (pointer-events: none)
z:20  Glass components     – transparent DOM elements, interactive
```

### Core (`packages/core/src/`)

- **LiquidGlassHost** (`host.ts`) — canvas + renderer + `BackgroundCapture` + id→`getData` registry + rAF loop that feeds `setComponents` (registered before the renderer's rAF so rects and render share a frame). Throws without WebGL.
- **BackgroundCapture** (`background.ts`) — composites the bg texture: `renderer` (or `image`, cover) → SnapDOM snapshot of `element` drawn at `captureOffset − scroll` → live elements. Recaptures on scroll/resize/mutation/fonts/`CAPTURE_EVENT`.
- **LiquidGlass** (`LiquidGlass.ts`) — vanilla API: creates fixed canvas, `add(el, opts) → { update, remove }`.
- **LiquidGlassRenderer** — takes a `<canvas>` and a `bgSource` callback. Runs a rAF loop: uploads bg texture → computes per-component SDF union → renders glass pass(es) → composites layers.
- **shaders.ts** — GLSL vertex + fragment shaders. The fragment shader evaluates `sdRoundedRect` for each component, blends via `smin` (quadratic smooth-min, metaball merge), adds Poisson-disk blur, chromatic aberration, refraction displacement, tinting, grain, and rim highlight. Subpixel AA via `fwidth()`.
- **types.ts** — `GlassComponentData`, `GlassParams`, `ComponentAnimState`, `MAX_BTNS = 16` (injected into the GLSL `#define`).
- **helpers.ts** — `VARIANT_TINT`, `rubberBand`, `createGlassId` shared by both adapters.
- **utils.ts** — `tickBlendK()` animates blendK over 500ms with easeOutCubic (unlock) / easeInQuad (lock).

### React adapter (`packages/react/src/`)

- **LiquidGlassProvider** — renders the canvas, creates a `LiquidGlassHost` on mount, forwards prop changes (`params`, `bgImage`, `bgElement`, `bgRenderer`). Children register in effects that run before the provider's, so the provider keeps its own registry map and replays it into the host.
- **useLiquidGlass** — registers a `getData` closure (refs → read every frame). Returns `{ ref, locked, toggleLock, setLocked }`.
- **LiquidGlassButton / LiquidGlassCard** — pre-styled components built on the hook.

### Angular adapter (`packages/angular/src/`)

- **LiquidGlassContainerComponent** — creates the host outside the zone in `ngAfterViewInit`; `setLiveParams()` bypasses CD. Provides a per-container `LiquidGlassService` (registry, replayed into the host via `attach`).
- **LiquidGlassBase** (`@Directive()` abstract) — registration, press-to-expand + rubber band; button, card, input (`ControlValueAccessor`) and `[liquidGlass]` directive extend it. `[lgTransitionRefresh]` is a marker = `data-lg-live`.

### Multi-pass rendering

Layer 0 components render to an FBO + screen. The FBO is composited with the original bg into a second FBO, which becomes the background texture for layer 1. Layer 1 renders on top without clearing. This lets thin-material buttons (layer 1) sit on top of thick-material cards (layer 0) without SDF merge.

### SDF merge-on-overlap (`mergeOnOverlap` param)

When enabled (default), the renderer measures DOM rect overlap depth between unlocked same-layer components. `blendK` relaxes toward 0 in proportion to that depth (fully at 2× `blend` px, ~50ms smoothing), so light contact keeps the `smin` liquid bridge (shapes neck and pinch off when separating) and deep overlap becomes a hard `min` union. Tracked per-component in the `mergeRelaxT` map.

### Per-component blend (`blend`, `metaball`)

`blend` overrides the global blend radius for one component; a pair bridges with the smaller of the two radii (shader takes `min(kOwner, k_i)`). `metaball: true` skips the overlap relax, so overlapping shapes keep the smooth smin bulge (blob merges — see `demo/LiquidHero.tsx`).

### SDF fuse (per-component `fuse`, opt-in)

`min()` of two rounded rects leaves a pinched notch and a refraction seam where they meet. Only components that set `fuse: true` (both sides of a pair, unlocked) take part. Each component in an overlapping same-layer group morphs its shader rect toward the group's bounding box, weighted by how well the union fills that box (smoothstep over fill 0.78→0.94, ~60ms smoothing). A footer docked under a same-width card (fill ≈ 1) renders as one rounded rect; a diagonal overlap keeps its own shape. Partners are remembered after separation, and since fill drops continuously as the gap opens, the body stretches and pinches apart instead of popping. Only the rects sent to the shader change (`shaderRects`); overlap detection uses raw DOM rects.

### Edge refraction (`refr`, `bezelWidth`)

Physical model after kube.io/blog/liquid-glass-css-svg: the bezel is a convex squircle `y = (1-(1-x)^4)^(1/4)` as tall as `bezelWidth`; a vertical ray refracts at its surface (Snell, n = 1.5) and the sample is pulled toward the centre by `height · tan(θ1 − θ2)` px. Flat interior → no shift; the shift peaks just inside the rim and is 0 at the very edge. `refr` scales it (3.5 = physical), `dispStr` adds an optional broad term (×100 px).

### Materials (`frost`, `clear`, `edgeBlur`)

Per-component `frost` (0–1) mixes in a blurred bg (radius `frostBlur`) plus a faint milky veil. Per-component `clear` (layer 1) samples the raw bg instead of the layer-0 composite, so the glass is a see-through window with no refracted copy of the glass beneath. Global `edgeBlur` smears content toward the blurred bg in a band of 1.6× `bezelWidth` at the rim (Apple-style). The blurred texture (`blurFboC`) is only computed when `frostBlur > 0` and frost/edgeBlur is in use. Both per-component values are packed into one `u_material` vec2 array to save uniform slots.

### Live hover elements (`data-lg-live` / `[lgTransitionRefresh]`)

SnapDOM snapshots never see `:hover`/focus or CSS transitions (no DOM mutation), so the glass showed stale content. Elements inside `bgElement` marked `data-lg-live` (export `LIVE_ATTR`; Angular's `lgtransitionrefresh` also accepted) are hidden in the main snapshot (`excludeMode: 'hide'`) and get their own snapshot, refreshed on pointerover/out, focusin/out and every 40ms while a non-transform transition/animation runs. `BackgroundCapture.draw` draws them each frame with the live `transform`/`translate`/`scale` (assumes `transform-origin: center`). `bgRenderer` + `bgElement` now combine: renderer is the base, snapshot on top.

### Focus rings (`focus.ts`)

`LiquidGlassHost` injects one stylesheet (first in `<head>`, `:where()` specificity, so app CSS wins). `FOCUS_RING_CLASS` (`lg-focus-ring`) rings the element on `:focus-visible` (React/Angular buttons, vanilla `add()` targets). `FOCUS_RING_WITHIN_CLASS` (`lg-focus-ring-within`) rings the glass host around a focused descendant (Angular input, demo search/spotlight) and only after Tab navigation: text inputs match `:focus-visible` on click too, so a `data-lg-modality` attribute on `<html>` (Tab → `keyboard`, pointerdown → `pointer`) gates it. Tokens: `--lg-focus-ring-color` / `-width` / `-offset`. Angular button host is `role="button"`, `tabindex="0"`, Enter/Space click.

## Key constraints

- `MAX_BTNS = 16` — max components per frame, baked into the GLSL `#define`. Change the constant in `types.ts` (the shader template reads it).
- WebGL 1 with `OES_standard_derivatives` extension.
- Background capture uses SnapDOM (async, not pixel-perfect). A static `bgImage` is drawn every frame as the base; the snapshot of the whole `bgElement` is drawn at its document offset minus current scroll.
- The shader runs 4 SDF loops × up to 16 components per fragment.
