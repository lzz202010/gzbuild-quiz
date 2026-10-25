'use strict';
/* PWA 离线缓存(仅 HTTPS/localhost 下生效,iOS 主屏 App 需发布到静态托管后才有离线能力)
   策略:页面导航与 data.js 网络优先(题库更新即时可见,断网回落缓存);
   其余静态资源缓存优先。build_site.py 每次构建会更新 ?v= 版本号,天然击穿缓存。 */
const CACHE = 'gzbuild-quiz-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求与 data.js:网络优先,离线时回落缓存
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/data.js')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 其余资源:缓存优先
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
