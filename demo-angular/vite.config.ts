import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { resolve } from 'path'

export default defineConfig({
  plugins: [angular({ tsconfig: resolve(__dirname, 'tsconfig.json') })],
  root: __dirname,
  server: {
    port: 5174,
    host: '127.0.0.1',
  },
  resolve: {
    alias: {
      '@lib': resolve(__dirname, '../src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'apple-tv': resolve(__dirname, 'apple-tv.html'),
      },
    },
  },
})
