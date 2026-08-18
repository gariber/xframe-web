/**
 * 本副本在頁面 DOM 上的識別字串。
 *
 * 注入標記與 shadow host 都掛在**頁面自己的 DOM** 上，而頁面 DOM 是所有擴充
 * 功能共用的。同時裝著商店版與未封裝版時，若兩份用同一組字串，先跑到的那份
 * 會把 anchor 標記起來、後跑的整個跳過 —— 頁面上只有一顆按鈕，屬於誰全看載入
 * 順序，輸的那份連 service worker 都不會被喚醒。把擴充功能自己的 ID 併進去，
 * 兩份副本才各自獨立。
 *
 * 集中在這裡而不是各檔案自己組，是因為 detector 與 content 進入點都要用，
 * 而且偵測「還有沒有別的副本在跑」需要知道「哪些字串是我的、哪些不是」。
 */

/** 在頂層讀取要能容忍 `chrome` 不存在（單元測試環境與任何非擴充功能情境）。 */
export const EXTENSION_ID =
  typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'dev'

/** 0.3.0 以前所有副本共用的標記。用來認出「還有一份舊版正在跑」。 */
export const LEGACY_MARK = 'data-xframe-injected'
export const LEGACY_HOST_ID = 'xframe-host'

export const MARK = `${LEGACY_MARK}-${EXTENSION_ID}`
export const BUTTON_CLASS = `xframe-trigger-${EXTENSION_ID}`
export const HOST_ID = `${LEGACY_HOST_ID}-${EXTENSION_ID}`

let warned = false

/**
 * 偵測頁面上是否還有另一份 XFrame 在運作，有的話大聲說出來。
 *
 * 這個狀況從使用者的角度完全無法分辨：兩份都會在推文右上角注入按鈕，而兩顆
 * 按鈕的定位一模一樣（top:8px right:8px）—— 它們**完全重疊**，點下去永遠是同
 * 一顆，且看不出是哪一份的。結果就是「明明裝了新版，行為卻始終是舊版」，而且
 * 沒有任何錯誤訊息。實際發生過，查了很久。
 *
 * 舊版不會印任何 log，所以只能從它留在 DOM 上的痕跡反推。
 */
export function warnIfAnotherCopyIsRunning(): void {
  if (warned) return
  const legacy = document.querySelector(`[${LEGACY_MARK}]`) !== null
    || document.getElementById(LEGACY_HOST_ID) !== null
  const otherNamespaced = [...document.querySelectorAll('[id^="xframe-host-"]')]
    .some((el) => el.id !== HOST_ID)
  if (!legacy && !otherNamespaced) return

  warned = true
  console.warn(
    '[XFrame] ⚠️ 這個頁面上還有另一份 XFrame 正在運作' +
      (legacy ? '（0.3.0 以前的版本，通常是 Chrome 線上商店安裝的那份）' : '') +
      '。\n' +
      '兩份都會在推文右上角注入按鈕，而且位置完全重疊 —— 你點到的可能不是這一份，' +
      '因此會看到舊版的行為（作者被遮蔽、沒有圖片與互動數）。\n' +
      '請到 chrome://extensions 停用或移除其中一份，只留要用的那個。',
  )
}
