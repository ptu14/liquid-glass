import { defineConfig } from 'tsup'

export default defineConfig([
  // npm: ESM + CJS, dependencies stay external
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  // CDN: one self-contained ES module (snapdom bundled), usable via
  // <script type="module"> import from jsDelivr / unpkg
  {
    entry: { 'liquid-glass.browser': 'src/index.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2020',
    noExternal: ['@zumer/snapdom'],
    minify: true,
    sourcemap: true,
    outExtension: () => ({ js: '.js' }),
  },
])
