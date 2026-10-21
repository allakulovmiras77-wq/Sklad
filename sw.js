self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
e.respondWith(fetch(e.request).then(r=>{if(new URL(e.request.url).origin===location.origin){const c=r.clone();caches.open('v1').then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)))});
