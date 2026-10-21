"""Real refinery arrival/reload and six-to-one-to-six Inventory capacity."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'review-gameplay'
OUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
        page.add_init_script('''(()=>{const raf=requestAnimationFrame;window.__reviewRaf=raf;window.requestAnimationFrame=fn=>raf(t=>{
          if(fn.name==='draw'){window.__reviewDraw=fn;window.__reviewStamp=t;if(window.__reviewHold)return;}fn(t);
        });})();''')
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.locator('[data-menu="dev"]').click(timeout=120000)
        page.wait_for_function('()=>nativeNpcDev.getState() && window.__reviewDraw && nativeSolAsteroids.placements.length')

        def freeze():
            page.evaluate('''()=>{window.__reviewHold=true;window.requestAnimationFrame=()=>0;
              window.__reviewTick=n=>{for(let i=0;i<n;i++){__reviewStamp+=1000/60;__reviewDraw(__reviewStamp);}};
            }''')

        freeze()
        fixture = page.evaluate(r'''()=>{
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState())),e=s.civilianTraffic.ships.find(e=>e.shipType===58);
          const check=(v,m)=>{if(!v)throw Error(m);};window.__reviewCheck=check;
          for(const other of s.civilianTraffic.ships)nativeNpcLives.interrupt(s,other,'isolated fractional refinery check');
          s.civilianTraffic.ships=[e];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
          Object.assign(s,{system:1,landed:false,localBody:3,localCruise:null,arrivalApproach:null,speed:0,vx:0,vy:0,angle:0});
          delete s.motionKick;delete s.motionSpin;
          s.minedAsteroids=nativeSolAsteroids.forSystem(1).map(r=>r.slotId);
          const at=nativeSimulation.seconds(s);s.civilianTraffic.life.config.economyEnabled=false;
          Object.assign(e,{system:1,port:3,phase:'docked',hull:nativeShipDefinitions.get(58).hull,shields:nativeShipDefinitions.get(58).shields,
            repairDeuranium:199.625,repairProvisioning:false,credits:1200,dockingVersion:1,heading:0,speed:0,vx:0,vy:0});
          delete e.motionKick;delete e.motionSpin;delete e.localLeg;delete e.dockingMove;delete e.combatInterruption;
          const berth=nativePortDocking.request(s,e,1,3);check(berth?.kind==='berth','No real refinery berth');
          Object.assign(e,{x:berth.x-300,y:berth.y});e.needsDockRecovery=true;e.nextActionAt=at;e.lifeScheduleToken++;
          e.task={id:`civilian:${e.id}:fractional-review`,kind:'mining',phase:'unloading',status:'active',createdAt:at,
            origin:{system:1,port:3},destination:{system:1,port:3},requirements:{good:7,tons:4,medicalSupply:true}};
          e.cargo={good:7,tons:4,raw:true,oreType:'deuranium',owner:e.id,fromSystem:1,fromPort:3,toSystem:1,toPort:3};
          const m=nativeNpcLives.market(s,1,3);m.stock[7]=0;m.credits=12000;
          const pose=vexedSolFlight.shipPosition(s);s.x+=berth.x-150-pose.x;s.y+=berth.y-170-pose.y;
          check(nativeSaveStorage.write(s).ok,'Fixture save failed');resumeNativeGame('dev');
          return {id:e.id,taskId:e.task.id,berth,start:{x:e.x,y:e.y},material:203.625,cash:13200};
        }''')
        page.evaluate('async()=>{await nativeShipEffects.prepare(58,"civilian");}')
        for _ in range(500):
            page.evaluate('__reviewTick(1)')
            midway = page.evaluate('(id)=>{const e=nativeNpcDev.getState().civilianTraffic.ships.find(e=>e.id===id);return {x:e.x,y:e.y,leg:!!e.localLeg,cargo:e.cargo};}', fixture['id'])
            if midway['leg'] and abs(midway['x']-fixture['start']['x']) > 20:
                break
        assert midway['leg'] and midway['cargo']['raw']
        assert abs(midway['x']-fixture['berth']['x']) > 5
        page.evaluate('(id)=>{nativeNpcDev.visit(id);__reviewTick(1);}', fixture['id'])
        page.screenshot(path=str(OUT/'olympic-approaching-refinery.png'))
        page.locator('#pauseBtn').click()
        page.locator('#pause-menu [data-save]').click()
        assert page.locator('[data-pause-title]').inner_text() == 'Game saved'
        page.reload()
        page.locator('[data-menu="continue-dev"]').click(timeout=120000)
        page.wait_for_function('()=>nativeNpcDev.getState() && window.__reviewDraw')
        freeze()
        restored = page.evaluate('(id)=>{const e=nativeNpcDev.getState().civilianTraffic.ships.find(e=>e.id===id);return {taskId:e.task.id,tons:e.cargo.tons,raw:e.cargo.raw,reserve:e.repairDeuranium};}', fixture['id'])
        assert restored == {'taskId': fixture['taskId'], 'tons': 4, 'raw': True, 'reserve': 199.625}
        for _ in range(1200):
            page.evaluate('__reviewTick(1)')
            result = page.evaluate('(id)=>{const s=nativeNpcDev.getState(),e=s.civilianTraffic.ships.find(e=>e.id===id),m=nativeNpcLives.market(s,1,3);return {cargo:e.cargo,reserve:e.repairDeuranium,wallet:e.credits,stock:m.stock[7],treasury:m.credits,deliveries:e.deliveries,transaction:e.task.transactionId,funds:m.fundsReserved,incoming:m.incoming[7],task:e.task.status};}', fixture['id'])
            if result['cargo'] is None:
                break
        assert result['cargo'] is None and result['reserve'] == 200 and result['deliveries'] == 1
        assert abs(result['reserve']+result['stock']-fixture['material']) < 1e-9
        assert abs(result['wallet']+result['treasury']-fixture['cash']) < 1e-9
        assert abs(result['wallet']-1200-3.625*75) < 1e-9
        assert result['funds'] == 0 and result['incoming'] == 0
        assert result['transaction'] == 'unload:'+fixture['taskId']
        page.evaluate('(id)=>{nativeNpcDev.visit(id);__reviewTick(1);}', fixture['id'])
        page.screenshot(path=str(OUT/'olympic-fractional-unload-complete.png'))
        page.evaluate('nativeSaveStorage.write(nativeNpcDev.getState())')
        page.reload()
        page.locator('[data-menu="continue-dev"]').click(timeout=120000)
        page.wait_for_function('()=>nativeNpcDev.getState() && window.__reviewDraw')
        freeze()
        after = page.evaluate('(id)=>{const s=nativeNpcDev.getState(),e=s.civilianTraffic.ships.find(e=>e.id===id),m=nativeNpcLives.market(s,1,3);return {deliveries:e.deliveries,stock:m.stock[7],cash:e.credits+m.credits,cargo:e.cargo};}', fixture['id'])
        assert after['deliveries'] == 1 and after['cargo'] is None and after['stock'] == result['stock']
        assert abs(after['cash']-fixture['cash']) < 1e-9

        capacity = page.evaluate('''()=>{
          const s=nativeNpcDev.getState(),a=nativeShipEquipment;
          if(!a.changeHull(s,58).ok)throw Error('Cannot select medical hull');const eq=a.ensure(s);
          for(let i=0;i<6;i++)if(!eq.slots.repairDrone[i])a.grant(s,'basic-dot',{location:'slot',slot:i});
          const ids=eq.slots.repairDrone.slice(),count=Object.keys(eq.instances).length;
          eq.instances[ids[5]].hull=17;eq.instances[ids[5]].readyAt=123;
          if(!a.changeHull(s,7).ok)throw Error('Cannot select small hull');nativeSaveStorage.write(s);resumeNativeGame('dev');
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();window.requestAnimationFrame=fn=>fn.name==='draw'?0:__reviewRaf(fn);return {ids,count};
        }''')
        page.locator('#inventoryBtn').click()
        page.wait_for_selector('#ship-inventory canvas.ready', timeout=30000)
        assert page.locator('[data-equipment-kind="repairDrone"][data-equipment-place="slot"]').count() == 1
        assert page.locator('[data-equipment-place="locker"][aria-label="Stored Basic Dot"]').count() == 5
        page.screenshot(path=str(OUT/'small-hull-owned-drone-overflow.png'))
        page.locator('.inventory-close').click()
        page.reload()
        page.locator('[data-menu="continue-dev"]').click(timeout=120000)
        page.wait_for_function('()=>nativeNpcDev.getState()')
        freeze()
        assert page.evaluate('nativeNpcDev.getState().repairBay.capacity') == 1
        page.evaluate('''()=>{const s=nativeNpcDev.getState();if(!nativeShipEquipment.changeHull(s,58).ok)throw Error('Cannot return to Olympic');nativeSaveStorage.write(s);resumeNativeGame('dev');window.nativeSimulation={...nativeSimulation,blocked:()=>true};window.nativeSimulationHost?.checkpoint();window.requestAnimationFrame=fn=>fn.name==='draw'?0:__reviewRaf(fn);}''')
        page.locator('#inventoryBtn').click()
        page.wait_for_selector('#ship-inventory canvas.ready', timeout=30000)
        assert page.locator('[data-equipment-kind="repairDrone"][data-equipment-place="slot"]').count() == 6
        for index in range(1, 6):
            page.locator('[data-equipment-place="locker"][aria-label="Stored Basic Dot"]').first.click()
            page.locator(f'[data-equipment-kind="repairDrone"][data-equipment-place="slot"][data-equipment-index="{index}"]').click()
        final = page.evaluate('''()=>{const s=nativeNpcDev.getState(),eq=s.shipEquipment;return {capacity:s.repairBay.capacity,ids:eq.slots.repairDrone,count:Object.keys(eq.instances).length,damaged:Object.values(eq.instances).find(d=>d.category==='repairDrone'&&d.hull===17)};}''')
        assert final['capacity'] == 6 and set(final['ids']) == set(capacity['ids']) and final['count'] == capacity['count']
        assert final['damaged']['readyAt'] == 123
        page.screenshot(path=str(OUT/'olympic-six-returned-owned-drones.png'))
        assert not errors, errors
        report = {'passed': True, 'physicalApproach': {'fixture': fixture, 'midway': midway, 'restored': restored}, 'fractionalUnload': result,
                  'reloadExactlyOnce': after, 'hullChangeCapacity': final, 'javascriptErrors': errors}
        (OUT/'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
        browser.close()
finally:
    server.shutdown()
