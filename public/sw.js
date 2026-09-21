self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// No financial data or authenticated responses are cached.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<html lang="ru"><meta name="viewport" content="width=device-width"><body style="background:#f7f5f0;font:20px system-ui;padding:40px"><h1>Долги</h1><p>Нет соединения. Подключитесь к интернету, чтобы открыть ваш учет.</p><button onclick="location.reload()">Повторить</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}))));});
