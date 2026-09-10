// Versioned public assets only. Auth/API responses and user snapshots are never cached here.
const CACHE="sledovatko-shell-32a724f2fa9b";
const ASSETS=["./index.html","./manifest.webmanifest","./js/account-ui.js","./js/account.js","./js/api.js","./js/app.js","./js/auth-config.js","./js/bored.js","./js/config.js","./js/discovery.js","./js/effects.js","./js/image-selection.js","./js/library.js","./js/navigation.js","./js/platform.js","./js/runtime.js","./js/search.js","./js/storage-upgrade.js","./js/storage.js","./js/transfer.js","./js/ui.js","./js/vendor/qrcode.js","./js/vendor/supabase.js","./css/account.css","./css/base.css","./css/concept.css","./css/effects.css","./css/liquid.css","./icons/icon-192.png","./icons/icon-512.png","./icons/icon.svg"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('sledovatko-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const base=new URL('./',self.location.href);
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>await caches.match(new URL('index.html',base).href)||Response.error()));
    return;
  }
  if(!ASSETS.some(asset=>new URL(asset,base).href===url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(request)||fetch(request)));
});
