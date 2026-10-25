/* Service Worker:App Shell 缓存,首开后秒开/离线可用;?v= 变化自动拉新 */
const CACHE = 'gzm-v1';
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest',
               'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('wrongbook-pdf')) return;   // 导出走网络
  // 缓存优先,后台不更新(?v= 变了就是新 URL,自然拉新;旧缓存由 activate 清)
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
                       url.pathname.endsWith('.png') || url.pathname.endsWith('.html') ||
                       url.pathname === location.pathname)) {
          const clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      });
    }).catch(function () { return caches.match('./'); })
  );
});
