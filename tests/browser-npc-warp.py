"""Full-fleet NPC departure images, indexed flashes, camera/zoom and pure rendering. No FPS claim."""
import base64,functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/npc-warp';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[];failed=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}));page=browser.new_page(viewport={'width':1280,'height':850})
        page.add_init_script("""(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>{if(fn.name==='draw')window.__npcDraw=fn;return raf(t=>{if(fn.name==='draw'){if(window.__freezeNpcDraw)return;window.__npcStamp=t;}fn(t);});};})()""")
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:failed.append(r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html');page.wait_for_function('()=>nativeCombatShots.isReady()&&document.querySelector("#startup").hidden',timeout=120000)
        page.locator('[data-menu="dev"]').click();page.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships?.length===1200',timeout=120000)
        setup=page.evaluate('''async()=>{
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();window.__freezeNpcDraw=true;
          const s=nativeNpcDev.getState(),ships=s.civilianTraffic.ships,types=[58,...new Set(ships.map(e=>e.shipType).filter(t=>t!==58))].slice(0,4),selected=new Set();window.__npcActors=types.map(type=>{const a=ships.find(e=>e.shipType===type&&!selected.has(e.id));if(!a)throw Error('Missing real fleet class '+type);selected.add(a.id);return a;});
          Object.assign(s,{system:1,x:5000,y:5000,landed:false,localCruise:null,arrivalApproach:null});nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);
          const at=nativeSimulation.seconds(s),anchor=nativeManualFlight.anchor(1);window.__npcAnchor=anchor;
          for(const [i,a] of __npcActors.entries()){
            nativeNpcLives.interrupt(s,a,'Warp appearance fixture');nativePortDocking.release(s,a);nativeShipMotion.stop(a);delete a.localLeg;delete a.travelResume;
            Object.assign(a,{system:1,x:5000-180+i*120,y:5060,phase:'warp',nextActionAt:at+10000});
            if(i===3){a.journey=null;a.warpVisual={kind:'departure',elapsedMs:200,angle:0};}
            else{const from={x:anchor.x+a.x,y:anchor.y+a.y};a.journey={version:1,origin:1,destination:4,route:[1,4],departedAt:at-.2,duration:30,arrivalAt:at+29.8,from:{x:a.x,y:a.y},to:{x:0,y:0},galaxyFrom:from,galaxyTo:{x:from.x,y:from.y-100000},distance:100000,speed:100000/30};}
            nativeNpcLives.refreshLocation(s,a);await vexedFlightAssets.loadShip(a.shipType,a.hull*nativeShipDefinitions.get(a.shipType).hull/nativeShipDefinitions.forEntity(s,a,{category:'civilian'}).hull);
          }
          window.__npcBodies=[];window.__npcLights=[];const effects=nativeShipEffects;window.nativeShipEffects={...effects,paintShip(ctx,d,v){if(__npcActors.includes(d.entity))__npcBodies.push({id:d.entity.id,type:d.shipType,effect:v.warpEffect});return effects.paintShip(ctx,d,v);}};
          const assets=vexedFlightAssets;window.vexedFlightAssets={...assets,drawWarpFlash(ctx,f){assets.drawWarpFlash(ctx,f);if(f){const m=ctx.getTransform(),x=Math.round(m.a*f.x+m.c*f.y+m.e),y=Math.round(m.b*f.x+m.d*f.y+m.f);__npcLights.push({...f,pixel:x>=0&&y>=0&&x<ctx.canvas.width&&y<ctx.canvas.height?Array.from(ctx.getImageData(x,y,1,1).data):null});}}};
          window.__npcFrame=elapsed=>{
            for(const a of __npcActors){if(a.journey)a.journey.departedAt=nativeSimulation.seconds(s)-elapsed/1000;else a.warpVisual.elapsedMs=elapsed;nativeNpcLives.refreshLocation(s,a);}
            __npcBodies.length=__npcLights.length=0;const before=JSON.stringify(s);__npcDraw(__npcStamp);if(JSON.stringify(s)!==before)throw Error('Drawing changed saved NPC jobs or cargo');
            return {bodies:__npcBodies,flashes:__npcLights,clock:nativeSimulation.seconds(s)};
          };
          return {population:ships.length,actors:__npcActors.map(a=>({id:a.id,type:a.shipType,role:a.role,cargo:a.cargo}))};
        }''')
        first=page.evaluate('__npcFrame(200)');assert len(first['bodies'])==4 and not first['flashes'],first
        assert all(b['effect']['kind']=='departure' and b['effect']['nacelleCharge']==1 and b['effect']['alpha']>.9 for b in first['bodies'])
        raw=page.evaluate('document.querySelector("#space").toDataURL().split(",")[1]');(OUT/'departing.png').write_bytes(base64.b64decode(raw))
        flash=page.evaluate('__npcFrame(650)');assert not flash['bodies'] and len(flash['flashes'])==4,flash
        assert all(f['pixel'] and min(f['pixel'][:3])>220 for f in flash['flashes']),flash
        raw=page.evaluate('document.querySelector("#space").toDataURL().split(",")[1]');(OUT/'four-flashes.png').write_bytes(base64.b64decode(raw))
        paused=page.evaluate('''()=>{nativePause.open();const before=JSON.stringify(nativeNpcDev.getState());__npcBodies.length=__npcLights.length=0;__npcDraw(__npcStamp);if(JSON.stringify(nativeNpcDev.getState())!==before)throw Error('Paused painting mutated the fleet');return __npcLights;}''');assert paused==flash['flashes'],(paused,flash)
        page.locator('#pause-menu [data-resume]').click()
        later=page.evaluate('__npcFrame(1200)');assert not later['bodies'] and not later['flashes'],later
        assert page.evaluate('nativeNpcDev.getState().civilianTraffic.ships.length')==setup['population']==1200
        recovery=page.evaluate('''()=>{
          const s=nativeNpcDev.getState(),a=__npcActors[3],legs=a.legs;
          nativeNpcLives.interrupt(s,a,'Timed legacy travel regression');nativePortDocking.release(s,a);nativeShipMotion.stop(a);
          delete a.journey;delete a.travelResume;delete a.localLeg;
          Object.assign(a,{system:1,x:5000,y:5060,scriptedDemo:'mining',phase:'warp',destinationSystem:2,timer:2.5,warpDuration:2.5,
            warpVisual:{kind:'departure',elapsedMs:0,angle:Math.PI/2}});
          nativeNpcLives.refreshLocation(s,a);nativeCivilianTraffic.select(a.id);
          if(nativeCivilianTraffic.target(s)||nativeShipSystems.resolve(s,a.id))throw Error('Departing hull still has a tactical target');
          function step(count){
            window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();
            for(let i=0;i<count;i++){nativeSimulation.advance(s,1/60);nativeCivilianTraffic.advance(s,1/60);}
            window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          }
          function frame(){__npcBodies.length=__npcLights.length=0;__npcDraw(__npcStamp);return {bodies:__npcBodies.filter(b=>b.id===a.id),flashes:__npcLights.slice()};}
          step(24);const elapsed=a.warpVisual?.elapsedMs,moving=frame();
          if(!(elapsed>390&&moving.bodies[0]?.effect.alpha>0&&moving.bodies[0].effect.shipX>a.x+10))throw Error('Departure remained frozen');
          step(15);const flash=frame();
          if(flash.bodies.length||!flash.flashes.some(f=>f.pixel&&Math.min(...f.pixel.slice(0,3))>220))throw Error('Departure did not produce a visible flash: '+JSON.stringify({elapsed:a.warpVisual?.elapsedMs,flash}));
          step(117);if(a.system!==2||a.phase!=='arriving')throw Error('Legacy warp did not reach arrival');
          Object.assign(s,{system:2,x:a.x+50,y:a.y,phase:'flight',landed:false});nativeShipMotion.stop(s);nativeManualFlight.initializeRegion(s);nativeShipSystems.invalidate(s);
          step(43);
          if(a.phase!=='docked'||a.warpVisual||a.legs!==legs+1)throw Error('Arrival remained frozen');
          const target=nativeShipSystems.resolve(s,a.id);
          if(target?.entity!==a||nativeCivilianTraffic.target(s)!==a)throw Error('Arrived ship is still untargetable');
          // Exercise the real contact dispatcher after arrival, rather than
          // granting a collision body to a visual that is still in warp.
          Object.assign(s,{x:a.x+1,y:a.y,previousX:a.x+1,previousY:a.y});
          nativeShipSystems.refreshShip(s,s,'player');nativeShipSystems.refreshShip(s,a,'civilian');
          const before=Math.hypot(s.x-a.x,s.y-a.y);
          window.nativeSimulation={...nativeSimulation,blocked:()=>false};nativeSimulationHost.checkpoint();
          nativeShipTraffic.collide(s,1/60);
          window.nativeSimulation={...nativeSimulation,blocked:()=>true};nativeSimulationHost.checkpoint();
          const separation=Math.hypot(s.x-a.x,s.y-a.y);
          if(!(separation>before+1))throw Error('Player still passes through the arrived hull');
          return {elapsed,visibleDepartureFlash:true,completedArrival:true,targetRestored:true,collisionSeparation:separation,beforeSeparation:before};
        }''')
        assert not errors and not failed,(errors,failed)
        report={'passed':True,**setup,'simultaneousFlashes':4,'sameSharedDeparture':True,'legacyAndScheduledJourneys':True,'pureRendering':True,'pausedFlashFrozen':True,'noReappearanceAtLaunch':True,'travelRecovery':recovery,'javascriptErrors':errors,'failedRequests':failed}
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True);browser.close()
except Exception:
    if 'page' in locals():
        try:page.screenshot(path=str(OUT/'failure.png'))
        except Exception:pass
    raise
finally:server.shutdown();server.server_close()
