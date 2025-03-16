/**
 * HOT情報管理システム
 * メインJavaScriptファイル
 */

// グローバル変数
// ↓↓↓ ここのURLをGASの新しいデプロイメントURLに更新してください ↓↓↓
const API_URL = 'https://script.google.com/macros/s/AKfycbyP9ssL37CGFbk3RTmCS9I2joOnpNImfKfl0e4c-ubiU4MbRFIwLJA6DEAUKkb1k1ms/exec';
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
  function fetchRoutes() {
    // ローディング表示を追加
    routeButtonsContainer.innerHTML = '<div class="loading-indicator">ルート一覧を取得中...</div>';
    
    // APIからルート一覧を取得するURLを構築
    const routesURL = `${API_URL}?requestType=routes`;
    console.log('APIからルート一覧を取得開始:', routesURL);
    
    // ブラウザでURLを開くためのリンクをコンソールに表示
    console.log('APIテスト方法: このURLをブラウザで直接開いてみてください:', routesURL);
    console.log('---------------------------------------------------');
    console.log('CORS問題が発生する場合は、以下のURLでGASデプロイメントを新しく作成してください:');
    console.log('https://script.google.com/home/projects/1Eo_kM5fDs8jHzcDI4vCpx5kCxevbLhJqx48WNPh3p04/deployments');
    console.log('新しいデプロイを作成後、そのURLをapp.jsのAPI_URL定数に設定してください');
    console.log('---------------------------------------------------');
    
    // 最初にJSONPアプローチを試す
    console.log('JSONPを使用してAPIにアクセスします');
    tryJsonpApproach(routesURL);
    
    // タイムアウト処理（5秒後にCORSプロキシを使用）
    setTimeout(() => {
      if (document.querySelector('.loading-indicator')) {
        console.log('JSONPがタイムアウトしました。CORSプロキシを使用してアクセスを試みます...');
        tryCorsProxyApproach(routesURL);
      }
    }, 5000);
  }
  
  /**
   * JSONPアプローチを試みる関数
   */
  function tryJsonpApproach(url) {
    console.log('JSONPアプローチを実行します:', url);
    
    window.processRoutes = function(data) {
      console.log('JSONP経由でデータを受信:', data);
      
      if (data.status === 'ok' && Array.isArray(data.routes)) {
        displayRouteButtons(data.routes);
        console.log('JSONP: ルートボタンの生成完了:', data.routes.length + '個');
      } else {
        console.error('JSONP: 不正なデータ形式:', data);
        showDefaultRoutes('データ形式が不正です');
      }
    };
    
    try {
      const script = document.createElement('script');
      const timestamp = new Date().toISOString();
      script.src = `${url}&callback=processRoutes&timestamp=${timestamp}`;
      script.onerror = function() {
        console.error('JSONPスクリプトのロードに失敗しました');
        // エラーの場合はフォールバックを手動で呼び出さない（タイムアウトに任せる）
      };
      document.body.appendChild(script);
      
      console.log('JSONPスクリプトを追加しました:', script.src);
    } catch (error) {
      console.error('JSONPリクエスト作成エラー:', error);
    }
  }
  
  /**
   * CORSプロキシを使ったアプローチを試みる関数
   */
  function tryCorsProxyApproach(url) {
    // CORSProxyを使用してAPIにアクセス
    const corsProxyUrl = 'https://corsproxy.io/?';
    const proxyUrl = corsProxyUrl + encodeURIComponent(url);
    
    console.log('CORSプロキシ経由でAPIにアクセス:', proxyUrl);
    
    // タイムスタンプを追加してキャッシュを防止
    const urlWithTimestamp = `${proxyUrl}&timestamp=${new Date().getTime()}`;
    
    // fetch APIを使用してデータを取得
    fetch(urlWithTimestamp)
      .then(response => {
        console.log('レスポンスステータス:', response.status);
        
        if (!response.ok) {
          throw new Error(`サーバーエラー: ${response.status}`);
        }
        
        // レスポンスヘッダーをチェック
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('JSONレスポンスではありません:', contentType);
        }
        
        return response.text();
      })
      .then(text => {
        console.log('受信データ（生テキスト）:', text.substring(0, 100) + '...');
        
        // JSONとして解析を試みる
        try {
          const data = JSON.parse(text);
          console.log('JSONデータを正常に解析:', data);
          
          if (data.status === 'ok' && Array.isArray(data.routes)) {
            displayRouteButtons(data.routes);
            console.log('ルートボタンの生成完了:', data.routes.length + '個');
          } else {
            console.error('不正なデータ形式:', data);
            showDefaultRoutes('データ形式が不正です');
          }
        } catch (error) {
          console.error('JSONパースエラー:', error, text);
          showDefaultRoutes('データの解析に失敗しました');
        }
      })
      .catch(error => {
        console.error('データ取得エラー:', error);
        showDefaultRoutes(error.message);
      });
  }
  
  /**
   * ルートボタンを表示する共通関数
   */
  function displayRouteButtons(routes) {
    // ルートボタンコンテナを空にする
    routeButtonsContainer.innerHTML = '';
    
    // 取得したルート一覧でボタンを生成
    routes.forEach(routeName => {
      const button = document.createElement('button');
      button.className = 'route-btn';
      button.setAttribute('data-route', routeName);
      button.textContent = routeName;
      
      // クリックイベントを追加
      button.addEventListener('click', handleRouteButtonClick);
      
      // コンテナに追加
      routeButtonsContainer.appendChild(button);
    });
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