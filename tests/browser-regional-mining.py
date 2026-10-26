"""Real remote asteroid selection, mining, collection, refining and engineering."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

MINING_SYSTEM=int(os.environ.get('MINING_SYSTEM','43'))

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'regional-mining'
OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=None
if len(sys.argv)>1:
    base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=90000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeSolAsteroids.placements.length>0')
        # Use the existing ship and fleet, with a remote asteroid close enough
        # to click. No planet/asteroid artwork is substituted by the test.
        point=page.evaluate('''system=>{
          const s=nativeNpcDev.getState(),rock=nativeSolAsteroids.forSystem(system).find(r=>r.oreType==='dilithium');
          Object.assign(s,{devMode:false,deuranium:0,dilithium:100,system,planet:VexedMirrorWorld.systems.find(w=>w.id===system).name,x:rock.x-100,y:rock.y,speed:0,angle:Math.PI/2,miningTool:true,localCruise:null,arrivalApproach:null});
          delete s.localBodySystem;nativeSystemCatalog.initialize(s);
          nativeShipEquipment.grant(s,'mining-laser',{location:'slot',slot:0});window.__regionalState=s;window.__regionalRock=rock;window.__regionalBefore=s.dilithium;
          vexedSpace.enterSystem(system,true);
          const view=nativeView.measure(document.querySelector('#space'));
          return {x:view.w/2+100,y:view.h/2,w:view.w,h:view.h};
        }''',MINING_SYSTEM)
        page.wait_for_timeout(700)
        box=page.locator('#space').bounding_box()
        x=box['x']+point['x']/point['w']*box['width']
        y=box['y']+point['y']/point['h']*box['height']
        page.mouse.click(x,y)
        page.wait_for_timeout(150)
        assert not errors,errors
        page.locator('#asteroid-mine-action').wait_for(state='visible')
        page.locator('#asteroid-mine-action').click()
        # Completion follows simulation time. Software-rendered mining effects
        # can deliver fewer callbacks than a desktop GPU without changing the job.
        page.wait_for_function('()=>__regionalState.minedAsteroids?.includes(__regionalRock.slotId)',timeout=60000)
        page.mouse.click(x,y)
        page.wait_for_function('()=>__regionalState.asteroidOreDrops[__regionalRock.slotId]===0')
        assert page.evaluate('__regionalState.dilithium===__regionalBefore+4')
        page.screenshot(path=str(OUTPUT/'klingon-mining.png'))
        # Exercise the actual port market and engineering buttons outside Dev
        # purchasing privileges, while retaining the captured active state.
        before=page.evaluate('''()=>{
          const s=__regionalState;Object.assign(s,{devMode:false,x:0,y:0,speed:0,localCruise:null,arrivalApproach:null,latinum:10000,minerals:{trellium:30,tritanium:30,gallicite:30,benamite:10}});
          const m=nativeNpcLives.market(s,s.system,0);window.__regionalMarket=m;
          return {wallet:s.latinum,treasury:m.credits,ore:s.minerals.trellium,hull:nativeShipDefinitions.forEntity(s).hull};
        }''')
        page.locator('#tradeBtn').click()
        page.locator('[data-sell-mineral="trellium"]').click()
        result=page.evaluate('({wallet:__regionalState.latinum,treasury:__regionalMarket.credits,ore:__regionalState.minerals.trellium})')
        assert result['ore']==before['ore']-1
        assert result['wallet']+result['treasury']==before['wallet']+before['treasury']
        page.locator('[data-upgrade-mineral="hull"]').click()
        assert page.evaluate('__regionalState.mineralUpgrades[__regionalState.shipType].hull')==1
        assert page.evaluate('nativeShipDefinitions.forEntity(__regionalState).hull')==round(before['hull']*1.1)
        page.locator('[data-upgrade-mineral="hull"]').scroll_into_view_if_needed()
        page.screenshot(path=str(OUTPUT/'local-refinery.png'))
        page.locator('[data-prospect]').click()
        assert page.locator('#system-hub').is_hidden()
        assert page.evaluate('!!__regionalState.arrivalApproach')
        # The long Mining shop remains scrollable on a compact display, with
        # the final upgrade and the prospecting control reachable by pointer.
        page.evaluate('Object.assign(__regionalState,{x:0,y:0,speed:0,arrivalApproach:null})')
        page.set_viewport_size({'width':760,'height':600})
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        page.locator('#tradeBtn').click()
        page.locator('[data-tab="services"]').click()
        page.wait_for_function('()=>nativePlanetEncounter.active&&!nativeSystemHub.active')
        page.locator('[data-view-tab="shop"]').click()
        if MINING_SYSTEM==53:
            assert 'No ships are offered here.' in page.locator('#planet-encounter').inner_text()
            page.locator('[data-shop-category="weapons"]').click()
            assert 'No weapons are offered here.' in page.locator('#planet-encounter').inner_text()
        page.locator('[data-shop-category="mining"]').click()
        page.locator('[data-upgrade-mineral="drive"]').scroll_into_view_if_needed()
        bounds=page.locator('[data-upgrade-mineral="drive"]').bounding_box()
        assert bounds['y']>=0 and bounds['y']+bounds['height']<=600
        assert page.locator('.encounter-mining-scroll').evaluate('(e)=>e.scrollHeight>e.clientHeight')
        page.screenshot(path=str(OUTPUT/'compact-mining-shop.png'))
        page.locator('[data-prospect]').click()
        assert page.locator('#planet-encounter').is_hidden()
        # Geometry for every region is available without preparing distant
        # images; only the currently visible asteroid art is requested.
        report=page.evaluate('''()=>({systems:VexedMirrorWorld.systems.length,region:nativeRegionalMinerals.profile(__regionalState.system),geometry:nativeSolAsteroids.metrics(),minedId:__regionalRock.slotId,upgrades:__regionalState.mineralUpgrades})''')
        assert MINING_SYSTEM*100000<=report['minedId']<(MINING_SYSTEM+1)*100000
        if MINING_SYSTEM==53:
            assert report['region']['key']=='halka'
            assert report['region']['weights']['dilithium']==75
        assert not errors,errors
        (OUTPUT/'browser-report.json').write_text(json.dumps(report,indent=2))
        browser.close()
        print('Remote mining, one-time ore collection, funded refinery, hull upgrade, and prospecting UI passed; no browser errors.')
finally:
    if server: server.shutdown()
