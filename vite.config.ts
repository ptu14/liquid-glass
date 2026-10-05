import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { packageAliases } from './vite.aliases'

export default defineConfig({
  plugins: [react()],
  root: 'demo',
  resolve: { alias: packageAliases },
})
