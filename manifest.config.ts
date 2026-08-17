import { defineManifest } from '@crxjs/vite-plugin'

const manifest = defineManifest({
  manifest_version: 3,
  name: 'XFrame',
  version: '0.3.0',
  description: '把 X 推文變成漂亮的分享圖',
  // Chrome Web Store 強制要求 128×128；其餘尺寸供工具列、擴充功能頁與
  // 管理介面使用。由 scripts/make-icons.py 產生，設計呼應背景引擎的 sunset 調色盤。
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  // 沒有 popup 是刻意的：互動入口是推文上的內嵌按鈕，不是工具列。
  // 但沒有 action 的話 Chrome 會給一個點了沒反應的預設圖示，使用者會困惑
  // （實測就發生過）。宣告 action 並用 title 直接說明按鈕在哪裡。
  action: {
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    default_title: 'XFrame — 點推文右上角的 ◪ 按鈕來產生分享圖',
  },
  permissions: ['storage'],
  host_permissions: [
    '*://x.com/*',
    '*://twitter.com/*',
    '*://pbs.twimg.com/*',
    '*://abs.twimg.com/*',
  ],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['*://x.com/*', '*://twitter.com/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
})

// @crxjs/vite-plugin types defineManifest's return as
// `ManifestV3 | Promise<ManifestV3> | ManifestV3Fn` even though we pass a
// plain object, so narrow the export back to the synchronous object shape.
export default manifest as Exclude<typeof manifest, Promise<unknown> | ((...args: never[]) => unknown)>
