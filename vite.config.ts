import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'demo/index.html'),
        'apple-tv': resolve(__dirname, 'demo/apple-tv.html'),
      },
    },
  },
})
