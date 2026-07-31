import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// 獨立於 vite.config.ts 之外：預覽頁純粹是開發用網頁，不能讓 CRXJS 外掛（只認得
// manifest.config.ts 描述的擴充功能進入點）介入，否則一般網頁模式的 HMR/建置行為
// 會被扭曲。這份設定完全不會被 `npm run build`（擴充功能建置）讀取。
export default defineConfig({
  root: 'dev',
  publicDir: false,
  plugins: [preact()],
  server: {
    port: 5199,
    fs: { allow: ['..'] },
  },
})
