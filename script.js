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
        let content = $content.val();

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

        // 處理斜線指令
        if (content.startsWith('/')) {
            content = processSlashCommand(content, nickname);
        }

        const postData = {
            nickname: nickname,
            content: content,
            time: timeStr,
            userId: userId, // 持久化 ID
            image: selectedImage,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            replyTo: currentReply // 包含回覆資料
        };



        // 改為推送到 messages 節點
        messagesRef.push(postData);
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

    // Online Presence Logic (New Feature)
    const $onlineCount = $('#onlineCount');
    const $onlineList = $('#onlineList');
    // Using global firebase object for .info because it's a virtual path
    const connectedRef = firebase.database().ref('.info/connected');
    const myPresenceRef = database.child('online/' + userId);

    connectedRef.on('value', function (snap) {
        if (snap.val() === true) {
            // We're connected (or reconnected)!

            // 1. Tell server to remove us if we disconnect
            myPresenceRef.onDisconnect().remove();

            // 2. Set our status to online
            const nickname = $nickname.val().trim() || '匿名';
            myPresenceRef.set({
                nickname: nickname,
                status: 'online',
                lastChanged: firebase.database.ServerValue.TIMESTAMP
            });
        }
    });

    // Update presence nickname if user changes it
    $nickname.on('change', function () {
        const newName = $(this).val().trim() || '匿名';
        myPresenceRef.update({ nickname: newName });
    });

    // Listen for all online users
    database.child('online').on('value', function (snapshot) {
        const onlineUsers = snapshot.val() || {};
        const count = Object.keys(onlineUsers).length;

        $onlineCount.text(`${count} 人在線`);

        // Build tooltip list
        const names = Object.values(onlineUsers).map(u => u.nickname || '匿名');
        if (names.length > 0) {
            $onlineList.text(names.join(', ')); // Or use <ul> for nicer list
            // If too many, truncate
            if (names.length > 10) {
                $onlineList.text(names.slice(0, 10).join(', ') + ` ...等 ${count} 人`);
            }
        } else {
            $onlineList.text('無人');
        }
    });


    // 清除聊天紀錄邏輯
    $('#clear').on('click', function () {
        if (confirm('確定要刪除所有聊天記錄嗎？\n⚠️ 此動作無法復原！所有人的對話都會被清空。')) {
            // 只清除 messages 節點，保留 online 和 typing 狀態
            database.child('messages').remove()
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

    // 處理訊息點擊 (回覆功能) - 使用事件委派 (Delegation)
    $('#showtext').on('click', '.other_text', function (e) {
        // 如果是已收回的訊息，不處理
        if ($(this).hasClass('recalled')) return;

        // 從 data 屬性讀取資料
        const nickname = $(this).attr('data-nickname'); // .attr() 確保讀取原始字串 (避免 jQuery 自動轉型)
        const content = $(this).attr('data-content');
        const msgId = $(this).attr('data-msg-id');

        // 觸發回覆邏輯
        handleMessageClick(this, nickname, content, msgId);
    });

    // 訊息監聽器 (改進版) - Listen to 'messages' node
    let initialLoad = true;
    const messagesRef = database.child('messages');

    // Tab Alert (分頁標題通知)
    let unreadCount = 0;
    const originalTitle = document.title;

    // 監聽視窗可見度變化 (回到視窗時重置標題)
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            unreadCount = 0;
            document.title = originalTitle;
        }
    });

    // 載入最後 50 則訊息
    messagesRef.limitToLast(50).on('child_added', function (snapshot) {
        // 因已分流到 /messages，不再需要過濾 typing 或 online 節點

        const msg = snapshot.val();
        const msgId = snapshot.key; // 取得 Firebase 金鑰 (Key)
        const isSelf = msg.userId === userId;
        const isRecalled = msg.recalled === true;

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

        // 決定訊息內容
        let contentHtml = '';
        if (isRecalled) {
            contentHtml = `<span class="recalled-text">🚫 訊息已收回</span>`;
        } else {
            // Processing Order: Escape -> Markdown -> Linkify
            let processedContent = escapeHtml(msg.content);
            processedContent = parseMarkdown(processedContent);
            processedContent = linkify(processedContent);

            contentHtml = `
                    ${replyHtml}
                    ${msg.content ? `<p>${processedContent}</p>` : ''}
                    ${msg.image ? `<img src="${msg.image}" class="chat-image" onclick="event.stopPropagation(); showImage('${msg.image}')">` : ''}
            `;
        }

        // 渲染訊息
        const messageHtml = `
            <div class="message-row ${isSelf ? 'self' : 'other'}" id="${msgId}">
                <div class="meta-info">
                    ${isSelf ? `<span class="time_style">${msg.time}</span> <span class="nickname_style">${msg.nickname}</span>`
                : `<span class="nickname_style">${msg.nickname}</span> <span class="time_style">${msg.time}</span>`}
                </div>
                <div class="message-content-wrapper">
                    ${isSelf && !isRecalled ? `<button class="recall-btn-v2" onclick="recallMessage('${msgId}')" title="收回訊息">↩</button>` : ''}
                    
                    <!-- Reaction Trigger Button -->
                    ${!isRecalled ? `
                        <div class="reaction-btn" onclick="event.stopPropagation(); toggleReactionPicker('${msgId}', this)">☺</div>
                        <!-- Picker Container will be injected dynamically or global -->
                    ` : ''}

                    <!-- 加入點擊事件以觸發回覆 - 使用 data 屬性而非 onclick 以避免語法錯誤 -->
                    <div class="other_text ${isRecalled ? 'recalled' : ''}" 
                         data-msg-id="${msgId}"
                         data-nickname="${escapeHtml(msg.nickname)}"
                         data-content="${escapeHtml(msg.content || '[圖片]')}"
                    >
                        ${contentHtml}
                    </div>
                </div>
                
                <!-- Reaction Chips Display -->
                ${!isRecalled ? `<div id="reactions-${msgId}" class="reaction-chips-container"></div>` : ''}
            </div>
        `;

        $showtext.append(messageHtml);

        // Render existing reactions if any
        if (msg.reactions) {
            renderReactions(msgId, msg.reactions);
        }

        scrollToBottom();

        // 通知 (僅針對來自他人的新訊息且未收回)
        if (!initialLoad && !isSelf && !isRecalled) {
            // 聲音通知
            if (isSoundEnabled) {
                notificationSound.currentTime = 0;
                notificationSound.play().catch(e => console.error('Sound blocked:', e));
            }

            // 桌面通知
            sendNotification(msg.nickname, msg.content || '[收到一張圖片]');

            // 分頁標題通知 (如果是背景執行)
            if (document.hidden) {
                unreadCount++;
                document.title = `(${unreadCount}) ${msg.nickname} 傳來訊息...`;
            }
        }
    });

    // 監聽訊息修改 (收回同步 / 表情回應同步) - Listen to 'messages' node
    messagesRef.on('child_changed', function (snapshot) {
        const msg = snapshot.val();
        const msgId = snapshot.key;

        // 1. 處理收回
        if (msg.recalled) {
            const $msgRow = $(`#${msgId}`);
            const $bubble = $msgRow.find('.other_text');

            // 更新樣式與內容
            $bubble.addClass('recalled');
            $bubble.html('<span class="recalled-text">🚫 訊息已收回</span>');
            $bubble.removeAttr('onclick'); // 移除點擊事件
            $msgRow.find('.recall-btn-v2').remove(); // 移除收回按鈕
            $msgRow.find('.reply-context').remove(); // 移除引用
            $msgRow.find('.reaction-btn').remove(); // Remove reaction button
            $msgRow.find('.reaction-chips-container').remove(); // Remove chips
        }

        // 2. 處理表情回應更新
        if (msg.reactions) {
            renderReactions(msgId, msg.reactions);
        } else {
            // If reactions were removed entirely
            $(`#reactions-${msgId}`).empty();
        }
    });

    // 標記初始載入完成
    database.once('value', () => {
        initialLoad = false;
        scrollToBottom();
    });

    // 監聽訊息刪除 (同步清除畫面) - Listen to 'messages' node
    messagesRef.on('child_removed', function (snapshot) {
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

// 收回訊息功能
window.recallMessage = function (msgId) {
    if (confirm('確定要收回這則訊息嗎？')) {
        // 使用 messagesRef (或完整路徑) 更新
        firebase.database().ref('messages').child(msgId).update({
            recalled: true,
            content: null,
            image: null,
            replyTo: null
        });
    }
};

function parseMarkdown(text) {
    if (!text) return text;

    // 1. Code Blocks: ```code```
    // Use [\s\S] to match newlines too
    text = text.replace(/```([\s\S]*?)```/g, function (match, code) {
        return `<pre><code>${code}</code></pre>`;
    });

    // 2. Bold: **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // 3. Italic: *text*
    text = text.replace(/\*(.*?)\*/g, '<i>$1</i>');

    return text;
}

// 斜線指令處理器
function processSlashCommand(text, nickname) {
    if (!text.startsWith('/')) return text;

    const match = text.match(/^\/(\w+)\s*(.*)/);
    if (!match) return text;

    const command = match[1].toLowerCase();
    const args = match[2].trim();

    switch (command) {
        case 'roll':
            let max = 100;
            if (args) {
                const parts = args.split(/[^\d]+/); // Split by non-digits
                if (parts.length >= 1 && parts[0]) {
                    max = parseInt(parts[0], 10);
                }
            }
            const rollResult = Math.floor(Math.random() * max) + 1;
            return `🎲 ${nickname} 擲出了 **${rollResult}** 點 (1-${max})`;

        case 'coin':
            const isHeads = Math.random() < 0.5;
            return `🪙 ${nickname} 擲出了 **${isHeads ? '正面' : '反面'}**`;

        case 'me':
            return `* ${nickname} ${args} *`;

        // 隱藏指令：計算機
        case 'calc':
            try {
                // 安全限制：只允許數字和基本運算符
                if (/^[0-9+\-*/().\s]+$/.test(args)) {
                    // eslint-disable-next-line no-new-func
                    const result = new Function('return ' + args)();
                    return `🧮 ${args} = **${result}**`;
                }
                return text;
            } catch (e) {
                return text;
            }

        default:
            return text; // 未知指令當作一般訊息傳送
    }
}

// ----------------------
// Message Reactions Logic
// ----------------------
let activePickerId = null;

// Toggle Picker
window.toggleReactionPicker = function (msgId, btnElement) {
    // If clicking same button, verify if we should close or open
    const existingPicker = $(btnElement).parent().find('.reaction-picker');

    // Close any other open pickers
    $('.reaction-picker').remove();
    activePickerId = null;

    if (existingPicker.length > 0) {
        // Already open, logic above removed it, so we are toggling OFF.
        return;
    }

    const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
    let pickerHtml = `<div class="reaction-picker">`;
    emojis.forEach(emoji => {
        pickerHtml += `<span class="reaction-option" onclick="event.stopPropagation(); triggerReaction('${msgId}', '${emoji}')">${emoji}</span>`;
    });
    pickerHtml += `</div>`;

    $(btnElement).parent().append(pickerHtml);
    activePickerId = msgId;

    // Click elsewhere to close
    $(document).one('click', function () {
        $('.reaction-picker').remove();
        activePickerId = null;
    });
};

// Trigger Reaction (Update Firebase)
window.triggerReaction = function (msgId, emoji) {
    $('.reaction-picker').remove(); // Close picker
    const userReactionRef = firebase.database().ref(`messages/${msgId}/reactions/${emoji}/${userId}`);

    userReactionRef.once('value', snapshot => {
        if (snapshot.exists()) {
            userReactionRef.remove(); // Toggle OFF
        } else {
            userReactionRef.set(true); // Toggle ON
        }
    });
};

// Render Reactions (UI Update)
window.renderReactions = function (msgId, reactionsData) {
    const $container = $(`#reactions-${msgId}`);
    $container.empty();

    if (!reactionsData) return;

    Object.keys(reactionsData).forEach(emoji => {
        const users = reactionsData[emoji]; // Object of userIds
        const count = Object.keys(users).length;
        const iReacted = users[userId] === true;

        if (count > 0) {
            const $chip = $(`
                <div class="reaction-chip ${iReacted ? 'active' : ''}" onclick="triggerReaction('${msgId}', '${emoji}')">
                    <span>${emoji}</span>
                    <span>${count}</span>
                </div>
            `);
            $container.append($chip);
        }
    });
};