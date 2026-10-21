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
        # Exercise a first repair through the real flight loop. Hold optional
        # damage preparation so it cannot hide a missing cold-start body.
        cold=browser.new_page(viewport={'width':1280,'height':850},record_video_dir=str(OUTPUT/'repair-foundation-video'),record_video_size={'width':1280,'height':850})
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
        try:
            cold.wait_for_function('()=>nativeNpcDev.getState().civilianTraffic.ships[0].hull>11 && coldDotDraws>0',timeout=15000)
        except Exception:
            debug=cold.evaluate('()=>({state:nativeNpcDev.getState(),bodyDraws:coldDotDraws,repair:nativeRepairVisuals.snapshot(nativeNpcDev.getState()),frame:nativeSimulationFrame.snapshot(nativeNpcDev.getState())})')
            (OUTPUT/'repair-cold-debug.json').write_text(json.dumps({'debug':debug,'errors':errors},indent=2),encoding='utf-8')
            cold.locator('#space').screenshot(path=str(OUTPUT/'repair-cold-failure.png'))
            raise
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
        # Exercise the authoritative flight loop, rather than moving only the
        # drawn sprite: shared collision drift and spin move the casualty while
        # its owned craft must stay near the current work surfaces.
        cold.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),e=s.civilianTraffic.ships[0];
          window.repairTrackingStart={x:e.x,y:e.y,heading:e.heading,ids:e.repairBay.slots.map(d=>d.id),hull:e.hull,consumed:s.shipRepairs.ledger.consumed};
          e.motionKick={version:1,mode:'free',vx:4,vy:1};e.vx=4;e.vy=1;e.speed=Math.hypot(4,1);
          e.motionSpin={version:1,mode:'free',velocity:.7};nativeShipSystems.refreshShip(s,e,'civilian',e.system);
        }""")
        cold.wait_for_timeout(1700)
        cold_result['tracking']=cold.evaluate(r"""()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},s=nativeNpcDev.getState(),e=s.civilianTraffic.ships[0],before=repairTrackingStart,target=nativeShipDefinitions.describe(s,e,{category:'civilian'});
          const dots=nativeShipRepairs.drones(s,e.system).filter(d=>d.entity.phase==='repairing');
          check(Math.hypot(e.x-before.x,e.y-before.y)>2,'Casualty did not drift in the actual flight loop');
          check(Math.abs(nativeShipMotion.wrap(e.heading-before.heading))>.05,'Casualty did not rotate in the actual flight loop');
          check(dots.length>0,'No active craft during moving-hull repair');
          const distances=dots.map(d=>{const p=nativeShipRepairs.workPoint(target,d.entity);return Math.hypot(d.x-p.x,d.y-p.y);});
          check(distances.every(d=>d<6),'Repair craft remained behind while the target moved');
          check(JSON.stringify(e.repairBay.slots.map(d=>d.id))===JSON.stringify(before.ids),'Repair replaced owned craft');
          check(e.hull>before.hull&&s.shipRepairs.ledger.consumed>before.consumed,'Moving repair did not use real hull/material accounting');
          return {movement:Math.hypot(e.x-before.x,e.y-before.y),rotation:nativeShipMotion.wrap(e.heading-before.heading),working:dots.length,contactDistances:distances,ids:before.ids};
        }""")
        cold.locator('#space').screenshot(path=str(OUTPUT/'drifting-hull-repair-gameplay.png'))
        cold.evaluate("()=>document.querySelector('iframe').contentWindow.releaseDotPreparation()")
        cold.wait_for_function("()=>document.querySelector('iframe').contentWindow.droneSprites.inspect('basic').lamps.length>0")
        cold.wait_for_function("()=>nativeShipRepairs.drones(nativeNpcDev.getState(),47).some(d=>d.entity.phase==='returning')",timeout=45000)
        cold.locator('#space').screenshot(path=str(OUTPUT/'returning-repair-bay-gameplay.png'))
        cold.wait_for_function("()=>nativeNpcDev.getState().shipRepairs.missions.some(m=>m.status==='completed') && nativeShipRepairs.drones(nativeNpcDev.getState(),47).length===0",timeout=15000)
        cold_result['recovered']=cold.evaluate(r"""()=>{
          const s=nativeNpcDev.getState(),e=s.civilianTraffic.ships[0],m=s.shipRepairs.missions.find(m=>m.status==='completed'),d=e.repairBay.slots[0],max=nativeShipDefinitions.forEntity(s,e,{category:'civilian'}).hull;
          if(e.phase==='disabled'||d.phase!=='stowed'||Math.abs(m.restoredHull-(max-m.startHull))>1e-6||Math.abs(m.restoredHull-m.spent*5)>1e-6)throw Error('Actual flight-loop repair/recovery lost accounting or equipment');
          return {phase:e.phase,hull:e.hull,maximum:max,drone:d.id,condition:d.hull,readyAt:d.readyAt,restored:m.restoredHull,spent:m.spent,missionStatus:m.status};
        }""")
        cold.locator('#space').screenshot(path=str(OUTPUT/'recovered-repair-bay-gameplay.png'))
        cold_video=cold.video;cold.close();cold_video.save_as(str(OUTPUT/'drifting-hull-repair-gameplay.webm'))
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
          const referenceScale=nativeShipDefinitions.get(nativeShipRepairs.rules.basicType,'repair-drone').artwork.scale;
          let tries=0;while(!nativeShipRepairs.drones(s,1).some(d=>d.entity.phase==='repairing')){tick(.1);check(tries++<200,'Drone approach stalled');}
          const before=JSON.stringify(s),contacts=[];
          const draw=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);nativeShipEffects.paintShip(ctx,nativeShipDefinitions.describe(s,e,{category:'civilian'}),view);nativeRepairVisuals.paint(s,ctx,view);};
          for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const zoom of [.7,1,1.7]){
            const d=e.repairBay.slots[0];d.heading=heading;view.zoom=zoom;
            const described=nativeShipRepairs.drones(s,1).find(t=>t.id===d.id),b=nativeRepairVisuals.beam(s,described);
            near(described.dimensions.width,3.5,'Maintenance DOT size');check(described.dimensions.height<nativeShipDefinitions.dimensions({shipType:18},'civilian').height,'Repair DOT is not smaller than a Runabout');
            near(described.hullRadii.rx,sourceExtent*referenceScale*.34,'Scaled physical hull');
            const extents=[],drawImage=ctx.drawImage;
            ctx.drawImage=function(image,...args){const m=this.getTransform();extents.push(Math.hypot(m.a,m.b)*image.width);return drawImage.call(this,image,...args);};
            try{nativeRepairVisuals.drawDrone(ctx,described,view);}finally{ctx.drawImage=drawImage;}
            check(extents.length>0,'Missing rendered DOT artwork');near(extents[0],sourceExtent*referenceScale*zoom,'Actual rendered DOT extent');
            const n=sprites.nozzle('basic');
            near(b.from.x,described.x+(n.x*Math.cos(heading)-n.y*Math.sin(heading))*referenceScale,'Nozzle world X');near(b.from.y,described.y+(n.x*Math.sin(heading)+n.y*Math.cos(heading))*referenceScale,'Nozzle world Y');
            draw();const px=Math.round(view.cx+(b.from.x-view.ship.x)*zoom),py=Math.round(view.cy+(b.from.y-view.ship.y)*zoom),pixels=ctx.getImageData(px-2,py-2,5,5).data;
            // At the showcase proportion the zoomed-out beam is subpixel-wide;
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
          const effectBefore=JSON.stringify(nativeRepairVisuals.snapshot(s)),savedBefore=JSON.stringify(s),operations={images:0,gradients:0,paints:0},originals={};
          for(const [name,bucket] of [['drawImage','images'],['createRadialGradient','gradients'],['fill','paints'],['fillRect','paints'],['stroke','paints']]){originals[name]=ctx[name];ctx[name]=function(...args){operations[bucket]++;return originals[name].apply(this,args);};}
          try{for(let i=0;i<10;i++)nativeRepairVisuals.paint(s,ctx,{...view,ship:{x:1e7,y:1e7}});}finally{for(const [name,fn] of Object.entries(originals))ctx[name]=fn;}
          check(Object.values(operations).every(count=>count===0),'Offscreen repair damage/destruction still performed expensive drawing '+JSON.stringify(operations));
          check(JSON.stringify(s)===savedBefore&&JSON.stringify(nativeRepairVisuals.snapshot(s))===effectBefore,'Culling changed saved state or expired effects');
          const edge=assetWindow.droneShowcase.createDestruction();check(edge.emit({tier:'basic',role:'repair',position:{x:-20,y:50},heading:0,scale:referenceScale,time:0}),'Edge explosion did not emit');
          const comparison=()=>Object.assign(document.createElement('canvas'),{width:100,height:100}),full=comparison(),culled=comparison();
          edge.draw(full.getContext('2d'),350);edge.draw(culled.getContext('2d'),350,{visible:(x,y,r)=>nativeEffectVisibility.circle(x,y,r,{w:100,h:100})});
          const a=full.getContext('2d').getImageData(0,0,100,100).data,b=culled.getContext('2d').getImageData(0,0,100,100).data;
          check(a.some(value=>value>0),'Offscreen-origin explosion painted no crossing glow/wave pixels');check(a.every((value,index)=>value===b[index]),'Culling changed partially visible explosion pixels');
          window.__repairProof={s,draw};return {contacts,plates,wreck,explosionLayouts,offscreenEffects:{operations,identicalEdgePixels:true,purePainting:true},missions:s.shipRepairs.missions.length,consumed:s.shipRepairs.ledger.consumed};
        }""")
        result['coldStart']=cold_result
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
          const targetPose=nativeShipDefinitions.describe(s,target,{category:'civilian'}),contactDistances=nativeShipRepairs.drones(s,1).map(d=>{const p=nativeShipRepairs.workPoint(targetPose,d.entity);return Math.hypot(d.x-p.x,d.y-p.y);});
          check(contactDistances.length===6&&contactDistances.every(d=>d<6),'Medical craft do not work close to the actual armor');
          await Promise.all([nativeShipEffects.prepare(58,'civilian'),nativeShipEffects.prepare(52,'civilian')]);
          const canvas=document.querySelector('#repair-browser-proof'),ctx=canvas.getContext('2d'),view={ship:{x:target.x+80,y:target.y},cx:450,cy:300,w:900,h:600,zoom:1.7};
          ctx.fillStyle='#000';ctx.fillRect(0,0,900,600);
          for(const e of [target,medic])nativeShipEffects.paintShip(ctx,nativeShipDefinitions.describe(s,e,{category:'civilian'}),view);
          nativeRepairVisuals.paint(s,ctx,view);ctx.fillStyle='#b5ffe0';ctx.font='18px sans-serif';ctx.fillText('Olympic medical response',24,38);
          const d=nativeShipDefinitions.describe(s,medic,{category:'civilian'});check(nativeShipEffects.asset(d)?.type===58,'Olympic artwork did not load');
          const mx=Math.round(view.cx+(medic.x-view.ship.x)*view.zoom),my=Math.round(view.cy+(medic.y-view.ship.y)*view.zoom),mw=Math.ceil(d.dimensions.width*view.zoom),mh=Math.ceil(d.dimensions.height*view.zoom),painted=ctx.getImageData(mx-Math.ceil(mw/2),my-Math.ceil(mh/2),mw,mh).data;
          let medicalPixels=0;for(let i=0;i<painted.length;i+=4)if(Math.max(painted[i],painted[i+1],painted[i+2])>35)medicalPixels++;
          check(medicalPixels>50,'Ready Olympic artwork was not actually painted');
          return {departure,arrival:medic.lastJourney,working:6,hull:target.hull,medicalReserve:medic.repairDeuranium,inspectorMatches:true,contactDistances,medicalPixels,medic:{x:medic.x,y:medic.y},target:{x:target.x,y:target.y}};
        }""")
        page.locator('#repair-browser-proof').screenshot(path=str(OUTPUT/'live-repair-drones.png'))
        if errors: raise AssertionError(errors)
        (OUTPUT/'browser-ship-repairs.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps({'ok':True,'contacts':len(result['contacts']),'wreck':result['wreck'],'coldStart':cold_result}))
        browser.close()
finally:
    server.shutdown()
