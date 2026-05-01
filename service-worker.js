// ============================================================
// P.I.F. Studio Service Worker
// オフラインキャッシュ
// ============================================================
const CACHE_NAME = 'pif-studio-v1';

// 起動に必要な必須リソース
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.png',
];

// CDN（オンライン時に取得し、以降キャッシュ）
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];

// インストール：必須リソースをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // コアリソースは必須
      try {
        await cache.addAll(CORE_ASSETS);
      } catch (e) {
        console.error('[SW] Core asset cache failed:', e);
      }
      // CDNはオプショナル（取得失敗してもインストールは続行）
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('[SW] CDN cache skipped:', url, e);
        }
      }
    })
  );
  self.skipWaiting();
});

// アクティベート：古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// フェッチ：Cache First戦略
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET以外はパススルー
  if (req.method !== 'GET') return;

  // chrome-extension等は無視
  if (!req.url.startsWith('http')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // 成功した200レスポンスのみキャッシュ
          if (!res || res.status !== 200 || res.type === 'error') {
            return res;
          }
          // basic（同一オリジン）と cors（CDN）をキャッシュ
          if (res.type === 'basic' || res.type === 'cors') {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, resClone).catch((e) =>
                console.warn('[SW] Cache put failed:', e)
              );
            });
          }
          return res;
        })
        .catch((e) => {
          console.warn('[SW] Fetch failed:', req.url, e);
          // オフラインで HTML 要求 → トップへ
          if (req.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
    })
  );
});

// 更新通知用メッセージ受信
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
