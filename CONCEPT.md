# Liquid Glass – WebGL Component Library Spec

> Architecture reference for building a cross-framework UI component library with WebGL-powered liquid glass effect.  
> **Start with React. Angular and Web Components come later. All WebGL code must be framework-agnostic.**

---

## Concept

A UI component system where elements rendered on top of an HTML background get a **liquid glass** visual effect via a shared WebGL canvas overlay. The effect includes:

- **Frosted background sampling** – canvas captures the HTML background and renders it displaced inside each component
- **Edge-only refraction** – displacement only within ~5px of the shape boundary, interior is uniform
- **Metaball merge** – components near each other organically blend their glass surfaces using SDF smooth-minimum
- **Per-component merge lock** – individual components can opt out of merging (double-click to toggle in the PoC)
- **Animated lock/unlock** – blend factor animates with easing when merge is toggled

---

## Layer Stack

```
z:0   HTML background     – any DOM content (gradients, images, text, video)
z:10  WebGL canvas        – full-screen overlay, pointer-events: none
z:20  Glass components    – transparent background, normal DOM interactivity
z:100 UI controls         – on top of everything
```

The canvas sits between the background and the components. Components are fully interactive because the canvas ignores pointer events.

---

## Package Structure

```
packages/
  liquid-glass-core/        ← Framework-agnostic WebGL engine (shared)
    src/
      LiquidGlassRenderer.ts    – WebGL context, shaders, render loop
      types.ts                   – shared types
      utils.ts                   – easing, math helpers
    index.ts

  liquid-glass-react/       ← React adapter
    src/
      LiquidGlassProvider.tsx   – canvas mount, renderer lifecycle
      useLiquidGlass.ts         – hook: registers a component rect
      LiquidGlassButton.tsx     – example component
    index.ts

  liquid-glass-angular/     ← Angular adapter (later)
  liquid-glass-wc/          ← Web Components adapter (later)
```

---

## Core Engine – `LiquidGlassRenderer`

The renderer is a plain TypeScript class. It owns the WebGL context and knows nothing about React, Angular, or any framework.

### Constructor / Lifecycle

```ts
class LiquidGlassRenderer {
  constructor(canvas: HTMLCanvasElement, bgSource: () => HTMLCanvasElement)
  destroy(): void

  // Called by framework adapter every frame or on layout change
  setComponents(components: GlassComponentData[]): void

  // Global shader params
  setParams(params: Partial<GlassParams>): void

  // Start/stop render loop
  start(): void
  stop(): void
}
```

### `GlassComponentData`

```ts
interface GlassComponentData {
  id: string
  rect: DOMRect          // from getBoundingClientRect()
  borderRadius: number   // px
  blendK: number         // 0 = locked (hard SDF), >0 = merge radius
  locked: boolean        // visual indicator only, blendK drives shader
}
```

### `GlassParams`

```ts
interface GlassParams {
  blend: number          // global merge radius (k for smin), default 60
  dispStr: number        // displacement strength, default 0.028
  aberr: number          // chromatic aberration, default 0.006
  refr: number           // refraction multiplier, default 3.5
  bgCaptureInterval: number  // ms between background snapshots, default 16
}
```

---

## WebGL Pipeline

### Per-frame steps

```
1. captureBg()
   └─ drawImage(bgSource()) onto OffscreenCanvas
   └─ gl.texImage2D() → uniform sampler2D u_bg

2. setComponents(components)
   └─ getBoundingClientRect() per component
   └─ compute animated blendK (see Animation)
   └─ upload u_btns[], u_blendK[] uniforms

3. gl.drawArrays(TRIANGLES, 0, 6)
   └─ full-screen quad, fragment shader does all work
```

### Uniforms

| Uniform | Type | Description |
|---|---|---|
| `u_bg` | `sampler2D` | background texture snapshot |
| `u_res` | `vec2` | canvas resolution in px |
| `u_time` | `float` | elapsed seconds |
| `u_btnCount` | `int` | number of active components |
| `u_btns[8]` | `vec4[]` | x, y, w, h from `getBoundingClientRect` |
| `u_blendK[8]` | `float[]` | animated blend k per component |
| `u_radius` | `float` | border-radius in px |
| `u_blend` | `float` | global target k (used for animation target) |
| `u_dispStr` | `float` | displacement strength |
| `u_aberr` | `float` | chromatic aberration |
| `u_refr` | `float` | refraction multiplier |

