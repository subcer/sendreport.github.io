# 💬 Firebase Realtime Chat Room

這是一個基於 **Firebase Realtime Database** 的即時聊天室應用程式。
無需後端伺服器，利用純前端技術 (HTML/CSS/JavaScript) 實現即時通訊功能。

## ✨ 功能特色 (Features)

### 🚀 核心功能
*   **即時通訊**：訊息無延遲，多人同步更新。
*   **身分記憶**：自動記住您的「暱稱」與「ID」 (使用 LocalStorage)，重整網頁不會丟失身分。
*   **歷史訊息**：自動載入最後 50 則對話紀錄。

### 🎨 介面與體驗
*   **自訂氣泡顏色**：可以選擇自己喜歡的對話框顏色（僅自己可見）。
*   **訊息對齊**：自己的訊息在右邊，別人的在左邊，清楚好讀。
*   **連結自動辨識**：貼上網址 (URL) 會自動轉為藍色可點擊連結。

### 🛠️ 進階互動
*   **多媒體支援**：
    *   📷 **圖片上傳**：支援點擊按鈕上傳或 **直接貼上 (Ctrl+V)** 截圖。
    *   😀 **Emoji 表情**：內建表情符號選單。
*   **引用回覆 (Reply)**：點擊任一則訊息，可針對該訊息進行回覆。
*   **正在輸入提示 (Typing Indicator)**：當對方正在打字時，會即時顯示「XXX 正在輸入...」。
*   **新訊息提示音**：視窗最小化時，收到訊息會有「波！」的提示音 (可開關)。

### 🛡️ 安全與管理
*   **防呆清除**：清除聊天紀錄時會有確認視窗，防止誤觸。
*   **即時同步清除**：當有人執行清除操作時，所有連線中的使用者畫面都會同步清空，無需重新整理。
*   **XSS 防護**：自動過濾 HTML 標籤，防止腳本注入攻擊。

---

## 🛠️ 技術棧 (Tech Stack)
*   **Frontend**: HTML5, CSS3, JavaScript (jQuery)
*   **Database**: Firebase Realtime Database (v8 Compat)
*   **Style**: Modern Dark Theme (CSS Variables)

## 📖 如何使用 (How to use)
1.  直接打開 `index.html` 即可開始使用。
2.  首次進入請輸入您的「暱稱」。
3.  開始聊天！

## ⚙️ 設定 (Configuration)
若您要部署自己的版本，請修改 `script.js` 中的 Firebase Config：

```javascript
/* script.js */
var config = {
    databaseURL: "YOUR_FIREBASE_DATABASE_URL"
};
```