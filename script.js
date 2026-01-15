var firebase;
let selectedImage = null;
let notificationPermissionGranted = false;
let lastNotification = null;
let notificationTimeout = null;

// 生成或讀取持久化的使用者 ID
let userId = localStorage.getItem('chat_user_id');
if (!userId) {
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('chat_user_id', userId);
}

// 請求通知權限
async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
        notificationPermissionGranted = true;
        return true;
    }
    try {
        const permission = await Notification.requestPermission();
        notificationPermissionGranted = permission === 'granted';
        return notificationPermissionGranted;
    } catch (e) { console.error(e); return false; }
}

function sendNotification(title, body) {
    if (!notificationPermissionGranted) return;
    try {
        if (lastNotification) lastNotification.close();
        if (notificationTimeout) clearTimeout(notificationTimeout);

        const options = { body: body, tag: 'chat-message', icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png' };
        lastNotification = new Notification(title, options);
        notificationTimeout = setTimeout(() => lastNotification.close(), 5000);
        lastNotification.onclick = function () { window.focus(); this.close(); };
    } catch (e) { console.error(e); }
}

$(function () {
    requestNotificationPermission();

    // 初始化 Firebase
    var config = {
        databaseURL: "https://mpchat-5c750-default-rtdb.firebaseio.com/"
    };
    if (!firebase.apps.length) {
        firebase.initializeApp(config);
    }
    var database = firebase.database().ref();

    // DOM 元素
    const $nickname = $('#nickname');
    const $content = $('#content');
    const $send = $('#send');
    const $showtext = $('#showtext');
    const $emojiBtn = $('#emojiBtn');
    const $emojiPicker = $('#emojiPicker');
    const $colorPicker = $('#colorPicker');
    const $soundBtn = $('#soundBtn');
    const $soundOnIcon = $('#soundOnIcon');
    const $soundOffIcon = $('#soundOffIcon');

    // 音效初始化
    // 使用 Google 託管的音效檔，穩定且支援跨域 (CORS)
    const notificationSound = new Audio("https://actions.google.com/sounds/v1/cartoon/pop.ogg");
    let isSoundEnabled = localStorage.getItem('chat_sound_enabled') !== 'false';

    // 在第一次互動時解鎖音效播放 (瀏覽器限制)
    $(document).one('click keydown', function () {
        if (isSoundEnabled) {
            notificationSound.volume = 0;
            notificationSound.play().then(() => {
                notificationSound.pause();
                notificationSound.currentTime = 0;
                notificationSound.volume = 1;
            }).catch(e => { }); // Ignore initial error if any
        }
    });

    function updateSoundUI() {
        if (isSoundEnabled) {
            $soundOnIcon.show();
            $soundOffIcon.hide();
            $soundBtn.css('opacity', '1');
        } else {
            $soundOnIcon.hide();
            $soundOffIcon.show();
            $soundBtn.css('opacity', '0.5');
        }
    }
    updateSoundUI();

    $soundBtn.on('click', function () {
        isSoundEnabled = !isSoundEnabled;
        localStorage.setItem('chat_sound_enabled', isSoundEnabled);
        updateSoundUI();

        if (isSoundEnabled) {
            // 透過持續播放來解鎖音效環境
            notificationSound.currentTime = 0;
            notificationSound.play().catch(e => console.log('Audio play failed:', e));
        }
    });

    // 讀取儲存的設定
    const savedNickname = localStorage.getItem('chat_nickname');
    if (savedNickname) $nickname.val(savedNickname);

    const savedColor = localStorage.getItem('chat_color') || '#0066cc';
    $colorPicker.val(savedColor);
    document.documentElement.style.setProperty('--user-bubble-color', savedColor);

    // 顏色選擇器邏輯
    $colorPicker.on('input change', function () {
        const color = $(this).val();
        localStorage.setItem('chat_color', color);
        document.documentElement.style.setProperty('--user-bubble-color', color);
    });

    // 表情符號選單邏輯
    $emojiBtn.on('click', (e) => {
        e.stopPropagation();
        $emojiPicker.toggleClass('hidden');
    });

    $(document).on('click', (e) => {
        if (!$(e.target).closest('#emojiPicker').length && !$(e.target).closest('#emojiBtn').length) {
            $emojiPicker.addClass('hidden');
        }
    });

    $('#emojiPicker span').on('click', function () {
        const emoji = $(this).text();
        const currentVal = $content.val();
        $content.val(currentVal + emoji);
        $content.focus();
    });

    // 圖片上傳邏輯
    $('#imageInput').on('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                selectedImage = e.target.result;
                updateImagePreview();
            };
            reader.readAsDataURL(file);
        }
    });

    // 貼上圖片邏輯
    $content.on('paste', function (e) {
        const items = e.originalEvent.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function (e) {
                    selectedImage = e.target.result;
                    updateImagePreview();
                    showToast('圖片已添加！');
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
    });

    // 回覆功能邏輯
    let currentReply = null;
    const $replyPreview = $('#replyPreview');
    const $replyNickname = $('#replyNickname');
    const $replyContent = $('#replyContent');
    const $cancelReply = $('#cancelReply');

    function enableReplyMode(msg, msgId) {
        currentReply = {
            id: msgId,
            nickname: msg.nickname,
            content: msg.content || '[圖片]'
        };
        $replyNickname.text(currentReply.nickname);
        $replyContent.text(currentReply.content);
        $replyPreview.removeClass('hidden');
        $content.focus();
    }

    function disableReplyMode() {
        currentReply = null;
        $replyPreview.addClass('hidden');
    }

    $cancelReply.on('click', disableReplyMode);

    // 監聽全域回覆觸發事件
    document.addEventListener('trigger-reply', function (e) {
        enableReplyMode({
            nickname: e.detail.nickname,
            content: e.detail.content
        }, 'temp_id'); // 僅前端 UI 使用，ID 非必須
    });

    // 發送訊息邏輯
    function write() {
        const nickname = $nickname.val().trim() || '匿名';
        const content = $content.val();

        if (content === "" && !selectedImage) return;

        // Save nickname
        localStorage.setItem('chat_nickname', nickname);

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const dd = now.getDate().toString().padStart(2, '0');
        const hh = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        const ss = now.getSeconds().toString().padStart(2, '0');

        const timeStr = `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;

        const postData = {
            nickname: nickname,
            content: content,
            time: timeStr,
            userId: userId, // 持久化 ID
            image: selectedImage,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            replyTo: currentReply // 包含回覆資料
        };

        database.push(postData);
        $content.val('');
        selectedImage = null;
        updateImagePreview();
        $emojiPicker.addClass('hidden');
        disableReplyMode(); // 發送後清除回覆狀態

        // 發送後立即移除輸入中狀態
        database.child('typing/' + userId).remove();
    }

    // 正在輸入提示邏輯
    const $typingIndicator = $('#typingIndicator');
    const TYPING_TIMEOUT = 3000; // 3 seconds timeout
    let lastTypingTime = 0;

    // 1. 回報我的輸入狀態
    $content.on('input', function () {
        const now = Date.now();
        const nickname = $nickname.val().trim() || '匿名';

        // 為了節省流量，每秒最多更新一次 Firebase
        if (now - lastTypingTime > 1000) {
            lastTypingTime = now;
            database.child('typing/' + userId).set({
                nickname: nickname,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            // 斷線時自動移除 (例如使用者在打字時關閉分頁)
            database.child('typing/' + userId).onDisconnect().remove();
        }
    });

    // 2. 監聽其他人輸入狀態
    // 監聽 'value' 變化對於小型群組來說是最簡單的方式
    database.child('typing').on('value', function (snapshot) {
        const typingData = snapshot.val() || {};
        const now = Date.now();
        const names = [];

        Object.keys(typingData).forEach(key => {
            if (key !== userId) { // 不顯示自己
                const data = typingData[key];
                // 檢查輸入訊號是否為最新的 (3秒內)
                if (data.timestamp && (now - data.timestamp < TYPING_TIMEOUT)) {
                    names.push(data.nickname);
                }
            }
        });

        if (names.length > 0) {
            const text = names.length > 2
                ? `${names[0]}, ${names[1]} 等 ${names.length} 人正在輸入...`
                : `${names.join(', ')} 正在輸入...`;
            $typingIndicator.text(text).addClass('active');
        } else {
            $typingIndicator.removeClass('active');
        }
    });

    // 定期清除舊的輸入狀態顯示 (防止 Firebase 更新延遲)
    setInterval(() => {
        database.child('typing').once('value', snapshot => {
            const typingData = snapshot.val() || {};
            const now = Date.now();
            const names = [];
            Object.keys(typingData).forEach(key => {
                if (key !== userId) {
                    const data = typingData[key];
                    if (data.timestamp && (now - data.timestamp < TYPING_TIMEOUT)) {
                        names.push(data.nickname);
                    }
                }
            });

            if (names.length > 0) {
                const text = names.length > 2
                    ? `${names[0]}, ${names[1]} 等 ${names.length} 人正在輸入...`
                    : `${names.join(', ')} 正在輸入...`;
                $typingIndicator.text(text).addClass('active');
            } else {
                $typingIndicator.removeClass('active');
            }
        });
    }, 2000);

    // 清除聊天紀錄邏輯
    $('#clear').on('click', function () {
        if (confirm('確定要刪除所有聊天記錄嗎？\n⚠️ 此動作無法復原！所有人的對話都會被清空。')) {
            database.remove()
                .then(() => {
                    showToast('聊天記錄已清空');
                    setTimeout(() => window.location.reload(), 1000);
                })
                .catch(err => {
                    console.error(err);
                    showToast('清除失敗，請稍後再試');
                });
        }
    });

    $send.on('click', write);
    $content.on('keydown', function (e) {
        if (e.keyCode == 13 && !e.shiftKey) {
            e.preventDefault();
            write();
        }
    });

    // 訊息監聽器 (改進版)
    let initialLoad = true;

    // 載入最後 50 則訊息
    database.limitToLast(50).on('child_added', function (snapshot) {
        // 忽略 'typing' 節點 (防止它被誤認為訊息讀取)
        if (snapshot.key === 'typing') return;

        const msg = snapshot.val();
        const msgId = snapshot.key; // 取得 Firebase 金鑰 (Key)
        const isSelf = msg.userId === userId;

        // 如果有回覆內容，則渲染引用區塊
        let replyHtml = '';
        if (msg.replyTo) {
            replyHtml = `
                <div class="reply-context">
                    <span class="reply-context-nickname">${escapeHtml(msg.replyTo.nickname)}</span>
                    <span class="reply-context-text">${escapeHtml(msg.replyTo.content)}</span>
                </div>
            `;
        }

        // 渲染訊息
        const messageHtml = `
            <div class="message-row ${isSelf ? 'self' : 'other'}" id="${msgId}">
                <div class="meta-info">
                    ${isSelf ? `<span class="time_style">${msg.time}</span> <span class="nickname_style">${msg.nickname}</span>`
                : `<span class="nickname_style">${msg.nickname}</span> <span class="time_style">${msg.time}</span>`}
                </div>
                <!-- 加入點擊事件以觸發回覆 -->
                <div class="other_text" onclick="handleMessageClick(this, '${msg.nickname}', '${escapeHtml(msg.content || '[圖片]')}', '${msgId}')">
                    ${replyHtml}
                    ${msg.content ? `<p>${linkify(escapeHtml(msg.content))}</p>` : ''}
                    ${msg.image ? `<img src="${msg.image}" class="chat-image" onclick="event.stopPropagation(); showImage('${msg.image}')">` : ''}
                </div>
            </div>
        `;

        $showtext.append(messageHtml);
        scrollToBottom();

        // 通知 (僅針對來自他人的新訊息)
        if (!initialLoad && !isSelf) {
            if (isSoundEnabled) {
                notificationSound.currentTime = 0;
                // 部分瀏覽器需要互動才能播放音效，但在活躍的工作階段通常沒問題
                notificationSound.play().catch(e => console.error('Sound blocked:', e));
            }
            sendNotification(msg.nickname, msg.content || '[收到一張圖片]');
        }
    });

    // 標記初始載入完成
    database.once('value', () => {
        initialLoad = false;
        scrollToBottom();
    });

    // 監聽訊息刪除 (同步清除畫面)
    database.on('child_removed', function (snapshot) {
        const msgId = snapshot.key;
        $(`#${msgId}`).remove();
    });

});

