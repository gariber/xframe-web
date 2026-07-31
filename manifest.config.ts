import { defineManifest } from '@crxjs/vite-plugin'

const manifest = defineManifest({
  manifest_version: 3,
  name: 'XFrame',
  version: '0.1.0',
  description: '把 X 推文變成漂亮的分享圖',
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
