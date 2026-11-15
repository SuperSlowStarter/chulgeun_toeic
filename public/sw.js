/* 오프라인 캐시. VERSION 은 tools/build_data.py 가 파일 내용으로 바꿔 넣는다. */
const VERSION = "shell-c6f6822da1";
const FONTS = "mock-fonts-v1";
const AUDIO = "mock-audio-v1"; // app.js 가 직접 관리 (LC 음성 저장 버튼)
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "data/t1.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![VERSION, FONTS, AUDIO].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res;
    }).catch(() => Response.error()));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/audio/")) return; // 음성은 앱이 Cache Storage 에서 직접 꺼내 쓴다
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const key = req.mode === "navigate" ? "index.html" : req;
    const hit = await c.match(key, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    try { return await fetch(req); } catch (err) { return (await c.match("index.html")) || Response.error(); }
  })());
});
