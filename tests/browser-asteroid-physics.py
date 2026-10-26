"""Actual weapon hits, physical hull pushes, contact glints and saved drift."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results'/'asteroid-physics'
OUTPUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=None
if len(sys.argv)>1:
    base=sys.argv[1].rstrip('/')
else:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
errors=[]
try:
    with sync_playwright() as p:
        channel=os.environ.get('BROWSER_CHANNEL','msedge')
        browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
        page=browser.new_page(viewport={'width':1280,'height':850})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/html-games/broken-mirror-port/index.html')
        page.locator('[data-menu="dev"]').click(timeout=30000)
        page.wait_for_function('()=>nativeNpcDev.getState()&&nativeCombatShots.isReady()&&nativeSolAsteroids.placements.length')
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(100)
        report=page.evaluate('''async()=>{
          const check=(v,m)=>{if(!v)throw Error(m);},near=(a,b,m)=>check(Math.abs(a-b)<.01,m+': '+a+' != '+b),clone=v=>JSON.parse(JSON.stringify(v));
          const base=clone(nativeNpcDev.getState()),rockId=nativeSolAsteroids.placements[0].slotId;
          const templates={civilian:clone(base.civilianTraffic.ships[0]),tug:clone(base.solEconomy.freighters[0])};
          function isolated(category){const e=clone(templates[category]);for(const key of ['journey','localLeg','lifeLeg','motionKick','motionSpin','disputeId','retaliationId'])delete e[key];return e;}
          const canvas=document.createElement('canvas');canvas.id='asteroid-physics-output';canvas.width=1100;canvas.height=540;
          canvas.style.cssText='position:fixed;left:10px;top:100px;z-index:100000;background:#050a12';document.body.append(canvas);
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const realFlash=drawShowcaseShieldFlash,flashes=[];
          window.drawShowcaseShieldFlash=(context,image,w,h,flash,...rest)=>{
            if(context===ctx){const p=new DOMPoint(flash.x,flash.y).matrixTransform(context.getTransform());flashes.push({x:p.x,y:p.y});}
            return realFlash(context,image,w,h,flash,...rest);
          };
          const contactPixels=[],arc=ctx.arc.bind(ctx);
          ctx.arc=(x,y,r,...args)=>{if(r>0&&r<=5)contactPixels.push(new DOMPoint(x,y).matrixTransform(ctx.getTransform()));return arc(x,y,r,...args);};
          const shipPaints=[],realDrawShip=vexedFlightAssets.drawShip;
          vexedFlightAssets.drawShip=function(context,asset,x,y,width,angle,time,appearance){
            if(context===ctx)shipPaints.push({x,y,width,angle});return realDrawShip.apply(this,arguments);
          };
          function fresh(){
            nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();nativeAsteroidCombat.clear();
            const s=clone(base);Object.assign(s,{system:1,landed:false,hull:1000,shields:1000,speed:0,vx:0,vy:0,localCruise:null,arrivalApproach:null,x:100000,y:100000});
            delete s.asteroidMotion;s.destroyedAsteroids=[];s.asteroidDamage={};s.asteroidOreDrops={};
            s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
            nativeAsteroidMotion.ensure(s);
            // Exercise a real interpolated presentation pose consistently,
            // independent of the host frame fraction when this fixture loads.
            nativeSimulationFrame.schedule(s).pendingSeconds=1/120;
            s.minedAsteroids=nativeSolAsteroids.forSystem(1).filter(r=>r.slotId!==rockId).map(r=>r.slotId);
            return s;
          }
          function putPlayer(s,x,y){const p=vexedSolFlight.shipPosition(s);s.x+=x-p.x;s.y+=y-p.y;}
          const scenarios=[];
          for(const category of ['player','civilian','tug'])for(const shielded of [true,false]){
            const s=fresh(),r=nativeSolAsteroids.find(rockId);r.maxHull=1000;
            let entity=s;
            if(category!=='player'){entity={...isolated(category),id:9999,system:1,phase:'cruise',hull:1000};if(category==='tug')s.solEconomy.freighters=[entity];else s.civilianTraffic.ships=[entity];}
            Object.assign(entity,{shields:shielded?1000:0,angle:.65,heading:.65,vx:Math.cos(.65)*45,vy:Math.sin(.65)*45,speed:45});
            let d=nativeShipDefinitions.describe(s,entity,{category});
            const distance=d.hullRadii.ry+r.size*.43-.5,n={x:Math.cos(.65),y:Math.sin(.65)},x=r.x-n.x*distance,y=r.y-n.y*distance;
            if(category==='player')putPlayer(s,x,y);else Object.assign(entity,{x,y});
            entity.previousX=x-n.x*5;entity.previousY=y-n.y*5;
            d=nativeShipDefinitions.describe(s,entity,{category});await nativeShipEffects.prepare(d.shipType,category);
            nativeAsteroidMotion.collide(s,.12);
            const saved=s.asteroidMotion.rocks[rockId];check(saved&&Math.hypot(saved.vx,saved.vy)>0,category+' did not push rock');
            check(!s.destroyedAsteroids.includes(rockId),category+' gentle contact destroyed rock');
            check(entity.hull===1000&&entity.shields===(shielded?1000:0),'Contact subtracted ship health');
            d=nativeShipDefinitions.describe(s,entity,{category});const visual=nativeShipEffects.snapshot(d);
            check(!!visual.contact&&!visual.flash,category+' missing local hull contact glint');
            nativeSimulation.advance(s,.06);nativeShipEffects.advance(s,.06);
            const index=scenarios.length,cx=185+(index%3)*360,cy=index<3?150:410;
            let camera={x:d.x+20,y:d.y-15},view={state:s,ship:camera,cx,cy,zoom:1,w:1100,h:540};
            const rockArt=nativeSolAsteroids.image(r.file);await rockArt.decode();
            const rendered=()=>nativeSimulationFrame.renderPose(s,d);
            function paint(){
              nativeSolAsteroids.paint(ctx,{...view,mined:s.minedAsteroids,system:1,damage:s.asteroidDamage});shipPaints.length=0;nativeShipEffects.paintShip(ctx,d,view);nativeShipEffects.paint(s,ctx,view);
              const pose=rendered(),painted=shipPaints.at(-1);check(painted,'Expected actual ship artwork submission');
              near(painted.x,cx+pose.x-camera.x,'Rendered hull center x');near(painted.y,cy+pose.y-camera.y,'Rendered hull center y');near(painted.angle,pose.heading+Math.PI/2,'Rendered hull heading');
            }
            {
              flashes.length=0;contactPixels.length=0;paint();check(flashes.length===0,'Rock contact painted a whole shield');
              const local=visual.contact,world=nativeCombatShots.worldPoint(rendered(),local),p=contactPixels.at(-1);check(p,'Hull glint was not painted');
              near(p.x,cx+world.x-camera.x,'Hull contact pixel x');near(p.y,cy+world.y-camera.y,'Hull contact pixel y');
              camera={x:camera.x+27,y:camera.y-19};view={...view,ship:camera};contactPixels.length=0;paint();
              near(contactPixels.at(-1).x,p.x-27,'Camera movement x');near(contactPixels.at(-1).y,p.y+19,'Camera movement y');
              if(category==='player')entity.angle+=.3;else entity.heading+=.3;d=nativeShipDefinitions.describe(s,entity,{category});
              contactPixels.length=0;paint();const rotated=nativeCombatShots.worldPoint(rendered(),local);
              near(contactPixels.at(-1).x,cx+rotated.x-camera.x,'Rotated contact x');near(contactPixels.at(-1).y,cy+rotated.y-camera.y,'Rotated contact y');
            }
            ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText(category+' / '+(shielded?'shield':'hull'),cx-90,cy+90);
            s.minedAsteroids.push(rockId);nativeEnvironmentalImpacts.reset();
            nativeSimulation.advance(s,.17);nativeShipEffects.advance(s,.17);
            const previousVX=entity.vx,previousParticles=nativeShipEffects.snapshot(d).particles;
            const debris={x:d.x+120,y:d.y,vx:400,vy:0,size:6,system:1};
            nativeEnvironmentalImpacts.debris(s,debris,d.x-120,d.y,{dt:.6,sourceKey:'ship:foreign'});
            check(debris.vx<399||Math.abs(debris.vy)>1,category+' did not deflect debris from '+(shielded?'shield':'hull'));check(entity.vx>previousVX,'Debris did not transfer ship momentum');
            d=nativeShipDefinitions.describe(s,entity,{category});const debrisVisual=nativeShipEffects.snapshot(d);
            check(debrisVisual.contact?.kind==='debris'&&!debrisVisual.flash,'Debris should use a hull glint');contactPixels.length=0;paint();
            const point=nativeCombatShots.worldPoint(rendered(),debrisVisual.contact);near(contactPixels.at(-1).x,cx+point.x-camera.x,'Debris hull pixel x');near(contactPixels.at(-1).y,cy+point.y-camera.y,'Debris hull pixel y');
            check(debrisVisual.particles===previousParticles,'Physical debris contact emitted a hull burst');
            const display=rendered(),debrisRenderOffset=Math.hypot(display.x-d.x,display.y-d.y);
            check(debrisRenderOffset>.01,'Debris fixture did not exercise an interpolated physical push');
            scenarios.push({category,shielded,vx:saved.vx,vy:saved.vy,spin:saved.spin,shipHealthUnchanged:entity.hull===1000&&entity.shields===(shielded?1000:0),debrisBounce:true,debrisRenderOffset});
          }
          const weapons=[];
          for(const kind of ['beam','disruptor','torpedo']){
            const s=fresh(),r=nativeSolAsteroids.find(rockId),model=VexedMirrorWeapons.filter(m=>m.damage>0&&nativeCombatShots.weaponVisual(m).kind===kind).sort((a,b)=>a.damage-b.damage)[0];
            check(model,'Missing '+kind);r.maxHull=1000000;putPlayer(s,r.x-180,r.y);s.angle=0;
            nativeWeaponLoadout.refit(s,[model.id,null,null]);nativeAsteroidCombat.select(r);
            const d=nativeShipDefinitions.describe(s,s,{category:'player'}),fired=nativeAsteroidCombat.fire(s,d,d.dimensions.width,d.dimensions.height);
            check(fired.ok,'Weapon did not fire: '+fired.error);check(!s.destroyedAsteroids.includes(rockId),'Rock destroyed before actual weapon contact');
            for(let i=0;i<300&&!s.destroyedAsteroids.includes(rockId);i++){nativeSimulation.advance(s,1/60);nativeCombatShots.advance(s,1/60);}
            check(s.destroyedAsteroids.includes(rockId),kind+' did not instantly destroy high-health rock on contact');weapons.push({kind,name:model.name,damage:model.damage});
          }
          const s=fresh(),r=nativeSolAsteroids.find(rockId);r.maxHull=20;
          const debris=()=>({x:r.x+60,y:r.y,size:4,system:1,vx:240,vy:0}),piece=debris();
          const strike=p=>nativeEnvironmentalImpacts.debris(s,p,r.x-60,r.y,{dt:.5});
          strike(piece);near(s.asteroidDamage[rockId],5,'First debris quarter');check(piece.vx<0,'Fragment did not physically rebound');
          Object.assign(piece,debris());strike(piece);near(s.asteroidDamage[rockId],5,'Repeated overlap');
          for(let i=0;i<12;i++)strike(debris());
          near(s.asteroidDamage[rockId],15,'Environmental health floor');check(!s.destroyedAsteroids.includes(rockId),'Debris destroyed rock at floor');
          check(!s.asteroidOreDrops[rockId],'Collision minted collectible ore');
          const chipsAtFloor=nativeAsteroidCombat.metrics().chips;for(let i=0;i<12;i++)strike(debris());
          check(nativeAsteroidCombat.metrics().chips===chipsAtFloor,'Floor contacts repeatedly emitted damage chips');
          check(chipsAtFloor>0&&chipsAtFloor<=3,'Damage states did not shed bounded chips');
          const dense=fresh();dense.system=43;Object.assign(dense,{x:-180,y:0,angle:0,vx:0,vy:0,speed:0});
          const field=nativeSolAsteroids.forSystem(43),belt=field.slice(0,25),keep=new Set(belt.map(r=>r.slotId));
          dense.minedAsteroids=field.filter(r=>!keep.has(r.slotId)).map(r=>r.slotId);dense.destroyedAsteroids=[];dense.asteroidDamage={};dense.asteroidOreDrops={};
          nativeAsteroidMotion.ensure(dense);
          for(let i=0;i<belt.length;i++){const x=(i%5)*55,y=(Math.floor(i/5)-2)*55;nativeSolAsteroids.relocate(belt[i],{x,y,previousX:x,previousY:y,angle:belt[i].angle});}
          await Promise.all(belt.map(r=>nativeSolAsteroids.image(r.file).decode()));
          const chosen=belt[10],model=VexedMirrorWeapons.filter(m=>m.damage>0&&nativeCombatShots.weaponVisual(m).kind==='beam').sort((a,b)=>a.damage-b.damage)[0];
          nativeWeaponLoadout.refit(dense,[model.id,null,null]);nativeAsteroidCombat.select(chosen);
          const shooter=nativeShipDefinitions.describe(dense,dense,{category:'player'}),shot=nativeAsteroidCombat.fire(dense,shooter,shooter.dimensions.width,shooter.dimensions.height);check(shot.ok,'Dense-belt weapon did not fire');
          let peakPieces=0,peakBursts=0;
          for(let i=0;i<600;i++){
            nativeSimulation.advance(dense,1/60);nativeAsteroidMotion.advance(dense,1/60);nativeShipSystems.move(dense,dense,'player',{},undefined,1/60);
            nativeCombatShots.advance(dense,1/60);nativeEnvironmentalImpacts.advance(dense,1/60);nativeShipEffects.advance(dense,1/60);nativeAsteroidCombat.advance(dense,1/60);nativeAsteroidMotion.collide(dense,1/60);
            const m=nativeAsteroidCombat.metrics();peakPieces=Math.max(peakPieces,m.pieces);peakBursts=Math.max(peakBursts,m.bursts);
            check(dense.destroyedAsteroids.length<=1,'One shot caused secondary asteroid explosions');
          }
          check(dense.destroyedAsteroids.length===1&&dense.destroyedAsteroids[0]===chosen.slotId,'Weapon destruction authority changed');
          check(belt.filter(r=>r!==chosen).every(r=>(dense.asteroidDamage[r.slotId]||0)<=r.maxHull*.75+1e-8),'Dense-belt collision bypassed health floor');
          check(peakBursts<=12&&peakPieces<=264,'Damage chip population escaped its bounds');
          check(Object.keys(dense.asteroidOreDrops).every(id=>Number(id)===chosen.slotId),'Secondary damage created collectible ore');
          const damaged=belt.filter(r=>r!==chosen&&dense.asteroidDamage[r.slotId]>0);check(damaged.length>0,'Dense belt did not exercise real debris damage');
          for(const sourceKey of ['ship:player','ship:civilian:999','ship:tug:999','asteroid:999',null]){
            nativeEnvironmentalImpacts.explode(dense,{x:100,y:0,size:500,system:43},{sourceKey});nativeSimulation.advance(dense,1);nativeEnvironmentalImpacts.advance(dense,1);
            check(dense.destroyedAsteroids.length===1,'Explosion source bypassed floor');
          }
          const noChainReaction={rocks:belt.length,destroyed:dense.destroyedAsteroids.length,damaged:damaged.length,peakPieces,peakBursts,chipsAtFloor};
          await Promise.all(belt.filter(r=>r!==chosen).map(r=>nativeSolAsteroids.image(nativeSolAsteroids.frame(r,dense.asteroidDamage[r.slotId])).decode()));
          const proof=document.createElement('canvas');proof.id='collision-floor-output';proof.width=900;proof.height=500;proof.style.cssText='position:fixed;left:10px;top:100px;z-index:100001;background:#050a12';document.body.append(proof);
          const proofCtx=proof.getContext('2d');nativeSolAsteroids.paint(proofCtx,{state:dense,system:43,ship:{x:100,y:0},cx:450,cy:250,zoom:1,w:900,h:500,mined:[...dense.minedAsteroids,...dense.destroyedAsteroids],damage:dense.asteroidDamage});
          proofCtx.fillStyle='#fff';proofCtx.font='17px sans-serif';proofCtx.fillText('One weapon target destroyed; all 24 neighboring asteroids survived.',30,35);
          const incoming=[];
          for(const category of ['player','civilian','tug'])for(const size of [20,70]){
            const initial=fresh(),r=nativeSolAsteroids.find(rockId),x=r.x,y=r.y,oldSize=r.size;
            const s={...initial,asteroidMotion:{version:1,rocks:{[rockId]:{system:1,x,y:y-35,angle:r.angle,vx:0,vy:180,spin:0,at:nativeSimulation.seconds(initial)}}}};
            nativeAsteroidMotion.ensure(s);r.size=size;
            let entity=s;if(category!=='player'){entity={...isolated(category),id:8899,system:1,phase:'cruise',hull:1000};if(category==='tug')s.solEconomy.freighters=[entity];else s.civilianTraffic.ships=[entity];}
            Object.assign(entity,{shields:1000,vx:0,vy:0,speed:0,heading:0,angle:0});
            if(category==='player')putPlayer(s,x,y);else Object.assign(entity,{x,y});entity.previousX=x;entity.previousY=y;
            await nativeShipEffects.prepare(nativeShipDefinitions.describe(s,entity,{category}).shipType,category);
            let steps=0;
            const tick=()=>{nativeSimulation.advance(s,1/60);nativeAsteroidMotion.advance(s,1/60);nativeShipSystems.move(s,entity,category,{},undefined,1/60);nativeAsteroidMotion.collide(s,1/60);nativeShipEffects.advance(s,1/60);};
            while(!entity.motionKick&&steps++<150)tick();check(entity.motionKick,'Incoming '+size+' rock did not push '+category);
            check(nativeShipEffects.snapshot(nativeShipDefinitions.describe(s,entity,{category})).contact,'Incoming rock did not use a hull glint');
            const velocity=entity.vy,before=nativeShipDefinitions.describe(s,entity,{category}).y;
            for(let i=0;i<12;i++)tick();const d=nativeShipDefinitions.describe(s,entity,{category});
            check(d.y>before+velocity*.15,'Normal steering cancelled incoming sideways knockback: '+category+' / '+size);check(d.vy>0,'Knockback velocity vanished');
            check(!nativeShipEffects.snapshot(d).flash,'Incoming rock painted a shield bubble');
            const restored=clone(entity);check(restored.motionKick.vy>0,'Ship knockback is not serializable');
            incoming.push({category,size,velocity,continuedDrift:d.y-before});r.size=oldSize;
          }
          for(const category of ['player','civilian','tug']){const cases=incoming.filter(c=>c.category===category);check(cases[1].velocity>cases[0].velocity,'Larger rock did not push '+category+' harder');}
          const chainState=fresh(),chainRocks=nativeSolAsteroids.forSystem(43).slice(0,3),at=nativeSimulation.seconds(chainState),positions=[0];
          for(let i=1;i<3;i++)positions.push(positions[i-1]+(chainRocks[i-1].size+chainRocks[i].size)*.43+8);
          const chained={...chainState,asteroidMotion:{version:1,rocks:Object.fromEntries(chainRocks.map((r,i)=>[r.slotId,{system:43,x:positions[i],y:0,angle:r.angle,vx:i?0:120,vy:0,spin:0,at}]))}};
          chained.minedAsteroids=[...chainState.minedAsteroids,...nativeSolAsteroids.forSystem(43).filter(r=>!chainRocks.includes(r)).map(r=>r.slotId)];
          nativeAsteroidMotion.ensure(chained);
          for(let i=0;i<180;i++){nativeSimulation.advance(chained,1/60);nativeAsteroidMotion.advance(chained,1/60);}
          check(chainRocks.every(r=>r.vx>0),'Offscreen whole-rock chain did not transfer motion to every rock');
          check(nativeAsteroidMotion.snapshot().rockContacts.length>=2,'Rock chain omitted physical contacts');
          const chain={velocities:chainRocks.map(r=>r.vx),contacts:nativeAsteroidMotion.snapshot().rockContacts.length,playerSystem:chained.system,rockSystem:43};
          // Actual disk save/Continue is checked below, after a normal physical push.
          const live=nativeNpcDev.getState();live.system=43;live.landed=false;live.localCruise=null;live.arrivalApproach=null;
          nativeAsteroidMotion.ensure(live);const moving=nativeSolAsteroids.forSystem(43).find(r=>!live.minedAsteroids?.includes(r.slotId)&&!live.destroyedAsteroids?.includes(r.slotId));
          live.minedAsteroids=nativeSolAsteroids.forSystem(43).filter(r=>r!==moving).map(r=>r.slotId);
          const d=nativeShipDefinitions.describe(live,live,{category:'player'});Object.assign(live,{x:moving.x-d.hullRadii.ry-moving.size*.43+1,y:moving.y,previousX:moving.x-200,previousY:moving.y,angle:0,speed:40,vx:40,vy:0});
          nativeAsteroidMotion.collide(live,.1);check(live.asteroidMotion.rocks[moving.slotId],'Live state push did not persist');
          const save={id:moving.slotId,pose:clone(live.asteroidMotion.rocks[moving.slotId])};document.querySelector('#save').click();
          return {scenarios,weapons,incoming,chain,noChainReaction,debrisQuarterDamage:true,debrisDeduplicated:true,save};
        }''')
        page.locator('#collision-floor-output').evaluate('(el)=>el.style.visibility="hidden"')
        page.locator('#asteroid-physics-output').screenshot(path=str(OUTPUT/'contacts.png'))
        page.locator('#collision-floor-output').evaluate('(el)=>el.style.visibility="visible"')
        page.locator('#collision-floor-output').screenshot(path=str(OUTPUT/'collision-floor.png'))
        # Inspect restoration before the first gameplay step; live stabilization
        # legitimately changes velocity once simulation resumes.
        page.add_init_script('''(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>raf(t=>{
          if(fn.name==='draw'&&document.body.classList.contains('playing'))return;fn(t);
        });})();''')
        page.reload()
        page.locator('[data-menu="continue-dev"]').click(timeout=30000)
        page.wait_for_function('()=>nativeNpcDev.getState()&&nativeSolAsteroids.placements.length')
        restored=page.evaluate('''id=>{
          const s=nativeNpcDev.getState(),r=nativeSolAsteroids.find(id),pose=s.asteroidMotion.rocks[id];
          return {record:pose,x:r.x,y:r.y};
        }''',report['save']['id'])
        assert restored['record']['vx']==report['save']['pose']['vx'],restored
        assert restored['record']['vy']==report['save']['pose']['vy'],restored
        assert abs(restored['x']-restored['record']['x'])<.01,restored
        assert abs(restored['y']-restored['record']['y'])<.01,restored
        report['saveContinuePreservesDrift']=True
        assert not errors,errors
        report['javascriptErrors']=errors
        (OUTPUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report,indent=2))
        browser.close()
finally:
    if server:server.shutdown()
