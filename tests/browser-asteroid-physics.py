"""Actual weapon hits, physical rock pushes, shield/hull art and saved drift."""
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
          const canvas=document.createElement('canvas');canvas.id='asteroid-physics-output';canvas.width=1100;canvas.height=540;
          canvas.style.cssText='position:fixed;left:10px;top:100px;z-index:100000;background:#050a12';document.body.append(canvas);
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const realFlash=drawShowcaseShieldFlash,flashes=[];
          window.drawShowcaseShieldFlash=(context,image,w,h,flash,...rest)=>{
            if(context===ctx){const p=new DOMPoint(flash.x,flash.y).matrixTransform(context.getTransform());flashes.push({x:p.x,y:p.y});}
            return realFlash(context,image,w,h,flash,...rest);
          };
          function fresh(){
            nativeCombatShots.reset();nativeShipEffects.reset();nativeEnvironmentalImpacts.reset();nativeAsteroidCombat.clear();
            const s=clone(base);Object.assign(s,{system:1,landed:false,hull:1000,shields:1000,speed:0,vx:0,vy:0,localCruise:null,arrivalApproach:null,x:100000,y:100000});
            delete s.asteroidMotion;s.destroyedAsteroids=[];s.asteroidDamage={};s.asteroidOreDrops={};
            s.civilianTraffic.ships=[];s.civilianTraffic.disputes=[];s.civilianTraffic.retaliations=[];s.solEconomy.freighters=[];
            nativeAsteroidMotion.ensure(s);
            s.minedAsteroids=nativeSolAsteroids.forSystem(1).filter(r=>r.slotId!==rockId).map(r=>r.slotId);
            return s;
          }
          function putPlayer(s,x,y){const p=vexedSolFlight.shipPosition(s);s.x+=x-p.x;s.y+=y-p.y;}
          const scenarios=[];
          for(const category of ['player','civilian','tug'])for(const shielded of [true,false]){
            const s=fresh(),r=nativeSolAsteroids.find(rockId);r.maxHull=1000;
            let entity=s;
            if(category!=='player'){entity={...clone(templates[category]),id:9999,system:1,phase:'cruise',hull:1000};if(category==='tug')s.solEconomy.freighters=[entity];else s.civilianTraffic.ships=[entity];}
            Object.assign(entity,{shields:shielded?1000:0,angle:.65,heading:.65,vx:Math.cos(.65)*45,vy:Math.sin(.65)*45,speed:45});
            let d=nativeShipDefinitions.describe(s,entity,{category});
            const distance=d.radii.ry+r.size*.43-.5,n={x:Math.cos(.65),y:Math.sin(.65)},x=r.x-n.x*distance,y=r.y-n.y*distance;
            if(category==='player')putPlayer(s,x,y);else Object.assign(entity,{x,y});
            entity.previousX=x-n.x*5;entity.previousY=y-n.y*5;
            d=nativeShipDefinitions.describe(s,entity,{category});await nativeShipEffects.prepare(d.shipType,category);
            nativeAsteroidMotion.collide(s,.12);
            const saved=s.asteroidMotion.rocks[rockId];check(saved&&Math.hypot(saved.vx,saved.vy)>0,category+' did not push rock');
            check(!s.destroyedAsteroids.includes(rockId),category+' gentle contact destroyed rock');
            check(entity.hull===1000&&entity.shields===(shielded?1000:0),'Contact subtracted ship health');
            d=nativeShipDefinitions.describe(s,entity,{category});const visual=nativeShipEffects.snapshot(d);
            check(shielded?!!visual.flash:visual.particles>0,category+' missing '+(shielded?'shield':'hull')+' impact');
            nativeSimulation.advance(s,.06);nativeShipEffects.advance(s,.06);
            const index=scenarios.length,cx=185+(index%3)*360,cy=index<3?150:410;
            let camera={x:d.x+20,y:d.y-15},view={state:s,ship:camera,cx,cy,zoom:1,w:1100,h:540};
            const rockArt=nativeSolAsteroids.image(r.file);await rockArt.decode();
            function paint(){nativeSolAsteroids.paint(ctx,{...view,mined:s.minedAsteroids,system:1,damage:s.asteroidDamage});nativeShipEffects.paintShip(ctx,d,view);nativeShipEffects.paint(s,ctx,view);}
            if(shielded){
              flashes.length=0;paint();check(flashes.length>0,'Shield shader was not called');
              const local=visual.flash,world=nativeCombatShots.worldPoint(d,local),p=flashes.at(-1);
              near(p.x,cx+world.x-camera.x,'Shield pixel x');near(p.y,cy+world.y-camera.y,'Shield pixel y');
              camera={x:camera.x+27,y:camera.y-19};view={...view,ship:camera};flashes.length=0;paint();
              near(flashes.at(-1).x,p.x-27,'Camera movement x');near(flashes.at(-1).y,p.y+19,'Camera movement y');
              if(category==='player')entity.angle+=.3;else entity.heading+=.3;d=nativeShipDefinitions.describe(s,entity,{category});
              flashes.length=0;paint();const rotated=nativeCombatShots.worldPoint(d,local);
              near(flashes.at(-1).x,cx+rotated.x-camera.x,'Rotated contact x');near(flashes.at(-1).y,cy+rotated.y-camera.y,'Rotated contact y');
            }else paint();
            ctx.fillStyle='#fff';ctx.font='13px sans-serif';ctx.fillText(category+' / '+(shielded?'shield':'hull'),cx-90,cy+90);
            scenarios.push({category,shielded,vx:saved.vx,vy:saved.vy,spin:saved.spin,shipHealthUnchanged:true});
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
          const debris=()=>({x:r.x+100,y:r.y,size:4,system:1}),piece=debris();
          nativeEnvironmentalImpacts.debris(s,piece,r.x-100,r.y);near(s.asteroidDamage[rockId],5,'First debris quarter');
          nativeEnvironmentalImpacts.debris(s,piece,r.x-100,r.y);near(s.asteroidDamage[rockId],5,'Repeated overlap');
          for(let i=0;i<3;i++)nativeEnvironmentalImpacts.debris(s,debris(),r.x-100,r.y);
          check(s.destroyedAsteroids.filter(id=>id===rockId).length===1,'Four debris impacts did not destroy exactly once');
          const incoming=[];
          for(const category of ['player','civilian','tug'])for(const size of [20,70]){
            const initial=fresh(),r=nativeSolAsteroids.find(rockId),x=r.x,y=r.y,oldSize=r.size;
            const s={...initial,asteroidMotion:{version:1,rocks:{[rockId]:{system:1,x,y:y-100,angle:r.angle,vx:0,vy:70,spin:0,at:nativeSimulation.seconds(initial)}}}};
            nativeAsteroidMotion.ensure(s);r.size=size;
            let entity=s;if(category!=='player'){entity={...clone(templates[category]),id:8899,system:1,phase:'cruise',hull:1000};if(category==='tug')s.solEconomy.freighters=[entity];else s.civilianTraffic.ships=[entity];}
            Object.assign(entity,{shields:1000,vx:0,vy:0,speed:0,heading:0,angle:0});
            if(category==='player')putPlayer(s,x,y);else Object.assign(entity,{x,y});entity.previousX=x;entity.previousY=y;
            await nativeShipEffects.prepare(nativeShipDefinitions.describe(s,entity,{category}).shipType,category);
            let steps=0;
            const tick=()=>{nativeSimulation.advance(s,1/60);nativeAsteroidMotion.advance(s,1/60);nativeShipSystems.move(s,entity,category,{},undefined,1/60);nativeAsteroidMotion.collide(s,1/60);nativeShipEffects.advance(s,1/60);};
            while(!entity.motionKick&&steps++<150)tick();check(entity.motionKick,'Incoming '+size+' rock did not push '+category);
            const velocity=entity.vy,before=nativeShipDefinitions.describe(s,entity,{category}).y;
            for(let i=0;i<12;i++)tick();const d=nativeShipDefinitions.describe(s,entity,{category});
            check(d.y>before+velocity*.15,'Normal steering cancelled incoming sideways knockback: '+category+' / '+size);check(d.vy>0,'Knockback velocity vanished');
            const visual=nativeShipEffects.snapshot(d);check(visual.flash,'Incoming rock did not use the ship shield effect');
            const restored=clone(entity);check(restored.motionKick.vy>0,'Ship knockback is not serializable');
            incoming.push({category,size,velocity,continuedDrift:d.y-before});r.size=oldSize;
          }
          for(const category of ['player','civilian','tug']){const cases=incoming.filter(c=>c.category===category);check(cases[1].velocity>cases[0].velocity,'Larger rock did not push '+category+' harder');}
          const chainState=fresh(),chainRocks=nativeSolAsteroids.forSystem(43).slice(0,3),at=nativeSimulation.seconds(chainState),positions=[0];
          for(let i=1;i<3;i++)positions.push(positions[i-1]+(chainRocks[i-1].size+chainRocks[i].size)*.43+8);
          const chained={...chainState,asteroidMotion:{version:1,rocks:Object.fromEntries(chainRocks.map((r,i)=>[r.slotId,{system:43,x:positions[i],y:0,angle:r.angle,vx:i?0:60,vy:0,spin:0,at}]))}};
          nativeAsteroidMotion.ensure(chained);
          for(let i=0;i<180;i++){nativeSimulation.advance(chained,1/60);nativeAsteroidMotion.advance(chained,1/60);}
          check(chainRocks.every(r=>r.vx>0),'Offscreen whole-rock chain did not transfer motion to every rock');
          check(nativeAsteroidMotion.snapshot().rockContacts.length>=2,'Rock chain omitted physical contacts');
          const chain={velocities:chainRocks.map(r=>r.vx),contacts:nativeAsteroidMotion.snapshot().rockContacts.length,playerSystem:chained.system,rockSystem:43};
          // Actual disk save/Continue is checked below, after a normal physical push.
          const live=nativeNpcDev.getState();live.system=43;live.landed=false;live.localCruise=null;live.arrivalApproach=null;
          nativeAsteroidMotion.ensure(live);const moving=nativeSolAsteroids.forSystem(43).find(r=>!live.minedAsteroids?.includes(r.slotId)&&!live.destroyedAsteroids?.includes(r.slotId));
          live.minedAsteroids=nativeSolAsteroids.forSystem(43).filter(r=>r!==moving).map(r=>r.slotId);
          const d=nativeShipDefinitions.describe(live,live,{category:'player'});Object.assign(live,{x:moving.x-d.radii.ry-moving.size*.43+1,y:moving.y,previousX:moving.x-200,previousY:moving.y,angle:0,speed:40,vx:40,vy:0});
          nativeAsteroidMotion.collide(live,.1);check(live.asteroidMotion.rocks[moving.slotId],'Live state push did not persist');
          const save={id:moving.slotId,pose:clone(live.asteroidMotion.rocks[moving.slotId])};document.querySelector('#save').click();
          return {scenarios,weapons,incoming,chain,debrisQuarterDamage:true,debrisDeduplicated:true,save};
        }''')
        page.locator('#asteroid-physics-output').screenshot(path=str(OUTPUT/'contacts.png'))
        page.reload()
        page.locator('[data-menu="continue"]').click(timeout=30000)
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
