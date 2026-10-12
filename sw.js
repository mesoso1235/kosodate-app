// Service Worker。アプリの枠はキャッシュ優先、data/*.json は通信優先（オフライン時は前回の内容）。
// アプリを更新したら VERSION を上げてください（古いキャッシュが入れ替わります）。
const VERSION = "v3";
const SHELL_CACHE = `kosodate-shell-${VERSION}`;
const DATA_CACHE = `kosodate-data-${VERSION}`;
const LIB_CACHE = `kosodate-lib-${VERSION}`;
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "assets/style.css", "assets/app.js", "assets/config.js", "assets/links.js", "assets/dates.js",
  "assets/util.js", "assets/procedures.js", "assets/store.js", "assets/data.js", "assets/ui.js",
  "assets/views/home.js", "assets/views/todo.js", "assets/views/news.js", "assets/views/search.js",
  "assets/views/map.js", "assets/views/settings.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const LIB_HOSTS = [
  { host: "unpkg.com", prefix: "/leaflet@1.9.4/" },
  { host: "cdn.jsdelivr.net", prefix: "/npm/@supabase/supabase-js@" },
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kosodate-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw new Error("offline");
  }
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
      e.respondWith(networkFirst(req, DATA_CACHE));
    } else {
      e.respondWith(cacheFirst(req, SHELL_CACHE).catch(() => caches.match("index.html")));
    }
    return;
  }
  // 外部: Leaflet と Supabase のライブラリだけ（APIや地図タイルは触らない）
  if (LIB_HOSTS.some((l) => url.hostname === l.host && url.pathname.startsWith(l.prefix))) {
    e.respondWith(cacheFirst(req, LIB_CACHE));
  }
});