> `MAX_BTNS = 8` is a compile-time GLSL constant. Changing it requires shader recompilation. Consider making it configurable at renderer construction time.

---

## Fragment Shader

Required extension (WebGL 1):
```glsl
#extension GL_OES_standard_derivatives : enable
```

### Coordinate spaces

Everything in the shader uses **DOM space** (Y=0 at top), matching `getBoundingClientRect`. The only Y-flip happens at `texture2D` sampling.

```
getBoundingClientRect  →  DOM space  (Y↑ = down on screen)
pxDOM in shader        →  DOM space  ← SDF, gradient, normal computed here
uv / dispUV            →  UV space   (Y=0 bottom)
texture2D sample       →  1.0 - uv.y ← single flip, only here
nUV = vec2(n.x, -n.y)  →  normal converted DOM → UV before displacement
```

**This is the critical invariant.** All previous bugs in the PoC came from mixing these two spaces.

### SDF – Rounded Rectangle

```glsl
float sdRoundedRect(vec2 p, vec2 half_size, float r) {
  vec2 d = abs(p) - half_size + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
```

### Metaball Merge – Smooth Minimum

```glsl
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
```

`k` = merge zone width in px.  
- `k = 0` → hard `min()`, no merging  
- `k = 60` → ~60px organic blend zone between components

Per-component: `u_blendK[i] < 0.5` → use `min()`, otherwise `smin(k)`.

### Numerical SDF Gradient (Normal)

4-sample finite difference in DOM space:

```glsl
// repeat for -x, +y, -y
float f_r = 1e9;
for (int i = 0; i < MAX_BTNS; i++) {
  if (i >= u_btnCount) break;
  vec2 c = u_btns[i].xy + u_btns[i].zw * 0.5;
  vec2 h = u_btns[i].zw * 0.5;
  float s = sdRoundedRect(pxDOM + vec2(eps, 0) - c, h, u_radius);
  float k = u_blendK[i];
  f_r = (k < 0.5) ? min(f_r, s) : smin(f_r, s, k);
}
vec2 nDOM = normalize(vec2(f_r - f_l, f_d - f_u));
vec2 nUV  = vec2(nDOM.x, -nDOM.y);  // DOM→UV flip
```

> This runs 4 full component loops per fragment. With 8 components = 32 `sdRoundedRect` calls per pixel. Acceptable for desktop, may need optimization for mobile (bake normal to texture).

### Displacement – Edge Only

```glsl
float edgePx   = 5.0 * u_dispStr * 15.0;
float edgeMask = smoothstep(edgePx, 0.0, abs(field));  // 1 at edge, 0 elsewhere

vec2 dispUV = uv + nUV * edgeMask * u_dispStr * u_refr;
```

`edgeMask` is symmetric around `field = 0` – affects both inside and outside of the shape boundary, within `edgePx` pixels. **The interior is untouched.**

### Chromatic Aberration

```glsl
vec2 aber  = nUV * u_aberr * edgeMask;  // edge-only, like a prism
vec2 sUV_r = vec2(dispUV.x + aber.x, 1.0 - (dispUV.y + aber.y));
vec2 sUV_b = vec2(dispUV.x - aber.x, 1.0 - (dispUV.y - aber.y));
// G channel uses undisplaced UV
```

### Glass Tint & Rim

```glsl
col *= 0.88;                                    // uniform interior darkening
float rim = smoothstep(3.0, 0.0, abs(field));  // ±3px rim highlight
col += rim * 0.25;
```

### Alpha – Subpixel AA

```glsl
float fw    = fwidth(field);               // screen-space derivative ~1px
float alpha = smoothstep(fw, -fw, field);  // AA exactly 1px wide
```

---

## Animation – Blend Factor

Managed entirely in JS/TS, not in the shader.

```ts
interface ComponentAnimState {
  locked: boolean
  animStart: number | null   // performance.now() at toggle, null = settled
  animDir: 1 | -1            // 1 = unlocking (k→target), -1 = locking (k→0)
  blendK: number             // current value sent to shader
}
```

