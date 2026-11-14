"""Real Saber/Runabout new games own a Photon Torpedo in Inventory and Continue."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/starter-torpedoes'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'passed':False,'starters':[],'errors':[]}
snapshot='''()=>{const s=__starterState,eq=nativeShipEquipment.ensure(s);return {type:s.shipType,captain:s.captain,models:eq.slots.weapon.map(id=>eq.instances[id]?.modelId??null),torpedo:eq.slots.weapon[1],owned:Object.keys(eq.instances).sort(),crews:s.civilianTraffic.ships.length};}'''
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        for faction,ship_type,name in [(2,6,'Saber'),(1,7,'Runabout')]:
            page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
            page.on('pageerror',lambda error:report['errors'].append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            # Observe the ordinary equipment owner; the Dev inspector deliberately
            # exposes no state in a normal new game or normal Continue.
            observe='''()=>{const api=nativeShipEquipment,ensure=api.ensure;window.nativeShipEquipment={...api,ensure(s,h=s,d){if(s?.captain&&h===s)window.__starterState=s;return ensure(s,h,d);}};}'''
            page.evaluate(observe)
            page.locator('[data-menu="new"]').click()
            page.locator(f'#setup-ui [data-faction="{faction}"]').click()
            page.locator('#setup-ui .setup-primary').click()
            page.locator('#setup-ui input[name="captain"]').fill('Starter Test '+name)
            page.locator('#setup-ui input[name="ship"]').fill('ISS '+name)
            page.locator('#setup-ui input[name="government"]').fill('Starter Test')
            page.locator('#setup-ui .setup-primary').click()
            assert not page.evaluate('nativeOpeningCinematic.active')
            page.wait_for_function('type=>window.__starterState?.shipType===type&&!nativeOpeningCinematic.active',arg=ship_type,timeout=120000)
            initial=page.evaluate(snapshot)
            assert initial['models']==[1,15,None] and initial['crews']==1200,initial
            page.locator('#inventoryBtn').click()
            page.wait_for_selector('#ship-inventory canvas.ready',timeout=60000)
            page.locator('#ship-inventory [data-equipment-kind="weapon"][data-equipment-place="slot"][data-equipment-index="1"]').click()
            assert page.locator('.inventory-detail-heading strong').inner_text()=='Photon Torpedo'
            page.screenshot(path=str(OUT/(name.lower()+'-inventory.png')))
            page.locator('.inventory-close').click()
            page.locator('#pauseBtn').click()
            page.locator('#pause-menu [data-save]').click()
            assert page.locator('#pause-menu [data-pause-title]').inner_text()=='Game saved'
            saved=page.evaluate('''()=>{const s=nativeSaveStorage.read('normal'),eq=s.shipEquipment;return {type:s.shipType,torpedo:eq.slots.weapon[1],model:eq.instances[eq.slots.weapon[1]].modelId};}''')
            assert saved=={'type':ship_type,'torpedo':initial['torpedo'],'model':15},saved
            page.reload()
            page.wait_for_function('()=>document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate(observe)
            page.locator('[data-menu="continue"]').click()
            page.wait_for_function('type=>window.__starterState?.shipType===type',arg=ship_type,timeout=120000)
            restored=page.evaluate(snapshot)
            assert restored==initial,{'initial':initial,'restored':restored}
            report['starters'].append({'name':name,'type':ship_type,'models':restored['models'],'inventoryVerified':True,'savedIdentityRetained':True})
            page.close()
        assert not report['errors'],report['errors']
        report['passed']=True
        browser.close()
        print(json.dumps(report),flush=True)
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    server.shutdown();server.server_close()
