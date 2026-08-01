# Chrome Web Store 上架清單

## 目前狀態

| 項目 | 狀態 |
|---|---|
| 128×128 圖示 | ✅ `public/icons/`，已進 manifest |
| 權限最小化 | ✅ 僅 `storage` + 四個必要來源，無 `<all_urls>` |
| 隱私權政策內容 | ✅ `PRIVACY.md` — ⚠️ 但需要**公開網址** |
| 商店說明文案 | ✅ `store/description.md` |
| 上架用 ZIP | ✅ 由 `npm run package` 產生（manifest 在根目錄） |
| **商店截圖** | ❌ **未擷取** — 見 `store/screenshots/README.md` |
| 開發者帳號 | ❌ 需註冊，一次性 5 美元 |

---

## 步驟

### 1. 註冊開發者帳號

<https://chrome.google.com/webstore/devconsole>

用 Google 帳號登入，付一次性 **5 美元**註冊費（終身，不是年費）。付款後帳號才能提交。

### 2. 準備隱私權政策的公開網址

Chrome Web Store 要求填**網址**，不能上傳檔案。`PRIVACY.md` 的內容已備妥，選一個地方放：

- **GitHub repo** — 推上 GitHub 後直接用 `PRIVACY.md` 的網址（最省事）
- **GitHub Gist** — 不想開 repo 的話
- **GitHub Pages / 任何個人網站**

### 3. 擷取截圖

至少 1 張，建議 4 張。規格：**1280×800** 或 640×400 PNG。
步驟見 `store/screenshots/README.md`（用 `npm run dev:preview` 拍）。

### 4. 打包

```bash
npm run package
```

產出 `xframe-store-upload.zip`，`manifest.json` 在根目錄 —— 這點很重要，多包一層資料夾會被拒。

### 5. 填寫商店資訊

- **名稱**：見下方「名稱的風險」
- **簡短說明**（132 字以內）：把 X 推文變成漂亮的分享圖，40 種程式生成背景，不蒐集任何資料。
- **詳細說明**：貼 `store/description.md`
- **類別**：社交與通訊 / 生產力工具
- **語言**：繁體中文

### 6. 權限理由（逐項必填）

審查員會逐條看，寫得具體通過率高：

| 權限 | 理由 |
|---|---|
| `storage` | 儲存使用者的外觀偏好（背景、字級、顏色、輸出比例）。僅存於本機，不上傳。 |
| `*://x.com/*`、`*://twitter.com/*` | 在推文旁顯示產生按鈕，並讀取使用者所選推文的公開內容以繪製卡片。 |
| `*://pbs.twimg.com/*`、`*://abs.twimg.com/*` | 讀取該推文的頭像與圖片，嵌入產出的 PNG。跨網域圖片必須轉為 data URL，否則 canvas 會被污染而無法匯出。 |

**資料用途聲明**：全部勾「不蒐集」。本擴充功能無任何分析、遙測或錯誤回報，
所有處理在本機完成，對 x.com 的請求不帶 cookie。

### 7. 提交後

審查通常數天，也可能更久。被退回會收到具體原因，修正後可重新提交。

---

## 名稱的風險（提交前請自行判斷）

目前叫 **XFrame**。「X」是 X Corp. 的商標，而這個擴充功能正是在 X 上運作 ——
Chrome Web Store 政策禁止以暗示官方關聯的方式使用他人商標。

這**不必然**會被拒（大量第三方工具都用平台名稱），但這是實際存在的風險：
可能在審查時被要求改名，也可能上架後被商標權人檢舉。

如果想降低風險，可考慮不含「X」的名稱，並在說明文字裡以「for X」而非
「X」開頭來描述用途。這是你的決定，我沒有替你改。

---

## 上架後的維護

`@crxjs/vite-plugin` 目前釘在 **beta** 版本範圍（`^2.0.0-beta.28`）。
它會改寫 manifest，理論上可能在某次更新後注入非預期的權限。

`test/manifest.dist.test.ts` 會直接檢查建置產物的權限，所以每次送審前跑一次：

```bash
npm run build && npm test
```

有異動會直接紅燈。
