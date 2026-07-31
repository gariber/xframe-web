# 商店截圖 — 待手動擷取

Chrome Web Store 要求 1280×800 PNG。以下四張尚未擷取。

## 擷取方式

```bash
npm run dev:preview
```

瀏覽器開 `http://localhost:5199`，視窗調成 1280×800，依下列情境截圖：

| 檔名 | 內容 |
|---|---|
| `01-editor.png` | 預設 `plain` fixture，卡片預覽 + 右側完整控制面板 |
| `02-backgrounds.png` | 捲到背景選擇區，40 張縮圖可見 |
| `03-quoted.png` | 切到 `quoted` fixture，巢狀引用推文卡片可見 |
| `04-result.png` | 點「下載 PNG」後產出的成品圖 |

## 為什麼沒有自動產生

擷取這些需要把畫面存成檔案。開發環境的瀏覽器工具能顯示畫面但無法寫入本機檔案，
因此這四張必須由人手動擷取。頁面本身已驗證可正常運作（見 `docs/superpowers/plans/` 的 Task 12 實測紀錄）。
