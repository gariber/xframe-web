import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// iOS app 的網頁層。跟網頁版共用 src/，app 專屬的東西只放在 app/。
export default defineConfig({
  root: 'app',
  // Capacitor 從本機檔案載入，用相對路徑
  base: './',
  plugins: [preact()],
  build: { outDir: '../dist-app', emptyOutDir: true },
  server: { port: 5201 },
})
