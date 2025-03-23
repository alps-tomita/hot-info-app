/**
 * HOT情報管理システム
 * メインJavaScriptファイル
 */

// グローバル変数
// ↓↓↓ ここのURLをGASの新しいデプロイメントURLに更新してください ↓↓↓
const API_URL = 'https://script.google.com/macros/s/AKfycbxKnjzsPCdpBwFChTJgWDY9MB8ZYDrmx0PNmKcAVOK0XNjY701AcYPX7JZ0cfLIkauk/exec';
// ↑↑↑ 新しいデプロイメントURLに更新 ↑↑↑
let selectedRoute = '';
let capturedImage = null;
let latitude = null;
let longitude = null;
let locationAddress = '';
let isOnline = navigator.onLine;

// キャッシュをクリアする関数
function clearCaches() {
  if ('caches' in window) {
    console.log('ServiceWorkerのキャッシュをクリア中...');
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        console.log(`キャッシュを削除: ${cacheName}`);
        caches.delete(cacheName);
      });
    });
  }
}

// ServiceWorkerの登録解除
function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for(let registration of registrations) {
        console.log('ServiceWorkerの登録を解除: ', registration);
        registration.unregister();
      }
    });
  }
}

// 起動時にキャッシュクリア
clearCaches();
unregisterServiceWorker();

// DOMが読み込まれた後に実行
document.addEventListener('DOMContentLoaded', () => {
  // 要素の取得
  const routeButtonsContainer = document.querySelector('.route-buttons-container');
  const startCameraBtn = document.getElementById('start-camera-btn');
  const cameraContainer = document.querySelector('.camera-container');
  const cameraButtonContainer = document.querySelector('.camera-btn-container');
  const infoFormContainer = document.querySelector('.info-form-container');
  const routeSelectionContainer = document.querySelector('.route-selection-container');
  const offlineMessage = document.getElementById('offline-message');
  
  // ルート一覧を取得
  fetchRoutes();
  
  // オンライン/オフラインステータスの監視
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // 初期ステータスチェック
  updateOnlineStatus();
  
  /**
   * オンライン/オフラインステータスを更新する関数
   */
  function updateOnlineStatus() {
    isOnline = navigator.onLine;
    if (isOnline) {
      offlineMessage.style.display = 'none';
    } else {
      offlineMessage.style.display = 'block';
    }
  }
  
  /**
   * ルート一覧を取得する関数
   */
  async function fetchRoutes() {
    try {
      console.log('ルート一覧の取得を開始します');
      console.log('API URL:', `${API_URL}?requestType=routes`);
      
      const response = await fetch(`${API_URL}?requestType=routes`);
      console.log('APIレスポンス:', response);
      console.log('レスポンスヘッダー:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      console.log('生のレスポンス:', text);
      
      let data;
      try {
        data = JSON.parse(text);
        console.log('パースしたデータ:', data);
      } catch (e) {
        console.error('JSONパースエラー:', e);
        throw new Error('レスポンスのJSONパースに失敗しました');
      }
      
      if (!data) {
        throw new Error('データが空です');
      }
      
      console.log('データの型:', typeof data);
      console.log('データのキー:', Object.keys(data));
      
      if (data.status === 'ok' && Array.isArray(data.routes)) {
        console.log('ルートデータ:', data.routes);
        const routeButtonsContainer = document.querySelector('.route-buttons-container');
        routeButtonsContainer.innerHTML = '';
        
        data.routes.forEach(route => {
          console.log('ルート項目:', route, typeof route);
          const button = document.createElement('button');
          button.className = 'route-btn';
          button.textContent = String(route);
          button.setAttribute('data-route', String(route));
          
          button.addEventListener('click', () => {
            document.querySelectorAll('.route-btn').forEach(btn => {
              btn.classList.remove('selected');
            });
            button.classList.add('selected');
            selectedRoute = String(route);
            console.log('選択されたルート:', selectedRoute);
            
            // カメラセクションを表示
            cameraSection.classList.remove('hidden');
            infoSection.classList.add('hidden');
            startCamera();
          });
          
          routeButtonsContainer.appendChild(button);
        });
        
        console.log('ルート一覧の表示が完了しました');
      } else {
        console.error('ルートデータの形式が不正です:', data);
        throw new Error('データ形式が不正です');
      }
    } catch (error) {
      console.error('ルート一覧の取得に失敗しました:', error);
      showDefaultRoutes(error.message);
    }
  }
  
  /**
   * デフォルトのルート一覧を表示する補助関数
   */
  function showDefaultRoutes(errorMessage) {
    // エラーメッセージをユーザーフレンドリーに変換
    let userMessage = 'ルート一覧を取得できませんでした。';
    if (errorMessage) {
      userMessage += ' ' + errorMessage;
    }
    
    // エラー時はデフォルトのルート一覧を表示
    routeButtonsContainer.innerHTML = '';
    
    // デフォルトのルート一覧（実際のデータに合わせて修正）
    const defaultRoutes = [
      "東京都心エリア", "東京西部エリア", "東京東部エリア", "東京北部エリア", 
      "東京南部エリア", "横浜中央エリア", "横浜北部エリア", "横浜南部エリア", 
      "川崎エリア", "埼玉中央エリア", "埼玉西部エリア", "埼玉東部エリア", 
      "千葉中央エリア", "千葉西部エリア"
    ];
    
    console.log('デフォルトルート一覧を表示:', defaultRoutes);
    
    defaultRoutes.forEach(routeName => {
      const button = document.createElement('button');
      button.className = 'route-btn';
      button.setAttribute('data-route', routeName);
      button.textContent = routeName;
      
      // クリックイベントを追加
      button.addEventListener('click', handleRouteButtonClick);
      
      // コンテナに追加
      routeButtonsContainer.appendChild(button);
    });
    
    // エラーメッセージを表示
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.textContent = userMessage;
    routeButtonsContainer.insertAdjacentElement('afterbegin', errorMsg);
  }
  
  /**
   * ルートボタンのクリックイベントハンドラ
   */
  function handleRouteButtonClick(e) {
    // 前に選択されたボタンから選択状態を削除
    document.querySelectorAll('.route-btn.selected').forEach(btn => {
      btn.classList.remove('selected');
    });
    
    // クリックされたボタンを選択状態にする
    e.currentTarget.classList.add('selected');
    
    // ルート名を取得して保存
    selectedRoute = e.currentTarget.getAttribute('data-route');
    console.log('選択されたルート：', selectedRoute);
    
    // カメラボタンを表示
    cameraButtonContainer.style.display = 'block';
  }
  
  // イベントリスナー：カメラ起動ボタン
  startCameraBtn.addEventListener('click', () => {
    // この時点ではまだカメラ起動機能は実装していないので、
    // コンソールにメッセージを出力するだけ
    console.log('カメラ起動ボタンがクリックされました。ルート：', selectedRoute);
    alert('カメラ機能は次のステップで実装します。ルート：' + selectedRoute);
  });
});

/**
 * 位置情報を取得する関数（将来実装）
 */
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('お使いのブラウザは位置情報をサポートしていません'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        resolve({
          latitude,
          longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * データを送信する関数（将来実装）
 */
function sendData(data) {
  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('サーバーエラーが発生しました');
    }
    return response.json();
  });
} 