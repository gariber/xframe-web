import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  root: 'web',
  // GitHub Pages 會放在 /<repo>/ 子路徑底下，用相對路徑才不會 404
  base: './',
  plugins: [preact()],
  build: { outDir: '../dist-web', emptyOutDir: true },
  server: { port: 5200 },
})
