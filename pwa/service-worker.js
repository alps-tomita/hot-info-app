/**
 * HOT情報管理システム
 * Service Worker
 */

// キャッシュの名前とバージョン
const CACHE_NAME = 'hot-info-cache-v1';
const API_CACHE_NAME = 'hot-info-api-cache-v1.0.6';

// キャッシュするリソースのリスト
const CACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './images/icon-temp.svg',
  // 必要に応じてその他のリソースをここに追加
];

// Service Workerのインストール処理
self.addEventListener('install', event => {
  console.log('Service Worker: インストール中');
  
  // キャッシュの初期化と指定したリソースのキャッシュ
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: キャッシュを開きました');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => {
        // すぐにアクティベーションフェーズに移行
        return self.skipWaiting();
      })
  );
});

// アクティベーション時の処理
self.addEventListener('activate', event => {
  console.log('Service Worker: アクティベーション');
  
  // 古いキャッシュの削除
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('Service Worker: 古いキャッシュを削除', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 新しいService Workerを直ちにアクティブ化
      return self.clients.claim();
    })
  );
});

// フェッチイベントの処理（ネットワークリクエスト）
self.addEventListener('fetch', event => {
  console.log('Service Worker: フェッチ', event.request.url);
  
  // POSTリクエストはキャッシュせずにネットワークに直接渡す
  if (event.request.method === 'POST') {
    return;
  }
  
  // Google Apps ScriptへのGETリクエストもキャッシュしない
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  // スタティックアセットのキャッシュ戦略
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュに存在すればそれを返す
        if (response) {
          console.log('Service Worker: キャッシュからレスポンス', event.request.url);
          return response;
        }
        
        // アイコンのリクエストで、ファイルが存在しない場合は代替アイコンを提供
        if (event.request.url.includes('icon-192x192.png') || 
            event.request.url.includes('icon-512x512.png')) {
          // SVGアイコンをフォールバックとして使用
          return caches.match('./images/icon-temp.svg')
            .then(svgResponse => {
              if (svgResponse) {
                console.log('Service Worker: 代替アイコンを提供', event.request.url);
                return svgResponse;
              }
              // SVGも見つからない場合はネットワークリクエストを続行
              return fetchAndCache(event.request);
            });
        }
        
        // キャッシュになければネットワークにフェッチ
        return fetchAndCache(event.request);
      })
  );
});

// フェッチしてキャッシュする関数
function fetchAndCache(request) {
  console.log('Service Worker: ネットワークからフェッチ', request.url);
  return fetch(request)
    .then(networkResponse => {
      // レスポンスが有効かチェック
      if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
        return networkResponse;
      }
      
      // レスポンスをクローンしてキャッシュに保存
      // （レスポンスは一度しか使用できないため）
      const responseToCache = networkResponse.clone();
      caches.open(CACHE_NAME)
        .then(cache => {
          cache.put(request, responseToCache);
        });
        
      return networkResponse;
    })
    .catch(error => {
      console.error('Service Worker: フェッチに失敗', error);
      
      // 画像リクエストの場合は代替画像を返す
      if (request.url.includes('.png') || 
          request.url.includes('.jpg') || 
          request.url.includes('.jpeg') || 
          request.url.includes('.svg')) {
        return caches.match('./images/icon-temp.svg');
      }
      
      // オフライン時や通信エラー時にフォールバックコンテンツを表示
      return caches.match('./index.html');
    });
}

// バックグラウンド同期
self.addEventListener('sync', event => {
  if (event.tag === 'send-data') {
    console.log('Service Worker: バックグラウンド同期 - 送信データ');
    event.waitUntil(sendPendingData());
  }
});

// オフラインデータの送信処理
async function sendPendingData() {
  // オフラインキュー（IndexedDBなど）から未送信データを取得して送信
  // 実装はアプリの設計に依存します
  console.log('Service Worker: 未送信データの処理');
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