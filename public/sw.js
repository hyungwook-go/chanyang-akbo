// 앱 화면 파일을 기기에 보관해 인터넷이 없어도 열리게 합니다. (서버 데이터는 없고, 화면 파일만 있습니다)
// 인터넷이 되면 항상 최신 파일을 먼저 쓰므로, 앱을 한 번만 다시 열면 새 버전이 보입니다.
// 인터넷이 없거나 응답이 늦으면(3초) 보관해 둔 파일로 엽니다.
const PREFIX = 'chanyang-akbo-';   // GitHub Pages는 같은 계정의 다른 사이트와 보관함을 함께 쓰므로, 이 앱 것만 다룹니다
const VERSION = PREFIX + 'v1.0.2';
const WAIT = 3000;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.mjs', 'js/store.mjs', 'js/db.mjs', 'js/back.mjs', 'js/gate.mjs', 'js/pass.mjs', 'js/search.mjs',
  'js/image.mjs', 'js/trim.mjs', 'js/ink.mjs', 'js/viewer.mjs', 'js/weekly.mjs', 'js/ocr.mjs',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(networkFirst(e));
});

async function networkFirst(e) {
  const req = e.request;
  const cache = await caches.open(VERSION);
  // 받으면 보관본도 새로 바꿔 둠 (늦게 와도 다음을 위해 저장)
  const net = fetch(req).then((res) => {
    if (res.ok) e.waitUntil(cache.put(req, res.clone()));
    return res;
  });
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), WAIT))]);
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    return net;   // 보관본도 없으면 끝까지 기다림
  }
}
