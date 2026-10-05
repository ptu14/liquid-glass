# @daniluk/liquid-glass

Apple-style **liquid glass** for the web. A WebGL shader refracts the live page behind your elements — rounded-rect SDFs, physically based rim refraction, metaball merging between neighbours, frost, tint and specular — while the elements themselves stay ordinary, interactive DOM.

This is the framework-free core. For components see [`@daniluk/liquid-glass-react`](https://www.npmjs.com/package/@daniluk/liquid-glass-react) and [`@daniluk/liquid-glass-angular`](https://www.npmjs.com/package/@daniluk/liquid-glass-angular).

## Install

```bash
npm install @daniluk/liquid-glass
```

Or straight from a CDN, no build step:

```html
<script type="module">
  import { LiquidGlass } from 'https://cdn.jsdelivr.net/npm/@daniluk/liquid-glass'
</script>
```

The CDN entry (`dist/liquid-glass.browser.js`, also exported as `@daniluk/liquid-glass/browser`) is a single minified ES module with its only dependency, [SnapDOM](https://github.com/zumerlab/snapdom), bundled in. Pin a version in production: `…/npm/@daniluk/liquid-glass@0.1.0`.

## Quick start

```html
<main id="page">
  <!-- anything: text, images, video, canvas… -->
</main>

<nav id="nav" style="position: fixed; top: 12px; left: 12px; right: 12px; height: 56px; border-radius: 28px">
  Menu
</nav>

<script type="module">
  import { LiquidGlass } from 'https://cdn.jsdelivr.net/npm/@daniluk/liquid-glass'

  const glass = new LiquidGlass({
    bgElement: document.getElementById('page'), // what the glass refracts
    bgImage: '/wallpaper.jpg',                   // optional static base layer
  })

  glass.add(document.getElementById('nav'))
</script>
```

Glass elements must be **transparent** (no background) and sit above the canvas — give them `position` and a `z-index` above 10. The corner radius is read from the element's `border-radius` unless you pass `radius`.

## How it works

```
z: 0   your page (bgElement / bgImage / bgRenderer)
z: 10  WebGL canvas — full-screen, pointer-events: none
z: 20+ glass elements — transparent, fully interactive
```

Every frame the renderer reads each glass element's `getBoundingClientRect()`, composites a background texture (image → SnapDOM snapshot of `bgElement` shifted by scroll → live elements) and draws the glass in one fragment shader.

`bgElement` is captured with SnapDOM and re-captured on scroll, resize, DOM mutations and web-font load. Snapshots don't see `:hover`, focus or CSS transitions; mark such elements with `data-lg-live` (see [Live elements](#live-elements)).

## API

### `new LiquidGlass(options?)`

| Option | Type | Description |
| --- | --- | --- |
| `bgElement` | `HTMLElement` | Element captured as the background. |
| `bgImage` | `string` | Static image URL, drawn with `background-size: cover` logic. Needs CORS for cross-origin URLs. |
| `bgRenderer` | `(ctx, w, h) => void` | Draw your own base layer each frame (replaces `bgImage`). The `bgElement` snapshot is drawn on top. |
| `params` | `Partial<GlassParams>` | Shader tunables, see below. |
| `canvas` | `HTMLCanvasElement` | Use your own canvas instead of the auto-created fixed overlay. |
| `zIndex` | `number` | z-index of the created canvas. Default `10`. |

Throws if WebGL is unavailable.

| Method | Description |
| --- | --- |
| `add(el, options?) → GlassHandle` | Turn an element into glass. |
| `setParams(params)` | Update shader params (cheap, use it for live sliders or device tilt). |
| `setBgElement(el)` / `setBgImage(url)` / `setBgRenderer(fn)` | Swap the background (`null` clears it). |
| `capture()` | Force a background re-capture. Dispatching `CAPTURE_EVENT` on `document` does the same. |
| `destroy()` | Stop rendering and remove the canvas. |

`GlassHandle` has `update(options)` and `remove()`.

### Glass options (`add`)

| Option | Default | Description |
| --- | --- | --- |
| `radius` | computed `border-radius` | Corner radius in px. |
| `thickness` | `1` | `1` = regular material, `~0.35` = thin. |
| `layer` | `0` | `1` renders on top of layer 0 without merging (e.g. buttons on a card). |
| `tint` | — | RGB `[0–1]`. Darkens while pressed. |
| `frost` | `0` | `0–1` frosted material (blur `frostBlur` + milky veil). |
| `clear` | `false` | Layer 1 only: see-through window, no refracted copy of the glass below. |
| `fuse` | `false` | When two overlapping `fuse` elements form a near-rectangle (e.g. footer docked under a card), they render as one body. |
| `blend` | global `blend` | Own merge radius in px; a pair uses the smaller one. |
| `metaball` | `false` | Keep the soft blob bulge while overlapping. |
| `locked` | `false` | Opt out of merging with neighbours (animated). |
| `pressable` | `true` for `<button>`/`<a>` | Press tint on pointer down. |

### `GlassParams`

| Param | Default | Description |
| --- | --- | --- |
| `blend` | `20` | Merge radius in px between neighbouring elements. |
| `refr` | `3.5` | Rim refraction strength (`3.5` ≈ physical glass, n = 1.5). |
| `bezelWidth` | `22` | Width of the curved rim in px. |
| `dispStr` | `0.028` | Extra broad displacement across the rim. |
| `aberr` | `0` | Chromatic aberration at the edges. |
| `edgeBlur` | `0.85` | Blur toward the rim, like Apple's material. |
| `frostBlur` | `14` | Blur radius in px used by `frost` and `edgeBlur`. |
| `glassBlur` | `0` | Gaussian blur of the whole background (like `backdrop-filter: blur()`). |
| `frost` | `0` | Sandblasted noise amount. |
| `specularOpacity` | `0.15` | Rim highlight opacity, `0` disables it. |
| `specularAngle` | `π/4` | Light direction in radians. |
| `mergeOnOverlap` | `true` | Deeply overlapping elements become a clean union instead of a bulge. |
| `bgCaptureInterval` | `16` | Minimum ms between background texture uploads. |

`DEFAULT_GLASS_PARAMS` holds these values.

### Live elements

Elements inside `bgElement` with the `data-lg-live` attribute (`LIVE_ATTR`) get their own snapshot, refreshed on hover/focus and during CSS transitions, and are drawn every frame with their current `transform` / `translate` / `scale`. Use it for cards that lift on hover under a glass toolbar. Assumes `transform-origin: center`.

### Building blocks

Framework adapters are thin wrappers around these, and you can use them too:

- `LiquidGlassHost`: canvas + renderer + background + component registry + frame loop. `register(id, getData)`, `unregister(id)`, `setParams()`, `background`, `destroy()`.
- `BackgroundCapture`: the background compositor on its own.
- `LiquidGlassRenderer`: the raw WebGL renderer (`setComponents(GlassComponentData[])`, `setParams`, `start`, `stop`, `destroy`).
- Helpers: `VARIANT_TINT`, `rubberBand`, `createGlassId`, `drawCover`.

## Limits

- Up to **16** glass elements per canvas (`MAX_BTNS`, a shader constant).
- WebGL 1 with `OES_standard_derivatives` (every current browser).
- SnapDOM capture is close to, but not, pixel-perfect. Cross-origin images in `bgElement` need CORS headers. `<canvas>` elements are skipped; draw them via `bgRenderer` instead.
- Capture runs on the main thread. Very large or constantly mutating `bgElement`s cost frames; scope it to what actually sits behind the glass.

## License

MIT
