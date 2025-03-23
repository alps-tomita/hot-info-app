/**
 * HOT情報管理システム
 * メインJavaScriptファイル
 */

// グローバル変数
// 正常に動作確認済みのAPIエンドポイントURL
const API_URL = 'https://script.google.com/macros/s/AKfycbz6gw9LrKM9ovOD9e7AyQQKzJy5hB4N7iCU7xzgkQN3nqO9YiRAQm3Xm1vO9KMARyjh/exec';
let selectedRoute = '';
let capturedImage = null;
let latitude = null;
let longitude = null;
let locationAddress = '';
let locationDetail = '';  // 追加：位置情報の詳細（ビル名など）
let isOnline = navigator.onLine;
let selectedCategory = null;
let selectedMaterial = null;  // 選択された資料配布状況
let selectedProgress = null;  // 選択された工事進捗状況

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

  // イベントリスナー：写真なしで送信ボタン
  document.getElementById('no-photo-btn')?.addEventListener('click', () => {
    console.log('写真なしで送信が選択されました。ルート：', selectedRoute);
    routeSelectionContainer.style.display = 'none';
    infoFormContainer.style.display = 'block';
    
    // 位置情報フィールドを初期化
    document.getElementById('location-coords').textContent = '位置情報：未取得（手動入力可）';
    document.getElementById('location-address').value = '';
    document.getElementById('location-address').placeholder = '住所を入力してください';
    
    // 位置情報ステップを表示
    showLocationStep();
    setupCategoryCards();
  });

  // 画面制御関数を更新
  function showLocationStep() {
    document.getElementById('location-step').style.display = 'block';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'none';
    document.getElementById('progress-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'none';
  }

  function showCategoryStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'block';
    document.getElementById('material-step').style.display = 'none';
    document.getElementById('progress-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'none';
    setupCategoryCards();
  }

  function showMaterialStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'block';
    document.getElementById('progress-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'none';
    setupMaterialCards();
  }

  function showProgressStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'none';
    document.getElementById('progress-step').style.display = 'block';
    document.getElementById('comment-step').style.display = 'none';
    setupProgressCards();
  }

  function showCommentStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'none';
    document.getElementById('progress-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'block';
  }

  // 位置情報入力から次へボタンのイベントリスナー
  document.getElementById('next-to-category-btn').addEventListener('click', () => {
    // 位置情報の有無に関わらず次のステップに進めるように修正
    // すべての位置情報は任意入力とする
    showCategoryStep();
  });

  // カテゴリー選択の戻るボタンのイベントリスナー
  document.getElementById('back-to-location-btn')?.addEventListener('click', () => {
    showLocationStep();
  });

  // ルート選択に戻るボタンのイベントリスナー
  document.getElementById('back-to-route-btn')?.addEventListener('click', () => {
    // 写真情報をリセット
    document.getElementById('preview-image').src = '';
    document.getElementById('location-detail').value = '';
    capturedImage = null;
    selectedCategory = null;
    locationDetail = '';
    
    // ルート選択画面に戻る
    showRouteSelection();
  });

  // カテゴリーカードのイベントリスナーを更新
  function setupCategoryCards() {
    console.log('カテゴリーカードのセットアップを開始');
    const cards = document.querySelectorAll('.category-card');
    
    cards.forEach(card => {
      const newCard = card.cloneNode(true);
      card.parentNode.replaceChild(newCard, card);
      
      newCard.addEventListener('click', () => {
        console.log('カテゴリーがクリックされました:', newCard.dataset.category);
        
        cards.forEach(c => c.classList.remove('selected'));
        newCard.classList.add('selected');
        selectedCategory = newCard.dataset.category;
        
        // カテゴリー選択後、資料配布状況の選択へ
        setTimeout(() => {
          showMaterialStep();
        }, 300);
      });
    });
  }

  // 資料配布状況カードのイベントリスナーを設定
  function setupMaterialCards() {
    console.log('資料配布状況カードのセットアップを開始');
    const cards = document.querySelectorAll('.material-card');
    
    cards.forEach(card => {
      const newCard = card.cloneNode(true);
      card.parentNode.replaceChild(newCard, card);
      
      newCard.addEventListener('click', () => {
        console.log('資料配布状況がクリックされました:', newCard.dataset.material);
        
        cards.forEach(c => c.classList.remove('selected'));
        newCard.classList.add('selected');
        selectedMaterial = newCard.dataset.material;
        
        // 資料配布状況選択後、工事進捗状況の選択へ
        setTimeout(() => {
          showProgressStep();
        }, 300);
      });
    });
  }

  // 工事進捗状況カードのイベントリスナーを設定
  function setupProgressCards() {
    console.log('工事進捗状況カードのセットアップを開始');
    const cards = document.querySelectorAll('.progress-card');
    
    cards.forEach(card => {
      const newCard = card.cloneNode(true);
      card.parentNode.replaceChild(newCard, card);
      
      newCard.addEventListener('click', () => {
        console.log('工事進捗状況がクリックされました:', newCard.dataset.progress);
        
        cards.forEach(c => c.classList.remove('selected'));
        newCard.classList.add('selected');
        selectedProgress = newCard.dataset.progress;
        
        // 工事進捗状況選択後、コメント入力へ
        setTimeout(() => {
          showCommentStep();
        }, 300);
      });
    });
  }

  // 戻るボタンのイベントリスナーを更新
  document.getElementById('back-to-category-btn')?.addEventListener('click', () => {
    showCategoryStep();
  });

  document.getElementById('back-to-material-btn')?.addEventListener('click', () => {
    showMaterialStep();
  });

  document.getElementById('back-btn')?.addEventListener('click', () => {
    showProgressStep();
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
        material: selectedMaterial,
        progress: selectedProgress,  // 工事進捗状況を追加
        comment: comment,
        image: capturedImage,
        locationDetail: locationDetail,
        ...(capturedImage && {
          latitude: latitude,
          longitude: longitude,
          locationAddress: locationAddress
        })
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
      
      const response = await fetch(`${API_URL}?requestType=routes`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      console.log('レスポンス:', response);
      
      // レスポンスが正常でない場合は、デフォルトルートを表示
      if (!response.ok) {
        console.log('サーバーからの応答が正常ではありません。デフォルトルートを表示します。');
        showDefaultRoutes('サーバーからの応答が正常ではありません');
        return;
      }
      
      const data = await response.json();
      console.log('取得したルートデータ:', data);
      
      if (data.status === 'ok' && Array.isArray(data.routes)) {
        routeButtonsContainer.innerHTML = '';
        
        if (data.routes.length === 0) {
          console.log('ルートが存在しないためデフォルトルートを表示します');
          showDefaultRoutes('ルートが登録されていません');
          return;
        }
        
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
        console.log('デフォルトルートを表示します（データ形式不正）');
        showDefaultRoutes('データ形式が不正です');
      }
    } catch (error) {
      console.error('ルート一覧の取得に失敗しました:', error);
      showDefaultRoutes('ルート一覧の取得に失敗しました');
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
      // カメラ関連の要素をリセット
      videoElement = document.getElementById('camera-view');
      canvasElement = document.getElementById('camera-canvas');
      const previewContainer = document.querySelector('.preview-container');
      const captureBtn = document.getElementById('capture-btn');
      const retakeBtn = document.getElementById('retake-btn');
      const usePhotoBtn = document.getElementById('use-photo-btn');
      
      // 表示状態をリセット
      previewContainer.style.display = 'none';
      videoElement.style.display = 'block';
      captureBtn.style.display = 'inline-block';
      retakeBtn.style.display = 'none';
      usePhotoBtn.style.display = 'none';
      
      // プレビュー画像をクリア
      document.getElementById('preview-image').src = '';
      capturedImage = null;

      const cameraContainer = document.querySelector('.camera-container');
      const routeSelectionContainer = document.querySelector('.route-selection-container');
      
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
      await videoElement.play();  // ビデオの再生を待つ
      
      // カメラのイベントリスナーを設定
      setupCameraEventListeners();
      
    } catch (error) {
      console.error('カメラの起動に失敗しました:', error);
      alert('カメラの起動に失敗しました。設定を確認してください。');
      showRouteSelection();
    }
  }

  /**
   * カメラのイベントリスナーを設定する関数
   */
  function setupCameraEventListeners() {
    const captureBtn = document.getElementById('capture-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const usePhotoBtn = document.getElementById('use-photo-btn');
    
    captureBtn.addEventListener('click', capturePhoto);
    
    retakeBtn.addEventListener('click', () => {
      // プレビューを非表示にしてカメラを再表示
      const previewContainer = document.querySelector('.preview-container');
      
      previewContainer.style.display = 'none';
      videoElement.style.display = 'block';
      captureBtn.style.display = 'inline-block';
      retakeBtn.style.display = 'none';
      usePhotoBtn.style.display = 'none';
    });
    
    usePhotoBtn.addEventListener('click', async () => {
      stopCamera();
      
      // 情報入力フォームを表示
      cameraContainer.style.display = 'none';
      infoFormContainer.style.display = 'block';
      showLocationStep();
      
      // 位置情報の取得を試みる
      try {
        // まず写真のEXIF情報から位置情報の取得を試みる
        const exifLocation = await getExifLocation();
        if (exifLocation) {
          latitude = exifLocation.latitude;
          longitude = exifLocation.longitude;
          document.getElementById('location-coords').textContent = 
            `緯度: ${latitude.toFixed(6)}, 経度: ${longitude.toFixed(6)}`;
          return;
        }

        // EXIF情報が取得できない場合はデバイスの位置情報を取得
        const location = await getLocation();
        if (location) {
          latitude = location.latitude;
          longitude = location.longitude;
          document.getElementById('location-coords').textContent = 
            `緯度: ${latitude.toFixed(6)}, 経度: ${longitude.toFixed(6)}`;
        }
      } catch (error) {
        console.error('位置情報の取得に失敗しました:', error);
        document.getElementById('location-coords').textContent = '位置情報を取得できませんでした';
        document.getElementById('location-address').placeholder = '住所を入力してください';
        // 位置情報が取得できない場合はnullを設定
        latitude = null;
        longitude = null;
      }
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
      
      // プレビュー表示
      const previewContainer = document.querySelector('.preview-container');
      const previewImage = document.getElementById('preview-image');
      const captureBtn = document.getElementById('capture-btn');
      const retakeBtn = document.getElementById('retake-btn');
      const usePhotoBtn = document.getElementById('use-photo-btn');
      
      previewImage.src = capturedImage;
      videoElement.style.display = 'none';
      previewContainer.style.display = 'block';
      captureBtn.style.display = 'none';
      retakeBtn.style.display = 'inline-block';
      usePhotoBtn.style.display = 'inline-block';
      
    } catch (error) {
      console.error('写真の撮影に失敗しました:', error);
      alert('写真の撮影に失敗しました。もう一度お試しください。');
    }
  }

  /**
   * 写真のEXIF情報から位置情報を取得する関数
   */
  function getExifLocation() {
    return new Promise((resolve, reject) => {
      try {
        // Base64画像データをBlobに変換
        const base64Data = capturedImage.split(',')[1];
        const binary = atob(base64Data);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          array[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([array], { type: 'image/jpeg' });

        // BlobからFileオブジェクトを作成
        const file = new File([blob], "photo.jpg", { type: 'image/jpeg' });

        EXIF.getData(file, function() {
          const exifData = EXIF.getAllTags(this);
          console.log('EXIF情報:', exifData);

          if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
            // EXIF座標を10進数に変換
            const latitude = convertDMSToDD(
              exifData.GPSLatitude[0],
              exifData.GPSLatitude[1],
              exifData.GPSLatitude[2],
              exifData.GPSLatitudeRef
            );
            const longitude = convertDMSToDD(
              exifData.GPSLongitude[0],
              exifData.GPSLongitude[1],
              exifData.GPSLongitude[2],
              exifData.GPSLongitudeRef
            );

            resolve({ latitude, longitude });
          } else {
            resolve(null);
          }
        });
      } catch (error) {
        console.error('EXIF情報の取得に失敗:', error);
        resolve(null);
      }
    });
  }

  /**
   * 度分秒（DMS）から10進数（DD）に変換する関数
   */
  function convertDMSToDD(degrees, minutes, seconds, direction) {
    let dd = degrees + minutes/60 + seconds/3600;
    if (direction === 'S' || direction === 'W') {
      dd = dd * -1;
    }
    return dd;
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
    cameraContainer.style.display = 'none';
    infoFormContainer.style.display = 'block';
    showLocationStep();  // 位置情報入力ステップを表示
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
 * 位置情報を取得して表示する関数
 */
async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      console.log('位置情報がサポートされていません');
      document.getElementById('location-coords').textContent = '位置情報はサポートされていません';
      document.getElementById('location-address').placeholder = '住所を入力してください';
      resolve(null);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        
        // 位置情報を表示
        document.getElementById('location-coords').textContent = 
          `緯度: ${latitude.toFixed(6)}, 経度: ${longitude.toFixed(6)}`;
        
        // 住所を取得して表示
        try {
          const response = await fetch(
            `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          
          if (data.results) {
            // 市区町村コードを除外し、住所のみを表示
            const address = data.results.lv01Nm;
            document.getElementById('location-address').value = address || '住所を入力してください';
          }
        } catch (error) {
          console.error('住所の取得に失敗しました:', error);
          document.getElementById('location-address').placeholder = '住所を入力してください';
        }
        
        resolve({
          latitude: latitude,
          longitude: longitude
        });
      },
      (error) => {
        console.log('位置情報の取得に失敗しました:', error);
        document.getElementById('location-coords').textContent = '位置情報を取得できませんでした（手動入力可）';
        document.getElementById('location-address').placeholder = '住所を入力してください';
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

// フォームデータを取得する関数
function getFormData() {
  const locationCoordsText = document.getElementById('location-coords').textContent;
  const locationAddress = document.getElementById('location-address').value;
  const locationDetail = document.getElementById('location-detail').value;
  
  let latitude = null;
  let longitude = null;
  
  // 位置情報の解析
  const coordsMatch = locationCoordsText.match(/緯度: ([\d.-]+), 経度: ([\d.-]+)/);
  if (coordsMatch) {
    latitude = parseFloat(coordsMatch[1]);
    longitude = parseFloat(coordsMatch[2]);
  }
  
  return {
    latitude,
    longitude,
    address: locationAddress,
    detail: locationDetail
  };
}

/**
 * データを送信する関数
 */
function sendData(data) {
  console.log('データ送信を開始します:', data);
  
  // 位置情報がある場合のみ含める（必須ではない）
  if (latitude !== null && longitude !== null) {
    data.latitude = latitude;
    data.longitude = longitude;
  }
  
  // 住所情報も追加（入力された場合のみ）
  const addressInput = document.getElementById('location-address');
  if (addressInput && addressInput.value.trim() !== '') {
    data.address = addressInput.value.trim();
  }
  
  // 補足情報も追加（入力された場合のみ）
  const detailInput = document.getElementById('location-detail');
  if (detailInput && detailInput.value.trim() !== '') {
    data.detail = detailInput.value.trim();
  }

  return fetch(API_URL, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => {
    console.log('送信レスポンス:', response);
    if (!response.ok) {
      throw new Error(`サーバーエラーが発生しました (${response.status})`);
    }
    return response.json();
  })
  .then(data => {
    console.log('送信成功:', data);
    return data;
  })
  .catch(error => {
    console.error('送信エラー:', error);
    throw error;
  });
} 