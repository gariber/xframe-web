# XFrame

把 X 推文變成漂亮的分享圖的 Chrome 擴充功能。

## 開發

```bash
npm install
npm test          # 跑測試（138 個）
npm run build     # 產出 dist/
npm run dev:preview   # 開發預覽頁 → http://localhost:5199
```

載入 `dist/` 到 `chrome://extensions`（開發人員模式 → 載入未封裝項目）。

## 架構

擷取推文不靠抓取 React DOM，而是以**未驗證請求**（`credentials: 'omit'`）取得 X 的伺服器渲染頁面，
解析其中的 schema.org microdata。X 對未登入請求回傳的頁面帶有完整結構化資料：作者、內文、時間、
五種互動數（回覆／轉推／引用／讚／瀏覽）、巢狀引用推文。

這比抓取混淆過的 class name 穩健得多，且測試 fixture 與正式環境請求同一份資源，無落差。

```
content/permalink.ts   全系統唯一的 live DOM 依賴：找出 /status/ 連結
background/            不帶 cookie 抓取頁面；代抓頭像圖片轉 base64（避免污染 canvas）
parse/microdata.ts     HTML 字串 → TweetData（純函式）
render/backgrounds.ts  程式生成背景，零圖片檔
render/Card.tsx        卡片模板 —— 預覽節點本身即為匯出來源
```

詳見 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`。

## 開發預覽頁

擴充功能必須載入真 Chrome 才能測試。`npm run dev:preview` 把 `Card` 與控制項當普通網頁跑，
讓渲染、中文換行、引用推文、PNG 匯出都能在開發時驗證，也用於產生商店截圖。

## 測試

```bash
./scripts/capture-fixtures.sh   # 更新測試 fixture（推文被刪除時需要）
npm test
```

fixture 是四份真實的 X 推文頁 HTML，以 `curl`（不帶 cookie）擷取。
