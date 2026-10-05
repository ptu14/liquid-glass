# Liquid Glass

Apple-style **liquid glass** for the web. A WebGL shader refracts the live page behind your elements: rounded-rect SDFs, physically based rim refraction, liquid merging between neighbours, frost, tint and specular highlights. The elements themselves stay ordinary, interactive DOM.

**[Live demo](https://ptu14.github.io/liquid-glass/)** · [Angular](https://ptu14.github.io/liquid-glass/angular/) · [Vanilla / CDN](https://ptu14.github.io/liquid-glass/vanilla/)

| Package | | |
| --- | --- | --- |
| [`@daniluk/liquid-glass`](packages/core) | Framework-free core: renderer, background capture, vanilla `LiquidGlass` API, CDN build | [README](packages/core/README.md) |
| [`@daniluk/liquid-glass-react`](packages/react) | `<LiquidGlassProvider>`, `<LiquidGlassButton>`, `<LiquidGlassCard>`, `useLiquidGlass` | [README](packages/react/README.md) |
| [`@daniluk/liquid-glass-angular`](packages/angular) | `<liquid-glass-container>`, button, card, input, `[liquidGlass]` directive | [README](packages/angular/README.md) |

## At a glance

**Vanilla / CDN**

```html
<script type="module">
  import { LiquidGlass } from 'https://cdn.jsdelivr.net/npm/@daniluk/liquid-glass'

  const glass = new LiquidGlass({ bgElement: document.querySelector('main') })
  glass.add(document.querySelector('nav'))
</script>
```

**React**

```tsx
<LiquidGlassProvider bgElement={pageRef}>
  <div ref={pageRef}>…</div>
  <LiquidGlassButton variant="primary">Play</LiquidGlassButton>
</LiquidGlassProvider>
```

**Angular**

```html
<div #page>…</div>
<liquid-glass-container [bgElement]="page">
  <liquid-glass-button variant="primary">Play</liquid-glass-button>
</liquid-glass-container>
```

## How it works

```
z: 0   your page            ← captured with SnapDOM (+ optional image / custom renderer)
z: 10  WebGL canvas         ← one full-screen overlay, pointer-events: none
z: 20  glass elements       ← transparent DOM; their rects drive the shader
```

Each frame the host reads every registered element's `getBoundingClientRect()`, composites the background texture and renders all glass in one fragment shader. Each shape is a rounded-rect SDF, combined with a smooth minimum so neighbours bridge like liquid. The rim is a convex squircle bezel that refracts the background (Snell, n = 1.5), with blur, chromatic aberration, tint, grain and specular on top. Two render layers let thin buttons sit on thick cards without merging.

The core owns all of this: rendering, background capture, the component registry and the frame loop. The React and Angular packages are thin adapters over `LiquidGlassHost`.

## Development

```bash
npm install
npm run demo              # React demo        → http://localhost:5173
npm run demo:angular      # Angular demo      → http://localhost:5174
npm run example:vanilla   # CDN-style example → builds core, then serves examples/vanilla
npm run typecheck
npm run build             # core (tsup) → react (tsup) → angular (ng-packagr)
npm run pages:build       # all demos → site/ (deployed to GitHub Pages on push to main)
```

The demos import the packages by name; `vite.aliases.ts` points those names at `packages/*/src`, so edits hot-reload without a rebuild. Add `--host` to a demo command to open it from a phone on the same network.

```
packages/
  core/       @daniluk/liquid-glass          tsup → ESM + CJS + d.ts, plus dist/liquid-glass.browser.js for CDNs
  react/      @daniluk/liquid-glass-react    tsup → ESM + CJS + d.ts
  angular/    @daniluk/liquid-glass-angular  ng-packagr → Angular Package Format in packages/angular/dist
demo/            React demo (Vite)
demo-angular/    Angular demo (Vite + Analog)
examples/vanilla No-bundler example importing the CDN build
```

### Releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets). The three packages are versioned together (`fixed`).

```bash
npx changeset             # describe the change
npm run version-packages  # bump versions + changelogs
npm run release           # build all, publish core + react, publish packages/angular/dist
```

The Angular package is published from its `dist/` folder (ng-packagr output), which is why `release` publishes it separately.

## License

MIT © Mateusz Daniluk
