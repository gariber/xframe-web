# 部署到 GitHub Pages

全程在瀏覽器完成，不需要 git 或指令列。

## 一、產出檔案

在專案目錄執行：

```bash
npm run build:web
```

會產生 `dist-web/` 資料夾。要上傳的就是**這個資料夾裡面的內容**（不是資料夾本身）。

## 二、建立 GitHub 帳號與 repo

1. 到 <https://github.com/signup> 註冊（免費）
2. 登入後點右上角 **+** → **New repository**
3. Repository name 填 `xframe-web`
4. 選 **Public**（GitHub Pages 免費版需要公開）
5. 點 **Create repository**

## 三、上傳檔案

1. 在新建的 repo 頁面點 **uploading an existing file**
2. 把 `dist-web/` **裡面的所有檔案與資料夾**拖進去
3. 下方點 **Commit changes**

## 四、開啟 Pages

1. repo 頁面點 **Settings**
2. 左側選 **Pages**
3. Source 選 **Deploy from a branch**
4. Branch 選 **main**、資料夾選 **/ (root)**，按 **Save**
5. 等一到兩分鐘，頁面上方會出現網址：`https://<你的帳號>.github.io/xframe-web/`

## 五、加到 iPhone 主畫面

1. iPhone Safari 開啟上面那個網址
2. 點下方分享按鈕 → **加入主畫面**
3. 之後從主畫面開啟就是全螢幕，沒有網址列

## 更新網站

重新 `npm run build:web`，回到 repo 點 **Add file → Upload files**，
把新的 `dist-web/` 內容拖進去覆蓋，Commit 即可。

---

# 捷徑版本

因為網頁支援 `?u=` 參數，捷徑不需要自己抓任何東西 —— 只要把分享的網址接上去開啟。

## 建立步驟

1. iPhone 開啟「捷徑」app，點右上 **+**
2. 點捷徑名稱 → **詳細資訊** → 開啟 **在分享工作表中顯示**
3. 分享工作表類型只勾 **URL**
4. 加入動作 **文字**，內容填：

   ```
   https://<你的帳號>.github.io/xframe-web/?u=
   ```

5. 加入動作 **URL 編碼**，輸入選「捷徑輸入」
6. 加入動作 **合併文字**，把第 4 步的文字與第 5 步的結果接起來（分隔符號選「無」）
7. 加入動作 **打開 URL**，輸入選上一步的結果
8. 命名為 `XFrame`，儲存

## 使用

在 X app 或 Safari 上分享一則推文 → 選 **XFrame** → Safari 開啟並自動產生卡片。
