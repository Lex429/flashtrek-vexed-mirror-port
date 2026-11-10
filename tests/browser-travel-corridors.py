"""Full-fleet route rendering/reload; optional real-time Sol-to-Orion flight.

Functional clock-controlled checks do not qualify display refresh. The optional
tour uses ordinary keys and the actual host loop, without teleporting the player.
Use validate_gameplay_refresh.py separately for clean foreground FPS evidence.
"""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/travel-corridors'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def ready(page):
    page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
    page.locator('[data-menu="dev"]').click()
    page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=90000)

def functional(page,base):
    page.goto(base+'/html-games/broken-mirror-port/index.html');ready(page)
    page.evaluate('()=>{window.__routeBlocked=nativeSimulation.blocked;window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();}')
    result=page.evaluate('''()=>{
      const check=(v,m)=>{if(!v)throw Error(m);},copy=v=>JSON.parse(JSON.stringify(v));
      const s=window.__routeProof=copy(nativeNpcDev.getState()),paths=nativeTravelCorridors,route=paths.lanes().find(l=>l.from===1&&l.to===2);
      nativeNpcLives.initialize(s);const population=s.civilianTraffic.ships.length,medical=s.civilianTraffic.ships.filter(e=>e.shipType===58).length;
      check(population===1200&&medical===100,'Full production fleet was not retained');check(route.sites.length>=6,'Sol–Orion corridor is empty');
      const fields=route.sites.map(site=>{const box={minX:site.x-600,minY:site.y-600,maxX:site.x+600,maxY:site.y+600};const scene=nativeShipSystems.query(s,{system:1,...box,categories:['asteroid']});check(scene.rocks.some(r=>r.entity.corridor),'Field missing from canonical collision/targeting scene');return {site:site.id,x:site.x,y:site.y,rocks:scene.rocks.filter(r=>r.entity.corridor).length};});
      const traveller=s.civilianTraffic.ships.find(e=>{if(!e.journey||!e.cargo||e.hull<=0||e.journey.arrivalAt-nativeSimulation.seconds(s)<3)return false;const p=nativeNpcLives.galaxyPosition(s,e),a=nativeManualFlight.anchor(e.system);return Math.hypot(p.x-a.x,p.y-a.y)>5000&&Math.hypot(e.journey.galaxyTo.x-p.x,e.journey.galaxyTo.y-p.y)>2000;});check(traveller,'No real working traveller in the prepared fleet');
      const before=nativeNpcLives.galaxyPosition(s,traveller),origin=nativeManualFlight.anchor(traveller.system),cargo=JSON.stringify(traveller.cargo),task=traveller.task.id,escrow=JSON.stringify(s.civilianTraffic.life.reservations[task]);
      Object.assign(s,{system:traveller.system,x:before.x-origin.x,y:before.y-origin.y,landed:false});
      window.nativeSimulation={...nativeSimulation,blocked:()=>false};
      try{
        check(nativeNpcLives.promoteJourney(s,traveller,nativeSimulation.seconds(s)),'No safe local route for the selected traveller');
        const after=nativeNpcLives.galaxyPosition(s,traveller);check(Math.hypot(after.x-before.x,after.y-before.y)<.00001,'Promotion teleported a real traveller');
        check(nativeShipSystems.resolve(s,traveller.id,s.system)?.entity===traveller,'Local traveller is not an ordinary target');
        check(JSON.stringify(traveller.cargo)===cargo&&JSON.stringify(s.civilianTraffic.life.reservations[task])===escrow,'Promotion changed committed cargo or money');
      }finally{window.nativeSimulation={...nativeSimulation,blocked:()=>true};}
      const miner=s.civilianTraffic.ships.find(e=>e.task?.kind==='mining'&&e.task.status==='active'&&e.task.phase==='mining-flight'&&e.task.requirements?.corridorSite&&e.localLeg);check(miner,'Existing fleet has no real corridor mining job');
      const deadline=miner.nextActionAt,at=nativeSimulation.seconds(s);
      window.nativeSimulation={...nativeSimulation,blocked:()=>false};
      try{
        if(deadline>at)nativeSimulation.advance(s,deadline-at+.001);
        // Drain due jobs through their bounded owner at this fixed checkpoint.
        for(let pass=0;pass<4096&&miner.phase!=='mining';pass++){nativeSimulationFrame.begin(s);try{nativeCivilianTraffic.advance(s,1/60);}finally{nativeSimulationFrame.end(s);}}
        check(miner.phase==='mining','Saved corridor miner never reached its reserved rock: '+JSON.stringify({id:miner.id,phase:miner.phase,task:miner.task,nextActionAt:miner.nextActionAt,originalDeadline:deadline,clock:nativeSimulation.seconds(s),position:{x:miner.x,y:miner.y},leg:miner.localLeg,metrics:nativeNpcLives.metrics(s),blocked:__routeBlocked(),hidden:document.hidden}));
        nativeSimulation.advance(s,1);
        nativeSimulationFrame.begin(s);try{nativeCivilianTraffic.advance(s,1/60);}finally{nativeSimulationFrame.end(s);}
      }finally{window.nativeSimulation={...nativeSimulation,blocked:()=>true};}
      const rock=nativeSolAsteroids.find(miner.task.requirements.rockId,miner.system);check(rock?.corridor,'Mining was not at the persistent corridor field');
      Object.assign(s,{system:miner.system,x:(miner.x+rock.x)/2,y:(miner.y+rock.y)/2,speed:0,vx:0,vy:0,landed:false});
      s.routeBrowserProof={miner:miner.id,task:miner.task.id,rock:rock.slotId,nextActionAt:miner.nextActionAt,miningStartedAt:miner.miningStartedAt,fields:fields.length};
      return {population,medical,fields,traveller:{id:traveller.id,task,positionContinuous:true,targetable:true,cargoAndEscrowRetained:true},mining:copy(s.routeBrowserProof),scope:'Functional owner-clock checks; separate from real-time gameplay/refresh qualification'};
    }''')
    page.evaluate('()=>{const r=nativeSaveStorage.write(__routeProof);if(!r.ok)throw Error(r.error);const saved=nativeSaveStorage.read("dev");if(JSON.stringify(saved)!==JSON.stringify({...__routeProof,saveSlotVersion:3}))throw Error("Checkpoint changed full route state");}')
    page.reload();page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
    page.locator('[data-menu="continue-dev"]').click();page.wait_for_function('()=>!!nativeNpcDev.getState()?.routeBrowserProof')
    page.evaluate('nativePause.open()')
    result['reload']=page.evaluate('''()=>{const s=nativeNpcDev.getState(),p=s.routeBrowserProof,e=nativeNpcLives.find(s,p.miner);if(s.civilianTraffic.ships.length!==1200||s.civilianTraffic.ships.filter(e=>e.shipType===58).length!==100)throw Error('Continue changed population');if(e.task.id!==p.task||e.phase!=='mining'||e.miningStartedAt!==p.miningStartedAt||e.nextActionAt!==p.nextActionAt)throw Error('Continue changed a partial corridor mining job');return {population:1200,medical:100,partialMiningRetained:true};}''')
    page.evaluate('nativePause.close()');page.wait_for_timeout(1500)
    page.locator('#space').screenshot(path=str(OUTPUT/'corridor-mining.png'))
    result['painted']=page.evaluate('''()=>{const s=nativeNpcDev.getState(),e=nativeNpcLives.find(s,s.routeBrowserProof.miner),r=nativeSolAsteroids.find(s.routeBrowserProof.rock,s.system);return {miner:e.id,phase:e.phase,rock:r.slotId,artLoaded:!!nativeSolAsteroids.peekImage(r.file),effects:nativeShipEffects.metrics(),corridorGeometry:nativeSolAsteroids.metrics()};}''')
    assert result['painted']['artLoaded'],'Visible corridor asteroid did not load its existing artwork'
    return result

