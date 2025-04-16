var firebase;
let selectedImage = null;
let notificationPermissionGranted = false;
let lastNotification = null;
let notificationTimeout = null;

// 請求通知權限的函數
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('此瀏覽器不支援通知功能');
        return false;
    }
    
    if (Notification.permission === 'granted') {
        notificationPermissionGranted = true;
        return true;
    }
    
    if (Notification.permission === 'denied') {
        return false;
    }
    
    try {
        const permission = await Notification.requestPermission();
        notificationPermissionGranted = permission === 'granted';
        return notificationPermissionGranted;
    } catch (error) {
        console.error('請求通知權限時發生錯誤:', error);
        return false;
    }
}

// 發送通知的函數
function sendNotification(title, body) {
    if (!notificationPermissionGranted) {
        return;
    }
    
    try {
        if (lastNotification) {
            lastNotification.close();
        }
        
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }

        const options = {
            body: body,
            silent: false,
            requireInteraction: false,
            tag: 'chat-message',
            data: {
                timestamp: Date.now()
            }
        };

        lastNotification = new Notification(title, options);
        
        notificationTimeout = setTimeout(() => {
            if (lastNotification) {
                lastNotification.close();
            }
        }, 8000);

        lastNotification.onclick = function() {
            window.focus();
            this.close();
        };

        lastNotification.onclose = function() {
            if (lastNotification === this) {
                lastNotification = null;
            }
        };

    } catch (error) {
        console.error('發送通知時發生錯誤:', error);
    }
}

$(function(){
    // 請求通知權限
    requestNotificationPermission();
    
    var $nickname = $('#nickname'),
        $content = $('#content'),
        $send = $('#send'),
        $clear = $('#clear'),
        $showtext = $('#showtext'),
        time = new Date().getTime();
    
    var config = {
        databaseURL: "https://mpchat-5c750-default-rtdb.firebaseio.com/"
    };
    
    firebase.initializeApp(config);
    var database = firebase.database().ref();
    
    // 圖片上傳處理
    $('#imageInput').on('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                selectedImage = e.target.result;
                updateImagePreview();
            };
            reader.readAsDataURL(file);
        }
    });

    // 監聽貼上事件
    $('#content').on('paste', function(e) {
        const clipboardData = e.originalEvent.clipboardData;
        
        // 檢查是否有圖片
        const items = clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    selectedImage = e.target.result;
                    updateImagePreview();
                    showToast('圖片已添加！');
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
    });
    
    $send.on('click', write);
    $clear.on('click', remove);
    
    $content.on('keydown', function(e){
        if(e.keyCode == 13 && !e.shiftKey){
            e.preventDefault();
            write();
        }
    });

    function write(){
        var date = new Date();
        var h = date.getHours();
        var m = date.getMinutes();
        var s = date.getSeconds();
        var dy = date.getFullYear();
        var dm = date.getMonth() + 1;
        var dd = date.getDate();
        if(h<10) h = '0'+h;
        if(m<10) m = '0'+m;
        if(s<10) s = '0'+s;
        var now = dy+'/'+dm+'/'+dd+'  '+h+':'+m+':'+s;
        
        var postData = {
            nickname: $('#nickname').val(),
            content: $('#content').val(),
            time: now,
            id: 'id'+time,
            image: selectedImage
        };

        if(postData.content === "" && !postData.image) {
            return;
        }
        
        database.push(postData);
        $('#content').val('');
        selectedImage = null;
        updateImagePreview();
    }

    database.once('value', function(snapshot) {
        $showtext.html('');
        for(var i in snapshot.val()){
            let messageHtml = `
                <div class="${snapshot.val()[i].id}">
                    <div class="other_text">
                        <div class="time_style">${snapshot.val()[i].time}</div>
                        <div class="nickname_style">${snapshot.val()[i].nickname}</div>
                        ${snapshot.val()[i].content ? `<p>${snapshot.val()[i].content}</p>` : ''}
                        ${snapshot.val()[i].image ? `<img src="${snapshot.val()[i].image}" class="chat-image" onclick="showImage('${snapshot.val()[i].image}')">` : ''}
                    </div>
                </div>
            `;
            $showtext.prepend(messageHtml);
        }
    });

    database.limitToLast(1).on('value', function(snapshot) {
      for(var i in snapshot.val()){
          // 判斷是否為自己發送的訊息
          const isSelf = snapshot.val()[i].id === 'id'+time;
          
          let messageHtml = `
              <div class="${snapshot.val()[i].id}" style="text-align: ${isSelf ? 'right' : 'left'}">
                  <div class="other_text" style="${isSelf ? 'background-color: rgba(134,217,123,1); color: rgba(40,40,40,1);' : ''}">
                      <div class="time_style">${snapshot.val()[i].time}</div>
                      <div class="nickname_style">${snapshot.val()[i].nickname}</div>
                      ${snapshot.val()[i].content ? `<p>${snapshot.val()[i].content}</p>` : ''}
                      ${snapshot.val()[i].image ? `<img src="${snapshot.val()[i].image}" class="chat-image" onclick="showImage('${snapshot.val()[i].image}')">` : ''}
                  </div>
              </div>
          `;
          
          $showtext.prepend(messageHtml);
          
          if (snapshot.val()[i].id !== 'id'+time) {
              sendNotification(
                  snapshot.val()[i].nickname + ' 傳送了新訊息',
                  snapshot.val()[i].content || '傳送了一張圖片'
              );
          }
      }

      $showtext.find('.id'+time).css({
          'color':'rgba(134,217,123,1)',
          'text-align': 'right',
          'border-radius': '5px',
      });
      $showtext.find('.id'+time+' div').css({
          'color': 'rgba(55,55,55,1)',
          'background-color':'rgba(134,217,123,1)',
          'display':'inline-block',
          'text-align': 'left',
          'word-break': 'break-all'
      });
  });
    
    function remove(){
        database.remove();
        window.location.reload();
    }
});

// 更新圖片預覽
function updateImagePreview() {
    const preview = $('#imagePreview');
    preview.empty();
    
    if (selectedImage) {
        preview.addClass('has-image').html(`
            <div class="preview-container">
                <img src="${selectedImage}" class="preview-image">
                <div class="remove-image" onclick="removeImage()">×</div>
            </div>
        `);
    } else {
        preview.removeClass('has-image');
    }
}

// 移除已選擇的圖片
function removeImage() {
    selectedImage = null;
    updateImagePreview();
    $('#imageInput').val('');
}

// 顯示提示訊息
function showToast(message) {
    const toast = $('<div class="toast">')
        .text(message)
        .appendTo('body');
    
    setTimeout(() => {
        toast.fadeOut(() => toast.remove());
    }, 2000);
}

// 圖片放大檢視
function showImage(src) {
    const modal = $('<div class="image-modal">').append(
        $('<img class="modal-image">').attr('src', src)
    );
    
    modal.click(function() {
        $(this).fadeOut(function() {
            $(this).remove();
        });
    });
    
    $('body').append(modal);
    modal.fadeIn();
}