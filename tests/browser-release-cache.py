"""A normal reload receives new published bytes despite long hosting cache headers."""
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
version=1
requests={}

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
    def do_GET(self):
        name=self.path.split('?',1)[0]
        if name=='/html-games/cache-fixture.html':
            body=b'<!doctype html><link rel="stylesheet" href="cache-fixture.css"><script src="cache-fixture.js"></script><div id="marker"></div>'
            kind='text/html';cache='no-cache';tag=None
        elif name in ['/html-games/cache-fixture.js','/html-games/cache-fixture.css','/html-games/cache-fixture.json']:
            requests[name]=requests.get(name,0)+1;tag='"version-'+str(version)+'"';cache='public, max-age=31536000'
            if self.headers.get('If-None-Match')==tag:
                self.send_response(304);self.send_header('ETag',tag);self.end_headers();return
            if name.endswith('.js'):
                body=f'window.releaseVersion={version};fetch("cache-fixture.json").then(r=>r.json()).then(d=>window.dataVersion=d.version);'.encode();kind='application/javascript'
            elif name.endswith('.css'):
                body=f'#marker{{width:{version*10}px}}'.encode();kind='text/css'
            else:body=json.dumps({'version':version}).encode();kind='application/json'
        else:return super().do_GET()
        self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control',cache)
        if tag:self.send_header('ETag',tag)
        self.end_headers();self.wfile.write(body)

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/cache-fixture.html')
        page.wait_for_function('()=>window.releaseVersion===1&&window.dataVersion===1')
        version=2
        # A same-origin fetch really is stale under the hosting policy before
        # control is installed; this guards the integration fixture itself.
        assert 'releaseVersion=1' in page.evaluate('async()=>await (await fetch("cache-fixture.js")).text()')
        page.evaluate('async()=>{await navigator.serviceWorker.register("/html-games/release-cache-worker.js",{scope:"/html-games/",updateViaCache:"none"});await navigator.serviceWorker.ready;}')
        page.wait_for_function('()=>!!navigator.serviceWorker.controller')
        for expected in [2,3]:
            version=expected;page.reload()
            try:page.wait_for_function('(v)=>window.releaseVersion===v&&window.dataVersion===v',arg=expected)
            except Exception:
                print(json.dumps({'expected':expected,'browser':page.evaluate('()=>({script:window.releaseVersion,data:window.dataVersion,controller:navigator.serviceWorker.controller?.scriptURL})'),'requests':requests,'errors':errors}),flush=True)
                raise
            assert page.locator('#marker').evaluate('e=>e.getBoundingClientRect().width')==expected*10
        assert not errors,errors
        print(json.dumps({'passed':True,'ordinaryReloads':[2,3],'longCacheWasStale':True,'javascriptCssAndJsonUpdated':True,'errors':errors}))
        browser.close()
finally:server.shutdown();server.server_close()
