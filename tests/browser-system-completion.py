"""Illustrated roster, actual local map/cruise and save/reload in released systems."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/system-completion'
OUT.mkdir(parents=True,exist_ok=True)
plan=json.loads((ROOT/'tools/system-completion.json').read_text(encoding='utf-8'))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':960},reduced_motion='reduce')
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:errors.append(f'{response.status} {response.url}') if response.status>=400 else None)
        base=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/'
        page.goto(base+'system-completion-preview.html')
        page.locator('#system').select_option(str(plan['releasedSystems'][0]))
        page.evaluate('()=>{for(const image of document.images)image.loading="eager";}')
        page.wait_for_function('()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)')
        expected=sum(len(s['planets']) for s in plan['systems'] if s['id'] in plan['releasedSystems'])
        first=next(s for s in plan['systems'] if s['id']==plan['releasedSystems'][0])
        assert page.locator('.worlds article').count()==len(first['planets'])
        page.screenshot(path=str(OUT/'illustrated-roster.png'),full_page=True)
        for system in plan['releasedSystems']:
            page.goto(base+f'system-atlas.html?system={system}')
            page.wait_for_function('()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)')
            page.screenshot(path=str(OUT/f'atlas-{system}.png'))
        def boot(resume=False):
            page.goto(base+'index.html')
            page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('''resume=>{
              const ensure=nativeShipEquipment.ensure;
              window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__completionState=s;return ensure(s,h,d);}};
              if(resume)resumeNativeGame('normal');else startNativeDevGame();
            }''',resume)
            page.wait_for_function('()=>window.__completionState',timeout=120000)
        boot()
        tested=[]
        for system in plan['releasedSystems']:
            spec=next(s for s in plan['systems'] if s['id']==system)
            body=next(p['id'] for p in spec['planets'] if 'existingBodyId' not in p)
            # Put a normal saved ship near the new destination, then use the
            # actual map and cruise owner for the final physical approach.
            page.evaluate('''({system,body})=>{
              const s=__completionState,b=nativeSystemCatalog.bodies(system).find(b=>b.id===body),target=vexedSolFlight.bodyPosition(b);
              Object.assign(s,{system,devMode:false,phase:'flight',captain:'Planet Test',localBodySystem:system,localSystemVersion:2,localBody:nativeSystemCatalog.homeId(system),localNavTarget:body,x:target.x-700,y:target.y,speed:0,vx:0,vy:0,localCruise:null,arrivalApproach:null,pendingTransit:null,landed:false,latinum:2222});
              s.civilianTraffic.ships=[];s.solEconomy.freighters=[];
              if(!nativeSaveStorage.write(s).ok)throw Error('Normal fixture save failed');resumeNativeGame('normal');
            }''',dict(system=system,body=body))
            page.locator('#mapBtn').click()
            for planet in spec['planets']:
                ident=planet.get('existingBodyId',planet.get('id'))
                node=page.locator(f'#galaxy-map [data-system="{system}"][data-body="{ident}"]')
                assert node.count()==1,planet
            target=page.locator(f'#galaxy-map [data-system="{system}"][data-body="{body}"]')
            target.focus();target.press('Enter')
            page.screenshot(path=str(OUT/f'map-{system}.png'))
            page.locator('#galaxy-map [data-action="cruise"]').click()
            page.wait_for_function('(body)=>__completionState.localBody===body&&!__completionState.localCruise',arg=body,timeout=120000)
            page.wait_for_function('(body)=>!!vexedSolFlight.art(body,__completionState.system)',arg=body,timeout=30000)
            page.screenshot(path=str(OUT/f'flight-{system}.png'))
            assert page.evaluate('__completionState.latinum')==2222
            before=page.evaluate('''()=>{document.querySelector('#save').click();return {system:__completionState.system,body:__completionState.localBody,x:__completionState.x,y:__completionState.y};}''')
            boot(resume=True)
            after=page.evaluate('''()=>({system:__completionState.system,body:__completionState.localBody,x:__completionState.x,y:__completionState.y})''')
            assert before==after,(before,after)
            tested.append(dict(system=system,planetCount=len(spec['planets']),cruisedBody=body,saveReload=True))
        assert not errors,errors
        report=dict(tested=tested,errors=errors)
        (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
