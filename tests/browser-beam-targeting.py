"""Actual active-entry controls, beam pixels, and shield-contact regressions."""
import functools
import http.server
import json
import os
from pathlib import Path
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'test-results' / 'beam-targeting'
OUTPUT.mkdir(parents=True, exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors, failed = [], []
reproduce = '--reproduce' in sys.argv
try:
    with sync_playwright() as p:
        channel = os.environ.get('BROWSER_CHANNEL', 'msedge')
        browser = p.chromium.launch(headless=True, **({'channel': channel} if channel else {}))
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.add_init_script("""(() => {
          const raf=window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame=callback=>{if(callback.name==='draw')window.__beamNativeFrame=callback;return raf(callback);};
        })();""")
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
        page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
        page.evaluate("""() => {
          const advance=nativeCivilianTraffic.advance;
          nativeCivilianTraffic.advance=(state,dt)=>{window.__beamState=state;return advance(state,dt);};
          startNativeDevGame();
        }""")
        page.wait_for_function('() => window.__beamState && nativeCivilianTraffic.effectsReady() && nativeSolAsteroids.placements.length', timeout=120000)
        page.evaluate('window.requestAnimationFrame=()=>0')
        page.wait_for_timeout(100)
        page.evaluate("""() => {
          const clone=value=>JSON.parse(JSON.stringify(value)),liveState=window.__beamState,base=clone(liveState);
          const weapon=VexedMirrorWeapons.find(model=>model.damage>0&&nativeCombatShots.weaponVisual(model).kind==='beam');
          function fixture({rear=false,bearing=rear?Math.PI:0,distance=240,live=false,shield='active'}={}) {
            nativeCombatShots.reset();nativeShipEffects.reset();
            const state=live?liveState:clone(base);if(live)Object.assign(state,clone(base));
            delete state.weaponCombat;delete state.shipSimulation;delete state.shipEquipment;delete state.weaponLoadout;
            delete state.motionSpin;delete state.motionKick;delete state.localCruise;delete state.arrivalApproach;
            Object.assign(state,{devMode:false,system:1,localBody:3,shipType:47,x:100000,y:100000,angle:0,speed:0,landed:false,hull:1000,shields:1000,weapons:[weapon.id,null,null],weaponInventory:[],minedAsteroids:[],destroyedAsteroids:[]});
            state.civilianTraffic.ships=[];state.civilianTraffic.disputes=[];state.civilianTraffic.retaliations=[];state.civilianTraffic.strayShots=[];
            state.solEconomy.freighters=[];nativeShipMotion.stop(state);
            const origin=vexedSolFlight.shipPosition(state);
            const target={...clone(base.civilianTraffic.ships[0]),id:98002,shipType:47,system:1,phase:'cruise',x:origin.x+Math.cos(bearing)*distance,y:origin.y+Math.sin(bearing)*distance,heading:0,speed:0,hull:1000,shields:shield==='absent'?0:shield==='collapse'?weapon.damage/2:1000};
            for(const key of ['localLeg','journey','previousX','previousY','motionSpin','motionKick','combatAI','disputeId','retaliationId'])delete target[key];
            nativeShipMotion.stop(target);state.civilianTraffic.ships=[target];
            return {state,target,origin,source:()=>nativeShipDefinitions.describe(state,state,{category:'player'}),victim:()=>nativeShipDefinitions.describe(state,target,{category:'civilian'})};
          }
          const tick=(test,dt)=>{const elapsed=nativeSimulation.advance(test.state,dt);nativeCombatShots.advance(test.state,elapsed);nativeShipEffects.advance(test.state,elapsed);return elapsed;};
          const fire=test=>nativeCombatShots.fire({state:test.state,target:test.victim()});
          const nativeFrame=()=>{
            // Each new real-input scene needs a distinct host frame. Keep
            // authoritative poses/time frozen while advancing the input owner.
            const simulation=window.nativeSimulation;window.nativeSimulation={...simulation,blocked:()=>true};
            try{window.__beamNativeFrame(performance.now());}finally{window.nativeSimulation=simulation;}
          };
          window.__beam={clone,base,weapon,fixture,tick,fire,nativeFrame};
        }""")
        reproduction = page.evaluate("""() => {
          const {fixture,tick,fire}=__beam;
          let test=fixture({rear:true}),shot=fire(test);
          const rear={accepted:shot.ok,error:shot.error};
          test=fixture();shot=fire(test);test.state.angle=Math.PI/2;test.target.y+=75;
          nativeShipSystems.invalidate(test.state);tick(test,.08);
          const stale={accepted:shot.ok,resolved:shot.event.resolved,hitTargetId:shot.event.hitTargetId,expectedTargetId:test.target.id,shields:test.target.shields};
          test=fixture();shot=fire(test);tick(test,.08);
          test.target.heading=Math.PI;nativeShipSystems.invalidate(test.state);
          const from=nativeCombatShots.source(shot.shot,test.state,test.origin),endpoint=shot.shot.targetPoint(from),target=test.victim();
          const toward=(endpoint.x-target.x)*(from.x-target.x)+(endpoint.y-target.y)*(from.y-target.y);
          const wrap={hit:shot.event.hitTargetId===test.target.id,endpointIsNearSide:toward>0,endpoint,center:{x:target.x,y:target.y},from};
          return {rear,stale,wrap};
        }""")
        if reproduce:
            (OUTPUT / 'before.json').write_text(json.dumps(reproduction, indent=2), encoding='utf-8')
            print(json.dumps(reproduction, indent=2))
        else:
            assert reproduction['rear']['accepted'], reproduction
            assert reproduction['stale'].get('hitTargetId') == reproduction['stale']['expectedTargetId'], reproduction
            assert reproduction['wrap']['endpointIsNearSide'], reproduction
            page.evaluate("""() => {
              const h=__beam;
              h.check=(value,message)=>{if(!value)throw Error(message);};
              h.near=(actual,wanted,message,tolerance=.025)=>h.check(Math.abs(actual-wanted)<tolerance,`${message}: ${actual} versus ${wanted}`);
              h.counts=new WeakMap();
              const originalFire=nativeCombatShots.fire;
              nativeCombatShots.fire=options=>{const result=originalFire(options);h.lastFire=result;return result;};
              for(const [object,key] of [[nativeCivilianTraffic,'hit'],[nativeAsteroidCombat,'weaponHit']]){
                const original=object[key];object[key]=(state,...args)=>{h.counts.set(state,(h.counts.get(state)||0)+1);return original(state,...args);};
              }
              const playerHit=nativeCombatShots.onPlayerHit;
              nativeCombatShots.onPlayerHit=(state,...args)=>{h.counts.set(state,(h.counts.get(state)||0)+1);return playerHit(state,...args);};
              const canvas=document.createElement('canvas');canvas.width=1180;canvas.height=620;
              canvas.id='beam-regression-output';canvas.style.cssText='position:fixed;top:70px;left:40px;z-index:10000;background:#030914;border:1px solid #345570';
              document.body.append(canvas);h.canvas=canvas;h.ctx=canvas.getContext('2d',{willReadFrequently:true});
              h.painted=[];h.flashes=[];
              const render=paintShowcaseWeaponShot;
              window.paintShowcaseWeaponShot=(ctx,shot,geometry,age)=>{if(ctx===h.ctx)h.painted.push({...geometry});return render(ctx,shot,geometry,age);};
              const flash=drawShowcaseShieldFlash;
              window.drawShowcaseShieldFlash=(ctx,image,w,height,value,...args)=>{
                if(ctx===h.ctx){const point=new DOMPoint(value.x,value.y).matrixTransform(ctx.getTransform());h.flashes.push({x:point.x,y:point.y});}
                return flash(ctx,image,w,height,value,...args);
              };
              h.pixels=(x,y,radius=4)=>{
                const left=Math.max(0,Math.floor(x-radius)),top=Math.max(0,Math.floor(y-radius)),width=Math.min(canvas.width-left,radius*2+1),height=Math.min(canvas.height-top,radius*2+1);
                if(width<1||height<1)return 0;
                const data=h.ctx.getImageData(left,top,width,height).data;let count=0;
                for(let i=0;i<data.length;i+=4)if(data[i+3]>10&&data[i]+data[i+1]+data[i+2]>60)count++;
                return count;
              };
              h.view=test=>({state:test.state,ship:{x:test.origin.x,y:test.origin.y},cx:590,cy:310,zoom:1.3,w:canvas.width,h:canvas.height});
              h.geometry=(test,shot)=>{
                h.ctx.clearRect(0,0,canvas.width,canvas.height);h.painted.length=0;
                nativeCombatShots.paint(h.ctx,shot,h.view(test));h.check(h.painted.length===1,'Beam did not reach the actual Canvas weapon renderer');
                const result=h.painted[0];
                const middle={x:(result.x1+result.x2)/2,y:(result.y1+result.y2)/2};
                h.check(h.pixels(middle.x,middle.y)>0,'Rendered beam has no midpoint pixels');
                h.check(h.pixels(result.x2,result.y2)>0,'Rendered beam has no contact pixels '+JSON.stringify(result));
                const length=Math.hypot(result.x2-result.x1,result.y2-result.y1),past={x:result.x2+(result.x2-result.x1)/length*20,y:result.y2+(result.y2-result.y1)/length*20};
                h.check(h.pixels(past.x,past.y,2)===0,'Actual beam pixels continue beyond the physical impact');
                return result;
              };
              h.surface=(test,shot,target=test.victim())=>{
                const geometry=h.geometry(test,shot),view=h.view(test);
                const point={x:test.origin.x+(geometry.x2-view.cx)/view.zoom,y:test.origin.y+(geometry.y2-view.cy)/view.zoom};
                const from={x:test.origin.x+(geometry.x1-view.cx)/view.zoom,y:test.origin.y+(geometry.y1-view.cy)/view.zoom};
                const angle=target.heading+Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),dx=point.x-target.x,dy=point.y-target.y;
                const radii=nativeShipDefinitions.surfaceRadii(target.dimensions,target.shields>0,target.definition);
                h.near(Math.hypot((dx*c+dy*s)/radii.rx,(-dx*s+dy*c)/radii.ry),.96,'Beam endpoint is not on the current shared surface');
                h.check(dx*(from.x-target.x)+dy*(from.y-target.y)>0,'Beam endpoint rotated onto the far side');
                const aim=test.victim(),targetDirection={x:aim.x-from.x,y:aim.y-from.y},length=Math.hypot(targetDirection.x,targetDirection.y);
                h.near((point.x-from.x)*targetDirection.y/length-(point.y-from.y)*targetDirection.x/length,0,'Beam left its firing line');
                h.ctx.clearRect(0,0,canvas.width,canvas.height);h.flashes.length=0;
                nativeShipEffects.paintSurface(h.ctx,target,view,{front:true});
                if(target.shields>0&&shot.event?.resolved){
                  h.check(h.flashes.length===1,'Active shield did not paint a bright contact');
                  h.near(h.flashes[0].x,geometry.x2,'Shield contact pixel x is detached from beam');
                  h.near(h.flashes[0].y,geometry.y2,'Shield contact pixel y is detached from beam');
                  h.check(h.pixels(geometry.x2,geometry.y2,9)>0,'Shield contact shader produced no pixels');
                }
                return geometry;
              };
              h.art=async test=>{await nativeShipEffects.prepare(test.source().shipType,'player');await nativeShipEffects.prepare(test.victim().shipType,'civilian');};
              h.screenshot=(test,shot,title,detail)=>{
                const ctx=h.ctx,view=h.view(test);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#030914';ctx.fillRect(0,0,canvas.width,canvas.height);
                ctx.fillStyle='#aac6df';ctx.font='24px sans-serif';ctx.fillText(title,35,45);ctx.font='15px sans-serif';ctx.fillStyle='#6f9fbe';ctx.fillText(detail,35,73);
                nativeShipEffects.paintShip(ctx,test.source(),view);nativeShipEffects.paintShip(ctx,test.victim(),view);
                nativeCombatShots.paint(ctx,shot,view);nativeShipEffects.paintSurface(ctx,test.victim(),view,{front:true});
                const source=test.source(),target=test.victim(),sourceX=view.cx+(source.x-test.origin.x)*view.zoom,targetX=view.cx+(target.x-test.origin.x)*view.zoom;
                ctx.font='15px sans-serif';ctx.fillStyle='#e2edf7';ctx.fillText('Shooter / heading east →',sourceX-80,view.cy+105);ctx.fillText('Target / active shields',targetX-75,view.cy+105);
              };
            }""")
            native_controls = []
            for name, bearing in [('ahead', 0), ('beside', 1.5707963267948966), ('behind', 3.141592653589793)]:
                page.evaluate("""bearing => {
                  const h=__beam,test=h.fixture({bearing,live:true});h.nativeTest=test;
                  h.counts.set(test.state,0);h.lastFire=null;
                  nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();nativeCivilianTraffic.clearTarget();
                  h.nativeFrame();
                  document.querySelector('#space').focus();
                }""", bearing)
                page.keyboard.press('Shift')
                page.keyboard.press('Space')
                result = page.evaluate("""async name => {
                  const h=__beam,test=h.nativeTest,event=test.state.weaponCombat?.events[0];
                  h.check(nativeCivilianTraffic.target(test.state)?.id===test.target.id,'Shift did not select the real target');
                  h.check(event,`Native Space input rejected the ${name} target`);
                  h.near(test.state.angle,0,'Space input turned the shooter');
                  await h.art(test);h.tick(test,.08);h.tick(test,.02);h.check(event.hitTargetId===test.target.id,'Native control beam missed');
                  h.check(h.counts.get(test.state)===1,'Native input applied damage more than once');
                  h.check(test.target.shields<1000&&test.target.hull===1000,'Native beam bypassed shields');
                  h.surface(test,h.lastFire.shot);
                  return {bearing:name,realShiftAndSpace:true,hit:true,shieldFirst:true};
                }""", name)
                native_controls.append(result)
            results = page.evaluate("""async () => {
              const h=__beam,{fixture,fire,tick,check,near}=h,results={};
              const checkedFire=test=>{const shot=fire(test);check(shot.ok,'Shared beam rejected: '+shot.error);return shot;};
              const damageTotal=test=>1000-test.target.hull+(test.initialShields??1000)-test.target.shields;
              const motion=[];
              for(const mode of ['shooter rotation','target translation','both move and rotate','small fast target','close range']){
                const test=fixture({distance:mode==='close range'?105:240});
                if(mode==='small fast target')test.target.dimensions={width:6,height:10};
                await h.art(test);const fired=checkedFire(test);tick(test,.02);
                if(mode!=='target translation')test.state.angle=Math.PI*.8;
                if(mode!=='shooter rotation'){
                  test.target.previousX=test.target.x;test.target.previousY=test.target.y;
                  test.target.x+=mode==='small fast target'?45:12;test.target.y+=mode==='small fast target'?85:60;test.target.heading=1.3;
                }
                if(mode==='both move and rotate'){test.state.x+=25;test.state.y-=30;}
                nativeShipSystems.invalidate(test.state);h.surface(test,fired.shot);
                tick(test,.06);tick(test,.02);check(fired.event.hitTargetId===test.target.id,mode+' missed an unobstructed target');
                h.surface(test,fired.shot);near(damageTotal(test),fired.event.damage,mode+' damage did not match the shared spec');
                check(h.counts.get(test.state)===1,mode+' applied damage more than once');
                motion.push({mode,previewPixels:true,resolvedPixels:true,currentPoseHit:true});
              }
              results.motion=motion;
              const shields=[];
              for(const shield of ['active','collapse','absent']){
                const test=fixture({shield});test.initialShields=test.target.shields;await h.art(test);const fired=checkedFire(test);
                h.surface(test,fired.shot);tick(test,.08);tick(test,.02);
                check(fired.event.hitTargetId===test.target.id,'Missing '+shield+' impact');h.surface(test,fired.shot);
                near(damageTotal(test),fired.event.damage,shield+' damage accounting');
                if(shield==='active')check(test.target.hull===1000,'Active shields did not absorb first');
                if(shield==='collapse')check(test.target.shields===0&&test.target.hull<1000,'Shield collapse lost legitimate hull overflow');
                if(shield==='absent')check(test.target.hull<1000,'Unshielded hull took no damage');
                for(const heading of [.4,1.6,Math.PI,4.8]){
                  test.target.heading=heading;test.target.x+=2;test.target.y+=3;test.state.y-=2;
                  nativeShipSystems.invalidate(test.state);h.surface(test,fired.shot);
                }
                check(h.counts.get(test.state)===1,'Rotating/rendering '+shield+' contact applied damage again');
                shields.push({shield,rotatingVisibleSurface:true,brightContactAligned:shield==='active',damageApplications:1});
              }
              results.shields=shields;
              const intercept=[];
              for(const moving of [false,true]){
                const test=fixture(),blocker={...h.clone(test.target),id:98003,x:test.origin.x+120,y:test.origin.y+(moving?100:0)};
                test.state.civilianTraffic.ships.push(blocker);nativeShipSystems.invalidate(test.state);
                const fired=checkedFire(test);if(moving){blocker.previousY=blocker.y;blocker.y=test.origin.y;}
                nativeShipSystems.invalidate(test.state);tick(test,.08);tick(test,.02);
                check(fired.event.hitTargetId===blocker.id,'Intervening ship did not receive the first physical hit');
                check(test.target.shields===1000&&blocker.shields<1000,'Beam damaged selected target through a ship');
                await nativeShipEffects.prepare(47,'civilian');h.surface(test,fired.shot,nativeShipDefinitions.describe(test.state,blocker,{category:'civilian'}));
                check(h.counts.get(test.state)===1,'Interception applied duplicate damage');intercept.push({kind:'ship',movedInBeforeResolution:moving});
              }
              const rock=nativeSolAsteroids.placements[0],old={x:rock.x,y:rock.y,angle:rock.angle};
              try{
                for(const moving of [false,true]){
                  const test=fixture();nativeSolAsteroids.relocate(rock,{x:test.origin.x+120,y:test.origin.y+(moving?150:0)});
                  nativeShipSystems.invalidate(test.state);const fired=checkedFire(test);
                  if(moving)nativeSolAsteroids.relocate(rock,{x:test.origin.x+120,y:test.origin.y});
                  nativeShipSystems.invalidate(test.state);tick(test,.08);
                  check(fired.event.hitTargetId==='rock:'+rock.slotId,'Intervening asteroid did not intercept the beam');
                  check(test.state.destroyedAsteroids.includes(rock.slotId)&&test.target.shields===1000,'Asteroid interception hit the locked ship');
                  const geometry=h.geometry(test,fired.shot),view=h.view(test),endpoint={x:test.origin.x+(geometry.x2-view.cx)/view.zoom,y:test.origin.y+(geometry.y2-view.cy)/view.zoom};
                  near(Math.hypot(endpoint.x-rock.x,endpoint.y-rock.y),rock.size*.43,'Asteroid beam endpoint');
                  check(h.counts.get(test.state)===1,'Asteroid damage applied twice');intercept.push({kind:'asteroid',movedInBeforeResolution:moving});
                }
                const test=fixture();test.target.x=test.origin.x+120;nativeSolAsteroids.relocate(rock,{x:test.origin.x+260,y:test.origin.y});
                nativeShipSystems.invalidate(test.state);nativeAsteroidCombat.select(rock);
                const fired=nativeAsteroidCombat.fire(test.state,test.origin,test.source().dimensions.width,test.source().dimensions.height);
                check(fired.ok,'Native asteroid lock refused an intercepted shot');await h.art(test);tick(test,.08);tick(test,.02);
                check(fired.event.hitTargetId===test.target.id&&fired.event.contact.shielded,'Asteroid-lock callback bypassed the intercepting ship shield');
                check(test.target.hull===1000&&test.target.shields===1000-fired.event.damage,'Asteroid-lock ship interception did not absorb shields first');
                check(!test.state.destroyedAsteroids.includes(rock.slotId),'Asteroid-lock directly damaged the selected rock through a ship');
                h.surface(test,fired.shot);check(h.counts.get(test.state)===1,'Asteroid-lock interception damaged twice');
                intercept.push({kind:'shielded ship',selectedTarget:'asteroid',nativeController:true});
              }finally{nativeSolAsteroids.relocate(rock,old);nativeAsteroidCombat.deselect();}
              results.interception=intercept;
              const parity=[];
              for(const bearing of [0,Math.PI/2,Math.PI]){
                const test=fixture(),shooter=test.target;shooter.heading=bearing;shooter.x=test.origin.x+240;
                delete shooter.shipEquipment;delete shooter.weaponLoadout;shooter.weapons=[h.weapon.id,null,null];
                const source=nativeShipDefinitions.describe(test.state,shooter,{category:'civilian'}),target=test.source();
                const shot=nativeCombatShots.fireFor({state:test.state,shooter:source,target});check(shot.ok,'NPC shared rear/side fire rejected');
                near(shot.event.damage,nativeWeaponRules.weaponSpec(h.weapon,'beam').damage,'NPC/player model damage mismatch');
                near(shot.event.spec.recharge,nativeWeaponRules.weaponSpec(h.weapon,'beam').recharge,'NPC/player recharge mismatch');
                tick(test,.08);check(shot.event.hitTargetId==='player'&&test.state.shields<1000,'NPC beam missed player');
                check(h.counts.get(test.state)===1,'NPC shot applied damage twice');parity.push({shooterHeading:bearing,hit:true});
              }
              results.playerNpcParity=parity;
              // Exercise the ordinary civilian retaliation decision, not just fireFor.
              {
                const test=fixture(),ship=test.target;ship.heading=0;ship.x=test.origin.x+240;
                delete ship.shipEquipment;delete ship.weaponLoadout;ship.weapons=[h.weapon.id,null,null];
                nativeCivilianTraffic.hit(test.state,ship.id,.1,{source:'player',sourceId:'player',from:test.source()});
                const retaliation=test.state.civilianTraffic.retaliations[0];check(retaliation,'Real retaliation policy did not activate');
                retaliation.nextShotAt=test.state.civilianTraffic.clock;
                nativeCivilianTraffic.advance(test.state,.001);
                const shot=test.state.weaponCombat?.events.find(event=>event.sourceId===ship.id);
                check(shot,'NPC controller waited to turn toward a rearward target');
                check(Math.abs(nativeWeaponRules.wrap(ship.heading))<.1,'NPC turned around before firing');
                tick(test,.08);check(shot.hitTargetId==='player','Retaliation controller rear shot missed');
                results.npcDecision={ordinaryRetaliation:true,rearwardFireWithoutTurning:true};
              }
              {
                const test=fixture({rear:true}),fired=checkedFire(test);tick(test,.025);
                const pending=JSON.stringify(fired.event),clock=nativeSimulation.seconds(test.state),owned=nativeWeaponLoadout.equipped(test.state)[0];
                const readyAt=owned.instance.readyAt,id=owned.instance.id;
                nativePause.open();check(tick(test,1)===0,'Pause advanced a pending beam');check(JSON.stringify(fired.event)===pending,'Pause changed beam state');near(nativeSimulation.seconds(test.state),clock,'Pause changed saved time');nativePause.close();
                nativeShipInventory.open();check(tick(test,1)===0,'Inventory advanced a pending beam');nativeShipInventory.close();
                const state=h.clone(test.state),restored={...test,state,target:state.civilianTraffic.ships[0]};
                restored.source=()=>nativeShipDefinitions.describe(state,state,{category:'player'});restored.victim=()=>nativeShipDefinitions.describe(state,restored.target,{category:'civilian'});
                nativeCombatShots.reset();nativeCombatShots.restore(state);await h.art(restored);
                tick(restored,.055);const event=state.weaponCombat.events[0];check(event.hitTargetId===restored.target.id,'Restored pending rear shot missed');
                h.ctx.clearRect(0,0,h.canvas.width,h.canvas.height);h.painted.length=0;nativeCombatShots.paintAll(h.ctx,h.view(restored));check(h.painted.length===1,'Restored beam did not render');
                const restoredOwned=nativeWeaponLoadout.equipped(state)[0];check(restoredOwned.instance.id===id&&restoredOwned.instance.readyAt===readyAt,'Restoration reset owned recharge');
                for(let i=0;i<8;i++){nativeCombatShots.paintAll(h.ctx,h.view(restored));tick(restored,.004);}
                check(h.counts.get(state)===1,'Restored beam or repeated rendering damaged twice');
                const again=nativeCombatShots.fire({state,target:restored.victim()});check(!again.ok&&again.error.includes('recharging'),'Beam bypassed owned recharge after restore');
                results.pauseAndJsonReload={pauseFrozen:true,inventoryFrozen:true,pendingShotRestored:true,renderedAfterRestore:true,ownedRechargePreserved:true,damageApplications:1};
              }
              // Leave a real active rearward shot available for screenshot evidence.
              const evidence=fixture({rear:true});await h.art(evidence);const rear=checkedFire(evidence);tick(evidence,.08);tick(evidence,.03);h.surface(evidence,rear.shot);
              h.evidence={test:evidence,fired:rear};h.screenshot(evidence,rear.shot,'Rearward phaser fire','The ship faces east; the phaser fires west from its aft emitter and stops on the near shield.');
              results.passed=true;return results;
            }""")
            results['nativeControls'] = native_controls
            page.locator('#beam-regression-output').screenshot(path=str(OUTPUT / 'rearward-phaser.png'))
            page.evaluate("""() => {
              const h=__beam,{test,fired}=h.evidence;test.target.heading=Math.PI;test.target.y-=65;test.state.y+=22;
              nativeShipSystems.invalidate(test.state);h.surface(test,fired.shot);
              h.screenshot(test,fired.shot,'Shield contact while both ships move','The target rotated 180 degrees; the beam and bright shield contact remain on the surface facing the shooter.');
            }""")
            page.locator('#beam-regression-output').screenshot(path=str(OUTPUT / 'rotated-shield-contact.png'))
            # Save through the ordinary pause menu, reload the actual entry page,
            # and Continue with a still-pending rearward attack in isolated storage.
            page.evaluate("""() => {
              const h=__beam,test=h.fixture({rear:true,live:true});h.nativeTest=test;h.canvas.style.display='none';
              nativeSolEconomy.clearTarget();nativeAsteroidCombat.deselect();nativeCivilianTraffic.clearTarget();
              h.nativeFrame();
              document.querySelector('#space').focus();
            }""")
            page.keyboard.press('Shift')
            page.keyboard.press('Space')
            saved_attack = page.evaluate("""() => {
              const h=__beam,test=h.nativeTest;h.check(h.lastFire?.ok,'Native reload fixture did not fire '+JSON.stringify({last:h.lastFire?.error,notice:document.querySelector('#notice')?.textContent,target:nativeCivilianTraffic.target(test.state)?.id,pause:nativePause.active,inventory:nativeShipInventory.active,modal:document.querySelector('#modal')?.hidden}));h.tick(test,.025);
              const event=test.state.weaponCombat.events[0],owned=nativeWeaponLoadout.equipped(test.state)[0];
              return {eventId:event.id,dueAt:event.dueAt,clock:nativeSimulation.seconds(test.state),targetId:test.target.id,shields:test.target.shields,weaponId:owned.instance.id,readyAt:owned.instance.readyAt,damage:event.damage};
            }""")
            page.keyboard.press('Escape')
            page.locator('#pause-menu [data-save]').click()
            assert page.locator('#pause-menu [data-pause-title]').inner_text() == 'Game saved'
            paused_save = page.evaluate("""() => {
              const saved=nativeSaveStorage.read('normal');return {clock:saved.shipSimulation.seconds,pending:saved.weaponCombat.events[0].resolved};
            }""")
            assert paused_save == {'clock': saved_attack['clock'], 'pending': False}
            page.add_init_script("""{
              const raf=window.requestAnimationFrame.bind(window);
              window.requestAnimationFrame=callback=>callback.name==='draw'?(window.__nativeFrame=callback,0):raf(callback);
            }""")
            page.reload()
            page.wait_for_function('() => nativeCombatShots.isReady() && document.querySelector("#startup").hidden', timeout=120000)
            page.evaluate("""() => {
              const restore=nativeCombatShots.restore;
              nativeCombatShots.restore=state=>{window.__beamReloaded=state;return restore(state);};
            }""")
            page.locator('[data-menu="continue"]').click()
            restored_attack = page.evaluate("""saved => {
              const state=window.__beamReloaded,event=state.weaponCombat.events[0],target=state.civilianTraffic.ships.find(ship=>ship.id===saved.targetId),owned=nativeWeaponLoadout.equipped(state)[0];
              if(!event||event.resolved||event.id!==saved.eventId)throw Error('Continue lost its pending beam');
              if(owned.instance.id!==saved.weaponId||owned.instance.readyAt!==saved.readyAt)throw Error('Continue reset owned recharge');
              if(nativeSimulation.seconds(state)!==saved.clock)throw Error('Reload advanced paused simulation');
              state.angle=Math.PI/2;state.x+=20;target.y+=50;target.heading=Math.PI;nativeShipSystems.invalidate(state);
              let hits=0;const hit=nativeCivilianTraffic.hit;nativeCivilianTraffic.hit=(...args)=>{hits++;return hit(...args);};
              nativeSimulation.advance(state,.055);nativeCombatShots.advance(state,.055);
              const health={shields:target.shields,hull:target.hull};
              for(let i=0;i<8;i++){nativeSimulation.advance(state,.004);nativeCombatShots.advance(state,.004);}
              if(event.hitTargetId!==target.id||target.shields!==saved.shields-saved.damage||target.hull!==1000||hits!==1)throw Error('Continued beam did not resolve exactly once at the current pose');
              if(JSON.stringify(health)!==JSON.stringify({shields:target.shields,hull:target.hull}))throw Error('Continued beam damaged a second time');
              return {realPauseSave:true,pageReload:true,normalContinue:true,pendingAttackResolvedAtCurrentPose:true,ownedRechargePreserved:true,damageApplications:hits};
            }""", saved_attack)
            results['realSaveReload'] = restored_attack
            native_evidence = page.evaluate("""async () => {
              const state=window.__beamReloaded;await nativeShipEffects.prepare(state.shipType,'player');await nativeShipEffects.prepare(47,'civilian');
              await vexedFlightAssets.loadShip(state.shipType,state.hull);
              state.angle=0;nativeCivilianTraffic.select(state.civilianTraffic.ships[0].id);nativeShipSystems.invalidate(state);
              // Paint one actual native gameplay frame at its frozen simulation
              // time, retaining the HUD and the already resolved single hit.
              window.nativeSimulation={...nativeSimulation,blocked:()=>true};
              if(!window.__nativeFrame)throw Error('Native gameplay frame was not captured');
              const ctx=document.querySelector('#space').getContext('2d'),beams=[],flashes=[];
              const weapon=paintShowcaseWeaponShot;window.paintShowcaseWeaponShot=(context,shot,geometry,age)=>{if(context===ctx){const point=new DOMPoint(geometry.x2,geometry.y2).matrixTransform(context.getTransform());beams.push({x2:point.x,y2:point.y});}return weapon(context,shot,geometry,age);};
              const flash=drawShowcaseShieldFlash;window.drawShowcaseShieldFlash=(context,image,w,height,value,...args)=>{if(context===ctx){const point=new DOMPoint(value.x,value.y).matrixTransform(context.getTransform());flashes.push(point);}return flash(context,image,w,height,value,...args);};
              window.__nativeFrame(performance.now());
              if(beams.length!==1||flashes.length!==1)throw Error('Actual native gameplay frame omitted its beam or shield contact');
              if(Math.hypot(beams[0].x2-flashes[0].x,beams[0].y2-flashes[0].y)>.025)throw Error('Native HUD gameplay beam and bright shield contact disagree '+JSON.stringify({beams,flashes}));
              return {actualNativeCanvas:true,unpausedHud:true,rearwardFire:true,brightShieldContactAligned:true};
            }""")
            page.screenshot(path=str(OUTPUT / 'native-rearward-gameplay.png'))
            results['nativeGameplayScreenshot'] = native_evidence
            results.update(javascriptErrors=errors, failedResponses=failed)
            (OUTPUT / 'report.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
            print(json.dumps(results, indent=2))
        assert not errors, errors
        assert not failed, failed
        browser.close()
finally:
    server.shutdown()
