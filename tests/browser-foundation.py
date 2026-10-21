"""Real host-loop fixed scheduling, interpolated drawing, culling and large-save reload.

Synthetic host timestamps verify refresh independence, not physical120-Hz delivery.
No performance claim is inferred from this correctness suite.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'test-results/foundation-gameplay'

GATE_SCENARIO=r"""() => {
 const check=(v,m)=>{if(!v)throw Error(m)},copy=v=>JSON.parse(JSON.stringify(v)),originalNow=Object.getOwnPropertyDescriptor(performance,'now');
 const realNow=performance.now.bind(performance);let stamp=realNow(),expected=0,active=true;const visualSeconds=[],originalUpdate=vexedSpace.update;
 vexedSpace.update=function(dt,...args){visualSeconds.push(dt);return originalUpdate.call(this,dt,...args);};
 const original=copy(nativeNpcDev.getState()),fixture=copy(original);Object.assign(fixture,{system:47,x:1e6,y:1e6,landed:false});
 fixture.civilianTraffic.ships=[];fixture.civilianTraffic.disputes=[];fixture.civilianTraffic.retaliations=[];fixture.solEconomy.freighters=[];
 fixture.shipSimulation.schedule={version:1,pendingSeconds:0};fixture.solFreightHold={5:.125};
 const key=code=>dispatchEvent(new KeyboardEvent('keydown',{code,key:code==='Escape'?'Escape':code,bubbles:true}));
 const wait=ms=>{stamp+=ms;if(active)expected+=ms/1000;};
 Object.defineProperty(performance,'now',{configurable:true,value:()=>stamp});
 try{
  check(nativeSaveStorage.write(fixture).ok,'Gate fixture write failed');resumeNativeGame('dev');
  let s=nativeNpcDev.getState(),start=nativeSimulation.seconds(s);nativeSimulationHost.reset(stamp);
  const weapon=Object.values(s.shipEquipment.instances).find(e=>e.category==='weapon'),id=weapon.id;weapon.readyAt=start+17.125;
  const cargo=JSON.stringify(s.solFreightHold),money=s.latinum,owned=JSON.stringify(s.shipEquipment);
  const total=()=>nativeSimulation.seconds(s)+s.shipSimulation.schedule.pendingSeconds-start;
  const assertTotal=label=>check(Math.abs(total()-expected)<1e-7,label+' '+JSON.stringify({actual:total(),expected}));
  wait(3100);key('Escape');active=false;check(nativePause.active,'Actual Escape did not pause');assertTotal('Pre-pause stall lost');
  check(nativeSimulation.seconds(s)===start,'Pause opening synchronously integrated owed physics');
  wait(6000);document.querySelector('#pause-menu [data-save]').click();const pausedSave=nativeSaveStorage.read('dev');
  check(Math.abs(pausedSave.shipSimulation.schedule.pendingSeconds-3.1)<1e-8,'Durable paused save missed admitted tail');
  check(pausedSave.shipEquipment.instances[id].readyAt===weapon.readyAt,'Paused write changed owned deadline');
  wait(7000);document.querySelector('#pause-menu [data-resume]').click();active=true;assertTotal('Pause close counted suspended interval');
  wait(100);__nativeFrame(stamp);assertTotal('First resumed frame lost or duplicated time');check(Math.abs(visualSeconds.at(-1)-3.2)<1e-7,'Display replayed the between-frame paused interval');
  wait(200);const beforeInventory=nativeSimulation.seconds(s);key('KeyI');active=false;check(nativeShipInventory.active,'Actual I did not open inventory');
  check(nativeSimulation.seconds(s)===beforeInventory,'Inventory opening integrated physics');assertTotal('Pre-inventory active tail lost');
  wait(11000);key('KeyI');active=true;check(!nativeShipInventory.active,'Actual I did not close inventory');
  wait(100);__nativeFrame(stamp);assertTotal('Between-frame inventory interval was admitted');
  wait(300);Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));active=false;assertTotal('Pre-hide active tail lost');
  wait(12000);delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));active=true;
  wait(100);__nativeFrame(stamp-5000);check(total()<=expected+1e-7,'Stale RAF charged time twice');__nativeFrame(stamp);assertTotal('Hidden interval or stale RAF was counted');
  const simulation=nativeSimulation;wait(400);window.nativeSimulation={...simulation,blocked:()=>true};dispatchEvent(new CustomEvent('native-flightgatechange',{detail:{at:stamp}}));active=false;
  wait(18000);window.nativeSimulation=simulation;dispatchEvent(new CustomEvent('native-flightgatechange',{detail:{at:stamp}}));active=true;
  wait(100);__nativeFrame(stamp);assertTotal('Explicit diagnostic gate edge lost time');
  check(Math.abs(visualSeconds.reduce((a,b)=>a+b,0)-expected)<1e-7,'Display clock admitted suspended inventory/hidden intervals');
  check(JSON.stringify(s.solFreightHold)===cargo&&s.latinum===money&&JSON.stringify(s.shipEquipment)===owned,'Gates changed cargo, money or equipment');
  const accepted=expected;wait(20000);check(nativeSaveStorage.write(pausedSave).ok,'Reload fixture write failed');resumeNativeGame('dev');s=nativeNpcDev.getState();
  check(Math.abs(s.shipSimulation.schedule.pendingSeconds-3.1)<1e-8,'State replacement transferred old active time');
  check(s.shipEquipment.instances[id].readyAt===pausedSave.shipEquipment.instances[id].readyAt,'Reload lost owned deadline');
  start=nativeSimulation.seconds(s);expected=3.1;wait(100);__nativeFrame(stamp);assertTotal('Reload duplicated or discarded saved debt');
  let drains=0;while(!nativeSimulationFrame.transitionReady(s)){__nativeFrame(stamp);check(++drains<1000,'Saved debt could not drain before travel');}
  wait(100);const trip=nativeNavigation.call('course',2);check(trip.ok&&vexedWarp.active,'Ordinary bounded departure failed '+JSON.stringify(trip));active=false;
  assertTotal('Departure lost its active pre-warp tail');const duringTravel=nativeSimulation.seconds(s);
  const spaceUpdate=vexedSpace.update;let warpDisplaySeconds=0;vexedSpace.update=function(dt,...args){warpDisplaySeconds+=dt;return spaceUpdate.call(this,dt,...args);};
  try{wait(15000);__nativeFrame(stamp);}finally{vexedSpace.update=spaceUpdate;}
  check(warpDisplaySeconds>14,'Physical warp gate froze the existing background display/effect clock');
  check(nativeSimulation.seconds(s)===duringTravel,'Warp presentation admitted physical flight time');
  vexedWarp.reset();active=true;assertTotal('Public warp reset admitted its suspended interval');const resetHost=nativeSimulationHost.snapshot();
  wait(100);__nativeFrame(stamp);check(Math.abs(total()-expected)<1e-7,'First post-reset frame lost or replayed time '+JSON.stringify({actual:total(),expected,resetHost,host:nativeSimulationHost.snapshot(),warp:vexedWarp.active,paused:nativePause.active,inventory:nativeShipInventory.active,hidden:document.hidden}));
  check(nativeSaveStorage.write(original).ok,'Original isolated fixture restore failed');resumeNativeGame('dev');
  return {acceptedSeconds:accepted,excludedPauseSeconds:13,excludedInventorySeconds:11,excludedHiddenSeconds:12,excludedExplicitGateSeconds:18,
    pausedSavedDebt:pausedSave.shipSimulation.schedule.pendingSeconds,reloadedTotalSeconds:3.2,excludedWarpSeconds:15,warpDisplaySeconds,publicWarpResetPreserved:true,noGateIntegration:true,staleRafClamped:true,ownedDeadlinePreserved:true};
 }finally{vexedSpace.update=originalUpdate;delete document.hidden;if(originalNow)Object.defineProperty(performance,'now',originalNow);else delete performance.now;}
}"""

SERVICE_SCENARIO=r"""async () => {
 const check=(ok,message)=>{if(!ok)throw Error(message)},clone=value=>JSON.parse(JSON.stringify(value)),simulation=nativeSimulation,frameOwner=nativeSimulationFrame;
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 window.nativeSimulation={...simulation,blocked:()=>true};__nativeFrame(performance.now());
 const originalSource=clone(nativeNpcDev.getState()),source=clone(originalSource),template=clone(source.civilianTraffic.ships[0]);
 Object.assign(source,{system:1,localBody:3,x:1e6,y:1e6,angle:0,speed:0,landed:false,phase:'cruise'});
 source.civilianTraffic.ships=[];source.civilianTraffic.disputes=[];source.civilianTraffic.retaliations=[];source.solEconomy.freighters=[];
 source.shipSimulation.schedule={version:1,pendingSeconds:0};
 for(const key of ['motionKick','motionSpin','localCruise','arrivalApproach'])delete source[key];
 check(nativeSaveStorage.write(source).ok,'Service fixture save failed');resumeNativeGame('dev');
 const s=nativeNpcDev.getState(),start=simulation.seconds(s),origin=vexedSolFlight.shipPosition(s),target={...template,id:987654,shipType:47,system:1,
   x:origin.x+220,y:origin.y,heading:0,speed:0,vx:0,vy:0,hull:1000,shields:1000,phase:'docked',scriptedDemo:'service-proof',
   task:{id:'service-proof',kind:'idle',phase:'idle',status:'active',origin:{system:1,port:3},destination:{system:1,port:3}},nextActionAt:1e9,timer:1e9,dockingVersion:1,cargo:{good:5,tons:.125},credits:123.5};
 for(const key of ['localLeg','journey','motionSpin','motionKick','combatAI','disputeId','retaliationId'])delete target[key];
 s.civilianTraffic.ships=[target];nativeNpcLives.initialize(s);nativeShipSystems.invalidate(s);
 const beam=VexedMirrorWeapons.find(model=>model.damage>0&&nativeCombatShots.weaponVisual(model).kind==='beam');
 nativeWeaponLoadout.refit(s,[beam.id]);const equipped=nativeWeaponLoadout.equipped(s)[0];equipped.instance.readyAt=start;
 nativeSolEconomy.initialize(s);s.solEconomy.clock=29.5;const produced=s.solEconomy.flows.produced[0],cargo=JSON.stringify(target.cargo),credits=target.credits;
 let hits=0,paints=0;const paint=vexedFlightAssets.drawShip;
 vexedFlightAssets.drawShip=function(...args){paints++;return paint.apply(this,args);};
 window.nativeSimulation=simulation;
 const shot=nativeCombatShots.fire({state:s,target:nativeShipDefinitions.describe(s,target,{category:'civilian'}),onHit:(weapon,point,visual,result)=>{hits++;return nativeShipDamage.apply(result.target,weapon.damage,{point,kind:'beam'});}});
 check(shot.ok,'Service test beam rejected');
 // Emulate a task whose ordinary work budget admits only one physical step.
 // Keep the production beam delay/recharge, collision and damage untouched.
 window.nativeSimulationFrame={...frameOwner,run(state,elapsed,integrate,options){return frameOwner.run(state,elapsed,integrate,{...options,maxSteps:1});}};
 const ownedId=shot.event.weaponInstanceId,readyAt=s.shipEquipment.instances[ownedId].readyAt;
 nativeCivilianTraffic.select(target.id);document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));
 let stamp=performance.now();window.nativeSimulation={...simulation,blocked:()=>true};__nativeFrame(stamp);window.nativeSimulation=simulation;nativeSimulationHost.reset(stamp);
 stamp+=3100;__nativeFrame(stamp);
 const afterDisplay=simulation.seconds(s),debtAfterDisplay=s.shipSimulation.schedule.pendingSeconds,paintsAfterDisplay=paints,eventSequence=s.weaponCombat.nextEventId;
 check(debtAfterDisplay>2.9,'Injected stall was synchronously drained');
 nativePause.open();await sleep(35);check(simulation.seconds(s)===afterDisplay&&s.shipSimulation.schedule.pendingSeconds===debtAfterDisplay,'Queued service ran while paused');nativePause.close();
 // A normal next display may restart service; no further display callbacks are
 // supplied while its real MessageChannel tasks recover the accepted interval.
 document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));
 __nativeFrame(stamp);const resumedPaints=paints,deadline=performance.now()+10000;
 while(!nativeSimulationFrame.transitionReady(s)&&performance.now()<deadline)await sleep(5);
 check(nativeSimulationFrame.transitionReady(s),'Real service event loop did not recover without display callbacks');
 check(Math.abs(simulation.seconds(s)+s.shipSimulation.schedule.pendingSeconds-start-3.1)<1e-7,'Background service lost or added accepted time');
 check(paints===resumedPaints,'Background service painted ships');check(hits===1,'A launched beam did not resolve exactly once '+JSON.stringify({hits,event:shot.event,target:{hull:target.hull,shields:target.shields,x:target.x,y:target.y,previousX:target.previousX,previousY:target.previousY,system:target.system,phase:target.phase},members:nativeShipSystems.collectShips(s).map(d=>({id:d.id,x:d.x,y:d.y,system:d.system,phase:d.entity.phase,previousX:d.previousX,previousY:d.previousY})),clock:simulation.seconds(s)}));
 check(target.shields===1000-beam.damage&&target.hull===1000,'Actual shared shield damage changed');
 check(s.weaponCombat.nextEventId===eventSequence,'Service created extra held-fire shots');document.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));
 check(s.shipEquipment.instances[ownedId].readyAt===readyAt,'Service reset an owned recharge deadline');
 check(s.solEconomy.flows.produced[0]===produced+16,'Sol production did not settle exactly once');
 check(JSON.stringify(target.cargo)===cargo&&target.credits===credits,'Catch-up changed retained cargo or credits');
 const simulatedSeconds=simulation.seconds(s)-start,background=nativeSimulationFrame.pendingWork(s);check(background.steps>100&&background.tasks>1,'Background diagnostics did not retain work');
 __nativeFrame(stamp);const carried=nativeSimulationFrame.snapshot(s);check(carried.background.steps===background.steps&&carried.steps>=background.steps,'Next display lost carried work');
 check(nativeSimulationFrame.pendingWork(s).steps===0,'Display did not consume diagnostics');
 const gateProof=[];
 for(const gate of ['inventory','hidden','warp']){
   s.shipSimulation.schedule.pendingSeconds+=.735;__nativeFrame(stamp);const at=simulation.seconds(s),debt=s.shipSimulation.schedule.pendingSeconds;
   check(debt>1/60,'Gate fixture did not retain queued debt');
   let warp;
   if(gate==='inventory')nativeShipInventory.open();
   if(gate==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}
   if(gate==='warp'){warp=vexedWarp;window.vexedWarp={...warp,active:true};}
   await sleep(30);check(simulation.seconds(s)===at&&s.shipSimulation.schedule.pendingSeconds===debt,'Service ignored '+gate+' gate');
   if(gate==='inventory')nativeShipInventory.close();
   if(gate==='hidden'){delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));stamp=performance.now();}
   if(gate==='warp')window.vexedWarp=warp;
   window.nativeSimulation={...simulation,blocked:()=>true};__nativeFrame(stamp);window.nativeSimulation=simulation;
   __nativeFrame(stamp);while(!nativeSimulationFrame.transitionReady(s)&&performance.now()<deadline)await sleep(5);gateProof.push(gate);
 }
 s.shipSimulation.schedule.pendingSeconds+=.3;__nativeFrame(stamp);const oldAt=simulation.seconds(s),oldDebt=s.shipSimulation.schedule.pendingSeconds;
 window.nativeSimulation={...simulation,blocked:()=>true};check(nativeSaveStorage.write(originalSource).ok,'Replacement fixture save failed');resumeNativeGame('dev');
 await sleep(35);check(simulation.seconds(s)===oldAt&&s.shipSimulation.schedule.pendingSeconds===oldDebt,'Queued service advanced a replaced state');
 vexedFlightAssets.drawShip=paint;window.nativeSimulation=simulation;window.nativeSimulationFrame=frameOwner;
 return {acceptedSeconds:3.1,simulatedSeconds,debtSeconds:background.debtSeconds,replacedStateDebtPreserved:oldDebt,
   background,carriedSteps:carried.steps,hits,productionCycles:1,ownedRechargePreserved:true,noBackgroundPaints:true,noBackgroundHeldShots:true,
   gates:['pause',...gateProof,'state-switch'],notes:['RAF delivery remained captured; real MessageChannel tasks alone drained whole debt.']};
}"""

SCENARIO=r"""async () => {
 const check=(ok,message)=>{if(!ok)throw Error(message)},clone=value=>JSON.parse(JSON.stringify(value)),original=nativeSimulation;
 window.nativeSimulation={...original,blocked:()=>true};
 window.__nativeFrame(performance.now());
 let source=clone(nativeNpcDev.getState());
 Object.assign(source,{system:1,localBody:3,x:1e6,y:1e6,angle:0,speed:0,landed:false,phase:'cruise'});
 delete source.motionKick;delete source.motionSpin;delete source.localCruise;delete source.arrivalApproach;
 source.shipSimulation.schedule={version:1,pendingSeconds:0};
 const draw=vexedFlightAssets.drawShip,painted=[];
 vexedFlightAssets.drawShip=function(ctx,asset,x,y,width,angle,time,appearance){
   const s=nativeNpcDev.getState();if(asset.type===s.shipType)painted.push({angle,clock:nativeSimulation.seconds(s),steps:nativeSimulationFrame.snapshot(s).steps});
   return draw.apply(this,arguments);
 };
 const dispatch=(type,code)=>document.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
 const outcomes=[];
 for(const hz of [60,120,144]){
   window.nativeSimulation={...original,blocked:()=>true};check(nativeSaveStorage.write(clone(source)).ok,'Fixture write failed');resumeNativeGame('dev');
   await vexedFlightAssets.loadShip(source.shipType,source.hull);
   const s=nativeNpcDev.getState();let stamp=performance.now();__nativeFrame(stamp);
   const start=nativeSimulation.seconds(s);painted.length=0;window.nativeSimulation=original;nativeSimulationHost.reset(stamp);
   dispatch('keydown','KeyW');dispatch('keydown','KeyD');
   let steps=0;
   for(let index=0;index<hz*2;index++){
     if(index===hz/2)dispatch('keyup','KeyD');
     if(index===hz)dispatch('keyup','KeyW');
     stamp+=1000/hz;__nativeFrame(stamp);steps+=nativeSimulationFrame.snapshot(s).steps;
   }
   dispatch('keyup','KeyW');dispatch('keyup','KeyD');
   check(steps===120,'Display refresh changed physics work '+hz+' '+steps);
   check(Math.abs(nativeSimulation.seconds(s)-start-2)<1e-8,'Display refresh lost simulation time');
   const submittedAngles=new Set(painted.map(row=>row.angle.toFixed(8))).size;
   if(hz===120){check(painted.some(row=>row.steps===0),'120-Hz drawing starved zero-step frames');check(submittedAngles>35,'Actual ship drawing did not interpolate turns');}
   outcomes.push({hz,steps,submittedDraws:painted.length,submittedAngles,x:s.x,y:s.y,angle:s.angle,speed:s.speed,debt:s.shipSimulation.schedule.pendingSeconds});
 }
 for(const row of outcomes.slice(1))for(const key of ['x','y','angle','speed'])check(Math.abs(row[key]-outcomes[0][key])<1e-7,'Refresh changed authoritative '+key);
 window.nativeSimulation={...original,blocked:()=>true};
 const s=nativeNpcDev.getState(),descriptor=nativeShipDefinitions.describe(s),view={ship:{x:descriptor.x,y:descriptor.y},cx:300,cy:225,w:600,h:450,zoom:1};
 const pixels=document.createElement('canvas');pixels.width=600;pixels.height=450;const ctx=pixels.getContext('2d');
 const offscreen={...descriptor,id:'offscreen-cull-proof',x:descriptor.x+1e7,y:descriptor.y+1e7,entity:{...descriptor.entity,id:'offscreen-cull-proof'}};
 const stateBefore=JSON.stringify(s),load=vexedFlightAssets.loadShip;let requests=0;
 vexedFlightAssets.loadShip=function(...args){requests++;return load.apply(this,args);};
 for(let i=0;i<30;i++)nativeShipEffects.paintShip(ctx,offscreen,view);
 check(JSON.stringify(s)===stateBefore,'Camera-only painting changed simulation');
 check(requests===0,'Offscreen painting requested artwork');vexedFlightAssets.loadShip=load;
 check(nativeEffectVisibility.segment(-100,225,700,225,20,{w:600,h:450}),'Offscreen beam endpoints lost crossing segment');
 check(nativeEffectVisibility.ship({...descriptor,x:descriptor.x+340},view,64),'Partly visible large glow was culled');
 // Retain the original production population, then extend only its distant
 // records through the same saved collection and owner used by normal lives.
 const initial=s.civilianTraffic.ships.length,templates=clone(s.civilianTraffic.ships),count=5000-s.solEconomy.freighters.length-1;
 for(let index=initial;index<count;index++){
   const ship=clone(templates[index%templates.length]);Object.assign(ship,{id:1e6+index,name:'Capacity fixture '+index,x:1e7+index*200,y:1e7,
     phase:'docked',system:4,nextActionAt:1e9,task:null,journey:null,speed:0,vx:0,vy:0});
   for(const key of ['localLeg','dockingMove','motionKick','motionSpin','combatAI','combatInterruption','disputeId','retaliationId'])delete ship[key];
   const eq=ship.shipEquipment,ids=new Map(Object.keys(eq.instances).map((id,index)=>[id,'f'+ship.id.toString(36)+':'+index.toString(36)])),instances={};
   for(const [id,item] of Object.entries(eq.instances)){item.id=ids.get(id);instances[item.id]=item;}
   eq.owner='civilian:'+ship.id+':0';eq.instances=instances;for(const bank of Object.keys(eq.slots))eq.slots[bank]=eq.slots[bank].map(id=>id?ids.get(id):null);
   eq.locker=eq.locker.map(id=>ids.get(id));nativeShipEquipment.project(ship,eq);
   s.civilianTraffic.ships.push(ship);
 }
 nativeNpcLives.initialize(s);nativeShipSystems.invalidate(s);
 const weapon=Object.values(s.shipEquipment.instances).find(item=>item.category==='weapon');weapon.readyAt=nativeSimulation.seconds(s)+17.125;
 s.shipSimulation.schedule.pendingSeconds=.735;
 const retain=state=>JSON.stringify({clock:state.shipSimulation,equipment:state.shipEquipment,cargo:state.solFreightHold,contracts:state.localContracts,
   ships:state.civilianTraffic.ships.map(e=>({id:e.id,task:e.task,journey:e.journey,cargo:e.cargo,credits:e.credits,equipment:e.shipEquipment,repairDeuranium:e.repairDeuranium})),
   reservations:state.civilianTraffic.life.reservations,transactions:state.civilianTraffic.life.transactions});
 const expected=retain(s),saved=nativeSaveStorage.write(s);check(saved.ok,'5000-record durable save failed: '+saved.error);
 const stored=localStorage.getItem(nativeSaveStorage.keys.dev);check(stored.startsWith('VM3:'),'Large fleet did not use versioned packing');
 resumeNativeGame('dev');const restored=nativeNpcDev.getState();
 check(retain(restored)===expected,'Large reload changed jobs, cargo, equipment, cooldowns, debt or transactions');
 check(restored.civilianTraffic.ships.length+restored.solEconomy.freighters.length+1===5000,'Large reload lost records');
 const normal={...clone(restored),devMode:false};check(nativeSaveStorage.write(normal).ok,'Two large mode slots exceeded the origin quota');
 check(retain(nativeSaveStorage.read('normal'))===retain(normal),'Normal large slot did not restore exactly');
 check(localStorage.getItem(nativeSaveStorage.keys.dev)===stored,'Normal write changed the Dev slot');
 const combinedCharacters=stored.length+localStorage.getItem(nativeSaveStorage.keys.normal).length;
 const departure=retain(restored),travel=nativeNavigation.call('course',2);
 check(travel.ok===false&&travel.error.includes('catching up'),'Actual travel controller skipped unpaid physical steps');
 check(retain(restored)===departure&&!vexedWarp.active,'Rejected overloaded travel consumed resources or changed jobs');
 window.__nativeFrame(performance.now());
 return {outcomes,offscreenPaints:30,crossingBeamRetained:true,unpaidTravelDeferred:true,largeSave:{population:5000,characters:stored.length,combinedCharacters,twoLargeModeSlots:true,exactRetainedState:true,write:saved,cost:nativeSaveStorage.metrics()},
   notes:['60/120/144 are synthetic host timestamps for correctness, not delivered monitor refresh measurements.','Large-save timing here is diagnostic; use the separate sequential timing harness for comparisons.']};
}"""

def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();errors=[]
    try:
        with sync_playwright() as p:
            channel=os.environ.get('BROWSER_CHANNEL','msedge');browser=p.chromium.launch(headless=True,**({'channel':channel} if channel else {}))
            page=browser.new_page(viewport={'width':1280,'height':850});page.on('pageerror',lambda error:errors.append(str(error)))
            page.add_init_script("{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='draw'&&(!window.__nativeFrame||window.__nativeFrame===callback)?(window.__nativeFrame=callback,0):raf(callback);}")
            page.goto(f'http://127.0.0.1:{server.server_port}/html-games/broken-mirror-port/index.html')
            page.wait_for_function('()=>nativeCombatShots.isReady() && document.querySelector("#startup").hidden',timeout=120000)
            page.evaluate('startNativeDevGame()');page.wait_for_function('()=>nativeSolAsteroids.placements.length && nativeCivilianTraffic.effectsReady()',timeout=120000)
            gates=page.evaluate(GATE_SCENARIO)
            service=page.evaluate(SERVICE_SCENARIO)
            result=page.evaluate(SCENARIO);result['backgroundService']=service;result['activeTimeGates']=gates;assert not errors,errors
            page.screenshot(path=str(OUTPUT/'fixed-schedule-large-save-flight.png'))
            report={'passed':True,'browser':browser.version,'errors':errors,**result};(OUTPUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(json.dumps(report));browser.close()
    finally:server.shutdown()

if __name__=='__main__':main()
