// 서비스 워커 — 네트워크 우선, 실패하면 캐시 (오프라인에서도 앱이 열리게). 외부 API 는 건드리지 않는다.
const CACHE = 'gyeongjosa-1794566217';   // scripts/bump_version.py 가 숫자를 바꾼다
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192-v1.png', 'icon-180-v1.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 같은 주소의 GET 만 다룬다. version.txt 는 항상 새로 받는다.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('version.txt')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
