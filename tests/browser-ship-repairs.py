"""Live Dot artwork, rotated nozzle contacts, repair plates and paused rendering."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'
OUTPUT.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args): pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:errors.append(str(r.status)+' '+r.url) if r.status>=400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        page.evaluate('startNativeDevGame()')
        page.wait_for_function('()=>nativeNpcDev.getState() && nativeSolAsteroids.placements.length',timeout=120000)
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(150)
        result=page.evaluate(r"""async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b,m)=>check(Math.abs(a-b)<.001,m+': '+a+' vs '+b);
          const s=JSON.parse(JSON.stringify(nativeNpcDev.getState())),e=s.civilianTraffic.ships.find(e=>e.id===2);
          s.civilianTraffic.ships=[e];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
          s.shipRepairs.missions=[];s.shipRepairs.calls=[];s.shipRepairs.nextPollAt=0;
          s.system=1;s.devMode=false;s.landed=false;Object.assign(e,{x:150,y:120,system:1,phase:'disabled',hull:10,shields:0,repairDeuranium:20,nextActionAt:null,cargo:null,localLeg:null,journey:null});
          e.lifeScheduleToken++;nativeNpcLives.initialize(s).config.economyEnabled=false;nativeShipRepairs.initialize(s);
          const tick=dt=>{nativeSimulation.advance(s,dt);nativeCivilianTraffic.advance(s,dt);};tick(.25);
          const c=document.createElement('canvas');c.width=900;c.height=600;c.id='repair-browser-proof';c.style.cssText='position:fixed;left:15px;top:80px;z-index:100000;background:#000;border:1px solid #456';document.body.append(c);
          const ctx=c.getContext('2d',{willReadFrequently:true}),view={ship:{x:150,y:120},cx:450,cy:300,w:900,h:600,zoom:1};
          const framesBefore=document.querySelectorAll('iframe').length;
          nativeRepairVisuals.paint(s,ctx,{...view,ship:{x:1e7,y:1e7}});
          check(document.querySelectorAll('iframe').length===framesBefore,'Offscreen repair requested artwork');
          await Promise.all([nativeRepairVisuals.ensure(),nativeShipEffects.prepare(47,'civilian')]);
          let tries=0;while(!nativeShipRepairs.drones(s,1).some(d=>d.entity.phase==='repairing')){tick(.1);check(tries++<200,'Drone approach stalled');}
          const before=JSON.stringify(s),contacts=[];
          const draw=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);nativeShipEffects.paintShip(ctx,nativeShipDefinitions.describe(s,e,{category:'civilian'}),view);nativeRepairVisuals.paint(s,ctx,view);};
          for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const zoom of [.7,1,1.7]){
            const d=e.repairBay.slots[0];d.heading=heading;view.zoom=zoom;
            const described=nativeShipRepairs.drones(s,1).find(t=>t.id===d.id),b=nativeRepairVisuals.beam(s,described);
            const n=document.querySelector('iframe').contentWindow.droneSprites.nozzle('basic');
            near(b.from.x,described.x+n.x*Math.cos(heading)-n.y*Math.sin(heading),'Nozzle world X');near(b.from.y,described.y+n.x*Math.sin(heading)+n.y*Math.cos(heading),'Nozzle world Y');
            draw();const px=Math.round(view.cx+(b.from.x-view.ship.x)*zoom),py=Math.round(view.cy+(b.from.y-view.ship.y)*zoom),pixels=ctx.getImageData(px-2,py-2,5,5).data;
            let green=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>pixels[i]+15&&pixels[i+1]>80)green++;
            check(green>0,'No green welding pixels at rotated nozzle');contacts.push({heading,zoom,from:b.from,to:b.to,green});
          }
          // Restore headings changed by this controlled pixel fixture before
          // asserting that ordinary painting cannot alter any saved state.
          const renderState=JSON.stringify(s);for(let i=0;i<25;i++)draw();check(JSON.stringify(s)===renderState,'Rendering changed saved simulation');
          const m=s.shipRepairs.missions[0],assets=[.9,.7,.4,.1].map((ratio)=>({...nativeShipEffects.asset(nativeShipDefinitions.describe(s,{...e,hull:100*ratio},{category:'civilian'}))}));
          const plates=[];for(const progress of [.1,.5,.9]){e.hull=m.startHull+(100-m.startHull)*progress;const d=nativeShipDefinitions.describe(s,e,{category:'civilian'}),a=nativeRepairVisuals.surface(d,assets,assets[3]);check(a.repairSurface,'Missing live hull restoration plate');const pixels=a.art.getContext('2d').getImageData(0,0,a.art.width,a.art.height).data;let hash=0;for(const x of pixels)hash=(hash*31+x)>>>0;plates.push(hash);}
          check(new Set(plates).size===3,'Repair paint did not advance with real hull progress');
          e.hull=JSON.parse(before).civilianTraffic.ships[0].hull;view.zoom=1;draw();
          const paused=JSON.stringify(s);nativePause.open();nativeShipRepairs.advance(s,20);nativeRepairVisuals.advance(s,20);draw();check(JSON.stringify(s)===paused,'Paused repairs consumed material');nativePause.close();
          const d=nativeShipRepairs.drones(s,1)[0];nativeShipSystems.applyHit(s,{target:d,point:{x:d.x,y:d.y},from:{x:d.x-50,y:d.y}},{damage:100,kind:'beam'},{id:'player',system:1});
          tick(.1);draw();const wreck=nativeRepairVisuals.snapshot(s).destruction;check(wreck.wreckCount>0,'Dot destruction omitted actual hull fragments');
          window.__repairProof={s,draw};return {contacts,plates,wreck,missions:s.shipRepairs.missions.length,consumed:s.shipRepairs.ledger.consumed};
        }""")
        result['medical']=page.evaluate(r"""async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          const target=s.civilianTraffic.ships.find(e=>e.id===3),medic=s.civilianTraffic.ships.find(e=>e.shipType===58);
          s.civilianTraffic.ships=[target,medic];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
          s.system=1;s.shipRepairs.calls=[];s.shipRepairs.missions=[];s.shipRepairs.nextPollAt=0;
          for(const e of [target,medic]){e.nextActionAt=null;e.lifeScheduleToken++;e.cargo=null;delete e.localLeg;delete e.journey;}
          Object.assign(target,{system:1,x:2500,y:2500,hull:10,shields:0,phase:'disabled',repairDeuranium:0});Object.assign(medic,{system:2,x:0,y:0,phase:'docked',repairDeuranium:100});
          nativeShipRepairs.initialize(s);nativeNpcLives.initialize(s).config.economyEnabled=false;
          const tick=()=>{nativeSimulation.advance(s,.25);nativeCivilianTraffic.advance(s,.25);};tick();
          check(medic.journey&&medic.system===2,'Olympic skipped physical interstellar travel');
          const departure={system:medic.system,journey:JSON.parse(JSON.stringify(medic.journey))};let steps=0;
          while(medic.repairBay.slots.filter(d=>d.phase==='repairing').length<6){tick();check(steps++<1200,'Olympic failed to reach casualty and deploy six drones');}
          check(medic.system===1&&medic.task.phase==='rescue-service','Medical scheduler did not reach the casualty');
          const inspected=nativeNpcLives.inspect(s,medic.id),position=nativeNpcLives.galaxyPosition(s,medic);check(inspected.galaxy.x===position.x&&inspected.galaxy.y===position.y,'Rescue inspector position drift');
          await Promise.all([nativeShipEffects.prepare(58,'civilian'),nativeShipEffects.prepare(52,'civilian')]);
          const canvas=document.querySelector('#repair-browser-proof'),ctx=canvas.getContext('2d'),view={ship:{x:target.x+80,y:target.y},cx:450,cy:300,w:900,h:600,zoom:1.7};
          ctx.fillStyle='#000';ctx.fillRect(0,0,900,600);
          for(const e of [target,medic])nativeShipEffects.paintShip(ctx,nativeShipDefinitions.describe(s,e,{category:'civilian'}),view);
          nativeRepairVisuals.paint(s,ctx,view);ctx.fillStyle='#b5ffe0';ctx.font='18px sans-serif';ctx.fillText('Olympic medical response',24,38);
          const d=nativeShipDefinitions.describe(s,medic,{category:'civilian'});check(nativeShipEffects.asset(d)?.type===58,'Olympic artwork did not load');
          return {departure,arrival:medic.lastJourney,working:6,hull:target.hull,medicalReserve:medic.repairDeuranium,inspectorMatches:true};
        }""")
        page.locator('#repair-browser-proof').screenshot(path=str(OUTPUT/'live-repair-drones.png'))
        if errors: raise AssertionError(errors)
        (OUTPUT/'browser-ship-repairs.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps({'ok':True,'contacts':len(result['contacts']),'wreck':result['wreck']}))
        browser.close()
finally:
    server.shutdown()
