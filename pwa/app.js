/**
 * HOT情報管理システム
 * メインJavaScriptファイル
 */

// グローバル変数
const API_URL = 'https://script.google.com/macros/s/AKfycbxKnjzsPCdpBwFChTJgWDY9MB8ZYDrmx0PNmKcAVOK0XNjY701AcYPX7JZ0cfLIkauk/exec';
let selectedRoute = '';
let capturedImage = null;
let latitude = null;
let longitude = null;
let locationAddress = '';
let isOnline = navigator.onLine;
let selectedCategory = null;

// カメラ関連の変数
let mediaStream = null;
let videoElement = null;
let canvasElement = null;

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

  // イベントリスナー：カメラ起動ボタン
  startCameraBtn.addEventListener('click', () => {
    console.log('カメラ起動ボタンがクリックされました。ルート：', selectedRoute);
    startCamera();
  });

  // カテゴリー選択とコメント入力の画面制御
  function showCategoryStep() {
    document.getElementById('category-step').style.display = 'block';
    document.getElementById('comment-step').style.display = 'none';
    selectedCategory = null;
  }

  function showCommentStep() {
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'block';
  }

  // ルート選択に戻るボタンのイベントリスナー
  document.getElementById('back-to-route-btn')?.addEventListener('click', () => {
    // 写真情報をリセット
    document.getElementById('preview-image').src = '';
    capturedImage = null;
    selectedCategory = null;
    
    // ルート選択画面に戻る
    showRouteSelection();
  });

  // カテゴリーカードのイベントリスナーを設定
  function setupCategoryCards() {
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        // 他のカードの選択を解除
        document.querySelectorAll('.category-card').forEach(c => {
          c.classList.remove('selected');
        });
        
        // 選択したカードを強調表示
        card.classList.add('selected');
        selectedCategory = card.dataset.category;
        
        // 少し待ってから次のステップへ
        setTimeout(() => {
          showCommentStep();
        }, 300);
      });
    });
  }

  // 戻るボタンのイベントリスナー
  document.getElementById('back-btn')?.addEventListener('click', () => {
    showCategoryStep();
  });

  // 送信ボタンのイベントリスナー
  document.getElementById('submit-btn')?.addEventListener('click', async () => {
    const comment = document.getElementById('comment-input').value.trim();
    
    if (!comment) {
      alert('コメントを入力してください');
      return;
    }

    // ローディング表示
    const loadingContainer = document.querySelector('.loading-container');
    loadingContainer.style.display = 'flex';

    try {
      // データを送信
      const data = {
        requestType: 'submit',
        route: selectedRoute,
        category: selectedCategory,
        comment: comment,
        image: capturedImage,
        latitude: latitude,
        longitude: longitude,
        locationAddress: locationAddress
      };

      const response = await sendData(data);
      
      if (response.status === 'ok') {
        // 完了画面を表示
        document.querySelector('.info-form-container').style.display = 'none';
        document.querySelector('.complete-container').style.display = 'block';
      } else {
        throw new Error(response.message || '送信に失敗しました');
      }
    } catch (error) {
      console.error('データ送信エラー:', error);
      alert('送信に失敗しました: ' + error.message);
    } finally {
      // ローディング非表示
      loadingContainer.style.display = 'none';
    }
  });

  // 新規登録ボタンのイベントリスナー
  document.getElementById('new-report-btn')?.addEventListener('click', () => {
    // フォームをリセット
    document.getElementById('comment-input').value = '';
    document.getElementById('preview-image').src = '';
    capturedImage = null;
    selectedCategory = null;
    
    // 画面を初期状態に戻す
    document.querySelector('.complete-container').style.display = 'none';
    showRouteSelection();
  });

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
      const response = await fetch(`${API_URL}?requestType=routes`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'ok' && Array.isArray(data.routes)) {
        routeButtonsContainer.innerHTML = '';
        
        data.routes.forEach(route => {
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
            cameraButtonContainer.style.display = 'block';
          });
          
          routeButtonsContainer.appendChild(button);
        });
      } else {
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
    const defaultRoutes = [
      "東京都心エリア", "東京西部エリア", "東京東部エリア", "東京北部エリア", 
      "東京南部エリア", "横浜中央エリア", "横浜北部エリア", "横浜南部エリア", 
      "川崎エリア", "埼玉中央エリア", "埼玉西部エリア", "埼玉東部エリア", 
      "千葉中央エリア", "千葉西部エリア"
    ];
    
    routeButtonsContainer.innerHTML = '';
    defaultRoutes.forEach(routeName => {
      const button = document.createElement('button');
      button.className = 'route-btn';
      button.setAttribute('data-route', routeName);
      button.textContent = routeName;
      button.addEventListener('click', handleRouteButtonClick);
      routeButtonsContainer.appendChild(button);
    });
  }

  /**
   * ルートボタンのクリックイベントハンドラ
   */
  function handleRouteButtonClick(e) {
    document.querySelectorAll('.route-btn.selected').forEach(btn => {
      btn.classList.remove('selected');
    });
    e.currentTarget.classList.add('selected');
    selectedRoute = e.currentTarget.getAttribute('data-route');
    cameraButtonContainer.style.display = 'block';
  }

  /**
   * カメラを起動する関数
   */
  async function startCamera() {
    try {
      videoElement = document.getElementById('camera-view');
      canvasElement = document.getElementById('camera-canvas');
      
      cameraContainer.style.display = 'block';
      routeSelectionContainer.style.display = 'none';
      
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = mediaStream;
      await videoElement.play();
      
      setupCameraEventListeners();
      
    } catch (error) {
      console.error('カメラの起動に失敗しました:', error);
      handleCameraError(error);
    }
  }

  /**
   * カメラのイベントリスナーを設定する関数
   */
  function setupCameraEventListeners() {
    const captureBtn = document.getElementById('capture-btn');
    const cancelBtn = document.getElementById('cancel-camera-btn');
    
    captureBtn.addEventListener('click', capturePhoto);
    cancelBtn.addEventListener('click', () => {
      stopCamera();
      showRouteSelection();
    });
  }

  /**
   * 写真を撮影する関数
   */
  async function capturePhoto() {
    try {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      
      const context = canvasElement.getContext('2d');
      context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      
      capturedImage = canvasElement.toDataURL('image/jpeg', 0.8);
      stopCamera();
      showPreview();
      
      getLocation()
        .then(location => {
          document.getElementById('location-text').textContent = 
            `位置情報: 緯度 ${location.latitude.toFixed(6)}, 経度 ${location.longitude.toFixed(6)}`;
        })
        .catch(error => {
          document.getElementById('location-text').textContent = '位置情報: 取得できませんでした';
        });
      
    } catch (error) {
      console.error('写真の撮影に失敗しました:', error);
      alert('写真の撮影に失敗しました。もう一度お試しください。');
    }
  }

  /**
   * カメラを停止する関数
   */
  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  /**
   * プレビューを表示する関数
   */
  function showPreview() {
    const previewImage = document.getElementById('preview-image');
    previewImage.src = capturedImage;
    
    cameraContainer.style.display = 'none';
    infoFormContainer.style.display = 'block';
    setupCategoryCards();
  }

  /**
   * ルート選択画面を表示する関数
   */
  function showRouteSelection() {
    routeSelectionContainer.style.display = 'block';
    cameraContainer.style.display = 'none';
    infoFormContainer.style.display = 'none';
  }

  /**
   * カメラエラーを処理する関数
   */
  function handleCameraError(error) {
    let errorMessage = 'カメラの起動に失敗しました。';
    
    if (error.name === 'NotAllowedError') {
      errorMessage = 'カメラへのアクセスが許可されていません。ブラウザの設定でカメラへのアクセスを許可してください。';
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'カメラが見つかりません。デバイスにカメラが接続されているか確認してください。';
    } else if (error.name === 'NotReadableError') {
      errorMessage = 'カメラにアクセスできません。他のアプリケーションがカメラを使用していないか確認してください。';
    }
    
    alert(errorMessage);
    showRouteSelection();
  }
});

/**
 * 位置情報を取得する関数
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
        resolve({ latitude, longitude });
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
 * データを送信する関数
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