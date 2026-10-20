"""Shared spatial cache and real host-frame catch-up regression in a browser."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/spatial-performance'
SCENARIO=r"""() => {
 const check=(value,message)=>{if(!value)throw Error(message)},s=nativeNpcDev.getState(),systems=nativeShipSystems,frames=nativeSimulationFrame;
 const ship=s.civilianTraffic.ships.find(e=>e.system===s.system&&e.hull>0&&!['warp','arriving','destroyed'].includes(e.phase));
 check(ship,'No ordinary local civilian');
 const runtime=nativeSimulation,stamp=performance.now();window.nativeSimulation={...runtime,blocked:()=>true};window.__nativeFrame(stamp);
 frames.begin(s);frames.step(s);const initial=systems.scene(s),rocks=initial.rocks.slice(),before=frames.snapshot(s).counters;
 const location={x:ship.x,y:ship.y,heading:ship.heading,vx:ship.vx,vy:ship.vy,speed:ship.speed};
 for(let i=0;i<30;i++){
   ship.x+=1;ship.heading+=.03;systems.refreshShip(s,ship,'civilian');
   const current=systems.scene(s);check(current===initial,'One actor reconstructed the scene');
   check(current.rocks.every((rock,index)=>rock===rocks[index]),'A moving actor rebuilt unchanged rock geometry');
   check(systems.resolve(s,ship.id).x===ship.x,'ID resolution kept an old pose');
 }
 const work=frames.snapshot(s).counters;
 check(work.sceneCollections===1,'Repeated full scene assembly');
 check((work.asteroidGeometryBuilds||0)===(before.asteroidGeometryBuilds||0),'Repeated immutable geometry preparation');
 Object.assign(ship,location);systems.refreshShip(s,ship,'civilian');frames.end(s);
 // Exercise the real draw/advanceSimulation path, including actual contacts
 // and jobs, with a735ms active frame. No elapsed simulation time may disappear.
 const boundary=performance.now();window.__nativeFrame(boundary);const start=nativeSimulation.seconds(s);
 window.nativeSimulation=runtime;window.__nativeFrame(boundary+735);
 const elapsed=nativeSimulation.seconds(s)-start,physical=frames.snapshot(s);
 check(Math.abs(elapsed-.735)<1e-8,'Slow active frame discarded elapsed time '+elapsed);
 check(physical.steps===45,'Slow frame skipped required contact integration '+physical.steps);
 window.nativeSimulation={...runtime,blocked:()=>true};window.__nativeFrame(boundary+1500);
 check(Math.abs(nativeSimulation.seconds(s)-start-.735)<1e-8,'Pause advanced simulation');
 const conserved=state=>JSON.stringify({jobs:state.civilianTraffic.ships.map(e=>({id:e.id,task:e.task,cargo:e.cargo,credits:e.credits,equipment:e.shipEquipment})),
   reservations:state.civilianTraffic.life.reservations,player:state.shipEquipment,cargo:state.solFreightHold,contracts:state.localContracts,
   clock:state.shipSimulation,events:state.weaponCombat?.events,transactions:state.civilianTraffic.life.transactions});
 const expected=conserved(s);check(nativeSaveStorage.write(s).ok,'Verified save failed');window.resumeNativeGame('dev');
 const restored=nativeNpcDev.getState();check(conserved(restored)===expected,'Reload changed jobs, cargo, equipment, recharge or transactions');
 return {sceneCollections:work.sceneCollections,unchangedRocks:rocks.length,actorUpdates:30,elapsedSeconds:elapsed,physicalSubsteps:physical.steps,
   pausedClockPreserved:true,verifiedReloadPreserved:true,population:restored.civilianTraffic.ships.length+restored.solEconomy.freighters.length+1};
}"""

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*_args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
    try:
        with sync_playwright() as playwright:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=playwright.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850})
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.add_init_script("{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='draw'?(window.__nativeFrame=callback,0):raf(callback);}")
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('startNativeDevGame()')
            page.wait_for_function('()=>nativeSolAsteroids.placements.length && nativeCivilianTraffic.effectsReady()',timeout=120000)
            result=page.evaluate(SCENARIO)
            page.evaluate('()=>window.__nativeFrame(performance.now())')
            page.screenshot(path=str(OUTPUT/'shared-spatial-gameplay.png'));assert not errors,errors
            report={'passed':True,'browser':browser.version,**result,'errors':errors}
            (OUTPUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report));browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
