/* Revalidate the exact published files instead of retaining a previous release. */
'use strict';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/html-games/'))return;
  event.respondWith(fetch(request,{cache:'no-cache'}).catch(()=>fetch(request,{cache:'force-cache'})).then(response=>{
    // The browser's in-memory script/style cache also observes this response.
    // Keep its next reload from bypassing the worker under a long host max-age.
    const headers=new Headers(response.headers);headers.set('Cache-Control','no-cache');headers.delete('Expires');headers.delete('Content-Encoding');headers.delete('Content-Length');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }));
});
