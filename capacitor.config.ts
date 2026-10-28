import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS app 的外殼設定。只給自己用，不上架。
 *
 * CapacitorHttp 開著：app 裡的 `fetch` 改走原生網路層，不受 CORS 限制。
 * 網頁版抓不到 Threads、必須經 Cloudflare worker 代理，就是因為 CORS；
 * app 裡可以直接抓，也就不需要那支 worker。
 */
const config: CapacitorConfig = {
  appId: 'studio.gariber.xframe',
  appName: 'XFrame',
  webDir: 'dist-app',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
