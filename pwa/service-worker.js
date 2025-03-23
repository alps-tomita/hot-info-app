/**
 * HOT情報管理システム
 * Service Worker
 */

// キャッシュ名
const CACHE_NAME = 'hot-info-cache-v1.0.6';
const API_CACHE_NAME = 'hot-info-api-cache-v1.0.6';

// キャッシュするリソース
const CACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './images/icon-temp.svg'
];

// Service Workerのインストール時
self.addEventListener('install', event => {
  console.log('Service Worker: インストール中');
  
  // キャッシュの準備
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: キャッシュにファイルを追加');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Service Workerのアクティブ化時
self.addEventListener('activate', event => {
  console.log('Service Worker: アクティブ化');
  
  // 古いキャッシュの削除
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  
  return self.clients.claim();
});

// フェッチイベント
self.addEventListener('fetch', event => {
  console.log('Service Worker: フェッチリクエスト', event.request.url);
  
  // APIリクエストの処理（ルート一覧取得など）
  if (event.request.url.includes('script.google.com')) {
    // APIリクエストはネットワーク優先、その後キャッシュ
    console.log('Service Worker: APIリクエスト検出', event.request.url);
    
    // ルート一覧のAPIリクエスト
    if (event.request.url.includes('requestType=routes')) {
      // CORSリクエストをそのまま転送（処理せず）
      return;
    } else {
      // その他のAPIリクエスト（データ送信など）
      // これはキャッシュせず、常にネットワークを試みる
      return;
    }
  } else {
    // 静的アセットリクエストはキャッシュファースト戦略を適用
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // キャッシュが見つかった場合はそれを返す
          if (response) {
            console.log('Service Worker: キャッシュから返送', event.request.url);
            return response;
          }
          
          // キャッシュが見つからなかった場合はネットワークリクエスト
          console.log('Service Worker: キャッシュが見つからないのでネットワークリクエスト', event.request.url);
          return fetch(event.request)
            .then(res => {
              // レスポンスをクローン（1回しか読めないため）
              const resClone = res.clone();
              
              // キャッシュを開いて結果を保存
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, resClone);
                });
                
              return res;
            })
            .catch(err => {
              console.error('Service Worker: フェッチエラー', err);
              
              // オフラインフォールバック（特定のリクエストの場合）
              if (event.request.url.endsWith('.html')) {
                return caches.match('./index.html');
              }
            });
        })
    );
  }
});

// オフラインデータキュー（データ送信用）
let offlineDataQueue = [];

// バックグラウンド同期
self.addEventListener('sync', event => {
  console.log('Service Worker: バックグラウンド同期', event.tag);
  
  if (event.tag === 'sync-hot-data') {
    event.waitUntil(syncHotData());
  }
});

// HOTデータの同期処理
async function syncHotData() {
  // IndexedDBからオフラインデータを取得して送信する処理
  // 実際の実装はまだ含まれていません
  console.log('Service Worker: HOTデータ同期処理を実行');
  
  return true;
}

// プッシュ通知
self.addEventListener('push', event => {
  console.log('Service Worker: プッシュ通知受信', event);
  
  if (event.data) {
    const data = event.data.json();
    const title = data.title || 'HOT情報管理';
    const options = {
      body: data.body || '新しい通知があります',
      icon: './images/icon-192x192.png',
      badge: './images/icon-192x192.png'
    };
    
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
}); 