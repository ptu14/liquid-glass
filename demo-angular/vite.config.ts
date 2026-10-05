import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { resolve } from 'path'
import { packageAliases } from '../vite.aliases'

export default defineConfig({
  plugins: [angular({ tsconfig: resolve(__dirname, 'tsconfig.json') })],
  root: __dirname,
  server: {
    port: 5174,
    // `host: true` binds to all interfaces so a phone on the same LAN can
    // reach the dev server (vite prints the LAN URL on startup).
    host: true,
  },
  resolve: { alias: packageAliases },
})
