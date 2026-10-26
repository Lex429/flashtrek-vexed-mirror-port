"""Every repairable showcase ship and every live hull uses the shared repair tools."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'fleet-repairs'
OUTPUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
showcase_base = next((arg.rstrip('/') for arg in sys.argv[1:] if arg.startswith('http')), base)
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("""const nativeFrame=window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>callback.name==='frame'?0:nativeFrame(callback);
          localStorage.setItem('vexedMirrorRepairWorkshop.v1',JSON.stringify({version:1,credits:5700,owned:{basic:2,upgraded:0,advanced:0}}));""")
        page.goto(showcase_base + '/html-games/flashtrek-broken-mirror/damage-showcase.html?ship=1')
        page.wait_for_function('()=>window.showcaseState?.().ready', polling=50, timeout=120000)
        page.locator('[data-workspace-tab="repair"]').click()
        page.locator('[data-workspace-page="mission"]:visible').click()
        page.locator('#drone-auto-attack').uncheck()
        page.locator('[data-workspace-page="tools"]:visible').click()
        page.evaluate("""()=>{const create=steamrunnerRepair.create;steamrunnerRepair.create=(...args)=>{
          const engine=create(...args);window.fleetRepair={engine,args};return engine;
        };}""")
        ships = page.evaluate("""async()=>{const c=await fetch('showcase-assets/catalog.json').then(r=>r.json());
          return c.ships.filter(s=>(!s.kind||s.kind==='ship')).map(s=>({id:s.id,name:s.name}));}""")
        showcase = []
        for ship in ([] if '--native-only' in sys.argv else ships):
            page.select_option('#ship-select', str(ship['id']))
            page.wait_for_function('(id)=>showcaseState().ready&&showcaseState().ship===id', arg=ship['id'], polling=50, timeout=120000)
            assert page.locator('#repair-demo').is_visible(), ship
            page.evaluate("""()=>{const input=document.querySelector('#hull');input.value=15;input.dispatchEvent(new Event('input'));}""")
            page.locator('#repair-demo').click()
            proof = page.evaluate(r"""()=>{
              const check=(v,m)=>{if(!v)throw Error(m);}, {engine,args}=fleetRepair,[damaged,intact,born,geometry]=args;
              const initial=engine.snapshot();check(initial.steps>0&&initial.drones.length>0,'No hull work assigned');
              const at=initial.firstWeldAt+160;engine.advance(at);
              const work=engine.snapshot();check(work.drones.some(d=>d.phase==='welding'),'No welding phase');
              check(work.sparkCount>0,'No welding sparks');
              const canvas=Object.assign(document.createElement('canvas'),{width:1100,height:560}),ctx=canvas.getContext('2d');
              const before=JSON.stringify(engine.snapshot());engine.drawBody(ctx,geometry.layout,geometry.angle);
              engine.drawBeam(ctx,geometry.layout,geometry.angle,at);check(JSON.stringify(engine.snapshot())===before,'Painting advanced repairs');
              const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
              let green=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>150&&pixels[i+1]>pixels[i]*1.3&&pixels[i+1]>pixels[i+2]*1.1)green++;
              check(green>5,'No painted green welding tools');
              const done=engine.advance(born+initial.duration+10),end=engine.snapshot();
              check(done&&end.progress===1&&end.drones.every(d=>d.phase==='docked'),'Repair or return did not finish');
              check(engine.frame()===intact,'Completed hull differs from existing intact artwork');
              return {ship:showcaseState().ship,steps:initial.steps,drones:initial.drones.length,greenPixels:green,maintenance:initial.changedPixels===0};
            }""")
            showcase.append(proof)
            if len(showcase) % 10 == 0: print(json.dumps({'showcaseChecked': len(showcase)}), flush=True)
        print(json.dumps({'showcaseShips': len(showcase)}), flush=True)
        if showcase: (OUTPUT / 'showcase.json').write_text(json.dumps(showcase, indent=2), encoding='utf-8')
        page.close()

        game = browser.new_page(viewport={'width': 1280, 'height': 850})
        game.on('pageerror', lambda error: errors.append(str(error)))
        game.goto(base + '/html-games/broken-mirror-port/index.html')
        game.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden', timeout=120000)
        game.evaluate('startNativeDevGame()')
        game.evaluate("()=>{const frame=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='draw'?0:frame(callback);}")
        game.wait_for_timeout(150)
        native = game.evaluate(r"""async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},result=[],template=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          await nativeRepairVisuals.ensure();
          for(const entry of VexedMirrorWorld.ships){
            const s=JSON.parse(JSON.stringify(template));s.system=47;s.landed=false;s.devMode=false;
            s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
            s.shipRepairs={version:1,medicalFleetVersion:1,sequence:0,calls:[],missions:[],ledger:{consumed:0,lost:0,medicalCapital:0},nextPollAt:0};
            // Refit a fresh fixture hull through the shared equipment owner.
            delete s.shipEquipment;delete s.weaponLoadout;delete s.repairBay;
            s.shipType=entry.id;s.hull=1;s.shields=0;s.deuranium=10000;s.phase='disabled';s.x=0;s.y=0;s.heading=-Math.PI/2;
            nativeShipRepairs.initialize(s);
            const max=nativeShipDefinitions.forEntity(s,s).hull;s.hull=max*.1;
            const ref=nativeShipRepairs.ref('player',s),m=nativeShipRepairs.launch(s,ref,ref);
            check(m&&m.drones.length>0,'No launch on hull '+entry.id);
            const maximumSteps=Math.ceil(max*.9/(1.5*m.drones.length)/.25)+2000;
            const tick=()=>{nativeSimulation.advance(s,.25);nativeShipRepairs.advance(s,.25);};
            let steps=0;while(m.restoredHull<max*.2){tick();check(steps++<maximumSteps,'No work on hull '+entry.id);}
            const workers=nativeShipRepairs.drones(s,47).filter(d=>d.entity.phase==='repairing');
            check(workers.length>0&&s.shipRepairs.weldSparks.length>0,'Missing welding on '+entry.id);
            check(new Set(workers.map(d=>d.entity.workSite)).size===workers.length,'Duplicated work cell');
            const sites=workers.map(d=>d.entity.workSite);
            const pose=nativeShipDefinitions.describe(s);
            for(const d of workers){const point=nativeShipRepairs.workPoint(pose,d.entity),heading=Math.atan2(point.y-d.y,point.x-d.x);
              check(Math.abs(nativeShipMotion.wrap(d.heading-heading))<.001,'Drone is not facing its welding site');}
            const assets=await Promise.all([1,.7,.4,.1].map(q=>vexedFlightAssets.loadShip(entry.id,max*q,{showcase:true})));
            const desc=nativeShipDefinitions.describe(s),plate=nativeRepairVisuals.surface(desc,assets,assets[3]);
            check(plate.repairSurface&&plate.art.width>0,'No repair plate on '+entry.id);
            const canvas=Object.assign(document.createElement('canvas'),{width:900,height:600}),ctx=canvas.getContext('2d');
            const before=JSON.stringify(s);
            const view={ship:{x:0,y:0},cx:450,cy:300,w:900,h:600,zoom:4};
            ctx.drawImage(plate.art,350,200,200,200);nativeRepairVisuals.paint(s,ctx,view);
            for(const d of workers){const beam=nativeRepairVisuals.beam(s,d),expected=nativeShipRepairs.workPoint(desc,d.entity);
              check(Math.hypot(beam.to.x-expected.x,beam.to.y-expected.y)<1e-8,'Beam detached from hull');}
            check(JSON.stringify(s)===before,'Painting mutated game state');
            while(m.restoredHull<max*.4){tick();check(steps++<maximumSteps,'Tools stopped working');}
            check(workers.some((d,i)=>d.entity.workSite!==sites[i]),'Tools never moved between damage sites');
            while(m.status==='active'){tick();check(steps++<maximumSteps,'Repair did not finish '+entry.id);}
            check(m.status==='completed'&&Math.abs(s.hull-max)<1e-6,'Incomplete hull '+entry.id);
            check(s.repairBay.slots.every(d=>d.phase==='stowed'),'Drones failed to return');
            check(Math.abs(s.shipRepairs.ledger.consumed-max*.9/5)<1e-6,'Material accounting changed');
            result.push({ship:entry.id,drones:m.drones.length,workSites:VexedRepairSites.ships[entry.id].points.length/2,consumed:m.spent});
          }
          return result;
        }""")
        assert len(native) == 66
        if errors: raise AssertionError(errors)
        (OUTPUT / 'report.json').write_text(json.dumps({'showcase': showcase, 'native': native}, indent=2), encoding='utf-8')
        print(json.dumps({'ok': True, 'showcaseShips': len(showcase), 'liveHulls': len(native)}))
        browser.close()
finally:
    server.shutdown()
