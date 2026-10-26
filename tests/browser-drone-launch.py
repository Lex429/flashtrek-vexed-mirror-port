"""Visible live launch from a disabled hull, approach, welding and recovery through the same bay."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'drone-launch'
OUTPUT.mkdir(parents=True, exist_ok=True)

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
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, has_touch=True)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length', timeout=120000)
        page.evaluate("""()=>{
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          Object.assign(s,{devMode:false,captain:'Inventory regression',shipName:'USS Danube',shipType:7,system:1,localBody:3,
            latinum:10000,antimatter:80,deuranium:12,dilithium:25,food:40,repairDroneMode:'manual',miningTool:true,weapons:[1],weaponInventory:[],
            minerals:{iron:7},solFreightHold:{0:8},localContracts:[],hull:50,shields:50,phase:'docked',localCruise:null,arrivalApproach:null});
          delete s.shipEquipment;delete s.weaponLoadout;delete s.repairBay;delete s.inventoryLayout;
          const ensure=nativeShipEquipment.ensure;
          window.nativeShipEquipment={...nativeShipEquipment,ensure(value,h=value,d){if(value?.captain&&h===value)window.__inventoryState=value;return ensure(value,h,d);}};
          nativeSaveStorage.write(s);resumeNativeGame('normal');window.nativeSimulation={...nativeSimulation,blocked:()=>true};
        }""")
        page.locator('#inventoryBtn').click()
        page.wait_for_selector('#ship-inventory canvas.ready')



        page.evaluate("()=>{Object.assign(__inventoryState,{hull:10,shields:0,phase:'disabled',x:7000,y:7000,speed:0,landed:false});nativeShipInventory.refresh();}")
        page.wait_for_function('()=>nativeRepairVisuals.ready()',timeout=30000)
        page.evaluate("""()=>{
          window.__flightFrames=[];window.__dotPixelChanges=[];
          const visuals=nativeRepairVisuals;
          window.nativeRepairVisuals={...visuals,drawDrone(ctx,d,view){
            const relevant=d.entity.carrier?.category==='player',stage=d.entity.bayTransit?.stage;
            let sample=null,box=null;
            if(relevant&&stage==='exit'&&__dotPixelChanges.length<8){
              const z=view.zoom??1,x=view.cx+(d.x-view.ship.x)*z,y=view.cy+(d.y-view.ship.y)*z,matrix=ctx.getTransform();
              box={x:Math.round(matrix.a*x+matrix.c*y+matrix.e)-10,y:Math.round(matrix.b*x+matrix.d*y+matrix.f)-10};
              sample=ctx.getImageData(box.x,box.y,20,20).data;
            }
            const drawn=visuals.drawDrone(ctx,d,view);
            if(relevant&&drawn){
              const bay=nativeShipRepairs.bayGeometry(nativeShipRepairs.pose(d.state,d.entity.carrier));
              __flightFrames.push({at:nativeSimulation.seconds(d.state),phase:d.entity.phase,stage,x:d.x,y:d.y,dock:bay.dock,hull:d.state.hull});
              if(sample){const after=ctx.getImageData(box.x,box.y,20,20).data;let changed=0;for(let i=0;i<after.length;i+=4)if(after[i]!==sample[i]||after[i+1]!==sample[i+1]||after[i+2]!==sample[i+2])changed++;__dotPixelChanges.push(changed);}
            }
            return drawn;
          }};
          window.nativeSimulation={...nativeSimulation,blocked:()=>document.hidden||nativePause.active||nativeShipInventory.active};
        }""")
        page.locator('[data-deploy-repair-drones]').click()
        assert page.locator('#ship-inventory').is_hidden()
        page.wait_for_function('()=>__flightFrames.some(f=>f.stage==="exit")',timeout=10000)
        first=page.evaluate('__flightFrames[0]')
        assert first['phase']=='launching' and first['stage']=='exit',first
        assert ((first['x']-first['dock']['x'])**2+(first['y']-first['dock']['y'])**2)**.5<6,first
        page.locator('#space').screenshot(path=str(OUTPUT/'dot-leaving-hull.png'))
        page.wait_for_function('()=>__inventoryState.repairBay.slots[0].phase==="repairing"',timeout=30000)
        page.locator('#space').screenshot(path=str(OUTPUT/'dot-working.png'))
        page.wait_for_function('()=>__inventoryState.repairBay.slots[0].bayTransit?.stage==="enter"',timeout=90000)
        page.locator('#space').screenshot(path=str(OUTPUT/'dot-entering-hull.png'))
        page.wait_for_function('()=>__inventoryState.shipRepairs.missions.some(m=>m.manual&&m.status==="completed")',timeout=30000)
        result=page.evaluate("""()=>{
          const frames=__flightFrames,departures=frames.filter(f=>f.stage==='exit'),arrivals=frames.filter(f=>f.stage==='enter');
          const distance=f=>Math.hypot(f.x-f.dock.x,f.y-f.dock.y);
          if(departures.length<3||arrivals.length<3)throw Error('Missing visible launch or docking flight');
          if(departures.some(f=>f.hull!==10))throw Error('Repair started before approach finished');
          if(Math.max(...__dotPixelChanges)<=0)throw Error('Launch never painted visible DOT pixels');
          if(distance(departures.at(-1))<=distance(departures[0])+5)throw Error('DOT did not fly out of the bay');
          if(distance(arrivals.at(-1))>=distance(arrivals[0])-5)throw Error('DOT did not fly back into the bay');
          const s=__inventoryState,d=s.repairBay.slots[0],bay=nativeShipRepairs.bayGeometry(nativeShipRepairs.pose(s,nativeShipRepairs.ref('player',s)));
          if(Math.hypot(d.x-bay.dock.x,d.y-bay.dock.y)>.01||d.phase!=='stowed')throw Error('Recovery ended outside the hull');
          if(s.hull!==50||Math.abs(s.deuranium-4)>.00001)throw Error('Repair cost or completion changed');
          return {passed:true,launchFrames:departures.length,dockingFrames:arrivals.length,firstDistance:distance(frames[0]),launchPixels:Math.max(...__dotPixelChanges),hull:s.hull,deuranium:s.deuranium};
        }""")
        assert not errors,errors
        (OUTPUT/'report.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result))
        browser.close()
finally:
    server.shutdown()