def tour(page,base):
    page.goto(base+'/html-games/broken-mirror-port/index.html');ready(page)
    page.evaluate('''()=>{const s=nativeNpcDev.getState();nativeShipMotion.stop(s);const g=nativeManualFlight.guidance(s,2);s.angle=Math.atan2(g.dy,g.dx);nativeShipSystems.refreshShip(s,s,'player');
      const lane=nativeTravelCorridors.lanes().find(l=>l.from===1&&l.to===2);window.__routeTour={course:[...lane.sites.map(p=>({x:p.x,y:p.y})),nativeManualFlight.planetPosition(2)],courseIndex:0,actors:new Map(),warpShips:new Set(),ships:new Set(),miners:new Set(),fights:new Set(),talkers:new Set(),travellers:new Set(),corridorShips:new Set(),corridorMiners:new Set(),corridorTalkers:new Set(),rocks:new Set(),rows:[]};
      const draw=nativeShipEffects.paintShip;window.nativeShipEffects={...nativeShipEffects,paintShip(ctx,d,...rest){const result=draw.call(this,ctx,d,...rest);if(d.category==='civilian'&&result?.art){const p=__routeTour;p.ships.add(d.entity.id);p.actors.set(d.entity.id,{id:d.entity.id,name:d.entity.name,phase:d.entity.phase,work:d.entity.task?.kind,taskPhase:d.entity.task?.phase,localTravel:!!d.entity.travelResume,warpTravel:!!d.entity.journey});if(d.entity.journey)p.warpShips.add(d.entity.id);if(d.entity.travelResume)p.travellers.add(d.entity.id);if(d.entity.phase==='mining')p.miners.add(d.entity.id);if(d.entity.phase==='fighting')p.fights.add(d.entity.id);if(d.entity.talkingUntil>nativeSimulation.seconds(d.state))p.talkers.add(d.entity.id);const player=d.state.system===1?vexedSolFlight.shipPosition(d.state):d.state;if(Math.hypot(player.x,player.y)>5000){p.corridorShips.add(d.entity.id);if(d.entity.phase==='mining')p.corridorMiners.add(d.entity.id);if(d.entity.talkingUntil>nativeSimulation.seconds(d.state))p.corridorTalkers.add(d.entity.id);}}return result;}};
      const paint=nativeSolAsteroids.paint;nativeSolAsteroids.paint=function(ctx,view){const z=view.zoom||1;for(const r of nativeSolAsteroids.nearby(view.system,view.ship,Math.hypot(view.w,view.h)/(2*z)+70)){if(r.corridor&&Math.abs(r.x-view.ship.x)*z<view.w/2+r.size&&Math.abs(r.y-view.ship.y)*z<view.h/2+r.size&&!view.mined.includes(r.slotId))__routeTour.rocks.add(r.slotId);}return paint.call(this,ctx,view);};
    }''')
    page.locator('#space').click(position={'x':30,'y':100});page.wait_for_timeout(300);page.keyboard.down('w');page.wait_for_timeout(200);page.keyboard.up('w');page.keyboard.down('w');started=time.monotonic();rows=[];held=None;capture=0
    try:
        while time.monotonic()-started<240:
            page.wait_for_timeout(500)
            row=page.evaluate('''()=>{const s=nativeNpcDev.getState(),g=nativeManualFlight.guidance(s,2),p=__routeTour,position=nativeManualFlight.position(s);while(p.courseIndex<p.course.length-1&&Math.hypot(p.course[p.courseIndex].x-position.x,p.course[p.courseIndex].y-position.y)<500)p.courseIndex++;const target=p.course[p.courseIndex],heading=Math.atan2(target.y-position.y,target.x-position.x);return {system:s.system,distance:g?.distance??0,error:Math.atan2(Math.sin(heading-s.angle),Math.cos(heading-s.angle)),waypoint:p.courseIndex,x:s.x,y:s.y,hull:s.hull,speed:s.speed,at:nativeSimulation.seconds(s),ships:__routeTour.ships.size,travellers:__routeTour.travellers.size,miners:__routeTour.miners.size,fights:__routeTour.fights.size,talkers:__routeTour.talkers.size,rocks:__routeTour.rocks.size,corridorShips:__routeTour.corridorShips.size,corridorMiners:__routeTour.corridorMiners.size,corridorTalkers:__routeTour.corridorTalkers.size,region:nativeShipDetail.region(s)?.generation};}''')
            if row['system']==2:rows.append(row);break
            if time.monotonic()-started>8 and row['distance']>40500 and row['speed']==0:raise AssertionError('Ordinary thrust input did not move the actual game: '+json.dumps(row))
            wanted='d' if row['error']>.03 else 'a' if row['error']<-.03 else None
            if held and held!=wanted:page.keyboard.up(held);held=None
            if wanted:
                page.keyboard.down(wanted);page.wait_for_timeout(min(100,max(15,abs(row['error'])*180)));page.keyboard.up(wanted)
            if not rows or time.monotonic()-started>=len(rows)*5:
                row['wallSeconds']=time.monotonic()-started;rows.append(row);print(json.dumps({'tour':row}),flush=True)
            if row['distance']<30000-capture*12000 and capture<2:
                page.locator('#space').screenshot(path=str(OUTPUT/('route-flight-'+str(capture+1)+'.png')));capture+=1
    finally:
        page.keyboard.up('w')
        if held:page.keyboard.up(held)
    final=page.evaluate('''()=>{const s=nativeNpcDev.getState();return {system:s.system,population:s.civilianTraffic.ships.length,medical:s.civilianTraffic.ships.filter(e=>e.shipType===58).length,ships:[...__routeTour.ships],warpShips:[...__routeTour.warpShips],actors:[...__routeTour.actors.values()],travellers:[...__routeTour.travellers],miners:[...__routeTour.miners],fights:[...__routeTour.fights],talkers:[...__routeTour.talkers],rocks:[...__routeTour.rocks],corridorShips:[...__routeTour.corridorShips],corridorMiners:[...__routeTour.corridorMiners],corridorTalkers:[...__routeTour.corridorTalkers],physicsDebtSeconds:s.shipSimulation.schedule.pendingSeconds};}''')
    result={'passed':final['system']==2 and bool(final['rocks']) and bool(final['corridorShips']) and bool(final['travellers']), 'wallSeconds':time.monotonic()-started,'rows':rows,'final':final,'scope':'Actual host loop and ordinary manual keys; steering follows the shared corridor beacons; no player teleports, simulation fast-forward or renderer switches. Not a refresh qualification.'}
    (OUTPUT/'real-flight.json').write_text(json.dumps(result,indent=2));assert result['passed'],result
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tour-only',action='store_true');parser.add_argument('--tour',action='store_true');args=parser.parse_args()
    OUTPUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[];failed=[];result={}
    try:
        with sync_playwright() as p:
            if args.tour or args.tour_only:browser=p.chromium.launch(headless=False,executable_path='C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe')
            else:
                channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            def make_page():
                context=browser.new_context(viewport={'width':1200,'height':650} if args.tour_only or args.tour else {'width':1280,'height':850});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None);return context,page
            base='http://127.0.0.1:'+str(server.server_port)
            if not args.tour_only:
                context,page=make_page();result['functional']=functional(page,base);context.close()
            if args.tour or args.tour_only:
                context,page=make_page();result['tour']=tour(page,base);context.close()
            browser.close()
        assert not errors and not failed,(errors,failed);result.update(passed=True,javascriptErrors=errors,failedRequests=failed)
        (OUTPUT/('browser-tour.json' if args.tour_only else 'browser-checks.json')).write_text(json.dumps(result,indent=2));print(json.dumps(result))
    finally:server.shutdown()

if __name__=='__main__':main()
