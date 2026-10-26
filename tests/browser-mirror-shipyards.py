"""Real Dev access and regional yard clicks, physical docking, refits and reload."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/mirror-expansion'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
        url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
        def boot():
            page.goto(url)
            page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('''()=>{const ensure=nativeShipEquipment.ensure;window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__yardState=s;return ensure(s,h,d);}};}''')
        boot()
        assert page.locator('[data-menu="dev"]').is_visible()
        assert page.locator('[data-menu="continue-dev"]').is_visible()
        page.locator('[data-menu="dev"]').click()
        page.wait_for_function('()=>window.__yardState',timeout=120000)
        assert page.evaluate('__yardState.devMode')
        page.evaluate('nativeSaveStorage.write(__yardState)')
        boot()
        page.locator('[data-menu="continue-dev"]').click()
        page.wait_for_function('()=>window.__yardState?.devMode',timeout=120000)
        systems=[14,43,54,55]
        results=[]
        for system in systems:
            page.evaluate('''system=>{
              nativeShipyardServices.close();
              const s=JSON.parse(JSON.stringify(__yardState));
              Object.assign(s,{devMode:false,captain:'Regional Yard Test',shipName:'USS Survey',shipType:7,system,localBody:nativeSystemCatalog.homeId(system),x:0,y:0,angle:0,speed:0,vx:0,vy:0,latinum:100000,dilithium:200,phase:'flight',landed:false,localCruise:null,arrivalApproach:null,pendingTransit:null,minerals:{tritanium:100,trellium:100,deuranium:100,gallicite:100,benamite:20}});
              for(const k of ['shipyardDock','localBodySystem','shipEquipment','shipRefit','weaponLoadout','repairBay'])delete s[k];
              nativeSystemCatalog.initialize(s);nativeShipEquipment.ensure(s);
              const def=nativeShipDefinitions.forEntity(s);s.hull=def.hull;s.shields=def.shields;
              const center=nativeMarsShipyard.position(s);s.x=center.x-240;s.y=center.y;
              if(!nativeSaveStorage.write(s).ok)throw Error('Regional fixture write failed');resumeNativeGame('normal');
            }''',system)
            page.wait_for_function('(id)=>window.__yardState?.system===id',arg=system)
            page.wait_for_timeout(150)
            point=page.evaluate('''()=>{const s=__yardState,ship=vexedSolFlight.shipPosition(s),canvas=document.querySelector('#space'),rect=canvas.getBoundingClientRect(),v=nativeView.measure(canvas),p=nativeMarsShipyard.visible({state:s,ship,cx:v.w/2,cy:v.h/2,zoom:1,w:v.w,h:v.h});return {x:rect.x+p.x*rect.width/v.w,y:rect.y+p.y*rect.height/v.h};}''')
            page.mouse.click(point['x'],point['y'])
            page.locator('[data-yard-action="dock"]').wait_for()
            name=page.evaluate('nativeMarsShipyard.definitionFor(__yardState).name')
            assert page.locator('#shipyard-services h1').inner_text()==name
            page.locator('[data-yard-action="dock"]').click()
            page.wait_for_function('()=>__yardState.shipyardDock?.phase==="approach"')
            page.wait_for_timeout(250)
            page.evaluate('''()=>{if(!nativeSaveStorage.write(__yardState).ok)throw Error('Approach save failed');resumeNativeGame('normal');}''')
            page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active',timeout=90000)
            before=page.evaluate('__yardState.latinum')
            page.locator('[data-yard-action="upgrade"][data-kind="hull"]').click()
            assert page.evaluate('__yardState.latinum')==before
            page.locator('[data-yard-action="confirm-upgrade"]').click()
            assert page.evaluate('__yardState.latinum')==before-2400
            assert page.evaluate('nativeShipyardRefits.level(__yardState,"hull")')==1
            page.evaluate('resumeNativeGame("normal")')
            page.wait_for_function('()=>nativeShipyardServices.docked&&nativeShipyardServices.active')
            assert page.locator('#shipyard-services h1').inner_text()==name
            assert page.evaluate('nativeShipyardRefits.level(__yardState,"hull")')==1
            page.screenshot(path=str(OUT/f'yard-{system}.png'))
            page.locator('[data-yard-action="undock"]').click()
            page.wait_for_function('()=>!__yardState.shipyardDock',timeout=60000)
            results.append({'system':system,'name':name,'physicalDocking':True,'refitChargedOnce':True,'approachAndDockReload':True,'undocking':True})
        assert not errors,errors
        report={'passed':True,'devAndContinueDevButtons':True,'yards':results,'errors':errors}
        (OUT/'regional-shipyards.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
