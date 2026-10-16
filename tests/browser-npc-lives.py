"""Prove the persistent delivery through real Dev UI and authoritative game state.

The controlled fixture reuses the existing civilian #2, equipment and real Sol
inventories. It removes unrelated ships only for exact transaction assertions;
browser-npc-performance.py separately measures the unchanged full population.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'test-results'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


HELPERS = r"""() => {
  const copy=value=>JSON.parse(JSON.stringify(value));
  const check=(value,message)=>{if(!value)throw Error(message);};
  const near=(a,b,label,tolerance=.001)=>check(Math.abs(a-b)<=tolerance,label+': '+a+' vs '+b);
  window.__lifeTest={copy,check,near,steps:0};
  const t=window.__lifeTest,original=nativeNpcDev.getState();
  const state=copy(original),ship=state.civilianTraffic.ships.find(ship=>ship.id===2);
  check(ship,'Existing civilian #2 missing');
  state.civilianTraffic.ships=[ship];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];state.civilianTraffic.strayShots=[];
  delete state.civilianTraffic.life;state.civilianTraffic.clock=0;state.civilianTraffic.timingVersion=1;
  state.solEconomy.freighters=[];state.shipSimulation.seconds=0;
  state.system=1;state.localBody=3;state.x=0;state.y=0;state.speed=0;state.landed=false;
  Object.assign(ship,{system:1,port:3,stationSystem:1,homeSystem:1,role:'freight',phase:'docked',timer:10000,
    cargo:null,oreHold:0,credits:1200,deliveries:0,legs:0,taskSequence:0});
  const body=nativeSystemHub.sol.find(body=>body.id===3);
  ship.x=body.x+180+(ship.id%4)*35;ship.y=body.y-130+(ship.id%3)*35;
  for(const field of ['lifeVersion','task','localLeg','journey','lastJourney','nextActionAt','lifeScheduleToken','lifeDemoName','recentEvents','miningReservation','miningRockSlot'])delete ship[field];
  t.fixture=copy(state);
  t.activate=value=>{localStorage.setItem('broken-mirror-native-save',JSON.stringify(value));resumeNativeGame();return nativeNpcDev.getState();};
  t.activate(state);
  t.tick=(seconds,step=.25)=>{
    const s=nativeNpcDev.getState();let left=seconds;
    while(left>1e-8){const dt=Math.min(step,left),elapsed=nativeSimulation.advance(s,dt);check(elapsed>0,'Unexpected paused simulation');
      nativeSolEconomy.advance(s,elapsed);nativeCivilianTraffic.advance(s,elapsed);nativeCombatShots.advance(s,elapsed);
      nativeEnvironmentalImpacts.advance(s,elapsed);nativeShipEffects.advance(s,elapsed);nativeAsteroidCombat.advance(s,elapsed);
      left-=dt;t.steps++;check(t.steps<100000,'Unbounded test advance');
    }
  };
  t.until=(predicate,label,max=1200,step=.25)=>{let elapsed=0;while(!predicate()){t.tick(step,step);elapsed+=step;check(elapsed<=max,label+' timed out');}return elapsed;};
  t.ship=()=>nativeNpcLives.find(nativeNpcDev.getState(),2);
  t.sample=()=>{const s=nativeNpcDev.getState(),ship=t.ship();return copy({id:ship.id,name:ship.name,system:ship.system,
    task:ship.task,journey:ship.journey,position:nativeNpcLives.galaxyPosition(s,ship),cargo:ship.cargo,credits:ship.credits,
    hull:ship.hull,shields:ship.shields,equipment:ship.weaponLoadout,events:ship.recentEvents,nextActionAt:ship.nextActionAt});};
  t.stocks=()=>{const s=nativeNpcDev.getState(),ship=t.ship(),task=ship.task,source=nativeNpcLives.market(s,task.origin.system,task.origin.port),destination=nativeNpcLives.market(s,task.destination.system,task.destination.port),g=task.requirements.good;
    return {source:source.stock[g],destination:destination.stock[g],sourceCredits:source.credits,destinationCredits:destination.credits,reserved:source.reserved[g],shipCredits:ship.credits};};
  t.checkMap=()=>{const s=nativeNpcDev.getState(),ship=t.ship(),expected=nativeNpcLives.galaxyPosition(s,ship),snapshot=nativeGalaxyOverview.snapshot(s),row=snapshot.ships.find(row=>row.id===ship.id);
    check(row,'Selected ship missing from map');near(row.position.x,expected.x,'Map galaxy X');near(row.position.y,expected.y,'Map galaxy Y');
    if(ship.task?.requirements?.good!==undefined){const stock=t.stocks();near(row.tradeStock.origin.tons,stock.source,'Inspector source inventory');near(row.tradeStock.destination.tons,stock.destination,'Inspector destination inventory');}
    return copy(row);};
  t.drawLocal=()=>{
    const s=nativeNpcDev.getState(),ship=t.ship(),point=nativeNpcLives.galaxyPosition(s,ship),anchor=nativeManualFlight.anchor(s.system),effects=nativeShipEffects,painted=[];
    window.nativeShipEffects={...effects,paintShip(ctx,descriptor,...args){if(descriptor.id===ship.id)painted.push({x:descriptor.x,y:descriptor.y});return effects.paintShip(ctx,descriptor,...args);}};
    window.__lifeDraw(window.__lifeFrameTime);window.nativeShipEffects=effects;
    check(painted.length===1,'Locally inspected named ship was not rendered');near(painted[0].x,point.x-anchor.x,'Local painted X');near(painted[0].y,point.y-anchor.y,'Local painted Y');return painted[0];
  };
  return {id:ship.id,preservedEquipment:!!ship.weaponLoadout};
}"""


def main():
    OUTPUT.mkdir(exist_ok=True)
    server = None
    if len(sys.argv)>1:
        base=sys.argv[1].rstrip('/')
    else:
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base=f'http://127.0.0.1:{server.server_port}'
    errors,failed=[],[]
    try:
        with sync_playwright() as playwright:
            channel=os.environ.get('BROWSER_CHANNEL','msedge')
            browser=playwright.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850})
            page.add_init_script("""(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>{if(callback.name==='draw')window.__lifeDraw=callback;return raf(timestamp=>{if(callback.name==='draw'){if(window.__freezeLifeFrames)return;window.__lifeFrameTime=timestamp;}return callback(timestamp);});};})()""")
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('response',lambda response:failed.append(response.url) if response.status>=400 else None)
            page.goto(base+'/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('startNativeDevGame()')
            page.evaluate("nativeShipEffects.prepare(47,'civilian')")
            page.wait_for_function("()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length && nativeShipEffects.ready(47,'civilian')",timeout=120000)
            # Let the queued frame finish. All following advances call the same
            # simulation modules as the host without depending on rendering.
            page.evaluate('()=>{window.__freezeLifeFrames=true;window.requestAnimationFrame=()=>0;}')
            page.wait_for_timeout(100)
            fixture=page.evaluate(HELPERS)
            page.locator('#devToolsBtn').click()
            page.locator('#dev-freighter-life-button').click()
            page.evaluate('()=>nativeGalaxyOverview.snapshot(nativeNpcDev.getState())')
            page.locator('#dev-galaxy-ships [data-search]').fill('ISS Meridian')
            page.locator('#dev-galaxy-ships [data-ship-id="2"]').click()
            page.locator('#dev-galaxy-ships [data-track]').click()
            if page.evaluate('nativeGalaxyOverview.snapshot(nativeNpcDev.getState()).trackedId') != 2:
                page.locator('#dev-galaxy-ships [data-track]').click()
            before=page.evaluate(r"""()=>{
              const t=__lifeTest,s=nativeNpcDev.getState(),ship=t.ship();t.check(ship.name==='ISS Meridian','Demo did not select the named existing freighter');
              t.check(nativeGalaxyOverview.snapshot(s).trackedId===2,'UI tracking failed');
              const stocks=t.stocks();t.check(stocks.reserved===ship.task.requirements.tons,'Loading did not reserve stock');
              t.initial=t.sample();t.initialStocks=stocks;t.checkMap();return {ship:t.initial,stocks};
            }""")
            # Inspecting locally uses the actual Dev button and must preserve the
            # entire NPC task/pose/cargo/equipment before simulation resumes.
            page.locator('#dev-galaxy-ships [data-visit]').click()
            local_loading=page.evaluate('()=>__lifeTest.drawLocal()')
            page.screenshot(path=str(OUTPUT/'npc-life-loading-local.png'))
            page.evaluate(r"""()=>{
              const t=__lifeTest;t.check(JSON.stringify(t.sample())===JSON.stringify(t.initial),'Local visit mutated NPC life');
              const s=nativeNpcDev.getState(),ship=t.ship(),player=vexedSolFlight.shipPosition(s);
              t.check(Math.hypot(player.x-ship.x,player.y-ship.y)<1000,'Dev visit did not place observer locally');
              t.until(()=>!!t.ship().journey,'Freighter loading');
              const stocks=t.stocks(),tons=t.ship().task.requirements.tons;
              t.near(stocks.source,t.initialStocks.source-tons,'Source stock withdrawal');
              t.check(stocks.reserved===0,'Loaded goods kept a reservation');
              t.check(t.ship().cargo?.tons===tons,'Loaded cargo missing');
              t.check(stocks.shipCredits<t.initialStocks.shipCredits,'Purchase did not debit ship credits');
              t.tick(t.ship().journey.duration*.45);t.mid=t.sample();t.midStocks=t.stocks();
              t.saved=JSON.stringify(s);localStorage.setItem('broken-mirror-native-save',t.saved);
            }""")
            # Reload the actual page and Continue, preserving browser save data.
            saved=page.evaluate('({state:__lifeTest.saved,mid:__lifeTest.mid,stocks:__lifeTest.midStocks,initial:__lifeTest.initial,initialStocks:__lifeTest.initialStocks,fixture:__lifeTest.fixture})')
            page.reload()
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('()=>{window.__freezeLifeFrames=true;window.requestAnimationFrame=()=>0;}')
            page.wait_for_timeout(100)
            page.locator('[data-menu="continue"]').click()
            restored=page.evaluate('(saved)=>{const state=nativeNpcDev.getState(),ship=nativeNpcLives.find(state,2);return {id:ship.id,name:ship.name,task:ship.task,journey:ship.journey,position:nativeNpcLives.galaxyPosition(state,ship),cargo:ship.cargo,credits:ship.credits,equipment:ship.weaponLoadout};}',saved)
            for field in ['id','name','task','journey','position','cargo','credits','equipment']:
                assert restored[field]==saved['mid'][field],(field,restored[field],saved['mid'][field])
            # Reinstall helpers without changing restored state.
            page.evaluate('(saved)=>{window.__savedLife=saved;}',saved)
            # HELPERS builds one fresh fixture; restore the actual resumed save
            # after installing its deterministic stepping functions.
            page.evaluate(HELPERS)
            page.evaluate('()=>{const t=__lifeTest,s=__savedLife;t.activate(JSON.parse(s.state));Object.assign(t,{mid:s.mid,midStocks:s.stocks,initial:s.initial,initialStocks:s.initialStocks,fixture:s.fixture});}')
            page.evaluate('nativeNpcDev.showMap()')
            page.evaluate('()=>{nativeGalaxyOverview.select(2);nativeGalaxyOverview.track(2);__lifeTest.checkMap();}')
            # Paint actual map Canvas at each controlled checkpoint.
            def paint_map():
                page.evaluate('()=>{const canvas=document.querySelector("#space"),view=nativeView.measure(canvas);nativeGalaxyOverview.paint(canvas.getContext("2d"),view,nativeNpcDev.getState());}')
            paint_map()
            page.screenshot(path=str(OUTPUT/'npc-life-midjourney-map.png'))
            result=page.evaluate(r"""()=>{
              const t=__lifeTest,s=nativeNpcDev.getState(),ship=t.ship(),mid=t.sample();t.checkMap();
              const metricsBefore=nativeNpcLives.metrics(s);const preserved=JSON.stringify(t.sample());
              nativeNpcDev.visit(2);t.check(JSON.stringify(t.sample())===preserved,'Visiting transit altered task/cargo/journey');const transitPaint=t.drawLocal();
              nativeNpcDev.showMap();t.checkMap();
              // Leave the destination; completion depends on scheduled deadlines.
              s.system=4;s.x=0;s.y=0;const taskId=ship.task.id;
              t.until(()=>t.ship().system===2,'Arrival while observer elsewhere',1200,.5);
              t.check(ship.task.phase==='approaching','Arrival skipped actual destination approach');
              const arrival=t.sample();t.checkMap();
              nativeNpcDev.visit(2);t.check(ship.task.id===taskId,'Inspecting arrival reset its task');const arrivalPaint=t.drawLocal();
              t.until(()=>ship.task.id===taskId&&ship.task.phase==='unloading','Docking',1200,.25);
              const docked=t.sample();t.check(!!ship.cargo,'Cargo unloaded before handling completed');
              t.until(()=>ship.task.id===taskId&&ship.task.status==='completed','Delivery completion',20,.25);
              const delivered=t.sample(),stocks=t.stocks(),tons=ship.task.deliveredTons;
              t.near(stocks.destination,t.initialStocks.destination+tons,'Destination inventory transfer');
              t.check(ship.deliveries===1&&!ship.cargo,'Delivery was duplicated or cargo retained');
              t.check(delivered.events.some(event=>event.kind==='docked')&&delivered.events.some(event=>event.kind==='delivered'),'Missing useful life events');
              t.check(stocks.shipCredits>t.midStocks.shipCredits,'Delivery payment missing');
              const noStep=JSON.stringify({stocks:t.stocks(),deliveries:ship.deliveries,task:ship.task});
              for(let i=0;i<10;i++)nativeCivilianTraffic.advance(s,.1);
              t.check(JSON.stringify({stocks:t.stocks(),deliveries:ship.deliveries,task:ship.task})===noStep,'Repeated deadline duplicated transfer');
              return {mid,arrival,docked,delivered,stocks,transitPaint,arrivalPaint,sourceProductionDuringJourney:stocks.source-(t.initialStocks.source-tons),metricsBefore,metricsAfter:nativeNpcLives.metrics(s),
                realPageReload:true,taskPreservedByLocalVisit:true,mapMatchesAuthoritativePosition:true,deliveredWhileObserverElsewhere:true,deliveryExactlyOnce:true};
            }""")
            paint_map()
            page.screenshot(path=str(OUTPUT/'npc-life-delivered-map.png'))
            # Repeat the same named freight loop, observing only lightweight map
            # markers, with the player remaining in an unrelated system.
            page.evaluate('()=>__lifeTest.activate(__lifeTest.fixture)')
            page.locator('#devToolsBtn').click()
            page.locator('#dev-freighter-life-button').click()
            remote=page.evaluate(r"""()=>{
              const t=__lifeTest,s=nativeNpcDev.getState(),ship=t.ship(),initial=t.stocks(),id=ship.task.id;
              s.system=4;s.x=0;s.y=0;nativeNpcDev.showMap();nativeGalaxyOverview.snapshot(s);nativeGalaxyOverview.select(2);nativeGalaxyOverview.track(2);
              const effects=nativeShipEffects;let artworkPreparations=0,artworkDraws=0;
              window.nativeShipEffects={...effects,prepare(...args){artworkPreparations++;return effects.prepare(...args);},paintShip(...args){artworkDraws++;return effects.paintShip(...args);}};
              const canvas=document.querySelector('#space'),view=nativeView.measure(canvas),checkpoints=[];
              const draw=()=>{nativeGalaxyOverview.paint(canvas.getContext('2d'),view,s);checkpoints.push(t.checkMap());};
              draw();t.until(()=>!!ship.journey,'Map-only loading');t.tick(ship.journey.duration*.5);draw();
              t.until(()=>ship.system===2,'Map-only arrival',1200,.5);draw();
              t.until(()=>ship.task.id===id&&ship.task.status==='completed','Map-only delivery',1200,.5);draw();
              const final=t.stocks(),sample=t.sample(),before=JSON.stringify({sample,stocks:final,clock:nativeSimulation.seconds(s)});
              for(let i=0;i<20;i++)nativeGalaxyOverview.paint(canvas.getContext('2d'),view,s);
              t.check(JSON.stringify({sample:t.sample(),stocks:t.stocks(),clock:nativeSimulation.seconds(s)})===before,'Map rendering mutated gameplay');
              t.check(artworkPreparations===0&&artworkDraws===0,'Map triggered detailed ship artwork');
              t.check(s.system===4,'Map-only observation moved the player');t.check(ship.deliveries===1,'Map-only delivery duplicated');
              t.check(final.destination-initial.destination===ship.task.deliveredTons,'Map-only inventory transfer incorrect');
              window.nativeShipEffects=effects;
              return {initial,final,ship:sample,checkpoints,artworkPreparations,artworkDraws,observerSystem:s.system,mapRenderingPure:true};
            }""")
            assert remote['final']['destination']-remote['initial']['destination']==result['stocks']['destination']-before['stocks']['destination']
            assert remote['ship']['credits']==result['delivered']['credits']
            paint_map()
            page.screenshot(path=str(OUTPUT/'npc-life-map-only-delivery.png'))
            cleanup=page.evaluate(r"""()=>{
              const t=__lifeTest;
              let s=t.activate(t.fixture),ship=t.ship(),source=nativeNpcLives.market(s,1,3),stock=source.stock[5];
              t.check(nativeNpcLives.startDelivery(s,2,{fromSystem:1,fromPort:3,toSystem:2,toPort:0,good:5,tons:4}).ok,'Reservation fixture failed');
              nativeNpcLives.interrupt(s,ship,'disabled');t.check(source.reserved[5]===0&&source.stock[5]===stock,'Interrupted reservation leaked or removed stock');
              t.check(ship.task.status==='failed','Disabled task remained active');
              s=t.activate(t.fixture);ship=t.ship();nativeNpcLives.startDelivery(s,2,{fromSystem:1,fromPort:3,toSystem:2,toPort:0,good:5,tons:4});
              t.until(()=>!!ship.cargo,'Interruption loaded cargo');const loaded=ship.cargo.tons;
              nativeNpcLives.interrupt(s,ship,'disabled');t.check(ship.cargo.tons===loaded,'Disabled ship lost owned cargo');
              nativeNpcLives.interrupt(s,ship,'destroyed');t.check(ship.cargo===null&&s.civilianTraffic.life.strandedCargo.at(-1).cargo.tons===loaded,'Destroyed cargo disposition missing');
              // A real existing asteroid uses the shared entitlement completion.
              s=t.copy(t.fixture);ship=s.civilianTraffic.ships[0];ship.role='mining';ship.timer=0;ship.nextActionAt=0;delete ship.task;delete ship.lifeVersion;delete ship.lifeScheduleToken;
              s=t.activate(s);ship=t.ship();t.until(()=>ship.task?.kind==='mining','Mining task selection',30,.25);
              const rockId=ship.task.requirements.rockId;t.until(()=>ship.task?.phase==='collecting','Mining transport',1200,.5);
              t.check(!ship.cargo,'Ore awarded before transport');t.tick(nativeAsteroidCombat.miningTiming.transportSeconds*.25);t.check(!ship.cargo,'Transport completed early');
              t.until(()=>ship.task?.minedAt!==undefined,'Mining entitlement',1200,.5);
              const ore=ship.task.minedTons,claimed=(s.minedAsteroids||[]).filter(id=>id===rockId).length;
              t.check(ore>0&&claimed===1,'Mining did not consume one real resource claim');
              const again=nativeAsteroidCombat.completeMining(s,rockId);t.check(!again.ok,'Mining entitlement awarded twice');
              const oreBefore=ship.cargo.tons;for(let i=0;i<10;i++)nativeCivilianTraffic.advance(s,.01);
              t.check(ship.cargo.tons===oreBefore,'Repeated mining deadline duplicated cargo');
              const timestamp=nativeSimulation.seconds(s),task=JSON.stringify(ship.task);nativePause.open();
              nativeSimulation.advance(s,100);nativeCivilianTraffic.advance(s,100);t.check(nativeSimulation.seconds(s)===timestamp&&JSON.stringify(ship.task)===task,'Pause advanced a life');nativePause.close();
              s=t.copy(t.fixture);ship=s.civilianTraffic.ships[0];const definition=nativeShipDefinitions.forEntity(s,ship,{category:'civilian'});
              ship.hull=definition.hull*.6;ship.shields=0;ship.credits=100;ship.timer=0;delete ship.task;delete ship.lifeVersion;delete ship.lifeScheduleToken;
              s=t.activate(s);ship=t.ship();t.until(()=>ship.task?.kind==='repair','Paid repair selection',30,.25);
              const cost=ship.task.requirements.cost,credits=ship.credits;t.check(cost>0&&credits===100-cost,'Repair did not debit owned credits');
              t.until(()=>ship.task.status==='completed','Paid repair completion',30,.25);t.check(ship.hull===definition.hull&&ship.shields===definition.shields,'Paid repair did not restore promised condition');
              t.check(ship.credits===credits,'Repair charged more than once');
              return {reservationReleased:true,disabledCargoRetained:true,destroyedCargoRecorded:true,minedRockId:rockId,minedTons:ore,miningExactlyOnce:true,transportDelayPreserved:true,pauseFreezesJobs:true,paidRepairOnce:true};
            }""")
            result.update(mapOnlyRepeat=remote,interruptionsAndMining=cleanup)
            result.update(fixture=fixture,initial=before,loadingLocalPaint=local_loading,passed=not errors and not failed,javascriptErrors=errors,failedResponses=failed)
            (OUTPUT/'browser-npc-lives.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
            assert not errors,errors
            assert not failed,failed
            print(json.dumps({'passed':result['passed'],'namedShip':result['delivered']['name'],
                              'deliveryTons':result['delivered']['task']['deliveredTons'],
                              'realPageReload':True,'mapOnlyRepeat':True,'localCanvasPositions':True,
                              'interruptionsAndMining':cleanup,'javascriptErrors':errors,'failedResponses':failed},indent=2))
            browser.close()
    finally:
        if server:
            server.shutdown()


if __name__=='__main__':
    main()
