"""Real overview fit, new-system warp quote, committed receipt reload and arrival."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/system-layout'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
layout=json.loads((ROOT/'tools/system-layout.json').read_text(encoding='utf-8'))
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1600,'height':1100},reduced_motion='reduce')
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:errors.append(f'{response.status} {response.url}') if response.status>=400 else None)
        url=f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html'
        def boot(resume=False):
            page.goto(url)
            page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('''resume=>{
              const ensure=nativeShipEquipment.ensure;window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__layoutState=s;return ensure(s,h,d);}};
              if(resume)resumeNativeGame('normal');else startNativeDevGame();
            }''',resume)
            page.wait_for_function('()=>window.__layoutState',timeout=120000)
        boot()
        page.evaluate('''()=>{
          const s=JSON.parse(JSON.stringify(__layoutState));Object.assign(s,{devMode:false,captain:'Chart Test',system:1,localBody:3,localBodySystem:1,localSystemVersion:2,x:0,y:0,speed:0,vx:0,vy:0,phase:'flight',landed:false,antimatter:100,localCruise:null,arrivalApproach:null,pendingTransit:null,discovered:VexedMirrorWorld.systems.map(s=>s.id)});
          if(!nativeSaveStorage.write(s).ok)throw Error('Normal chart fixture save failed');resumeNativeGame('normal');
        }''')
        page.wait_for_function('()=>!__layoutState.devMode')
        page.locator('#mapBtn').click()
        for _ in range(25):page.locator('#galaxy-map [data-action="out"]').click()
        page.wait_for_timeout(1000)
        for item in layout['positions']:
            got=page.evaluate('(id)=>nativeNavigation.call("state").nodes.find(n=>n.id===id)',item['id'])
            assert got['x']==item['x'] and got['y']==item['y'],(item,got)
        visible=page.evaluate('''()=>{const b=document.querySelector('.map-viewport').getBoundingClientRect();return [...document.querySelectorAll('.map-destination-node:not([data-body]) .map-dot')].map(n=>{const p=n.getBoundingClientRect();return p.x>=b.x&&p.y>=b.y&&p.right<=b.right&&p.bottom<=b.bottom;});}''')
        assert len(visible)==90 and all(visible),visible
        page.screenshot(path=str(OUT/'live-overview-large.png'))
        page.set_viewport_size({'width':900,'height':700})
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT/'live-overview-small.png'))
        page.set_viewport_size({'width':1600,'height':1100})
        page.wait_for_timeout(500)
        node=page.locator('#galaxy-map [data-system="60"]:not([data-body])')
        node.focus();node.press('Enter')
        assert 'Kepler-174' in page.locator('.map-destination-info h3').inner_text()
        quote=page.evaluate('nativeNavigation.call("state",60).selected')
        original_fuel=page.evaluate('__layoutState.antimatter')
        assert quote['canTravel'] and quote['travelDays']>0 and quote['fuel']>0
        page.locator('#galaxy-map [data-action="warp"]').click()
        page.locator('#warp-transition[data-phase="report"] .warp-continue').wait_for(timeout=120000)
        receipt=page.evaluate('''()=>({system:__layoutState.system,fuel:__layoutState.antimatter,report:__layoutState.pendingTransit.report})''')
        assert receipt['system']==60 and receipt['fuel']==original_fuel-quote['fuel']
        assert receipt['report']['elapsedDays']==quote['travelDays']
        assert receipt['report']['fuelUsed']==quote['fuel']
        page.screenshot(path=str(OUT/'new-layout-warp-report.png'))
        # Reload the already committed receipt. Neither fuel nor elapsed days
        # may be charged again under the current chart.
        boot(resume=True)
        page.locator('#warp-transition[data-phase="report"] .warp-continue').wait_for(timeout=120000)
        restored=page.evaluate('''()=>({system:__layoutState.system,fuel:__layoutState.antimatter,report:__layoutState.pendingTransit.report})''')
        assert restored==receipt,(restored,receipt)
        page.locator('#warp-transition .warp-continue').click()
        page.wait_for_function('()=>!__layoutState.pendingTransit&&!__layoutState.arrivalApproach',timeout=120000)
        assert page.evaluate('__layoutState.system')==60
        assert page.evaluate('nativeSystemCatalog.current(__layoutState).name')=='Kepler-174d'
        page.screenshot(path=str(OUT/'kepler-174-arrival.png'))
        assert not errors,errors
        report={'passed':True,'all38PositionsMatchReviewedLayout':True,'all90OverviewNodesFit':True,'compactAndLargeOverview':True,'newWarpQuote':{'days':quote['travelDays'],'fuel':quote['fuel']},'committedReportReloadChargesOnce':True,'arrivedAtKepler174d':True,'errors':errors}
        (OUT/'browser.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