function scrollToBottom() {
    const el = document.getElementById('showtext');
    el.scrollTop = el.scrollHeight;
}

function updateImagePreview() {
    const preview = $('#imagePreview');
    preview.empty();
    if (selectedImage) {
        preview.html(`
            <div class="preview-container">
                <img src="${selectedImage}" class="preview-image">
                <div class="remove-image" onclick="removeImage()">×</div>
            </div>
        `);
    }
}

function removeImage() {
    selectedImage = null;
    updateImagePreview();
    $('#imageInput').val('');
}

function showToast(message) {
    const toast = $('<div class="toast">').text(message).appendTo('body');
    setTimeout(() => toast.fadeOut(() => toast.remove()), 2000);
}

function showImage(src) {
    const modal = $('<div class="image-modal">').append($('<img class="modal-image">').attr('src', src));
    modal.click(function () { $(this).fadeOut(() => $(this).remove()); });
    $('body').append(modal).fadeIn();
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function linkify(text) {
    var urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function (url) {
        return '<a href="' + url + '" target="_blank" class="chat-link">' + url + '</a>';
    });
}

// 全域訊息點擊處理器
window.handleMessageClick = function (element, nickname, content) {
    // 我們透過稍微 Hack 的方式來存取內部函數，或者需要複製邏輯。
    // 更好的做法：暴露特定函數或正確使用 jQuery 事件委派。
    // 目前我們先觸發一個自訂事件。

    // 實際上，因為 write() 邏輯在 $(function) 內部，我們很難從全域範圍合法存取 enableReplyMode，
    // 除非我們把 enableReplyMode 移出來或暴露出去。

    // 在 document 上觸發事件
    const event = new CustomEvent('trigger-reply', {
        detail: { nickname: nickname, content: content }
    });
    document.dispatchEvent(event);
};