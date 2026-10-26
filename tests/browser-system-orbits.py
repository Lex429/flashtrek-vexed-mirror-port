"""Actual map containment at two window sizes, cruise migration and reload."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'test-results/system-orbits'
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
        base = f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/'

        def boot(resume=False):
            page.goto(base+'index.html')
            page.wait_for_function('()=>window.nativeCombatShots?.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
            page.evaluate('''resume=>{
              const ensure=nativeShipEquipment.ensure;
              window.nativeShipEquipment={...nativeShipEquipment,ensure(s,h=s,d){if(s?.captain&&h===s)window.__orbitState=s;return ensure(s,h,d);}};
              if(resume)resumeNativeGame('normal');else startNativeDevGame();
            }''', resume)
            page.wait_for_function('()=>window.__orbitState', timeout=120000)

        boot()
        checked = []
        all_systems = page.evaluate('nativeSystemCatalog.records.map(r=>r.id)')
        for width, height in [(1600, 1100), (900, 700)]:
            page.set_viewport_size({'width': width, 'height': height})
            for system in all_systems if width == 1600 else [1, 38, 4, 12, 31, 51, 82, 84, 91]:
                if system % 15 == 0:
                    print(f'Checking rendered system {system} at width {width}', flush=True)
                page.evaluate('''system=>{
                  nativeGalaxyMap.close(false);
                  const s=__orbitState;
                  Object.assign(s,{system,devMode:true,phase:'flight',localBodySystem:system,localSystemVersion:2,localBody:nativeSystemCatalog.homeId(system),x:0,y:0,speed:0,vx:0,vy:0,localCruise:null,arrivalApproach:null,pendingTransit:null,landed:false});
                  nativeSystemCatalog.initialize(s);
                  nativeGalaxyMap.open();
                  for(let i=0;i<9;i++)document.querySelector('#galaxy-map [data-action="out"]').click();
                }''', system)
                page.wait_for_function('()=>Math.abs(Number(document.querySelector(".map-chart").dataset.span)-6*1.32**9)<.03')
                got = page.evaluate('''()=>{
                  const result=[];
                  for(const region of document.querySelectorAll('[data-region-system]')){
                    const system=Number(region.dataset.regionSystem),e=region.querySelector('ellipse');
                    const [x,y,rx,ry]=['cx','cy','rx','ry'].map(k=>Number(e.getAttribute(k)));
                    for(const body of document.querySelectorAll(`[data-system="${system}"][data-body]`)){
                      const dot=body.querySelector('.map-dot'),bx=Number(dot.getAttribute('cx')),by=Number(dot.getAttribute('cy'));
                      const inside=((bx-x)/rx)**2+((by-y)/ry)**2;
                      if(inside>1.000001)throw Error(`System ${system}, body ${body.dataset.body} outside ring: ${inside}`);
                      const radius=body.querySelector('image')?13:body.classList.contains('selected')?13:Number(dot.getAttribute('r'));
                      for(const dx of [-radius,radius])for(const dy of [-radius,radius])if(((bx+dx-x)/rx)**2+((by+dy-y)/ry)**2>1.000001)throw Error(`System ${system}, body ${body.dataset.body} marker crosses ring`);
                      result.push({system,body:Number(body.dataset.body)});
                    }
                  }
                  return result;
                }''')
                assert got, (width, system)
                checked.extend((item['system'], item['body']) for item in got)
                if system in [1, 38, 82, 84]:
                    page.screenshot(path=str(OUT/f'map-{system}-{width}.png'))

        # Every catalog is checked numerically in the real loaded game, including
        # regions offscreen in the chosen screenshots, without preparing artwork.
        counts = page.evaluate('''()=>{
          let bodies=0;
          for(const record of nativeSystemCatalog.records){
            const e=nativeSystemCatalog.boundary(record.id);
            for(const b of nativeSystemCatalog.bodies(record.id).filter(b=>!b.occludedBy)){
              if(((b.x-220-e.x)/e.rx)**2+((b.y+75-e.y)/e.ry)**2>1.000001)throw Error(`${record.id}/${b.id} outside`);
              bodies++;
            }
          }
          return {systems:nativeSystemCatalog.records.length,bodies};
        }''')
        assert counts == {'systems': 90, 'bodies': 490}
        assert len(set(checked)) == 490, len(set(checked))
        page.evaluate('''()=>{
          nativeGalaxyMap.close(false);
          const s=__orbitState,b=nativeSystemCatalog.bodies(82).find(b=>b.id===102),old=b.previousLayoutPosition;
          Object.assign(s,{system:82,devMode:false,captain:'Orbit Test',phase:'flight',localBodySystem:82,localSystemVersion:2,localBody:0,localNavTarget:102,x:b.x-920,y:b.y+75,speed:0,vx:0,vy:0,localCruise:{from:0,to:102,stopX:old.x-420,stopY:old.y+75,startedAt:1234},arrivalApproach:null,pendingTransit:null,landed:false,latinum:2468});
          delete s.orbitalLayoutVersion;
          s.civilianTraffic.ships=[];s.solEconomy.freighters=[];
          if(!nativeSaveStorage.write(s).ok)throw Error('Fixture save failed');
        }''')
        boot(resume=True)
        page.wait_for_function('()=>__orbitState.localBody===102&&!__orbitState.localCruise', timeout=120000)
        arrival = page.evaluate('''()=>{
          const s=__orbitState,b=nativeSystemCatalog.bodies(82).find(b=>b.id===102);
          document.querySelector('#save').click();
          return {system:s.system,body:s.localBody,revision:s.orbitalLayoutVersion,credits:s.latinum,distance:Math.hypot(s.x-(b.x-220),s.y-(b.y+75))};
        }''')
        assert arrival['system'] == 82 and arrival['body'] == 102 and arrival['revision'] == 1
        assert arrival['credits'] == 2468 and arrival['distance'] < 1000, arrival
        boot(resume=True)
        assert page.evaluate('({system:__orbitState.system,body:__orbitState.localBody,credits:__orbitState.latinum,revision:__orbitState.orbitalLayoutVersion})') == dict(system=82, body=102, credits=2468, revision=1)
        page.goto(base+'system-atlas.html?system=38')
        page.wait_for_function('()=>document.querySelector("#worlds").textContent.includes("Scientific estimate")')
        assert not errors, errors
        report = dict(passed=True, **counts, viewports=2, renderedBodiesChecked=len(set(checked)), migratedCruiseArrival=arrival, saveReload=True, errors=errors)
        (OUT/'browser.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
