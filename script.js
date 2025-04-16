var firebase;

// 通知權限狀態變數
let notificationPermissionGranted = false;

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
    
    if (notificationPermissionGranted) {
      // 權限獲得後，發送一個測試通知
      sendNotification('通知已啟用', '你將會收到新訊息的通知');
    }
    
    return notificationPermissionGranted;
  } catch (error) {
    console.error('請求通知權限時發生錯誤:', error);
    return false;
  }
}

let lastNotification = null;
let notificationTimeout = null;

// 修改發送通知的函數
function sendNotification(title, body) {
  if (!notificationPermissionGranted) {
    return;
  }
  
  try {
    // 如果有之前的通知，先關閉它
    if (lastNotification) {
      lastNotification.close();
    }
    
    // 如果有之前的計時器，先清除它
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    const options = {
      body: body,
      silent: false, // 允許系統預設的通知音效
      requireInteraction: false, // 不需要使用者互動就會自動關閉
      tag: 'chat-message', // 使用同一個 tag 來管理通知
      data: {
        timestamp: Date.now()
      }
    };

    // 建立新通知
    lastNotification = new Notification(title, options);
    
    // 設定 8 秒後自動關閉（Google Chat 的預設時間約為 8 秒）
    notificationTimeout = setTimeout(() => {
      if (lastNotification) {
        lastNotification.close();
      }
    }, 8000);

    // 點擊通知時的處理
    lastNotification.onclick = function() {
      window.focus(); // 將視窗切換到前景
      this.close();
    };

    // 通知關閉時的處理
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
  // 在頁面載入時請求通知權限
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
  
  $send.on('click', write);
  $clear.on('click', remove);
  
// 修改 keydown 事件處理的部分
$content.on('keydown', function(e){
  if(e.keyCode == 13){
    e.preventDefault(); // 防止 Enter 鍵的預設行為
    write();
    $('#content').val('');
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
    if(h<10){
      h = '0'+h;
    }
    if(m<10){
      m = '0' + m;
    }
    if(s<10){
      s = '0' + s;
    }
    var now = dy+'/'+dm+'/'+dd+'  '+h+':'+m+':'+s;
    
    var postData = {
      nickname:$('#nickname').val(),
      content:$('#content').val(),
      time:now,
      id:'id'+time
    };
    if(postData.content==""){

    }
    else{
      database.push(postData);
    }
    
    $content.val('');
  }

  database.once('value', function(snapshot) {
    $showtext.html('');
    for(var i in snapshot.val()){
       $showtext.prepend('<div><div class="other_text"><div class="time_style">'+snapshot.val()[i].time+'</div> <div class="nickname_style">'+snapshot.val()[i].nickname+' </div><p>'+snapshot.val()[i].content+'</p></div></div>');
    }
  });

    // 修改 database.limitToLast(1).on('value', ...) 的部分
  database.limitToLast(1).on('value', function(snapshot) {
    for(var i in snapshot.val()){
      $showtext.prepend('<div class="'+snapshot.val()[i].id+'"><div class="other_text"><div class="time_style">'+snapshot.val()[i].time+'</div> <div class="nickname_style">'+snapshot.val()[i].nickname+' </div><p>'+snapshot.val()[i].content+'</p></div></div>');
      
      // 如果不是自己發送的訊息才發送通知
      if (snapshot.val()[i].id !== 'id'+time) {
        // 發送通知，使用發送者名稱作為標題
        sendNotification(
          snapshot.val()[i].nickname + ' 傳送了新訊息', // 標題
          snapshot.val()[i].content // 內容
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