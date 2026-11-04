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
  appName: 'PostCard',
  webDir: 'dist-app',
  /*
   * WKWebView 的預設 UA 沒有 `Safari/…`，X 對這種 UA 直接斷線（fetch 只得到
   * Load failed）；補上之後回應與 iPhone Safari 相同。原生 HTTP 也沿用這個 UA。
   * Threads 不受影響：它的請求自己帶爬蟲 UA。
   */
  appendUserAgent: 'Version/18.0 Mobile/15E148 Safari/604.1',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