```ts
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }
function easeInQuad(t: number)   { return t * t }

const ANIM_DURATION = 500 // ms

function tickBlendK(state: ComponentAnimState, targetK: number, now: number): number {
  if (state.animStart === null) return state.locked ? 0 : targetK

  const t      = Math.min((now - state.animStart) / ANIM_DURATION, 1)
  const eased  = state.animDir === 1 ? easeOutCubic(t) : 1 - easeInQuad(t)
  if (t >= 1) state.animStart = null
  return eased * targetK
}
```

Unlock uses `easeOutCubic` – slow start, fast spread, deceleration (liquid feel).  
Lock uses `easeInQuad` reversed – fast cutoff (snappy).

---

## Background Snapshot

The renderer receives a `bgSource: () => HTMLCanvasElement` factory. The caller is responsible for rendering the background into it.

**Options by use case:**

| Scenario | Approach |
|---|---|
| Static/CSS background | Replicate in 2D canvas at init, re-capture on resize only |
| Animated CSS background | Re-capture every frame (current PoC approach) |
| Real DOM snapshot | `html2canvas(document.body)` – slow, use sparingly |
| Video background | `drawImage(videoElement)` every frame |

The renderer calls `bgSource()` every `bgCaptureInterval` ms and uploads the result via `gl.texImage2D`.

---

## React Adapter – API Design

### Provider

```tsx
// Mounts the WebGL canvas, owns the renderer lifecycle
// bgRef points to any element whose visual content should be captured
<LiquidGlassProvider bgSource={myBgCanvasRef}>
  {children}
</LiquidGlassProvider>
```

Internally:
- Creates `LiquidGlassRenderer` on mount
- Appends `<canvas>` to `document.body` (or a portal target)
- Runs render loop via `requestAnimationFrame`
- Destroys renderer on unmount

### Hook

```ts
// Registers a component with the renderer, returns lock toggle
const { ref, locked, toggleLock } = useLiquidGlass({
  borderRadius: 100,   // px, should match CSS
  initialLocked: false
})
```

`ref` is a `RefObject<HTMLElement>` – attach to any DOM element.  
The hook calls `getBoundingClientRect()` each frame and pushes data to the renderer via a shared registry (context or atom).

### Component

```tsx
<LiquidGlassButton onClick={...}>
  Primary
</LiquidGlassButton>
```

Built on top of `useLiquidGlass`. Transparent background, no border, `appearance: none`. All visual chrome comes from the WebGL canvas beneath it.

---

## CSS Requirements for Glass Components

```css
.glass-component {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  border: 0;
  box-shadow: none;
  outline: none;
  /* border-radius must match u_radius sent to shader */
  border-radius: 100px;
}
.glass-component:focus { outline: none; box-shadow: none; }
.glass-component::before,
.glass-component::after { display: none; }
```

> `border: none` is not enough – use `border: 0`. Some browsers render a 1px system border on `<button>` even with `border: none`.

---

## Known Limitations & Future Work

### Current limitations

**Background snapshot** – the PoC replicates the background in JS. True DOM pixel capture requires `html2canvas` (slow) or a CSS Houdini Paint Worklet. For production, a static or CSS-only background is the most reliable path.

**MAX_BTNS = 8** – hardcoded in GLSL. Changing requires shader recompilation. WebGL 2 would allow dynamic arrays via UBOs.

**Numerical gradient** – 4 loops × 8 components = 32 SDF evaluations per fragment. Acceptable on desktop GPU, may need a normal map baking pass for mobile.

**WebGL 1 dependency** – `OES_standard_derivatives` for `fwidth()` is widely supported but technically optional. WebGL 2 has it built in and is the better long-term target.

**Single canvas instance** – the current design assumes one global renderer per page. Multiple independent glass regions would need instancing.

### Planned improvements

- WebGL 2 upgrade (UBO for component data, built-in derivatives)
- Normal map pre-bake pass for mobile performance
- `ResizeObserver` integration to avoid layout thrashing
- Spring physics for merge animation (instead of fixed easing)
- Shadow / specular light position as a prop
- Multiple glass layers (nested components)