# 隱私權政策

最後更新：2026-08-09

XFrame 不要求帳號，也不蒐集或儲存使用者資料。

## 資料處理

由 XFrame 執行的卡片排版、圖片產生與偏好設定皆在瀏覽器本機完成。XFrame 不提供翻譯服務，也不使用翻譯 API。網頁版與擴充功能皆不含分析、遙測或錯誤回報服務。

## Safari 網頁翻譯（選用）

手機網頁版可提示你自行使用 Safari 的網頁翻譯。只有在你按下「Safari 翻譯完成，套用譯文」後，XFrame 才會從目前分頁讀取可見譯文，用來在本機產生卡片；譯文不會由 XFrame 上傳或永久儲存。

Safari 翻譯不是 XFrame 提供的服務。Apple 表示，使用 Safari 網頁翻譯時，網頁的完整文字會傳送至 Apple 伺服器；在非私密瀏覽中，網頁網址也會傳送給 Apple。細節請見 [Apple「Safari 與隱私權」](https://www.apple.com/tw/legal/privacy/data/zh-tw/safari/)。

## 網路請求

XFrame 僅對以下網域發出請求：

- `x.com` / `twitter.com` — 讀取你所選推文的公開內容
- `pbs.twimg.com` / `abs.twimg.com` — 讀取該推文的頭像與圖片

對 x.com 的請求皆以未驗證方式發出（不帶 cookie），因此不涉及你的帳號。

## 本機儲存

網頁版使用瀏覽器的 `localStorage`，擴充功能使用 `chrome.storage.local`，僅儲存你的外觀偏好設定（顏色、尺寸、背景選擇）。此資料不離開你的裝置。

## 權限說明

- `storage` — 記住你的外觀偏好
- `x.com` / `twitter.com` 存取權 — 在推文旁顯示按鈕、讀取所選推文內容
- `pbs.twimg.com` / `abs.twimg.com` 存取權 — 讀取頭像與圖片以嵌入產出的圖片

擴充功能未要求 `<all_urls>`、`tabs`、`webRequest` 或 `cookies` 權限。

## 聯絡方式

問題請至專案 issue 頁回報。
