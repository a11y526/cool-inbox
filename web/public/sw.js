// 휴대폰 웹앱: 인터넷이 없어도 열리게 화면 파일을 저장해 둔다. (쪽지는 IndexedDB에 따로 저장됨)
// 중계 서버(/r/)는 절대 저장하지 않는다.
const CACHE = 'cool-inbox-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/r/')) return;
  // 화면 파일: 먼저 인터넷에서 새로 받고, 안 되면 저장해 둔 것
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});
