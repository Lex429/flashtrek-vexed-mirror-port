"""Cold default CThia startup must not wait on optional generic debris material."""
import functools
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from local_site import Handler
OUTPUT=ROOT/'test-results/showcase-startup';OUTPUT.mkdir(parents=True,exist_ok=True)


class Quiet(Handler):
    def log_message(self,*args):pass


server=None;storage=tempfile.TemporaryDirectory(prefix='vexed-startup-test-')
if len(sys.argv)>1:
    base=sys.argv[1].rstrip('/')
else:
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    server.state=Path(storage.name)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'

try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':720});errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        # A permanently unfinished optional debris material must not trap the
        # page behind Loading. Worker preparation uses its own unmodified owner.
        page.add_init_script('''(()=>{
          let api;Object.defineProperty(window,'wreckageEffects',{configurable:true,get:()=>api,set:value=>{
            api={...value,prime:()=>new Promise(()=>{})};
          }});
          let drones;Object.defineProperty(window,'dotSprites',{configurable:true,get:()=>drones,set:value=>{
            drones={...value,ready:new Promise(()=>{})};
          }});
        })();''')
        started=time.monotonic()
        page.goto(base+'/html-games/flashtrek-broken-mirror/damage-showcase.html')
        page.wait_for_function('window.showcaseState?.().ready',timeout=10000)
        seconds=time.monotonic()-started
        state=page.evaluate('showcaseState()');queue=page.evaluate('nativeDamageArtPreparation.snapshot()')
        assert page.locator('#ship-name').inner_text()=="Vulcan C'Thia"
        assert page.locator('#loading').is_hidden()
        assert queue['workerJobs']==2,queue
        assert len(state['cthiaCutAudit'])==4
        for stage in state['cthiaCutAudit']:
            assert stage['sourcePixels']==stage['cutPixels'] and stage['pieces']>0
        page.locator('[data-workspace-tab=damage]').click()
        page.locator('[data-workspace-page=hull]:visible').click()
        page.locator('#destroy').click()
        assert page.evaluate('showcaseState().destroyed && showcaseState().cthiaWreck.length>0')
        page.locator('#reset').click()
        page.locator('#ship-select').select_option('1')
        page.wait_for_function('showcaseState().ready&&showcaseState().ship===1',timeout=8000)
        page.locator('[data-workspace-tab=repair]').click()
        assert page.locator('.drone-workshop-launch').is_disabled()
        assert 'Preparing repair drone artwork' in page.locator('.drone-flight-note').inner_text()
        page.locator('[data-workspace-tab=lab]').click()
        assert page.evaluate('nativeDamageArtPreparation.snapshot().suspended')
        page.wait_for_function('document.querySelector(".lab-notice").textContent.includes("Choose a scene")',timeout=30000)
        page.locator('[data-workspace-tab=weapons]').click()
        assert not page.evaluate('nativeDamageArtPreparation.snapshot().suspended')
        page.screenshot(path=str(OUTPUT/'cthia-ready.png'))
        browser.close()
        assert not errors,errors
        print(json.dumps({'readySeconds':round(seconds,3),'optionalDebrisBlocked':True,'workerJobs':queue['workerJobs'],'fourStagesPreserved':True,'destructionWorks':True,'shipVisibleDuringDroneWarmup':True,'stressSuspendsPreparation':True,'errors':errors}),flush=True)
finally:
    if server:server.shutdown();server.server_close()
    storage.cleanup()
