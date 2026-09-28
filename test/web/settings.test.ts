import { describe, it, expect } from 'vitest'
import { settingsFromSaved } from '../../web/App'
import { DEFAULT_SETTINGS } from '../../src/render/Card'

/*
 * 「顯示項目」那一區已經從網頁版移除。存檔卻是留在使用者裝置上的舊資料，
 * 裡面可能還帶著當初關掉的選擇 —— 例如把推文圖片關掉。介面上已經沒有地方
 * 可以打開了，所以若照舊讀回來，那個人就再也看不到圖片，而且完全找不到原因：
 * 不會報錯，卡片只是靜靜地少了東西。
 *
 * 這組斷言鎖住的就是這條遷移。
 */
describe('settingsFromSaved：拿掉「顯示項目」之後的存檔遷移', () => {
  it.each(['avatar', 'stats', 'timestamp', 'media'] as const)(
    '存檔裡關掉的 %s 不會被讀回來 —— 介面上已經打不開了',
    (key) => {
      const out = settingsFromSaved({ show: { ...DEFAULT_SETTINGS.show, [key]: false } })
      expect(out.show[key]).toBe(true)
    },
  )

  it('parent 仍然讀得回來 —— 它在預覽底下有自己的控制項，關掉之後打得開', () => {
    expect(settingsFromSaved({ show: { ...DEFAULT_SETTINGS.show, parent: false } }).show.parent)
      .toBe(false)
    expect(settingsFromSaved({ show: { ...DEFAULT_SETTINGS.show, parent: true } }).show.parent)
      .toBe(true)
  })

  it('沒有 show 的舊存檔照樣是預設值', () => {
    expect(settingsFromSaved({ padding: 30 }).show).toEqual(DEFAULT_SETTINGS.show)
  })

  it('其餘設定照舊讀回來', () => {
    const out = settingsFromSaved({ padding: 96, fontSize: 31, aspect: '4:5', timeFormat: 'absolute' })
    expect([out.padding, out.fontSize, out.aspect, out.timeFormat]).toEqual([96, 31, '4:5', 'absolute'])
  })

  it('已移除的比例退回預設，不會留下一個選不中的下拉', () => {
    expect(settingsFromSaved({ aspect: '16:9' as never }).aspect).toBe('9:16')
  })

  it('不會改到傳進來的物件', () => {
    const saved = { show: { ...DEFAULT_SETTINGS.show, parent: false } }
    settingsFromSaved(saved).show.parent = true
    expect(saved.show.parent).toBe(false)
  })
})
