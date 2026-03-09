# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # tsup → dist/ (CJS + ESM + .d.ts)
npm run dev          # tsup --watch
npm run demo         # vite dev server (port 5173, hot reload)
npm run demo:build   # vite production build of demo
npm run lint         # eslint src/
npm run typecheck    # tsc --noEmit
```

The demo server is configured in `.claude/launch.json` as `npx vite --host 127.0.0.1` on port 5173.

## Architecture

**Core-Adapter pattern**: the WebGL engine (`src/core/`) is framework-agnostic; React bindings (`src/react/`) wrap it. This supports future Angular/Web Components adapters.

**Rendering stack** (z-order):
```
z:0   HTML background     – DOM content behind the glass
z:10  WebGL canvas         – full-screen overlay (pointer-events: none)
z:20  Glass components     – transparent DOM elements, interactive
```

### Core (`src/core/`)

- **LiquidGlassRenderer** — main class. Takes a `<canvas>` and a `bgSource` callback (returns a canvas with the current background). Runs a rAF loop: captures bg texture → computes per-component SDF union → renders glass pass(es) → composites layers.
- **shaders.ts** — GLSL vertex + fragment shaders. The fragment shader evaluates `sdRoundedRect` for each component, blends via `smin` (quadratic smooth-min, metaball merge), adds Poisson-disk blur, chromatic aberration, refraction displacement, tinting, grain, and rim highlight. Subpixel AA via `fwidth()`.
- **types.ts** — `GlassComponentData` (per-component rect/radius/blendK/thickness/layer), `GlassParams` (global shader tunables), `ComponentAnimState`, `MAX_BTNS = 8` (hardcoded in GLSL).
- **utils.ts** — `tickBlendK()` animates blendK over 500ms with easeOutCubic (unlock) / easeInQuad (lock).

### React Adapter (`src/react/`)

- **LiquidGlassProvider** — creates the WebGL canvas, instantiates the renderer, provides a registry context. Supports three background modes: `bgRenderer` (manual draw), `bgElement` (auto html2canvas capture with scroll/resize/mutation listeners), `bgImage` (static URL blended with captured overlay).
- **useLiquidGlass** — hook that registers a component with the renderer. Returns a `ref` to attach to the DOM element and a `toggleLock` function. Each frame, `getBoundingClientRect()` feeds the component's rect to the shader.
- **LiquidGlassButton / LiquidGlassCard** — pre-styled components built on the hook.

### Multi-pass rendering

Layer 0 components render to an FBO + screen. The FBO is composited with the original bg into a second FBO, which becomes the background texture for layer 1. Layer 1 renders on top without clearing. This lets thin-material buttons (layer 1) sit on top of thick-material cards (layer 0) without SDF merge.

### SDF merge-on-overlap (`mergeOnOverlap` param)

When enabled (default), the renderer detects DOM rect overlap between unlocked same-layer components. On overlap, `blendK` animates toward 0 over 400ms, transitioning `smin` (metaball blend) to `min` (hard SDF union). On separation, `blendK` restores in 200ms. This is tracked per-component in the `mergeRelaxT` map.

## Key constraints

- `MAX_BTNS = 8` — max components per frame, baked into the GLSL `#define`. Changing it requires updating the constant in `types.ts` (the shader template reads it).
- WebGL 1 with `OES_standard_derivatives` extension.
- Background capture uses `html2canvas` (async, not pixel-perfect). A static `bgImage` is drawn every frame as the base; the html2canvas snapshot is overlaid and shifted by scroll delta between captures. Oversized capture pad: 300px.
- The shader runs 4 SDF loops × up to 8 components = 32 evaluations per fragment.
