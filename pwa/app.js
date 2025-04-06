/**
 * HOT情報管理システム
 * メインJavaScriptファイル
 */

// グローバル変数
// 正常に動作確認済みのAPIエンドポイントURL
const API_URL = 'https://script.google.com/macros/s/AKfycbxHkHnbyCfL0QDxRZbqaXn4n0vByyNtVgbfALvMwH_H3crad-7nVhiX7Qrk0cztGuDL/exec';
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

// PWAのインストールプロンプト処理
let deferredPrompt;

// 開発モードフラグ - 本番環境では false に変更
const isDevelopment = false;

// キャッシュをクリアする関数
function clearCaches() {
  if ('caches' in window && isDevelopment) {
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
  if ('serviceWorker' in navigator && isDevelopment) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for(let registration of registrations) {
        console.log('ServiceWorkerの登録を解除: ', registration);
        registration.unregister();
      }
    });
  }
}

// 開発モードの場合のみキャッシュクリア
if (isDevelopment) {
  clearCaches();
  unregisterServiceWorker();
}

// DOMが読み込まれた後に実行
document.addEventListener('DOMContentLoaded', () => {
  // 要素の取得
  const routeButtonsContainer = document.querySelector('.route-buttons-container');
  const startCameraBtn = document.getElementById('start-camera-btn');
  const selectPhotoBtn = document.getElementById('select-photo-btn');
  const photoFileInput = document.getElementById('photo-file-input');
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
    // 位置情報をリセット
    latitude = null;
    longitude = null;
    locationAddress = '';
    // フォームフィールドも初期化
    if (document.getElementById('location-coords')) {
      document.getElementById('location-coords').textContent = '';
    }
    if (document.getElementById('location-address')) {
      document.getElementById('location-address').value = '';
      document.getElementById('location-address').placeholder = '住所を取得中...';
    }
    resetAllCardSelections();
    startCamera();
  });

  // イベントリスナー：写真選択ボタン
  selectPhotoBtn.addEventListener('click', () => {
    console.log('写真選択ボタンがクリックされました。ルート：', selectedRoute);
    // 位置情報をリセット
    latitude = null;
    longitude = null;
    locationAddress = '';
    // フォームフィールドも初期化
    if (document.getElementById('location-coords')) {
      document.getElementById('location-coords').textContent = '';
    }
    if (document.getElementById('location-address')) {
      document.getElementById('location-address').value = '';
      document.getElementById('location-address').placeholder = '住所を取得中...';
    }
    // ファイル選択ダイアログを表示
    photoFileInput.click();
  });

  // ファイル選択時のイベントリスナー
  photoFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) {
      console.log('ファイルが選択されませんでした');
      return;
    }

    console.log('ファイルが選択されました:', file.name);
    
    try {
      // FileReaderを使って画像ファイルをBase64形式に変換
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        capturedImage = e.target.result; // Base64形式の画像データ
        console.log('画像ファイルを読み込みました', capturedImage.substring(0, 50) + '...');
        
        // ルート選択画面を非表示にして情報入力フォームを表示
        routeSelectionContainer.style.display = 'none';
        infoFormContainer.style.display = 'block';
        showLocationStep();
        
        // 位置情報の取得を試みる
        try {
          // EXIF情報から位置情報を取得
          const exifLocation = await getExifLocationFromFile(file);
          
          if (exifLocation) {
            console.log('ファイルからEXIF位置情報を取得:', exifLocation);
            latitude = exifLocation.latitude;
            longitude = exifLocation.longitude;
            document.getElementById('location-coords').textContent = 
              `緯度: ${latitude.toFixed(6)}, 経度: ${longitude.toFixed(6)}`;
            
            // 住所を取得する処理を追加
            try {
              await fetchAddressFromCoordinates(latitude, longitude);
            } catch (addrError) {
              console.error('住所の取得に失敗:', addrError);
            }
          } else {
            console.log('ファイルにEXIF位置情報がありませんでした');
            document.getElementById('location-coords').textContent = '位置情報を取得できませんでした';
            document.getElementById('location-address').placeholder = '住所を入力してください';
            // 位置情報が取得できない場合はnullを設定
            latitude = null;
            longitude = null;
          }
        } catch (error) {
          console.error('EXIF情報の取得に失敗しました:', error);
          document.getElementById('location-coords').textContent = '位置情報を取得できませんでした';
          document.getElementById('location-address').placeholder = '住所を入力してください';
          latitude = null;
          longitude = null;
        }
      };
      
      reader.onerror = (error) => {
        console.error('ファイル読み込みエラー:', error);
        alert('ファイルの読み込みに失敗しました');
      };
      
      // ファイルをBase64形式で読み込む
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('写真選択処理エラー:', error);
      alert('写真の処理に失敗しました: ' + error.message);
    }
  });

  // イベントリスナー：写真なしで送信ボタン
  document.getElementById('no-photo-btn')?.addEventListener('click', () => {
    console.log('写真なしで送信が選択されました。ルート：', selectedRoute);
    
    // 写真なしの場合はcapturedImageをnullにセット
    capturedImage = null;
    
    // 位置情報もnullに設定
    latitude = null;
    longitude = null;
    
    // ルート選択画面を非表示
    routeSelectionContainer.style.display = 'none';
    
    // 位置情報入力ステップを表示
    cameraContainer.style.display = 'none';
    infoFormContainer.style.display = 'block';
    
    // 位置情報の入力フィールドを初期化
    document.getElementById('location-coords').textContent = '位置情報なし（手動入力可）';
    document.getElementById('location-address').value = '';
    document.getElementById('location-address').placeholder = '住所を入力してください';
    
    showLocationStep();
  });

  // 画面制御関数を更新
  function showLocationStep() {
    // 位置情報フィールドの状態をチェック・リセット
    // 新しい送信を始める時に前回の値が残らないようにする
    if (!capturedImage) {
      // 写真なしの場合や新規セッションの場合はフィールドをクリア
      if (document.getElementById('location-coords')) {
        document.getElementById('location-coords').textContent = '位置情報なし（手動入力可）';
      }
      if (document.getElementById('location-address')) {
        document.getElementById('location-address').value = '';
        document.getElementById('location-address').placeholder = '住所を入力してください';
      }
    }

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
  }

  function showMaterialStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'block';
    document.getElementById('progress-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'none';
  }

  function showProgressStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'none';
    document.getElementById('progress-step').style.display = 'block';
    document.getElementById('comment-step').style.display = 'none';
  }

  function showCommentStep() {
    document.getElementById('location-step').style.display = 'none';
    document.getElementById('category-step').style.display = 'none';
    document.getElementById('material-step').style.display = 'none';
    document.getElementById('progress-step').style.display = 'none';
    document.getElementById('comment-step').style.display = 'block';
  }

  // 全てのカードの選択をリセットする関数
  function resetAllCardSelections() {
    document.querySelectorAll('.category-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('.material-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('.progress-card').forEach(card => card.classList.remove('selected'));
    
    selectedCategory = null;
    selectedMaterial = null;
    selectedProgress = null;
  }

  // 位置情報入力から次へボタンのイベントリスナー
  document.getElementById('next-to-category-btn').addEventListener('click', () => {
    // 位置情報の有無に関わらず次のステップに進めるように修正
    // すべての位置情報は任意入力とする
    showCategoryStep();
  });

  // カテゴリー選択の戻るボタンのイベントリスナー
  document.getElementById('back-to-location-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.category-card').forEach(card => card.classList.remove('selected'));
    selectedCategory = null;
    showLocationStep();
  });

  // 資料配布状況の戻るボタンのイベントリスナー
  document.getElementById('back-to-category-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.material-card').forEach(card => card.classList.remove('selected'));
    selectedMaterial = null;
    showCategoryStep();
  });

  // 工事進捗状況の戻るボタンのイベントリスナー
  document.getElementById('back-to-material-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.progress-card').forEach(card => card.classList.remove('selected'));
    selectedProgress = null;
    showMaterialStep();
  });

  document.getElementById('back-btn')?.addEventListener('click', () => {
    showProgressStep();
  });

  // 送信ボタンのイベントリスナー
  document.getElementById('submit-btn')?.addEventListener('click', async () => {
    const comment = document.getElementById('comment-input').value.trim();
    
    // ローディング表示
    const loadingContainer = document.querySelector('.loading-container');
    loadingContainer.style.display = 'flex';

    try {
      // 手動入力された住所があれば上書き
      const addressInput = document.getElementById('location-address').value;
      if (addressInput && addressInput !== '住所を取得中...' && addressInput !== '住所を入力してください') {
        locationAddress = addressInput;
      }
      
      // 場所の補足情報
      locationDetail = document.getElementById('location-detail').value || '';
      
      // データを送信
      const data = {
        requestType: 'submit',
        route: selectedRoute,
        category: selectedCategory,
        material: selectedMaterial,
        progress: selectedProgress,
        comment: comment || '',
        imageUrl: capturedImage,
        address: locationAddress,
        locationDetail: locationDetail,
        ...(latitude !== null && longitude !== null && {
          latitude: latitude,
          longitude: longitude
        })
      };

      const response = await sendData(data);
      
      // no-corsモードではresponse.statusが常にokになるため、
      // エラーは.catchブロックでのみ捕捉される
      
      // 成功時の処理
      // 完了画面を表示
      document.querySelector('.info-form-container').style.display = 'none';
      document.querySelector('.complete-container').style.display = 'block';
      
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
    
    // グローバル関数を呼び出してルート選択画面に戻る
    showRouteSelection();
  });
  
  // アプリ終了ボタンのイベントリスナー
  document.getElementById('close-app-btn')?.addEventListener('click', () => {
    // インストール済みのPWAの場合はウィンドウを閉じる
    // (一部のモバイルブラウザでは動作しない場合があります)
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      // PWAとして実行中の場合
      window.close();
    } else {
      // 通常のブラウザの場合
      alert('ブラウザを閉じてアプリを終了してください。');
    }
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
          width: { ideal: 1280 },
          height: { ideal: 720 }
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
          
          // 住所を取得
          try {
            await fetchAddressFromCoordinates(latitude, longitude);
          } catch (addrError) {
            console.error('住所の取得に失敗:', addrError);
          }
          return;
        }

        // EXIF情報が取得できない場合、撮影時に取得した位置情報を使用
        if (window._tempPhotoLocation) {
          console.log('EXIF情報なし - 撮影時に保存した位置情報を使用');
          latitude = window._tempPhotoLocation.latitude;
          longitude = window._tempPhotoLocation.longitude;
          document.getElementById('location-coords').textContent = 
            `緯度: ${latitude.toFixed(6)}, 経度: ${longitude.toFixed(6)}`;
          
          // 住所を取得
          try {
            await fetchAddressFromCoordinates(latitude, longitude);
          } catch (addrError) {
            console.error('住所の取得に失敗:', addrError);
          }
          return;
        }

        // どちらの方法でも位置情報が取得できない場合
        console.log('写真からの位置情報取得できず、現在地からの取得もスキップします');
        document.getElementById('location-coords').textContent = '位置情報を取得できませんでした';
        document.getElementById('location-address').placeholder = '住所を入力してください';
        // 位置情報が取得できない場合はnullを設定
        latitude = null;
        longitude = null;
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
      // 位置情報を先に取得しておく（モバイル端末用）
      try {
        // PWAで位置情報許可を得るタイミングの改善
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              console.log('撮影時に位置情報を取得: 成功');
              // 位置情報を一時的に保存（EXIF取得に失敗した場合のバックアップ）
              window._tempPhotoLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              };
            },
            (error) => {
              console.log('撮影時の位置情報取得: 失敗', error.message);
              window._tempPhotoLocation = null;
            },
            { enableHighAccuracy: true, timeout: 5000 }
          );
        }
      } catch (geoError) {
        console.log('位置情報の事前取得に失敗:', geoError);
      }

      // キャンバスサイズをビデオに合わせる
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
        // デバッグ: Base64画像データの確認
        console.log('EXIF取得開始: 画像データあり=', !!capturedImage);
        if (!capturedImage) {
          console.log('画像データがありません');
          resolve(null);
          return;
        }
        
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
        console.log('EXIF取得: Fileオブジェクト作成完了', file.size, 'bytes');

        EXIF.getData(file, function() {
          const exifData = EXIF.getAllTags(this);
          console.log('EXIF情報取得結果:', exifData);

          if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
            console.log('EXIF位置情報検出:', exifData.GPSLatitude, exifData.GPSLongitude);
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

            console.log('位置情報変換完了:', latitude, longitude);
            resolve({ latitude, longitude });
          } else {
            console.log('EXIF内に位置情報が見つかりませんでした');
            resolve(null);
          }
        });
      } catch (error) {
        console.error('EXIF情報の取得エラー:', error);
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

  // インストール状態を確認して、インストールボタンの表示/非表示を切り替える関数
  function checkInstallState() {
    const installButton = document.getElementById('install-button');
    if (!installButton) return;
    
    // PWAとして実行されているか確認（スタンドアロンモードまたはiOSのホーム画面から起動）
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      // インストール済みの場合はボタンを非表示
      installButton.style.display = 'none';
      console.log('PWAモードで実行中 - インストールボタンを非表示');
    } else {
      // インストールプロンプトが利用可能な場合のみボタンを表示（初期状態は非表示）
      installButton.style.display = 'none';
      console.log('ブラウザモードで実行中 - インストールプロンプトを待機');
    }
  }

  // インストールプロンプトをキャッチ
  window.addEventListener('beforeinstallprompt', (e) => {
    // プロンプトをすぐに表示しないためにデフォルトの動作を防止
    e.preventDefault();
    // 後で使用するためにイベントを保存
    deferredPrompt = e;
    
    // インストールボタンがあれば表示する
    const installButton = document.getElementById('install-button');
    if (installButton) {
      // ブラウザモードで実行中かつプロンプトが利用可能な場合のみボタンを表示
      if (!window.matchMedia('(display-mode: standalone)').matches && 
          window.navigator.standalone !== true) {
        installButton.style.display = 'block';
        console.log('インストールプロンプトが利用可能 - インストールボタンを表示');
      }
      
      // インストールボタンのクリックイベント
      installButton.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        // プロンプトを表示
        deferredPrompt.prompt();
        
        // ユーザーの選択を待つ
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`ユーザーの選択: ${outcome}`);
        
        // deferredPromptをリセット（一度しか使えない）
        deferredPrompt = null;
        
        // ボタンを非表示
        installButton.style.display = 'none';
      });
    }
  });

  // PWAが正常にインストールされたかを追跡
  window.addEventListener('appinstalled', (evt) => {
    console.log('インストール成功');
    // インストール後はボタンを非表示
    const installButton = document.getElementById('install-button');
    if (installButton) {
      installButton.style.display = 'none';
    }
  });

  // アプリケーションバージョン
  const appVersion = '1.0.0';

  // Webアプリが読み込まれたときの処理
  console.log(`HOT情報アプリ バージョン ${appVersion} を起動中...`);
  
  // PWAとして実行されているか確認
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    console.log('PWAモードで実行中');
  } else {
    console.log('ブラウザモードで実行中');
  }
  
  // インストール状態を確認
  checkInstallState();

  // ルート選択に戻るボタンのイベントリスナー
  document.getElementById('back-to-route-btn')?.addEventListener('click', () => {
    // 写真情報をリセット
    document.getElementById('preview-image').src = '';
    document.getElementById('location-detail').value = '';
    
    resetAllCardSelections();
    
    // ルート選択画面に戻る
    infoFormContainer.style.display = 'none';
    routeSelectionContainer.style.display = 'block';
  });

  // カード選択のイベントリスナーをDOMContentLoadedイベント内で直接設定
  // カテゴリーカードのイベントリスナー
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', function() {
      console.log('カテゴリーがクリックされました:', this.dataset.category);
      
      // すべてのカテゴリーカードの選択状態をリセット
      document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
      
      // このカードを選択状態に
      this.classList.add('selected');
      selectedCategory = this.dataset.category;
      
      // 次のステップへ
      setTimeout(() => {
        showMaterialStep();
      }, 300);
    });
  });
  
  // 資料配布状況カードのイベントリスナー
  document.querySelectorAll('.material-card').forEach(card => {
    card.addEventListener('click', function() {
      console.log('資料配布状況がクリックされました:', this.dataset.material);
      
      // すべての資料配布状況カードの選択状態をリセット
      document.querySelectorAll('.material-card').forEach(c => c.classList.remove('selected'));
      
      // このカードを選択状態に
      this.classList.add('selected');
      selectedMaterial = this.dataset.material;
      
      // 次のステップへ
      setTimeout(() => {
        showProgressStep();
      }, 300);
    });
  });
  
  // 工事進捗状況カードのイベントリスナー
  document.querySelectorAll('.progress-card').forEach(card => {
    card.addEventListener('click', function() {
      console.log('工事進捗状況がクリックされました:', this.dataset.progress);
      
      // すべての工事進捗状況カードの選択状態をリセット
      document.querySelectorAll('.progress-card').forEach(c => c.classList.remove('selected'));
      
      // このカードを選択状態に
      this.classList.add('selected');
      selectedProgress = this.dataset.progress;
      
      // 次のステップへ
      setTimeout(() => {
        showCommentStep();
      }, 300);
    });
  });

  /**
   * ファイルから直接EXIF情報を取得する関数
   */
  function getExifLocationFromFile(file) {
    return new Promise((resolve, reject) => {
      try {
        console.log('ファイルからEXIF情報取得開始:', file.name);
        
        EXIF.getData(file, function() {
          const exifData = EXIF.getAllTags(this);
          console.log('EXIF情報取得結果:', exifData);

          if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
            console.log('EXIF位置情報検出:', exifData.GPSLatitude, exifData.GPSLongitude);
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

            console.log('位置情報変換完了:', latitude, longitude);
            resolve({ latitude, longitude });
          } else {
            console.log('EXIF内に位置情報が見つかりませんでした');
            resolve(null);
          }
        });
      } catch (error) {
        console.error('EXIF情報の取得エラー:', error);
        resolve(null);
      }
    });
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
            // グローバル変数に住所を保存
            locationAddress = address || '';
          }
        } catch (error) {
          console.error('住所の取得に失敗しました:', error);
          document.getElementById('location-address').placeholder = '住所を入力してください';
          locationAddress = '';
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

/**
 * 座標から住所を取得する関数
 */
async function fetchAddressFromCoordinates(lat, lon) {
  try {
    const response = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    
    if (data.results) {
      // 市区町村コードを除外し、住所のみを表示
      const address = data.results.lv01Nm;
      document.getElementById('location-address').value = address || '住所を入力してください';
      // グローバル変数に住所を保存
      locationAddress = address || '';
      return address;
    }
    return null;
  } catch (error) {
    console.error('住所の取得に失敗しました:', error);
    document.getElementById('location-address').placeholder = '住所を入力してください';
    locationAddress = '';
    return null;
  }
}

// 送信するフォームデータを取得する関数
function getFormData() {
  const selectedRoute = localStorage.getItem('selectedRoute') || '';
  const category = selectedCategory;
  const material = selectedMaterial;
  const progress = selectedProgress;
  const comment = document.getElementById('comment-input').value;
  
  // 位置情報を取得
  const latitude = document.getElementById('latitude').value;
  const longitude = document.getElementById('longitude').value;
  const address = document.getElementById('address').value;
  
  // フォームデータを返す
  return {
    route: selectedRoute,
    latitude: latitude,
    longitude: longitude,
    address: address,
    category: category,
    comment: comment,
    imageUrl: '', // GAS側で設定されるためここでは空文字
    imageData: capturedImage, // 撮影した画像のBase64データ
    material: material,
    progress: progress
  };
}

/**
 * ローディング表示を制御する関数
 */
function showLoading(message = '処理中...') {
  const loadingContainer = document.querySelector('.loading-container');
  if (loadingContainer) {
    const messageElement = loadingContainer.querySelector('p');
    if (messageElement) {
      messageElement.textContent = message;
    }
    loadingContainer.style.display = 'flex';
  }
}

function hideLoading() {
  const loadingContainer = document.querySelector('.loading-container');
  if (loadingContainer) {
    loadingContainer.style.display = 'none';
  }
}

/**
 * フォーム情報をリセットする関数
 */
function resetForm() {
  // 入力フィールドをクリア
  document.getElementById('comment-input').value = '';
  document.getElementById('location-detail').value = '';
  
  // 画像情報をクリア
  capturedImage = null;
  latitude = null;
  longitude = null;
  locationAddress = '';
  locationDetail = '';
  
  // カード選択をリセット
  document.querySelectorAll('.category-card').forEach(card => card.classList.remove('selected'));
  document.querySelectorAll('.material-card').forEach(card => card.classList.remove('selected'));
  document.querySelectorAll('.progress-card').forEach(card => card.classList.remove('selected'));
  selectedCategory = null;
  selectedMaterial = null;
  selectedProgress = null;
}

/**
 * データをサーバーに送信する関数
 */
async function sendData(data) {
  try {
    showLoading('送信中...');
    
    const endpoint = 'https://script.google.com/macros/s/AKfycbxHkHnbyCfL0QDxRZbqaXn4n0vByyNtVgbfALvMwH_H3crad-7nVhiX7Qrk0cztGuDL/exec';
    
    console.log('送信データ:', data);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors', // CORSエラーを回避するためno-corsに変更
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    // no-corsモードの場合、レスポンスのステータスコードや内容にアクセスできないため
    // 成功として扱う（エラーはcatchブロックで捕捉される）
    console.log('レスポンス（詳細表示不可）:', response);
    
    hideLoading();
    
    // フォームをリセットして完了画面を表示
    resetForm();
    
    // 成功したら完了画面を表示
    const infoFormContainer = document.querySelector('.info-form-container');
    const completeContainer = document.querySelector('.complete-container');
    
    if (infoFormContainer) infoFormContainer.style.display = 'none';
    if (completeContainer) completeContainer.style.display = 'block';
    
    // completeContainer表示後は、「新規登録へ」ボタンでshowRouteSelectionを使用
    
  } catch (error) {
    hideLoading();
    console.error('送信エラー:', error);
    alert('送信に失敗しました。インターネット接続を確認してください。');
  }
}

/**
 * ルート選択画面を表示する関数
 */
function showRouteSelection() {
  // すべてのカード選択をリセット
  document.querySelectorAll('.category-card').forEach(card => card.classList.remove('selected'));
  document.querySelectorAll('.material-card').forEach(card => card.classList.remove('selected'));
  document.querySelectorAll('.progress-card').forEach(card => card.classList.remove('selected'));
  
  // グローバル変数をリセット
  selectedCategory = null;
  selectedMaterial = null;
  selectedProgress = null;
  capturedImage = null;
  latitude = null;
  longitude = null;
  locationAddress = '';
  
  // 位置情報入力フィールドを確実にリセット
  if (document.getElementById('location-coords')) {
    document.getElementById('location-coords').textContent = '';
  }
  if (document.getElementById('location-address')) {
    document.getElementById('location-address').value = '';
    document.getElementById('location-address').placeholder = '住所を入力してください';
  }
  if (document.getElementById('location-detail')) {
    document.getElementById('location-detail').value = '';
  }
  
  // 画面表示を切り替え
  const routeSelectionContainer = document.querySelector('.route-selection-container');
  const cameraContainer = document.querySelector('.camera-container');
  const infoFormContainer = document.querySelector('.info-form-container');
  const completeContainer = document.querySelector('.complete-container');
  
  // 各コンテナの表示状態を設定
  if (routeSelectionContainer) routeSelectionContainer.style.display = 'block';
  if (cameraContainer) cameraContainer.style.display = 'none';
  if (infoFormContainer) infoFormContainer.style.display = 'none';
  if (completeContainer) completeContainer.style.display = 'none';
} 