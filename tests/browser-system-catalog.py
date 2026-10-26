"""Real map selection, regional flight, Remus services and saved local destinations."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/system-expansion'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
failed=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1440,'height':960})
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:failed.append(response.url) if response.status>=400 else None)
        requested=[]
        page.on('request',lambda request:requested.append(request.url))
        url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
        def start(resume=False):
            page.goto(url)
            page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=90000)
            page.evaluate('''resume=>{
              const advance=nativeCivilianTraffic.advance;
              nativeCivilianTraffic.advance=(s,dt)=>{window.__systemState=s;return advance(s,dt);};
              if(resume)resumeNativeGame('normal');else startNativeDevGame();
            }''',resume)
            page.wait_for_function('()=>window.__systemState',timeout=90000)
        def place(system):
            page.evaluate('''system=>{
              const s=__systemState;
              Object.assign(s,{system,x:0,y:0,speed:0,vx:0,vy:0,localCruise:null,arrivalApproach:null,landed:false,manualTargetSystem:0,localNavTarget:0});
              delete s.localBodySystem;nativeSystemCatalog.initialize(s);
              s.civilianTraffic.ships=[];s.solEconomy.freighters=[];
              vexedSolFlight.setTarget(s.localBody,system);
            }''',system)
        def cruise(system,body,evidence=None):
            page.locator('#mapBtn').click()
            target=page.locator(f'#galaxy-map [data-system="{system}"][data-body="{body}"]')
            target.wait_for(timeout=10000)
            # Fit the local area if a destination is just outside the initial view.
            for _ in range(3):
                box=target.bounding_box()
                bounds=page.locator('.map-viewport').bounding_box()
                if box and bounds and bounds['x']<box['x']<bounds['x']+bounds['width'] and bounds['y']<box['y']<bounds['y']+bounds['height']:break
                page.locator('#galaxy-map [data-action="out"]').click()
                page.wait_for_timeout(300)
            target.click(force=True)
            assert 'Broken Mirror lore' not in page.locator('.map-destination-meta').inner_text()
            page.locator('#galaxy-map [data-action="cruise"]').click()
            page.wait_for_function('()=>!!__systemState.localCruise',timeout=10000)
            page.wait_for_function('(id)=>!__systemState.localCruise&&__systemState.localBody===id',arg=body,timeout=120000)
        start()
        assert page.evaluate('nativeSystemCatalog.records.length')==90
        assert page.locator('#dev-galaxy-controls [data-system] option').count()==91
        assert page.locator('#dev-galaxy-controls [data-system] option[value="30"]').count()==0
        assert page.evaluate('nativeNavigation.call("state").nodes.some(n=>n.id===30)') is False
        place(12)
        page.locator('#mapBtn').click()
        assert '40 Eridani' in page.locator('.map-location').inner_text()
        assert page.locator('#galaxy-map [data-system="12"][data-body]').count()>=7
        page.screenshot(path=str(OUT/'vulcan-map.png'))
        page.locator('#galaxy-map [data-action="close"]').click()
        cruise(12,1,'Reported screen graphic')
        page.wait_for_function('()=>!!vexedSolFlight.art(1,12)',timeout=30000)
        assert page.evaluate('nativeSystemCatalog.current(__systemState).name')=="T'Khut"
        assert page.evaluate('nativeSystemCatalog.current(__systemState).port') is False
        page.screenshot(path=str(OUT/'t-khut-flight.png'))
        # The same real movement owner operates between the two historical worlds.
        place(31)
        page.evaluate('Object.assign(__systemState,{devMode:false,latinum:2500})')
        wallet=page.evaluate('__systemState.latinum')
        populations=page.evaluate('({...__systemState.planetPopulationCounts})')
        cruise(31,1)
        assert page.evaluate('__systemState.system')==30
        assert page.evaluate('nativeSystemCatalog.current(__systemState).name')=='Remus'
        assert page.evaluate('nativeSystemCatalog.current(__systemState).port') is True
        assert page.evaluate('__systemState.latinum')==wallet
        after_population=page.evaluate('({...__systemState.planetPopulationCounts})')
        assert populations.keys()==after_population.keys()
        # Natural population growth continues during the real-time journey.
        assert all(abs(after_population[k]-v)<max(10,v*.001) for k,v in populations.items())
        page.locator('#tradeBtn').click()
        assert 'Remus' in page.locator('#system-hub').inner_text()
        page.screenshot(path=str(OUT/'remus-services.png'))
        page.locator('#system-hub .hub-close').click()
        # The real cruise completion already writes through the verified save owner.
        assert page.evaluate('nativeSaveStorage.read("normal").system')==30
        assert page.evaluate('nativeSaveStorage.read("normal").localBody')==1
        start(resume=True)
        assert page.evaluate('__systemState.system')==30
        assert page.evaluate('nativeSystemCatalog.current(__systemState).name')=='Remus'
        assert page.evaluate('__systemState.latinum')==wallet
        page.locator('#mapBtn').click()
        assert 'Romulus' in page.locator('.map-location').inner_text()
        page.screenshot(path=str(OUT/'romulus-remus-map.png'))
        page.locator('#galaxy-map [data-action="close"]').click()
        cruise(31,0)
        assert page.evaluate('__systemState.system')==31
        assert page.evaluate('nativeSystemCatalog.current(__systemState).name')=='Romulus'
        # Opening a very wide overview must not request every planet's artwork.
        requested.clear()
        page.locator('#mapBtn').click()
        for _ in range(14):page.locator('#galaxy-map [data-action="out"]').click()
        page.wait_for_timeout(1000)
        distant={u for u in requested if '/assets/system-planets/' in u}
        assert len(distant)<20,len(distant)
        page.locator('#galaxy-map [data-action="close"]').click()
        place(25)
        page.wait_for_function('()=>!!vexedSolFlight.art(0,25)',timeout=30000)
        page.screenshot(path=str(OUT/'andoria-flight.png'))
        assert page.evaluate('nativeSystemCatalog.current(__systemState).kind')=='moon'
        assert page.evaluate('vexedSolFlight.artCacheSize')<=8
        assert page.evaluate('nativeSystemCatalog.records.flatMap(r=>r.bodies).filter(b=>b.evidence==="authored").length')>=24
        assert page.evaluate('nativeSystemCatalog.bodies(14).length')==7
        place(6)
        cruise(6,100,'Original game addition')
        page.wait_for_function('()=>!!vexedSolFlight.art(100,6)',timeout=30000)
        point=page.evaluate('''()=>{
          const s=__systemState,c=document.querySelector('#space'),rect=c.getBoundingClientRect(),view=nativeView.measure(c),body=nativeSystemCatalog.current(s),p=vexedSolFlight.bodyPosition(body);
          return {x:rect.left+(view.w/2+p.x-s.x)*rect.width/view.w,y:rect.top+(view.h/2+p.y-s.y)*rect.height/view.h};
        }''')
        page.mouse.click(point['x'],point['y'])
        page.locator('#planet-encounter').wait_for(state='visible')
        assert page.locator('.encounter-evidence').count()==0
        assert 'Broken Mirror lore' not in page.locator('#planet-encounter').inner_text()
        page.screenshot(path=str(OUT/'original-neighbor-label.png'))
        page.locator('.encounter-close').click()
        # Halka is a real chart destination with a populated home and finite
        # mining fields; the new local moon also survives the actual save owner.
        assert page.evaluate('nativeNavigation.call("state").nodes.some(n=>n.id===53)')
        assert page.evaluate('nativeSystemCatalog.bodies(25).find(b=>b.kind==="gas_giant").name')=='Andor'
        place(53)
        field=page.evaluate('''()=>{
          const rocks=nativeSolAsteroids.forSystem(53);return {rocks:rocks.length,dilithium:rocks.filter(r=>r.oreType==='dilithium').length};
        }''')
        assert field['rocks']==396 and field['dilithium']>=288
        cruise(53,101,'Original game addition')
        assert page.evaluate('nativeSystemCatalog.current(__systemState).name')=='Tharn'
        assert page.evaluate('nativeSaveStorage.read("normal").system')==53
        start(resume=True)
        assert page.evaluate('__systemState.system')==53
        assert page.evaluate('nativeSystemCatalog.current(__systemState).name')=='Tharn'
        cruise(53,0,'Screen-sourced')
        assert page.evaluate('nativeSystemCatalog.current(__systemState).port')
        page.locator('#tradeBtn').click()
        assert 'Halkan' in page.locator('#system-hub').inner_text()
        page.screenshot(path=str(OUT/'halkan-homeworld-services.png'))
        page.locator('#system-hub .hub-close').click()
        # Read an actual version-1 save with a removed filler target through the
        # normal save owner and the ordinary activation/migration path.
        place(14)
        retired=page.evaluate('''()=>{
          const s=__systemState;Object.assign(s,{localSystemVersion:1,localBodySystem:14,localBody:3,localNavTarget:2,x:5500,y:3200,landed:true,localCruise:{from:3,to:2,stopX:4600,stopY:2300}});
          for(const key of ['planetPopulations','planetPopulationCounts','planetGovts','planetStrengths','localPrestige'])delete s[key][53];
          const out={x:s.x,y:s.y,latinum:s.latinum,shipType:s.shipType,contracts:JSON.stringify(s.localContracts),minerals:JSON.stringify(s.minerals)};
          const saved=nativeSaveStorage.write(s);if(!saved.ok)throw Error(saved.error);return out;
        }''')
        start(resume=True)
        migrated=page.evaluate('''()=>{const s=__systemState;return {x:s.x,y:s.y,latinum:s.latinum,shipType:s.shipType,contracts:JSON.stringify(s.localContracts),minerals:JSON.stringify(s.minerals),version:s.localSystemVersion,body:s.localBody,target:s.localNavTarget,cruise:s.localCruise,landed:s.landed};}''')
        assert migrated['version']==2 and migrated['body']==0 and migrated['target']==0
        assert migrated['cruise'] is None and not migrated['landed']
        assert page.evaluate('__systemState.planetPopulationCounts[53]>0&&__systemState.planetGovts[53]===12')
        for key,value in retired.items():assert migrated[key]==value,(key,migrated,retired)
        # Review every atlas page using the actual image assets and DOM controls.
        page.goto(url.replace('index.html','system-atlas.html'))
        atlas_ids=page.evaluate('nativeSystemCatalog.records.map(r=>String(r.id))')
        assert len(atlas_ids)==90
        atlas_bodies=0
        for system_id in atlas_ids:
            page.locator('#system').select_option(system_id)
            while True:
                page.wait_for_function('()=>Array.from(document.querySelectorAll(".art img")).every(i=>i.complete&&i.naturalWidth>0)',timeout=30000)
                atlas_bodies+=page.locator('.world').count()
                if page.locator('#next').is_disabled():break
                page.locator('#next').click()
        page.locator('#system').select_option('31')
        page.wait_for_function('()=>Array.from(document.querySelectorAll(".art img")).every(i=>i.complete&&i.naturalWidth>0)')
        assert 'Remus' in page.locator('#worlds').inner_text()
        assert 'Romulus' in page.locator('#worlds').inner_text()
        page.screenshot(path=str(OUT/'romulus-atlas.png'))
        page.locator('#system').select_option('25')
        page.wait_for_function('()=>Array.from(document.querySelectorAll(".art img")).every(i=>i.complete&&i.naturalWidth>0)')
        assert 'Orbits Andor' in page.locator('#worlds').inner_text()
        page.screenshot(path=str(OUT/'andorian-atlas.png'))
        page.locator('#system').select_option('6')
        page.wait_for_function('()=>Array.from(document.querySelectorAll(".art img")).every(i=>i.complete&&i.naturalWidth>0)')
        assert 'Original game addition' in page.locator('#worlds').inner_text()
        page.screenshot(path=str(OUT/'original-neighbor-atlas.png'))
        page.locator('#system').select_option('53')
        page.wait_for_function('()=>Array.from(document.querySelectorAll(".art img")).every(i=>i.complete&&i.naturalWidth>0)')
        assert 'Tharn' in page.locator('#worlds').inner_text()
        assert 'Original game addition' in page.locator('#worlds').inner_text()
        page.screenshot(path=str(OUT/'halka-atlas.png'))
        page.locator('#system').select_option('1')
        for _ in range(3):page.locator('#next').click()
        page.wait_for_function('()=>Array.from(document.querySelectorAll(".art img")).every(i=>i.complete&&i.naturalWidth>0)')
        assert page.locator('img[alt="Haumea"]').get_attribute('src').endswith('haumea-v2.webp')
        page.screenshot(path=str(OUT/'haumea-replacement-atlas.png'))
        assert not errors,errors
        assert not failed,failed
        report=dict(passed=True,physicalSystems=90,legacyWorlds=52,additionalDestinations=39,regionalCruise=True,remusRoundTrip=True,remusServices=True,saveReload=True,retiredFillerSaveMigration=True,researchBadgesRemovedFromGame=True,preservedPopulationRecordsAndWallet=True,andoriaIsMoon=True,distantOverviewArtRequests=len(distant),atlasSystems=len(atlas_ids),atlasBodies=atlas_bodies,javascriptErrors=errors,failedResponses=failed)
        (OUT/'browser.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report,indent=2))
        browser.close()
finally:
    server.shutdown()
