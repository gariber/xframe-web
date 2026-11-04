import { describe, expect, it } from 'vitest'
import capacitorConfig from '../../capacitor.config'
import webConfig from '../../vite.web.config'
import appConfig from '../../vite.app.config'

describe('app 組建目標', () => {
  it('Capacitor 從 dist-app 載入，fetch 走原生（不受 CORS 限制）', () => {
    expect(capacitorConfig.webDir).toBe('dist-app')
    expect(capacitorConfig.appId).toBe('studio.gariber.xframe')
    expect(capacitorConfig.appName).toBe('PostCard')
    expect(capacitorConfig.plugins?.CapacitorHttp?.enabled).toBe(true)
  })

  it('UA 帶 Safari 字樣 —— X 對沒有它的 WKWebView UA 直接斷線（實測 Load failed）', () => {
    expect(capacitorConfig.appendUserAgent).toMatch(/Safari\/\d/)
  })

  it('app 有自己的入口與輸出目錄', () => {
    expect(appConfig.root).toBe('app')
    expect(appConfig.build?.outDir).toBe('../dist-app')
  })

  it('網頁版的組建設定不變', () => {
    expect(webConfig.root).toBe('web')
    expect(webConfig.build?.outDir).toBe('../dist-web')
  })
})
