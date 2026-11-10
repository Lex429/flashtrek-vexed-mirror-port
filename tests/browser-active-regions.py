"""Production fleet sleep/wake, launched weapons and worker checkpoint/reload.

Functional checks only. Foreground 120 Hz gameplay qualification is separate.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/active-regions'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True);server=None
    if len(sys.argv)>1:base=sys.argv[1].rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
    errors=[];failed=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850},reduced_motion='reduce')
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
            page.goto(base+'/html-games/broken-mirror-port/index.html',wait_until='domcontentloaded')
            ready='()=>nativeCombatShots.isReady()&&document.getElementById("startup").hidden'
            page.wait_for_function(ready,timeout=120000);page.locator('[data-menu="dev"]').click()
            page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=90000)
            page.evaluate('''()=>{window.__regionsBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();window.requestAnimationFrame=()=>0;}''')
            page.wait_for_timeout(100)
            report=page.evaluate('''()=>{
              const check=(value,message)=>{if(!value)throw Error(message);},copy=x=>JSON.parse(JSON.stringify(x));
              const s=window.__regionsFixture=copy(nativeNpcDev.getState()),ids=s.civilianTraffic.ships.map(e=>e.id),a=s.civilianTraffic.ships.find(e=>e.shipType!==58),b=s.civilianTraffic.ships.find(e=>e.id!==a.id&&e.shipType!==58);
              const at=nativeSimulation.seconds(s),y=1000000;
              Object.assign(s,{system:2,x:-500,y:y-500,landed:false});nativeShipMotion.stop(s);
              for(const e of [a,b]){nativeNpcLives.interrupt(s,e,'active area regression fixture');nativeShipMotion.stop(e);Object.assign(e,{system:2,y,hull:1000,shields:1000,phase:'docked',journey:null,heading:0,scriptedDemo:null});}
              a.x=-500;b.x=0;a.localLeg=nativeShipMotion.planLeg(a,{x:500,y},{maxSpeed:100,acceleration:100,braking:100,turnRate:1000},at);a.nextActionAt=at+a.localLeg.duration;
              nativeNpcLives.refreshLocation(s,a);nativeNpcLives.refreshLocation(s,b);nativeShipSystems.invalidateShips(s);
              window.nativeSimulation={...nativeSimulation,blocked:()=>false};
              try{
                nativeShipTraffic.collide(s,1/60);const route=JSON.stringify(a.localLeg),cargo=JSON.stringify(a.cargo),credits=a.credits;
                Object.assign(s,{x:4000000,y:4000000});nativeSimulation.advance(s,30);nativeShipTraffic.advance(s,1/60);nativeShipTraffic.collide(s,1/60);
                check(a.x===-500,'Sleeping route was integrated continuously');check(route===JSON.stringify(a.localLeg)&&cargo===JSON.stringify(a.cargo)&&credits===a.credits,'Sleep changed route/cargo/credits');
                Object.assign(s,{x:0,y:y-500});nativeShipTraffic.collide(s,1/60);const shown=nativeShipSystems.resolve(s,a.id,2);
                check(Math.abs(shown.x-500)<.01,'Waking route did not sample its current authoritative position');check(nativeShipTraffic.snapshot(s).contacts.length===0,'Waking replayed a collision through the sleeping interval');
                const old=nativeShipDetail.region(s);s.x=old.chunkSize;const next=nativeShipDetail.region(s);check(old.chunkX+1===next.chunkX,'Boundary did not activate the next buffered area');
                // Launch through the real owner, then leave the area before impact.
                nativeNpcLives.interrupt(s,a,'launched weapon regression');nativeShipMotion.stop(a);Object.assign(a,{shipType:7,x:0,y,heading:0,phase:'docked',weapons:[1]});delete a.shipEquipment;delete a.weaponLoadout;nativeShipEquipment.ensure(s,a);
                Object.assign(b,{x:200,y,shields:1000,hull:1000});Object.assign(s,{x:0,y});
                nativeShipSystems.refreshShip(s,a,'civilian',2);nativeShipSystems.refreshShip(s,b,'civilian',2);
                const target=nativeShipSystems.resolve(s,b.id,2),source=nativeShipSystems.resolve(s,a.id,2),before=b.hull+b.shields;
                const fired=nativeCombatShots.fireFor({state:s,shooter:source,target});check(fired.ok,'Real weapon launch failed: '+JSON.stringify(fired));
                Object.assign(s,{x:4000000,y:4000000});check(!nativeShipDetail.isDetailed(s,b,{category:'civilian'}),'Target should be outside the active area');
                nativeSimulation.advance(s,.1);nativeCombatShots.advance(s,.1);check(b.hull+b.shields<before,'A launched shot stopped when its area went to sleep');
                const after=b.hull+b.shields;nativeSimulation.advance(s,.5);nativeCombatShots.advance(s,.5);check(b.hull+b.shields===after,'Launched beam replayed damage');
                check(s.civilianTraffic.ships.length===1200&&JSON.stringify(ids)===JSON.stringify(s.civilianTraffic.ships.map(e=>e.id)),'Area changes altered the saved fleet');
                s.activeRegionsBrowserProof='complete';
                return {civilians:1200,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,sleepingRoutePreserved:true,wakePose:shown.x,noHistoricalSweep:true,boundaryChanged:true,launchedShotResolvedOutsideActiveArea:true,shotExactlyOnce:true};
              }finally{window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}
            }''')
            page.evaluate('()=>{nativeSaveStorage.schedule(__regionsFixture,{now:0,delay:.01,maxWait:.01});nativeSaveStorage.flushDue(__regionsFixture,{now:1});}')
            page.wait_for_function('()=>!nativeSaveStorage.pending(__regionsFixture)',timeout=15000)
            report['checkpoint']=page.evaluate('''()=>{
              const s=__regionsFixture,saved=nativeSaveStorage.read('dev'),metrics=nativeSaveStorage.metrics();
              if(!metrics.worker)throw Error('Real fleet checkpoint did not use the optional encoder worker');
              if(JSON.stringify(saved)!==JSON.stringify({...s,saveSlotVersion:3}))throw Error('Worker snapshot changed saved jobs, equipment, money or debt');
              return {worker:true,exactState:true,metrics};
            }''')
            page.reload(wait_until='domcontentloaded');page.wait_for_function(ready,timeout=120000)
            page.locator('[data-menu="continue-dev"]').click()
            page.wait_for_function('()=>nativeNpcDev.getState()?.activeRegionsBrowserProof==="complete"')
            report['reload']=page.evaluate('()=>{const s=nativeNpcDev.getState();return {civilians:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,region:nativeShipDetail.region(s)};}')
            assert report['reload']['civilians']==1200 and report['reload']['medical']==100
            assert report['reload']['region'] and not errors and not failed,(errors,failed)
            report.update(passed=True,javascriptErrors=errors,failedRequests=failed)
            (OUTPUT/'browser-regions.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps(report));browser.close()
    finally:
        if server:server.shutdown()

if __name__=='__main__':main()
