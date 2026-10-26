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
        # The actual Dev menu starts the rescue without fixture damage or travel.
        demo=browser.new_page(viewport={'width':1280,'height':850})
        demo.on('pageerror',lambda e:errors.append(str(e)))
        demo.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        demo.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        demo.locator('[data-menu="dev"]').click()
        initial_demo=demo.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),d=s.devRepairDemo,target=nativeNpcLives.find(s,d.targetId),medic=nativeNpcLives.find(s,d.medicalId);
          if(target.phase!=='disabled'||target.hull!==d.initialHull||medic.task.kind!=='medical')throw Error('Dev launch did not start its real rescue');
          return {...d,ships:s.civilianTraffic.ships.length};
        }""")
        demo.wait_for_function(r"""()=>{const s=nativeNpcDev.getState(),d=s.devRepairDemo,m=s.shipRepairs.missions.find(m=>m.target.id===d.targetId);return m?.restoredHull>2&&nativeShipRepairs.drones(s,s.system).filter(d=>d.entity.missionId===m.id&&d.entity.phase==='repairing').length===6;}""",timeout=60000)
        demo_result=demo.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),d=s.devRepairDemo,target=nativeNpcLives.find(s,d.targetId),medic=nativeNpcLives.find(s,d.medicalId),origin=nativeShipDefinitions.describe(s),view=nativeView.measure(document.querySelector('#space'));
          for(const e of [target,medic])if(Math.abs(e.x-origin.x)>view.w/2-45||Math.abs(e.y-origin.y)>view.h/2-45)throw Error('Rescue is outside the initial flight view');
          const m=s.shipRepairs.missions.find(m=>m.target.id===target.id),drones=nativeShipRepairs.drones(s,s.system).filter(e=>e.entity.missionId===m.id);
          if(drones.some(e=>e.dimensions.width!==3.5))throw Error('Dev rescue changed DOT scale');
          if(!nativeSaveStorage.write(s).ok)throw Error('Could not save the rescue');
          return {targetId:target.id,medicalId:medic.id,hull:target.hull,working:drones.length,missionStartedAt:m.startedAt,ships:s.civilianTraffic.ships.length};
        }""")
        demo.locator('#space').screenshot(path=str(OUTPUT/'dev-medical-rescue.png'))
        demo.reload()
        demo.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        demo.locator('[data-menu="continue-dev"]').click()
        restored_demo=demo.evaluate(r"""()=>{const s=nativeNpcDev.getState(),d=s.devRepairDemo,m=s.shipRepairs.missions.find(m=>m.target.id===d.targetId);return {targetId:d.targetId,medicalId:d.medicalId,hull:nativeNpcLives.find(s,d.targetId).hull,ships:s.civilianTraffic.ships.length,missionStartedAt:m.startedAt};}""")
        for key in ['targetId','medicalId','ships','missionStartedAt']:
            assert restored_demo[key]==demo_result[key], (key,restored_demo,demo_result)
        assert restored_demo['hull']>=demo_result['hull']>initial_demo['initialHull'], 'Continue Dev replayed the disabled-hull setup'
        demo.close()
        # Exercise a first repair through the real flight loop. Hold optional
        # damage preparation so it cannot hide a missing cold-start body.
        cold=browser.new_page(viewport={'width':1280,'height':850})
        cold.on('pageerror',lambda e:errors.append(str(e)))
        requested=[]
        cold.on('request',lambda r:requested.append(r.url))
        cold_assets=(ROOT/'html-games/flashtrek-broken-mirror/live-repair-assets.html').read_text(encoding='utf-8').replace(
            'window.nativeDamageArtPreparation=parent.nativeDamageArtPreparation;',
            'window.nativeDamageArtPreparation={run:iterator=>new Promise((resolve,reject)=>{window.releaseDotPreparation=()=>parent.nativeDamageArtPreparation.run(iterator).then(resolve,reject);})};')
        cold.route('**/live-repair-assets.html*',lambda route:route.fulfill(content_type='text/html',body=cold_assets))
        cold.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        cold.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
        cold.evaluate('startNativeDevGame()')
        cold.wait_for_function('()=>nativeNpcDev.getState()?.civilianTraffic?.ships.length')
        cold.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),e=s.civilianTraffic.ships.find(e=>e.shipType===23);
          s.system=47;s.landed=false;s.x=1000;s.y=1000;s.speed=0;s.localCruise=null;
          s.civilianTraffic.ships=[e];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
          s.shipRepairs.missions=[];s.shipRepairs.calls=[];s.shipRepairs.nextPollAt=0;
          e.nextActionAt=null;e.lifeScheduleToken++;e.cargo=null;delete e.localLeg;delete e.journey;
          Object.assign(e,{system:47,x:1080,y:1000,shields:0,phase:'docked',repairDeuranium:20});
          const d=nativeShipDefinitions.describe(s,e,{category:'civilian'});
          nativeShipSystems.applyHit(s,{target:d,point:{x:e.x,y:e.y},from:{x:1000,y:1000}},{damage:d.definition.hull*.8,kind:'beam'},{id:'player',system:47});
          window.coldDotDraws=0;const ctx=document.querySelector('#space').getContext('2d'),drawImage=ctx.drawImage;
          ctx.drawImage=function(image,...args){if((image.src||'').includes('/dot-basic.png'))coldDotDraws++;return drawImage.call(this,image,...args);};
        }""")
        cold.wait_for_function('()=>nativeNpcDev.getState().civilianTraffic.ships[0].hull>11 && coldDotDraws>0',timeout=15000)
        cold_result=cold.evaluate(r"""()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},s=nativeNpcDev.getState(),e=s.civilianTraffic.ships[0],d=nativeShipRepairs.drones(s,47)[0];
          const w=document.querySelector('iframe').contentWindow,canvas=document.querySelector('#space'),ctx=canvas.getContext('2d'),view=nativeView.measure(canvas);
          check(d?.entity.phase==='repairing','Sail ship repaired without an active drone');
          check(w.droneSprites.inspect('basic').lamps.length===0,'Optional preparation was not held');
          const x=(view.w/2+d.x-s.x)*canvas.width/view.w,y=(view.h/2+d.y-s.y)*canvas.height/view.h,pixels=ctx.getImageData(Math.round(x)-15,Math.round(y)-15,30,30).data;
          let visible=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>40)visible++;
          check(visible>10,'Missing DOT body pixels in the real flight canvas');
          return {shipType:e.shipType,hull:e.hull,bodyDraws:coldDotDraws,visiblePixels:visible,optionalPreparationHeld:true,droneWidth:d.dimensions.width};
        }""")
        assert not any('/attack-drone-' in url or '/defense-drone-' in url or '/dot-upgraded.png' in url or '/dot-advanced.png' in url for url in requested), 'Live repair loaded unused drone variants'
        cold.locator('#space').screenshot(path=str(OUTPUT/'sail-repair-cold-start.png'))
        cold.evaluate("()=>document.querySelector('iframe').contentWindow.releaseDotPreparation()")
        cold.wait_for_function("()=>document.querySelector('iframe').contentWindow.droneSprites.inspect('basic').lamps.length>0")
        cold.close()
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
          const sprites=document.querySelector('iframe').contentWindow.droneSprites,sourceExtent=1254*sprites.definitions.repair.basic.scale;
          const referenceScale=3.5/sourceExtent;
          let tries=0;while(!nativeShipRepairs.drones(s,1).some(d=>d.entity.phase==='repairing')){tick(.1);check(tries++<200,'Drone approach stalled');}
          const before=JSON.stringify(s),contacts=[];
          const draw=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);nativeShipEffects.paintShip(ctx,nativeShipDefinitions.describe(s,e,{category:'civilian'}),view);nativeRepairVisuals.paint(s,ctx,view);};
          for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const zoom of [.7,1,1.7]){
            const d=e.repairBay.slots[0];d.heading=heading;view.zoom=zoom;
            const described=nativeShipRepairs.drones(s,1).find(t=>t.id===d.id),b=nativeRepairVisuals.beam(s,described);
            near(described.dimensions.width,3.5,'Maintenance DOT width');
            for(const shipType of [7,18]){const shuttle=nativeShipDefinitions.dimensions({shipType},'civilian');check(described.dimensions.width/Math.max(shuttle.width,shuttle.height)<1/3,'DOT is too large beside a shuttle');}
            near(described.hullRadii.rx,sourceExtent*referenceScale*.34,'Scaled physical hull');
            const extents=[],drawImage=ctx.drawImage;
            ctx.drawImage=function(image,...args){const m=this.getTransform();extents.push(Math.hypot(m.a,m.b)*image.width);return drawImage.call(this,image,...args);};
            try{nativeRepairVisuals.drawDrone(ctx,described,view);}finally{ctx.drawImage=drawImage;}
            check(extents.length>0,'Missing rendered DOT artwork');near(extents[0],sourceExtent*referenceScale*zoom,'Actual rendered DOT extent');
            const n=sprites.nozzle('basic');
            near(b.from.x,described.x+(n.x*Math.cos(heading)-n.y*Math.sin(heading))*referenceScale,'Nozzle world X');near(b.from.y,described.y+(n.x*Math.sin(heading)+n.y*Math.cos(heading))*referenceScale,'Nozzle world Y');
            draw();const px=Math.round(view.cx+(b.from.x-view.ship.x)*zoom),py=Math.round(view.cy+(b.from.y-view.ship.y)*zoom),pixels=ctx.getImageData(px-2,py-2,5,5).data;
            // At maintenance-drone size the zoomed-out beam is subpixel-wide;
            // antialiasing lowers brightness while preserving its green tint.
            let green=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>pixels[i]+8&&pixels[i+1]>30)green++;
            check(green>0,'No green welding pixels at rotated nozzle');contacts.push({heading,zoom,from:b.from,to:b.to,green,extent:extents[0],hullRadius:described.hullRadii.rx});
          }
          // Restore headings changed by this controlled pixel fixture before
          // asserting that ordinary painting cannot alter any saved state.
          const renderState=JSON.stringify(s);for(let i=0;i<25;i++)draw();check(JSON.stringify(s)===renderState,'Rendering changed saved simulation');
          const m=s.shipRepairs.missions[0],assets=[.9,.7,.4,.1].map((ratio)=>({...nativeShipEffects.asset(nativeShipDefinitions.describe(s,{...e,hull:100*ratio},{category:'civilian'}))}));
          const plates=[];for(const progress of [.1,.5,.9]){e.hull=m.startHull+(100-m.startHull)*progress;const d=nativeShipDefinitions.describe(s,e,{category:'civilian'}),a=nativeRepairVisuals.surface(d,assets,assets[3]);check(a.repairSurface,'Missing live hull restoration plate');const pixels=a.art.getContext('2d').getImageData(0,0,a.art.width,a.art.height).data;let hash=0;for(const x of pixels)hash=(hash*31+x)>>>0;plates.push(hash);}
          check(new Set(plates).size===3,'Repair paint did not advance with real hull progress');
          e.hull=JSON.parse(before).civilianTraffic.ships[0].hull;view.zoom=1;draw();
          const paused=JSON.stringify(s);nativePause.open();nativeShipRepairs.advance(s,20);nativeRepairVisuals.advance(s,20);draw();check(JSON.stringify(s)===paused,'Paused repairs consumed material');nativePause.close();
          const d=nativeShipRepairs.drones(s,1)[0],assetWindow=document.querySelector('iframe').contentWindow,destruction=assetWindow.cthiaDestruction,explosionLayouts=[];
          assetWindow.cthiaDestruction={...destruction,emitFragments:(...args)=>{explosionLayouts.push({...args[1]});return destruction.emitFragments(...args);}};
          try{nativeShipSystems.applyHit(s,{target:d,point:{x:d.x,y:d.y},from:{x:d.x-50,y:d.y}},{damage:100,kind:'beam'},{id:'player',system:1});}finally{assetWindow.cthiaDestruction=destruction;}
          check(explosionLayouts.length===1,'Missing shared DOT destruction');near(explosionLayouts[0].w,d.dimensions.width,'Wreckage matches scaled DOT width');near(explosionLayouts[0].h,d.dimensions.height,'Wreckage matches scaled DOT height');
          tick(.1);draw();const wreck=nativeRepairVisuals.snapshot(s).destruction;check(wreck.wreckCount>0,'Dot destruction omitted actual hull fragments');
          window.__repairProof={s,draw};return {contacts,plates,wreck,explosionLayouts,missions:s.shipRepairs.missions.length,consumed:s.shipRepairs.ledger.consumed};
        }""")
        result['coldStart']=cold_result
        result['devLaunch']=demo_result
        result['medical']=page.evaluate(r"""async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},s=JSON.parse(JSON.stringify(nativeNpcDev.getState()));
          const target=s.civilianTraffic.ships.find(e=>e.id===3),medic=s.civilianTraffic.ships.find(e=>e.shipType===58&&e.id!==s.devRepairDemo?.medicalId);
          s.civilianTraffic.ships=[target,medic];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
          s.system=1;s.shipRepairs.calls=[];s.shipRepairs.missions=[];s.shipRepairs.nextPollAt=0;
          for(const e of [target,medic]){nativeNpcLives.interrupt(s,e,'Isolated medical browser fixture');delete e.task;e.nextActionAt=null;e.lifeScheduleToken++;e.cargo=null;delete e.localLeg;delete e.journey;}
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
        print(json.dumps({'ok':True,'contacts':len(result['contacts']),'wreck':result['wreck'],'coldStart':cold_result,'devLaunch':demo_result}))
        browser.close()
finally:
    server.shutdown()
