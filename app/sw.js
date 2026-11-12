const CACHE="galaxy-v2-9c08d8d7b081";
const FILES=["./","./VOICE-LICENSES.md","./capacitor-runtime.js","./content.js","./enhancements.css","./index.html","./main.js","./mobile.js","./narrator.js","./orbit.js","./runner-lines.js","./runner.js","./styles.css","./voice-library.js","./voice-pack.js","./licenses/Arabic-CC-BY-NC-SA-4.0.txt","./licenses/Capacitor-MIT.txt","./licenses/Kokoro-Apache-2.0.txt"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('galaxy-v2-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});
