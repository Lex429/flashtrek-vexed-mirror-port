(()=>{'use strict';
const canvas=document.querySelector('#space'),ctx=canvas.getContext('2d'),modal=document.querySelector('#modal'),dialog=document.querySelector('#dialog'),navigation=window.nativeNavigation;
const asteroidMineButton=document.createElement('button');asteroidMineButton.id='asteroid-mine-action';asteroidMineButton.type='button';asteroidMineButton.hidden=true;document.querySelector('#game').append(asteroidMineButton);
const world=window.VexedMirrorWorld;
const localCatalog=window.nativeSystemCatalog;
const localBodies=()=>localCatalog.bodies(game.system);
const localCurrent=()=>localCatalog.currentId(game);
const factions=['Non-Aligned','Earth Empire','Klingon Empire','Ferengi','Romulan Empire','Vulcan','Cardassian Order','Borg Collective'];
const colors=['#9dd9ee','#ed879b','#f06456','#e6c65d','#74d979','#d8c88e','#c18be2','#a6f05e'];
const goods=['Deuranium','Antimatter','Dilithium','Food'];
const devResources=['latinum','deuranium','antimatter','dilithium','food'];
const shipStats=value=>window.nativeShipDefinitions.forEntity(value,value,{category:'player'});
const localSpeedFactor=value=>{const speed=Number(shipStats(value).speedOrOtherStationValue),standard=window.nativeShipDefinitions.engineSpeeds.standard;return speed>standard?2.5*speed/standard:Math.max(.7,Math.min(2.5,speed/35));};
function unlockDev(value){
 value.devMode=true;
 if(!value.devWeaponKitGranted){for(const weapon of window.VexedMirrorWeapons||[])window.nativeWeaponLoadout.grant(value,weapon.id);value.devWeaponKitGranted=true}
 for(const key of devResources)value[key]=1000000000;
 value.stocks=Object.fromEntries(goods.map(g=>[g,1000000000]));
 value.discovered=world.systems.map(system=>system.id);
 value.localPrestige=Object.fromEntries(world.systems.map(system=>[system.id,100]));
 value.nav=100;value.hull=shipStats(value).hull;value.shields=shipStats(value).shields;
 window.nativeShipEquipment.ensure(value);
 return value;
}
let game=null,keys={},pressed={},last=performance.now(),toastTimer,flightShip=null,visualGeneration=0,spaceCamera=null,planetHit=null,planetHits=[],marketFromPlanet=false;
let inputFrame=0;
const heldFire=window.nativePlayerCombatControls.heldFire({targetKey:currentTargetKey,allowed:()=>targetInputAllowed()&&game.hull>0&&game.phase!=='disabled'&&!document.hidden&&!!selectedCombatTarget(),request:()=>fireLockedTarget(false)});
const combatFeedback=document.createElement('div');combatFeedback.id='combat-target-status';combatFeedback.hidden=true;combatFeedback.setAttribute('role','status');
Object.assign(combatFeedback.style,{position:'absolute',left:'50%',top:'calc(var(--hud-height,43px) + 54px)',transform:'translateX(-50%)',maxWidth:'min(640px,85%)',padding:'6px 10px',background:'rgba(3,14,23,.82)',border:'1px solid #477988',borderRadius:'4px',color:'#c8e9ee',font:'12px Arial,sans-serif',textAlign:'center',pointerEvents:'none',zIndex:'5'});document.querySelector('#game').append(combatFeedback);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const flightShipDimensions=()=>window.nativeShipDefinitions.dimensions(game,'player');
let devGalaxyView=false;
const travelling=()=>!!window.vexedWarp?.active;
const paused=()=>!!window.nativeOpeningCinematic?.active||!!window.nativePause?.active||!!window.nativeShipInventory?.active,busy=()=>travelling()||paused()||!!window.nativeShipyardServices?.busy;
const sys=id=>navigation.system(id);
function fresh(){return navigation.initialize({faction:0,captain:'Captain',shipName:'ISS Wayfarer',shipClass:'Danube Runabout',weapons:[1,null,null],weaponInventory:[],government:'United Earth',system:1,planet:'Earth',localBody:3,x:0,y:0,angle:-Math.PI/2,speed:0,hull:100,shields:100,latinum:500,deuranium:120,antimatter:80,dilithium:25,food:40,nav:0,day:1,landed:false,discovered:[1],stocks:Object.fromEntries(goods.map(g=>[g,40]))})}
function factionStart(selection,names){
 const start=world.factionStarts.find(entry=>entry.selectionId===Number(selection));
 const ship=world.ships.find(entry=>entry.id===start?.playership);
 if(!start||!ship)return false;
 const captain=String(names?.captain||'').trim(),shipName=String(names?.ship||'').trim(),government=String(names?.government||'').trim();
 if(!captain||!shipName||!government)return false;
 const state={...fresh(),faction:start.selectionId-1,captain,shipName,government,shipClass:ship.name,shipType:ship.id,
  weapons:ship.defaultWeapons.map(value=>value||null),system:start.myplanet,planet:navigation.system(start.myplanet).name,
  latinum:start.mylatinum,deuranium:start.mydeuranium,antimatter:start.myantimatter,discovered:[start.myplanet]};
 delete state.localPrestige;
 window.nativeWorldBootstrap?.apply(state);activate(state);window.nativeShipTraffic?.clearSpawn(state,{nearTraffic:true,view:window.nativeView.measure(canvas)});message(`${captain} commissioned at ${state.planet} in the ${ship.name}.`);save();return true;
}
function message(s){const status=document.querySelector('#connection');status.textContent=`DAY ${game?.day||1} · ${s}`;status.title=status.textContent}
function toast(s){const n=document.querySelector('#notice');n.textContent=s;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.textContent='',2600)}
function save(silent=false){
 if(!game)return {ok:false,error:'No game to save.'};
 const result=window.nativeSaveStorage.write(game);
 if(!result.ok){toast(result.error);message(result.error);return result;}
 document.querySelector(game.devMode?'[data-menu="continue-dev"]':'[data-menu="continue"]').disabled=false;
 if(!silent)toast('Command data saved');return result;
}
function reportSaveResult(result){if(result&&!result.ok){toast(result.error);message(result.error);}return result;}
function scheduleCombatSave(){if(game)reportSaveResult(window.nativeSaveStorage.schedule(game,{delay:.25,maxWait:1}));}
function flushCombatSave(){if(game)reportSaveResult(window.nativeSaveStorage.flush(game));}
function clearFlightInput(){keys={};pressed={};heldFire.stop();cancelTargetPress();flushCombatSave();}
function savedGame(mode){const value=window.nativeSaveStorage.read(mode);return value&&navigation.system(value.system)&&Number.isFinite(Number(value.antimatter))?value:null;}
function updateVisuals(){window.nativeShipSystems?.refreshShip(game,game,'player');const token=++visualGeneration;if(flightShip?.type!==Number(game.shipType))flightShip=null;window.vexedFlightAssets.loadShip(game.shipType,game.hull*window.nativeShipDefinitions.get(game.shipType).hull/Math.max(1,shipStats(game).hull)).then(asset=>{if(token===visualGeneration)flightShip=asset}).catch(()=>{});window.vexedFlightAssets.loadPlanet(game.system).catch(()=>{});window.vexedSolFlight.art(localCurrent(),game.system)}
window.nativeCombatShots.onPlayerImpact=impact=>window.nativePlayerCombat.visualImpact(game,impact);
window.nativeCombatShots.onPlayerHit=(state,damage,impact)=>{
 const before=state.hull,result=window.nativePlayerCombat.hit(state,damage,impact);
 if(state===game&&result.ok){
  if(state.hull!==before)updateVisuals();
  if(result.destroyed||result.disabled){clearFlightInput();message('Hull disabled. Repair your ship to resume flight.');}
  refresh();
 }
 return result;
};
function activateState(value){clearFlightInput();window.nativePlayerCombat.reset();window.nativeEnvironmentalImpacts?.reset();cancelTargetPress();window.nativeShipInventory?.close();window.nativePause.close();window.vexedWarp.reset();window.nativeGalaxyMap?.close(false);window.nativePlanetEncounter?.close(false);window.nativeAsteroidCombat?.clear();window.nativeSolEconomy?.clearTarget();window.nativeCivilianTraffic?.clearTarget();game=navigation.initialize(value);window.nativeSimulation.ensure(game);window.nativeAsteroidMotion?.ensure(game);setDevGalaxyView(false);if(game.vitalsVersion!==2){const ship=shipStats(game);game.hull=Math.round(Math.max(0,Math.min(100,Number(game.hull)||0))*ship.hull/100);game.shields=Math.round(Math.max(0,Math.min(100,Number(game.shields)||0))*ship.shields/100);game.vitalsVersion=2;}game.localBody=Number.isInteger(Number(game.localBody))?Number(game.localBody):3;game.localContracts=Array.isArray(game.localContracts)?game.localContracts:[];game.weaponInventory=Array.isArray(game.weaponInventory)?game.weaponInventory.map(Number).filter(id=>Number.isInteger(id)&&id>0&&window.VexedMirrorWeapons?.some(item=>item.id===id)):[];window.nativeShipEquipment.ensure(game);window.nativeSolEconomy.initialize(game);window.nativeCivilianTraffic.initialize(game);window.nativeShipRepairs?.initialize(game);window.nativeNpcLives?.initialize(game);window.vexedSolFlight?.setTarget(game.localCruise?.to??game.localNavTarget??game.localBody,game.system);if(game.devMode)unlockDev(game);window.nativeWeaponLoadout.ensure(game);window.nativeCombatShots.restore?.(game);window.vexedSpace.enterSystem(game.system,true);spaceCamera=null;clearFlightInput();modal.hidden=true;menuArt.hidden=true;document.body.classList.add('playing');document.getElementById('save').disabled=false;devButton.hidden=!game.devMode;window.nativeShipyardServices?.restore();updateVisuals();refresh()}

function activate(value){hostTime.checkpoint();simulationService.cancel();preparingTravel=false;activateState(value);simulationService.cancel();hostTime.reset();}
function begin(){const state={...fresh(),devMode:true};window.nativeWorldBootstrap?.apply(state);activate(state);window.nativeShipTraffic?.clearSpawn(state);const demo=window.nativeDevRepairDemo?.start(game);message(demo?.ok?'Dev command ready. Nearby disabled cruiser: Olympic response underway.':'Dev command ready. All systems, ships, and supplies are available.');save()}
function resume(mode){const saved=savedGame(mode);if(!saved)return;const defaults=fresh(),value={...defaults,...saved,stocks:{...defaults.stocks,...saved.stocks}};for(const key of ['system','faction','day','nav','antimatter','deuranium','latinum','dilithium','food','x','y','angle','speed','hull','shields'])value[key]=Number.isFinite(Number(value[key]))?Number(value[key]):defaults[key];activate(value);if(game.devMode)save(true);message(`Command data restored. Current system: ${sys(game.system).name}.`);const receipt=game.pendingTransit;if(receipt?.version===1&&receipt.report?.systemId===game.system&&Array.isArray(receipt.report.events))startJourney(receipt.report,null,true)}
window.startNativeNewGame=()=>window.nativeSetup.open();
window.startNativeFactionGame=factionStart;
window.startNativeDevGame=begin;
window.resumeNativeGame=resume;
document.addEventListener('DOMContentLoaded',()=>window.nativeWorldBootstrap?.prepare(fresh()),{once:true});
function refresh(){document.querySelector('#captain').textContent=`${game.captain} | ${game.government}`;document.querySelector('#shipLine').textContent=game.shipName;document.querySelector('#mineBtn').textContent=window.nativeAsteroidCombat?.target?'Mine asteroid':'Scan';window.vexedHud.update(game);window.nativeShipInventory?.refresh();}
function size(){return window.nativeView.fit(canvas,ctx)}
let starTime=0;
let lastCruiseSave=0;
let lastManualSave=0;
function updateManualFlight(now){
 const destination=window.nativeManualFlight.nearbySystem(game);
 if(destination&&window.nativeManualFlight.enter(game,destination)){
  if(destination.id===1)window.vexedSolFlight?.setTarget(3);
  window.vexedSpace.enterSystem(destination.id,true);
  spaceCamera=null;updateVisuals();refresh();save(true);
  message(`Entered ${destination.name} by manual flight.`);
  lastManualSave=now;
  return;
 }
 if(game.speed>0&&now-lastManualSave>5000){lastManualSave=now;save(true);}
}
function approachDistance(diameter){
 const size=window.vexedFlightAssets.size(game.shipType);
 const dimensions=window.nativeShipDefinitions.dimensions(game);const shipRadius=Math.hypot(dimensions.width,dimensions.height)/2;
 return diameter/2+shipRadius+24;
}
function localApproachDistance(body){return approachDistance(window.vexedSolFlight.bodySize(body));}
function advanceArrivalApproach(dt,now){
 const approach=game?.arrivalApproach;
 if(!approach||dt<=0)return;
 if(approach.system!==game.system){delete game.arrivalApproach;game.speed=0;save(true);return;}
 const moved=window.nativeShipSystems.move(game,game,'player',{goal:{x:approach.x+(game.system===1?window.vexedSolFlight.shipPosition(game).x-game.x:0),y:approach.y+(game.system===1?window.vexedSolFlight.shipPosition(game).y-game.y:0)},snap:true},shipStats(game).movement,dt);
 if(moved.arrived){
  delete game.arrivalApproach;save(true);message(`Approach complete at ${localCatalog.current(game).name}.`);refresh();return;
 }
 if(now-lastCruiseSave>2000){lastCruiseSave=now;save(true);}
}
function advanceLocalCruise(dt,now){
 if(!game?.localCruise||dt<=0)return;
 const cruise=game.localCruise,destination=localBodies().find(body=>body.id===Number(cruise.to));
 if(!destination){game.localCruise=null;game.speed=0;save(true);return;}
 const ship=window.vexedSolFlight.shipPosition(game);
 const goal=window.vexedSolFlight.bodyPosition(destination);
 if(!Number.isFinite(Number(cruise.stopX))||!Number.isFinite(Number(cruise.stopY))){
  const origin=localBodies().find(body=>body.id===Number(cruise.from));
  const start=origin?window.vexedSolFlight.bodyPosition(origin):ship;
  const awayX=start.x-goal.x,awayY=start.y-goal.y,length=Math.hypot(awayX,awayY)||1;
  const clearance=localApproachDistance(destination);
  cruise.stopX=goal.x+awayX/length*clearance;
  cruise.stopY=goal.y+awayY/length*clearance;
 }
 const dx=cruise.stopX-ship.x,dy=cruise.stopY-ship.y,distance=Math.hypot(dx,dy);
 const movement=shipStats(game).movement;
 cruise.speed=movement.maxSpeed;cruise.speedVersion=3;
 const moved=window.nativeShipSystems.move(game,game,'player',{goal:{x:cruise.stopX,y:cruise.stopY},snap:true},movement,dt);
 if(moved.arrived){
  localCatalog.arrive(game,destination,{x:cruise.stopX,y:cruise.stopY});game.localNavTarget=destination.id;game.speed=0;game.localCruise=null;
  updateVisuals();save(true);message(`Arrived at ${destination.name}.`);window.nativeSystemHub?.refresh();return;
 }
 if(now-lastCruiseSave>2000){lastCruiseSave=now;save(true);}
}
let lastEconomySave=0;
// Display refresh does not select the physical timestep. The shared schedule
// retains elapsed active time and bounds catch-up work per host frame.
function advanceSimulation(dt,now){
 if(!game||window.nativeSimulation.blocked()||travelling())return;
 const repairHullBefore=game.hull,repairStageBefore=window.nativeShipDefinitions.stage(window.nativeShipDefinitions.describe(game));
 window.nativeSimulationFrame.run(game,dt,(step,now)=>{
  window.nativeShipyardServices?.advance(game,step);window.nativeShipyardRefits?.advance(game,step);
  window.nativeAsteroidMotion?.advance(game,step);
  window.nativeShipTraffic?.advance(game,step);
  if(game.phase!=='disabled'){advanceLocalCruise(step,now);advanceArrivalApproach(step,now);}
  if(window.nativePopulation.advanceSeconds(game,step)){window.nativePlanetEncounter?.refresh();window.nativeSystemHub?.updatePopulation();}
  window.nativeSolEconomy.advance(game,step);
  window.nativeCivilianTraffic.advance(game,step);
  window.nativeCombatShots.advance(game,step);
  window.nativeEnvironmentalImpacts?.advance(game,step);
  window.nativeShipEffects.advance(game,step);
  window.nativeAsteroidCombat.advance(game,step);
  if(modal.hidden&&game.phase!=='disabled'&&game.hull>0&&!game.landed&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!game.localCruise&&!game.arrivalApproach&&!busy()){
   const held=code=>keys[code]||pressed[code];
   const turn=(held('KeyA')||held('ArrowLeft')?-1:0)+(held('KeyD')||held('ArrowRight')?1:0);
   window.nativeShipSystems.move(game,game,'player',{turn,throttle:held('KeyW')||held('ArrowUp')?1:0,brake:!!(held('KeyS')||held('ArrowDown'))},undefined,step);
   pressed={};
   updateManualFlight(now);
  }
  if(game.phase==='disabled')window.nativeShipSystems.move(game,game,'player',{},undefined,step);
  window.nativeAsteroidMotion?.collide(game,step);
  window.nativeShipTraffic?.collide(game,step);
 });
 if(game.hull!==repairHullBefore){window.vexedHud.update(game);if(window.nativeShipDefinitions.stage(window.nativeShipDefinitions.describe(game))!==repairStageBefore)updateVisuals();}
 now=window.nativeSimulation.now(game);
 if(now-lastEconomySave>8000){lastEconomySave=now;save(true)}
}
let preparingTravel=false;
const hostTime=window.nativeSimulationHost=window.nativeSimulationFrame.createHostTime({getState:()=>game,active:()=>!window.nativeSimulation.blocked()&&!travelling()&&!preparingTravel});
const simulationService=window.nativeSimulationFrame.createService({getState:()=>game,allowed:()=>!travelling(),advance(){advanceSimulation(0,window.nativeSimulation.now(game));if(game)reportSaveResult(window.nativeSaveStorage.flushDue(game));}});
// Returning from a hidden tab must not advance its suspended interval.
const checkpointHost=event=>{hostTime.checkpoint(event?.detail?.at);if(window.nativeSimulation.blocked()){simulationService.cancel();clearFlightInput();}else simulationService.request(game);};
addEventListener('native-pausechange',checkpointHost);addEventListener('native-inventorychange',checkpointHost);addEventListener('native-flightgatechange',checkpointHost);
document.addEventListener('visibilitychange',()=>checkpointHost());
addEventListener('pagehide',()=>{hostTime.checkpoint();flushCombatSave();});
function draw(frameTime){if(window.nativeOpeningCinematic?.active){hostTime.checkpoint(frameTime);last=frameTime;requestAnimationFrame(draw);return;}const frameStarted=performance.now(),frameMs=Math.max(0,frameTime-last);hostTime.checkpoint(frameTime);const dt=hostTime.consumeDisplay();last=frameTime;starTime+=dt;inputFrame++;window.nativeSimulationFrame?.begin(game);advanceSimulation(0,window.nativeSimulation.now(game));simulationService.request(game);const now=window.nativeSimulation.now(game);heldFire.step(inputFrame);updateCombatFeedback();if(game)reportSaveResult(window.nativeSaveStorage.flushDue(game));const simulationMs=performance.now()-frameStarted,renderStarted=performance.now();const recordFrame=()=>{window.nativeSimulationMetrics?.record(game,{frame:frameMs,simulation:simulationMs,render:performance.now()-renderStarted,mode:devGalaxyView?'map':'flight'});window.nativeSimulationFrame?.end(game);};const {w,h,safeBottom}=size(),warpFlight=window.vexedWarp.flightEffect,zoom=1;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
 window.vexedShieldGPU?.beginFrame(ctx);
 if(game&&!paused()&&!document.hidden&&!travelling()){
  const arrived=window.vexedSolFlight?.nearestArrival(game);
  if(arrived){updateVisuals();save(true);message(`Approaching ${arrived.name}. ${arrived.port?'Local services are available nearby.':'No port is available here.'}`);window.nativeSystemHub?.refresh();}
 }
 if(devGalaxyView&&game?.devMode&&!travelling()){
  asteroidMineButton.hidden=true;
  planetHit=null;planetHits=[];
  window.nativeGalaxyOverview.paint(ctx,{w,h},game);
  window.nativeRadar?.paint(game,false);
  window.vexedShieldGPU?.endFrame(ctx,now);
  recordFrame();requestAnimationFrame(draw);return;
 }
 const playerDescriptor=game?window.nativeShipDefinitions.describe(game,game,{category:'player'}):null;
 const renderPosition=window.nativeSimulationFrame.renderPose(game,playerDescriptor);
 const solPosition=game?.system===1?renderPosition:null;
 const cameraX=(renderPosition?.x??0)+(warpFlight?.cameraX||0),cameraY=(renderPosition?.y??0)+(warpFlight?.cameraY||0),cx=w/2,cy=h/2;
 syncAsteroidMineButton(renderPosition||game,{w,h,cx,cy,zoom});
 const planetX=cx-220-cameraX,planetY=cy+75-cameraY,planetSize=180;
 const planetObject={x:planetX,y:planetY,width:planetSize,height:planetSize};
 const screenPlanetX=cx+(planetX-cx)*zoom,screenPlanetY=cy+(planetY-cy)*zoom,screenPlanetSize=planetSize*zoom;
 const screenPlanet={x:screenPlanetX,y:screenPlanetY,width:screenPlanetSize,height:screenPlanetSize,contains(x,y){return ((x-screenPlanetX)/(screenPlanetSize*.48))**2+((y-screenPlanetY)/(screenPlanetSize*.48))**2<1;}};
 const solBodies=game&&window.vexedSolFlight?window.vexedSolFlight.visibleBodies(game,{w,h,cx,cy,zoom,camera:{x:cameraX,y:cameraY}}):null;
 const visualBodies=solBodies?.filter(entry=>entry.body.kind!=='belt');
 // Lighting and occlusion share the artwork's screen-space opaque limb.
 const planetVisuals=visualBodies?visualBodies.map(entry=>({x:entry.screenX,y:entry.screenY,width:entry.screenSize,height:entry.screenSize,id:entry.body.id,art:window.vexedSolFlight.art(entry.body.id,game.system)})):
  [{x:screenPlanetX,y:screenPlanetY,width:screenPlanetSize,height:screenPlanetSize,art:window.vexedFlightAssets.planet(game?.system)}];
 for(const visual of planetVisuals)visual.disk=window.vexedSpace.bodyDisk(visual,game?.system,visual.id,Boolean(visual.art));
 planetHits=visualBodies?visualBodies.map(entry=>({id:entry.body.id,name:entry.body.name,contains:(x,y)=>((x-entry.screenX)/(entry.screenSize*.48))**2+((y-entry.screenY)/(entry.screenSize*.48))**2<1})):[];
 planetHit=solBodies?planetHits.find(hit=>hit.id===Number(game.localBody))||null:game&&screenPlanetX+screenPlanetSize/2>=0&&screenPlanetX-screenPlanetSize/2<=w&&screenPlanetY-screenPlanetSize/2>=0&&screenPlanetY-screenPlanetSize/2<=h?screenPlanet:null;
 if(game){
  const phase=warpFlight?.kind||'flight';
  const previous=spaceCamera?.system===game.system&&spaceCamera?.phase===phase?spaceCamera:null;
  const locx=previous&&dt>0?-(cameraX-previous.x)/(dt*13):0,locy=previous&&dt>0?-(cameraY-previous.y)/(dt*13):0;
  spaceCamera={x:cameraX,y:cameraY,system:game.system,phase};
  window.vexedSpace.enterSystem(game.system);window.vexedSpace.update(dt,{locx,locy,speed:locx||locy?Math.max(0,warpFlight?.speed??game.speed):0,warp:phase==='arrival'?2:1,frame:Math.floor(starTime*window.VexedFlightReference.space.sourceRenderFps)});
  const warpPulse=phase==='departure'?(warpFlight.ring?.alpha||0):phase==='arrival'?1-(warpFlight.alpha||0):0;
  window.vexedSpace.render(ctx,{w,h,zoom,reducedMotion:reducedMotion.matches,warpPulse,playerX:solPosition?.x??game.x,playerY:solPosition?.y??game.y,cameraX,cameraY},planetVisuals.map(visual=>visual.disk));
 }
 if(game&&modal.hidden){const shipDimensions=flightShipDimensions(),shipW=shipDimensions.width,shipH=shipDimensions.height;
 ctx.save();
 // Nearby world and flight instruments
 for(const visual of planetVisuals){
  if(visual.x+visual.width<0||visual.x-visual.width>w||visual.y+visual.height<0||visual.y-visual.height>h)continue;
  window.vexedSpace.planetGlow(ctx,visual.disk);
  if(visual.art)ctx.drawImage(visual.art,visual.x-visual.width/2,visual.y-visual.height/2,visual.width,visual.height);
  else{ctx.fillStyle=visual.id===0?'#edba65':'#315d83';ctx.beginPath();ctx.ellipse(visual.disk.x,visual.disk.y,visual.disk.rx,visual.disk.ry,0,0,Math.PI*2);ctx.fill();
   if(!visualBodies){ctx.fillStyle='#65b5d2';ctx.beginPath();ctx.ellipse(visual.x-8,visual.y-8,9,4,-.5,0,7);ctx.fill()}}
  window.vexedSpace.planetLight(ctx,visual.disk);
 }
 // All ships, their lights and combat effects pass in front of planets.
 window.nativeSolAsteroids?.paint(ctx,{system:game.system,ship:renderPosition||game,cx,cy,zoom,w,h,mined:[...(game.minedAsteroids||[]),...(game.destroyedAsteroids||[])],damage:game.asteroidDamage||{},hiddenId:window.nativeAsteroidCombat?.miningId,hiddenIds:window.nativeCivilianTraffic.miningIds(game)});
 window.nativeShipSpriteCache.beginFrame?.(ctx,{width:w,height:h});window.nativeHullBatch?.begin(ctx);
 if(game.system===1&&solPosition)window.nativeSolEconomy.paint(ctx,{state:game,ship:solPosition,cx,cy,w,h,zoom});
 window.nativeCivilianTraffic.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,w,h,zoom});
 window.nativeShipEffects.paintShip(ctx,playerDescriptor,{ship:renderPosition||game,cx,cy,w,h,asset:warpFlight?window.vexedWarp.flightShip||flightShip:flightShip,
  x:warpFlight?warpFlight.shipX+cx-300:cx,y:warpFlight?warpFlight.shipY+cy-225:cy,dimensions:shipDimensions,warpEffect:warpFlight,
  appearance:{light:window.vexedSpace.light,warpPulse:warpFlight?.kind?1:0,...window.nativeShipyardServices?.appearance(game)}});
 window.nativeHullBatch?.end(ctx);window.nativeShipSpriteCache.endFrame?.(ctx);
 window.vexedShieldGPU?.endFrame(ctx,now);
 window.vexedFlightAssets.drawWarpRing(ctx,warpFlight?.ring?{...warpFlight.ring,x:warpFlight.ring.x+cx-300,y:warpFlight.ring.y+cy-225}:null,shipW);
 window.nativeCombatShots.paintAll(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,now,w,h});
 window.nativeShipEffects.paint(game,ctx,{ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeRepairVisuals?.paint(game,ctx,{ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeCivilianTraffic.paintMining(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeAsteroidCombat?.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,now,w,h});
 window.nativeEnvironmentalImpacts?.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeMarsShipyard?.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,w,h,now});
 ctx.restore();
 ctx.fillStyle='#b4c6d7';ctx.font='12px system-ui';ctx.fillText(`FLIGHT · ${Math.round(warpFlight?.speed??game.speed)} u/s`,16,24);ctx.fillText(`SYSTEM ${String(game.system).padStart(2,'0')} · ${sys(game.system).name.toUpperCase()}`,16,43);ctx.fillStyle='#24374a';ctx.fillRect(16,h-safeBottom-24,130,5);ctx.fillStyle='#6dd8ed';ctx.fillRect(16,h-safeBottom-24,130*Math.max(0,Math.min(1,game.shields/Math.max(1,shipStats(game).shields))),5);ctx.fillStyle='#ef7885';ctx.fillRect(16,h-safeBottom-15,130*Math.max(0,Math.min(1,game.hull/Math.max(1,shipStats(game).hull))),4);ctx.fillStyle='#9eb1c2';ctx.fillText('SHIELDS',154,h-safeBottom-18);ctx.fillText('HULL',154,h-safeBottom-7);
 const debt=game.shipSimulation?.schedule?.pendingSeconds||0;
 if(debt>.25){ctx.fillStyle='#eac987';ctx.fillText(`Catching up · ${debt.toFixed(2)} s`,16,62);}
 if(game.landed&&!warpFlight&&!window.nativeShipyardServices?.docked){ctx.fillStyle='#06101bdc';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#e7f7ff';ctx.font='22px system-ui';ctx.fillText(`PORT OF ${sys(game.system).name.toUpperCase()}`,w/2,h/2-12);ctx.font='13px system-ui';ctx.fillStyle='#9db8ce';ctx.fillText('Docked · open Trade to buy and sell cargo',w/2,h/2+18);ctx.textAlign='left'}
 }
 window.nativeRadar?.paint(game,!!game&&modal.hidden&&!travelling()&&!paused()&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active);
 recordFrame();requestAnimationFrame(draw)}requestAnimationFrame(draw);
function showMap(){if(game&&!busy()){window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);window.nativeGalaxyMap.open()}}
function openInventory(){if(window.nativeShipyardServices?.busy)return;if(!game||travelling()||window.nativePause?.active||!modal.hidden||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active||window.nativeGalaxyMap?.isOpen)return;window.nativeShipInventory.open()}
function trackManualSystem(id){
 const destination=window.nativeManualFlight.guidance(game,id);
 if(!destination)return{ok:false,error:'This system has no known position.'};
 game.manualTargetSystem=destination.id;
 save(true);message(`Manual course to ${destination.name}. Steer toward the radar arrow.`);
 return{ok:true,message:`Tracking ${destination.name} for manual flight.`};
}
window.nativeManualFlight.clearTracking=()=>{if(game?.manualTargetSystem){game.manualTargetSystem=0;save(true);}};
function startJourney(report,next,resumed=false,destinationLabel){if(!resumed&&window.nativeShipRepairs?.playerDronesDeployed(game))return {ok:false,error:'Recover your repair drones before travelling.'};preparingTravel=true;hostTime.checkpoint();window.nativeCombatShots.cancel();clearFlightInput();setDevGalaxyView(false);modal.hidden=true;const started=window.vexedWarp.start({report,resumed,destinationLabel,originPosition:{x:game.x,y:game.y},originAngle:game.angle+Math.PI/2,originShip:flightShip,arrivalAngle:Math.atan2(-220,-75),
 commit(){const previous=game;game=next;hostTime.reset();window.nativePlayerCombat.reset();window.nativeEnvironmentalImpacts.reset();if(game.system===1&&previous.system!==1)game.localBody=3;game.localCruise=null;delete game.arrivalApproach;game.pendingTransit={version:1,phase:'report',report};const saved=save(true);if(!saved.ok){game=previous;hostTime.reset();throw Error(saved.error)}updateVisuals();message(`Transit to ${report.systemName} complete. Awaiting your arrival command.`);refresh()},
 beginArrival(){window.vexedSpace.enterSystem(game.system,true);spaceCamera=null;game.pendingTransit.phase='arrival';game.angle=Math.atan2(75,-220);game.landed=false;save(true)},
 finish(){preparingTravel=false;hostTime.checkpoint();delete game.pendingTransit;const planet=game.system===1?window.nativeSystemHub.sol.find(body=>body.id===3):null,goal=planet?window.vexedSolFlight.bodyPosition(planet):{x:-220,y:75};const dx=goal.x-game.x,dy=goal.y-game.y,distance=Math.hypot(dx,dy),clearance=approachDistance(planet?window.vexedSolFlight.bodySize(planet):128);game.arrivalApproach={system:game.system,x:distance>clearance?goal.x-dx/distance*clearance:game.x,y:distance>clearance?goal.y-dy/distance*clearance:game.y};game.speed=window.vexedRebirthWarp.arrivalSpeed;save(true);message(`Arrived at ${report.systemName}. ${report.elapsedDays} days elapsed; ${report.fuelUsed} antimatter consumed. Slowing for planetary approach.`);refresh();canvas.focus({preventScroll:true})},
 cancel(wasCommitted){preparingTravel=false;hostTime.checkpoint();if(wasCommitted){delete game.pendingTransit;save(true)}message(wasCommitted?`Arrived at ${report.systemName}.`:'Transit interrupted. Your original course and resources are unchanged.');refresh();canvas.focus({preventScroll:true})}
});preparingTravel=false;hostTime.checkpoint();return started;}
function warp(journey){if(game.phase==='disabled'||game.hull<=0)return{ok:false,error:'Repair your disabled hull before warping.'};if(game.arrivalApproach)return{ok:false,error:'Finish the current approach before warping.'};if(busy())return{ok:false,error:'A journey is already in progress.'};hostTime.checkpoint();if(!window.nativeSimulationFrame.transitionReady(game))advanceSimulation(0,window.nativeSimulation.now(game));if(!window.nativeSimulationFrame.transitionReady(game)){simulationService.request(game);return{ok:false,error:'Simulation is catching up. Wait for flight to recover before warping.'};}preparingTravel=true;hostTime.checkpoint();try{const prepared=window.vexedTravelEvents.plan(game,journey);return startJourney(prepared.report,prepared.next,false,journey.name);}catch(error){preparingTravel=false;hostTime.checkpoint();throw error;}}
function close(){modal.hidden=true;marketFromPlanet=false}
function hubPort(id){
 return !!localCatalog.nodes(game).find(node=>node.id===Number(id))?.port;
}
function hubHere(id){return !game.localCruise&&hubPort(id)&&id===localCurrent()}
function hubPrice(good,port){const index=goods.indexOf(good);return ([18,24,45,8][index]||20)+((game.system*7+port*11+index*13)%19)}
function hubCargoPay(from,to){
 const a=window.nativeSystemHub.sol.find(node=>node.id===from),b=window.nativeSystemHub.sol.find(node=>node.id===to);
 return a&&b?Math.round(Math.hypot(b.x-a.x,b.y-a.y)/45)+80:0;
}
function hubTrade(good,buy,port,quantity=1){
 if(!hubHere(port))return{ok:false,error:'Travel to this port before trading.'};
 quantity=Number(quantity);
 if(![1,5,10].includes(quantity))return{ok:false,error:'Choose 1, 5, or 10 units.'};
 const key=String(good).toLowerCase(),price=buy?hubPrice(good,port):Math.max(1,hubPrice(good,port)-4);
 if(!goods.includes(good))return{ok:false,error:'Unknown resource.'};
 if(game.devMode)return{ok:true,message:`${good} is unlimited in Dev mode.`};
 if(buy&&good==='Deuranium'&&window.nativeShipEquipment.cargoUsed(game)+quantity>shipStats(game).cargo)return{ok:false,error:'Not enough cargo space for repair supplies.'};
 if(buy&&game.latinum<price*quantity)return{ok:false,error:'Not enough latinum.'};
 if(buy&&game.stocks[good]<quantity)return{ok:false,error:'Market stock is too low.'};
 if(!buy&&Number(game[key])<quantity)return{ok:false,error:'You do not have that many to sell.'};
 game[key]=Number(game[key])+(buy?quantity:-quantity);game.latinum+=buy?-price*quantity:price*quantity;game.stocks[good]+=buy?-quantity:quantity;
 save(true);refresh();return{ok:true,message:`${buy?'Bought':'Sold'} ${quantity} ${good} for ${price*quantity} latinum.`};
}
function hubFreightTrade(good,buy,port,quantity,quotedTotal){
 if(game.system!==1||!hubHere(port))return{ok:false,error:'Reach this Sol port to load or sell freight.'};
 const result=window.nativeSolEconomy.buySell(game,port,good,buy,quantity,quotedTotal);
 if(result.ok){save(true);refresh()}
 return result;
}
const shopWeaponOffers={1:[7,10,6],2:[14,4,15],3:[1,7,10,14,15,16],4:[7,8,15],5:[6,8,17],7:[2,9,13],8:[3,11,16],9:[4,14,19],10:[2,13,17]};
function hubBuyWeapon(id,port){
 if(!hubHere(port))return{ok:false,error:'Reach this port to buy a weapon.'};
 const offers=game.system===1?shopWeaponOffers[port]||[]:[1,7,10,14,15];
 if(!offers.includes(id))return{ok:false,error:'This weapon is not offered at this port.'};
 const weapon=window.VexedMirrorWeapons?.find(entry=>entry.id===id);
 if(!weapon)return{ok:false,error:'Weapon unavailable.'};
 if(!game.devMode&&game.latinum<weapon.price)return{ok:false,error:'Not enough latinum for this weapon.'};
 if(!game.devMode)game.latinum-=weapon.price;
 window.nativeWeaponLoadout.grant(game,id);save(true);refresh();message(`${weapon.name} added to your weapon locker.`);
 return{ok:true,message:`${weapon.name} added to your weapon locker. Equip it in your inventory.`};
}
function hubRepair(port){
 if(!hubHere(port))return{ok:false,error:'Reach this port for repairs.'};
 const ship=shipStats(game);
 if(game.hull>=ship.hull&&game.shields>=ship.shields)return{ok:false,error:'Hull and shields are already at full strength.'};
 if(!game.devMode&&game.latinum<40)return{ok:false,error:'Repairs cost 40 latinum.'};
 if(!game.devMode)game.latinum-=40;
 game.hull=Math.min(ship.hull,game.hull+Math.ceil(ship.hull*.25));game.shields=Math.min(ship.shields,game.shields+Math.ceil(ship.shields*.25));
 updateVisuals();save(true);refresh();return{ok:true,message:'Hull and shields restored by 25% of capacity.'};
}
function hubCruise(id){
 if(window.nativeShipRepairs?.playerDronesDeployed(game))return {ok:false,error:'Recover your repair drones before cruising.'};
 if(game.phase==='disabled'||game.hull<=0)return{ok:false,error:'Engines are disabled until hull repairs finish.'};

 if(game.localCruise||game.arrivalApproach)return{ok:false,error:'Finish the current approach before cruising.'};
 const from=localBodies().find(node=>node.id===localCurrent());
 const to=localBodies().find(node=>node.id===Number(id));
 if(!from||!to)return{ok:false,error:'Choose a local destination.'};
 const ship=window.vexedSolFlight.shipPosition(game),goal=window.vexedSolFlight.bodyPosition(to),distance=Math.hypot(goal.x-ship.x,goal.y-ship.y);
 const clearance=localApproachDistance(to);
 if(distance<=clearance+5)return{ok:false,error:'You are already at this destination.'};
 const stopX=distance>clearance?goal.x-(goal.x-ship.x)/distance*clearance:ship.x;
 const stopY=distance>clearance?goal.y-(goal.y-ship.y)/distance*clearance:ship.y;
 const speedFactor=localSpeedFactor(game),speed=Math.max(350,Math.min(1500,Math.ceil(distance/8)))*speedFactor;
 game.localCruise={from:from.id,to:to.id,speed,speedFactor,speedVersion:2,stopX,stopY,startedAt:Date.now()};game.speed=0;game.landed=false;
 game.manualTargetSystem=0;game.localNavTarget=to.id;window.vexedSolFlight.setTarget(to.id,game.system);lastCruiseSave=window.nativeSimulation.now(game);
 save(true);message(`Flying from ${from.name} to ${to.name}.`);return{ok:true,message:`Course set for ${to.name}. Flying there now.`};
}
function selectLocalDestination(id){
 const destination=localBodies().find(body=>body.id===Number(id));
 if(!game||!destination)return{ok:false,error:'Choose a local destination in this system.'};
 if(game.localCruise||game.arrivalApproach)return{ok:false,error:'Finish the current approach before setting another course.'};
 game.manualTargetSystem=0;game.localNavTarget=destination.id;window.vexedSolFlight.setTarget(destination.id,game.system);save(true);
 message(`${destination.name} selected for navigation.`);
 return{ok:true,message:`${destination.name} selected on the flight radar.`};
}
function mapCruise(id){
 return hubCruise(id);
}
function deliveryNavigation(id,action){
 const contract=game?.localContracts?.find(job=>Number(job.id)===Number(id));
 if(!contract)return{ok:false,error:'This delivery is no longer aboard.'};
 const destination=window.nativeSystemHub.sol.find(node=>node.id===Number(contract.to)&&node.port);
 if(!destination)return{ok:false,error:'This delivery has no charted destination.'};
 if(action==='cruise')return hubCruise(destination.id);
 if(action!=='select')return{ok:false,error:'Unknown navigation action.'};
 if(game.system!==1)return{ok:false,error:'Return to Sol to select this planet.'};
 if(game.localCruise||game.arrivalApproach)return{ok:false,error:'Finish the current approach before selecting another destination.'};
 game.localNavTarget=destination.id;window.vexedSolFlight.setTarget(destination.id,game.system);save(true);
 message(`${destination.name} selected for manual navigation.`);
 return{ok:true,message:`${destination.name} selected on the flight radar.`};
}
function hubBuyShip(id,port){
 if(!hubHere(port))return{ok:false,error:'Reach this port to buy a ship.'};
 const offers=game.system===1?({1:[7,16],2:[6,7],3:[7,34,36,9,8,4],4:[7,18],5:[6,12,17,10],7:[3,15],8:[2,13],9:[5,10],10:[1,26]})[port]||[]:sys(game.system).planetShopItemIds;
 if(!offers.includes(id))return{ok:false,error:'This ship is not offered at this port.'};
 const ship=window.nativeShipDefinitions.get(id);
 if(!ship?.name||ship.id===game.shipType)return{ok:false,error:'You already command this hull.'};
 if(!game.devMode&&Number(game.localPrestige[game.system])<ship.massClass*15)return{ok:false,error:`Local prestige ${ship.massClass*15}% is required.`};
 if(!game.devMode&&game.latinum<ship.price)return{ok:false,error:'Not enough latinum for this ship.'};
 const accommodation=window.nativeShipEquipment.canChangeHull(game,id);if(!accommodation.ok)return accommodation;
 const tugMaterials=[[1,15],[2,12],[3,6],[7,5],[8,2]];
 if(id===10&&game.system===1&&port===5&&!game.devMode){const materials=window.nativeSolEconomy.consumeMaterials(game,5,tugMaterials);if(!materials.ok)return materials;}
 if(!game.devMode)game.latinum-=ship.price;
 window.nativeShipEquipment.changeHull(game,id);
 updateVisuals();refresh();save(true);message(`${ship.name} purchased at ${game.system===1?window.nativeSystemHub.sol[port].name:sys(game.system).name}.`);
 return{ok:true,message:`You now command the ${ship.name}.`};
}
function hubUpgradeTug(port){
 if(game.system!==1||port!==7||!hubHere(port)||game.shipType!==10)return{ok:false,error:'Bring Tug Class II to Jupiter Station for an engine upgrade.'};
 const equipment=window.nativeShipEquipment.ensure(game);if(!equipment.slots.engineering[0])return{ok:false,error:'Fit an engineering system before upgrading.'};const level=Math.max(0,Math.min(2,Number(equipment.instances[equipment.slots.engineering[0]]?.upgrades?.tugEngineLevel)||0));
 if(level>=2)return{ok:false,error:'The Tug already has its fastest Jupiter engine.'};
 const cost=level===0?2000:6000,materials=level===0?[[2,4],[3,6]]:[[2,8],[3,10],[7,4]],inventory=window.nativeSolEconomy.initialize(game).ports[7];
 if(!game.devMode&&game.latinum<cost)return{ok:false,error:'Not enough latinum for this upgrade.'};
 if(!game.devMode){const supplies=window.nativeSolEconomy.consumeMaterials(game,7,materials);if(!supplies.ok)return supplies;game.latinum-=cost;}
 game.tugEngineLevel=level+1;const eq=window.nativeShipEquipment.ensure(game);eq.instances[eq.slots.engineering[0]].upgrades.tugEngineLevel=level+1;window.nativeShipSystems?.refreshShip(game,game,'player');save(true);refresh();return{ok:true,message:`Tug Class II engine Mk ${level+2} installed. Manual and Sol cruise speed increased.`};
}
function hubContract(from,to,tons){
 if(game.system!==1||!hubHere(from))return{ok:false,error:'Reach the origin port to load cargo.'};
 game.localContracts=Array.isArray(game.localContracts)?game.localContracts:[];
 const result=window.nativeSolEconomy.contract(game,from,to,tons);
 if(result.ok)save(true);
 return result;
}
function hubDeliver(id){
 const contract=game.localContracts?.find(entry=>entry.id===id);
 if(!contract||!hubHere(contract.to))return{ok:false,error:'Reach the destination port to deliver this cargo.'};
 const result=window.nativeSolEconomy.deliver(game,id);if(result.ok){save(true);refresh()}return result;
}
function openHub(tab='navigation'){
 if(!game||busy())return;
 cancelTargetPress();
 if(tab==='navigation'){showMap();return;}
 window.nativeGalaxyMap?.close(false);window.nativePlanetEncounter?.close(false);modal.hidden=true;clearFlightInput();
 window.nativeSystemHub.open({getState:()=>game,price:hubPrice,cruise:hubCruise,trade:hubTrade,freightTrade:hubFreightTrade,buyShip:hubBuyShip,upgradeTug:hubUpgradeTug,sellMineral:hubSellMineral,refineDeuranium:hubRefineDeuranium,upgradeMinerals:hubUpgradeMinerals,prospect:hubProspect,contract:hubContract,deliver:hubDeliver,openMap:showMap,openEncounter},tab);
}
function hubBuyEquipment(id,port){
 if(!hubHere(port))return{ok:false,error:'Reach this port to buy equipment.'};
 const equipment=window.nativeShipEquipment,result=equipment.purchase(game,id);
 if(!result.ok)return result;
 equipment.inventoryLayout(game);
 const saved=save(true);refresh();
 return saved.ok?{ok:true,message:`${equipment.model(id).name} added to your inventory. Drag it into a ship bay to equip.`}:{ok:false,error:saved.error};
}
function hubBuyMiningTool(port){return hubBuyEquipment('mining-laser',port);}

function hubSellMineral(type,port,tons){
 if(!hubHere(port))return{ok:false,error:'Reach this port to sell minerals.'};
 const result=window.nativeNpcLives.sellMineral(game,type,port,tons);if(result.ok){save(true);refresh();}return result;
}
function hubRefineDeuranium(port,tons=1){
 if(!hubHere(port))return{ok:false,error:'Reach this port to refine deuranium.'};
 const result=window.nativeNpcLives.refineDeuranium(game,port,tons);if(result.ok){save(true);refresh();}return result;
}
function hubUpgradeMinerals(kind,port){
 if(!hubHere(port))return{ok:false,error:'Reach this port to install mineral technology.'};
 const result=window.nativeNpcLives.upgradeMinerals(game,kind,port);if(result.ok){updateVisuals();save(true);refresh();}return result;
}
function hubProspect(oreType){
 const ship=game.system===1?window.vexedSolFlight.shipPosition(game):game,gone=new Set([...(game.minedAsteroids||[]),...(game.destroyedAsteroids||[])]);
 const rock=(window.nativeSolAsteroids.forSystem(game.system)||[]).filter(r=>(!oreType||r.oreType===oreType)&&!r.demo&&!gone.has(r.slotId)&&!window.nativeCivilianTraffic.isMiningRock(game,r.slotId)).sort((a,b)=>Math.hypot(a.x-ship.x,a.y-ship.y)-Math.hypot(b.x-ship.x,b.y-ship.y))[0];
 if(!rock)return{ok:false,error:oreType==='deuranium'?'No unclaimed deuranium deposits remain in this system.':'No unclaimed asteroids remain in this system.'};
 const dx=rock.x-ship.x,dy=rock.y-ship.y,distance=Math.hypot(dx,dy),factor=Math.max(0,1-220/Math.max(1,distance));
 game.arrivalApproach={system:game.system,x:game.x+dx*factor,y:game.y+dy*factor};game.landed=false;game.speed=window.vexedRebirthWarp.arrivalSpeed;
 window.nativeSystemHub.close(false);window.nativePlanetEncounter.close(false);window.nativeAsteroidCombat.select(rock);save(true);message('Approaching '+rock.region+'. Stop near the asteroid, then choose Mine.');return{ok:true};
}
function openEncounter(){
 if(!game||busy())return;
 cancelTargetPress();
 window.nativeSystemHub?.close(false);window.nativeGalaxyMap?.close(false);modal.hidden=true;clearFlightInput();
 window.nativePlanetEncounter.open({getState:()=>game,price:hubPrice,trade:hubTrade,buyShip:hubBuyShip,buyWeapon:hubBuyWeapon,buyEquipment:hubBuyEquipment,buyMiningTool:hubBuyMiningTool,repair:hubRepair,sellMineral:hubSellMineral,refineDeuranium:hubRefineDeuranium,upgradeMinerals:hubUpgradeMinerals,prospect:hubProspect,quote:hubCargoPay,contract:hubContract,deliver:hubDeliver});
}
function trade(){if(!game||busy())return;window.nativeGalaxyMap?.close(false);const hailed=window.nativePlanetComm?.active;if(!game.landed&&!game.devMode&&!hailed&&!marketFromPlanet){toast('Click the planet or dock nearby [E]');return}if(hailed)marketFromPlanet=true;window.nativePlanetComm?.close(false);dialog.innerHTML=`<p style="color:var(--cyan);letter-spacing:.12em">LOCAL EXCHANGE · ${sys(game.system).name.toUpperCase()}</p><h2>Cargo market</h2><p>Exchange goods at local rates. One unit per transaction.</p><div class="market">${goods.map((g,i)=>{const price=([18,24,45,8][i])+((game.system*7+i*13)%19);return`<div><b>${g}</b><br><small>In hold: ${game.devMode?'∞':game[g.toLowerCase()]}</small></div><div>${game.devMode?'FREE':price+' L'}</div><button data-buy="${g}" data-price="${price}">Buy</button><button data-sell="${g}" data-price="${Math.max(1,price-4)}">Sell</button>`}).join('')}</div><p id="marketmsg" class="muted"></p><div class="row"><button data-close>Close</button></div>`;dialog.querySelector('[data-close]').onclick=close;dialog.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>tradeOne(b.dataset.buy,Number(b.dataset.price),true));dialog.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>tradeOne(b.dataset.sell,Number(b.dataset.price),false));modal.hidden=false}
function tradeOne(item,price,buy){const key=item.toLowerCase(),msg=dialog.querySelector('#marketmsg');if(game.devMode){msg.textContent=`${item} is unlimited in Dev mode.`;return}if(buy&&game.latinum<price){msg.textContent='Not enough latinum.';return}if(buy&&game.stocks[item]<=0){msg.textContent='Market depleted.';return}if(!buy&&game[key]<1){msg.textContent='No cargo available to sell.';return}game[key]+=buy?1:-1;game.latinum+=buy?-price:price;game.stocks[item]+=buy?-1:1;msg.textContent=`${buy?'Bought':'Sold'} 1 ${item}.`;refresh();save();trade()}
function dock(){if(window.nativeShipyardServices?.docked){window.nativeShipyardServices.select();return;}if(!game||busy())return;const yard=window.nativeMarsShipyard?.position(game),pose=game.system===1?window.vexedSolFlight.shipPosition(game):game;if(yard&&Math.hypot(yard.x-pose.x,yard.y-pose.y)<300){window.nativeShipyardServices.select();return;}if(game.localCruise||game.arrivalApproach){toast('Finish the current approach before docking');return}if(game.landed){game.landed=false;window.nativeShipSystems?.invalidateShips(game);message('Undocked.');return}{const body=localCatalog.current(game),ship=window.vexedSolFlight.shipPosition(game);if(!body?.port){toast('There is no port at this body');return}if(Math.hypot(body.x-220-ship.x,body.y+75-ship.y)>Math.max(180,window.vexedSolFlight.bodySize(body)*1.4,localApproachDistance(body)+20)){toast('Fly closer to '+body.name+' to dock');return}}game.landed=true;game.speed=0;window.nativeShipSystems?.invalidateShips(game);message(`Docked at ${localCatalog.current(game).name}. Local services available.`);refresh()}
function mineTarget(){
 const rock=window.nativeAsteroidCombat?.target;
 if(!rock)return false;
 const ship=game.system===1?window.vexedSolFlight.shipPosition(game):game;
 if(game.landed||game.localCruise||game.arrivalApproach||game.speed>20){toast('Stop near the asteroid to mine it');return true}
 const result=window.nativeAsteroidCombat.mine(game,ship,(rock,hasOre)=>{
  const notice=hasOre?'Ore released. Click anywhere inside the blue shield to transport all ore aboard.':'Asteroid mined.';
  message(notice);toast(notice);refresh();save(true);
 });
 if(!result.ok)toast(result.error);else{message(result.message);toast(result.message)}
 return true;
}
function syncAsteroidMineButton(ship,{w,h,cx,cy,zoom}){
 const rock=window.nativeAsteroidCombat?.target;
 const visible=rock&&ship&&modal.hidden&&!game.landed&&!travelling()&&!busy()&&!paused()&&!devGalaxyView&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&window.nativeAsteroidCombat?.miningId!==rock.slotId;
 if(!visible){asteroidMineButton.hidden=true;return}
 const sx=cx+(rock.x-ship.x)*zoom,sy=cy+(rock.y-ship.y)*zoom;
 const radius=Math.max(18,Math.hypot(rock.size,rock.size)*.41*zoom);
 const buttonWidth=Math.max(74,Math.min(180,radius*1.35)),buttonHeight=10;
 if(sx+radius<0||sx-radius>w||sy+radius<0||sy-radius>h){asteroidMineButton.hidden=true;return}
 const buttonX=Math.max(5,Math.min(w-buttonWidth-5,sx-buttonWidth/2));
 const buttonY=Math.max(5,Math.min(h-buttonHeight-5,sy+radius+22));
 const canvasRect=canvas.getBoundingClientRect(),stageRect=document.querySelector('#game').getBoundingClientRect(),scaleX=canvasRect.width/w,scaleY=canvasRect.height/h;
 asteroidMineButton.style.left=`${canvasRect.left-stageRect.left+buttonX*scaleX}px`;
 asteroidMineButton.style.top=`${canvasRect.top-stageRect.top+buttonY*scaleY}px`;
 asteroidMineButton.style.width=`${buttonWidth*scaleX}px`;
 asteroidMineButton.style.height=`${buttonHeight*scaleY}px`;
 asteroidMineButton.style.fontSize=`${Math.max(9,7*Math.min(scaleX,scaleY))}px`;
 asteroidMineButton.disabled=!game.miningTool;
 asteroidMineButton.textContent=game.miningTool?'MINE':'NEED TOOL';
 asteroidMineButton.title=game.miningTool?`Mine ${rock.name}`:'Buy a mining tool at a planet shop';
 asteroidMineButton.setAttribute('aria-label',game.miningTool?`Mine ${rock.name}`:`Mining tool required to mine ${rock.name}`);
 asteroidMineButton.hidden=false;
}
function nearbyTargets(ship){
 const status=window.nativeCombatShots.firingStatus(game,window.nativeShipDefinitions.describe(game,game,{category:'player'}),null);
 const selectionRange=Math.max(650,status.maxRange||0),inRange=entry=>Math.hypot(entry.x-ship.x,entry.y-ship.y)<=selectionRange;
 const excluded=new Set([...(game.minedAsteroids||[]),...(game.destroyedAsteroids||[])]);
 const targets=(window.nativeSolAsteroids?.forSystem?.(game.system)||(game.system===1?window.nativeSolAsteroids?.placements:[])||[])
  .filter(rock=>!excluded.has(rock.slotId)&&!window.nativeCivilianTraffic.isMiningRock(game,rock.slotId)&&inRange(rock))
  .map(rock=>({key:`asteroid:${rock.slotId}`,kind:'asteroid',entry:rock}));
 for(const tug of game.system===1?window.nativeSolEconomy.initialize(game).freighters:[])
  if(tug.phase!=='destroyed'&&inRange(tug))targets.push({key:`tug:${tug.id}`,kind:'tug',entry:tug});
 for(const vessel of window.nativeCivilianTraffic.localShips(game))
  if(inRange(vessel))targets.push({key:`civilian:${vessel.id}`,kind:'civilian',entry:vessel});
 const view=window.nativeView.measure(canvas),visible=item=>{
  const x=view.w/2+item.entry.x-ship.x,y=view.h/2+item.entry.y-ship.y;
  return x>=0&&x<=view.w&&y>=0&&y<=view.h;
 };
 const threats=new Set();
 for(const entry of targets)if(entry.kind!=='asteroid'&&entry.entry.retaliationTargetId==='player'&&(entry.entry.retaliationUntil||0)>=window.nativeSimulation.seconds(game))threats.add(entry.key);
 for(const attack of game.weaponCombat?.events||[])if(!attack.cancelled&&!attack.resolved&&attack.targetId==='player'){
  const id=String(attack.sourceId);threats.add(id.startsWith('tug:')?id:`civilian:${id}`);
 }
 return window.nativePlayerCombatControls.rankTargets(targets,{threats,visible,distance:item=>Math.hypot(item.entry.x-ship.x,item.entry.y-ship.y)});
}
function currentTargetKey(){
 const tug=game.system===1?window.nativeSolEconomy.target(game):null,rock=window.nativeAsteroidCombat.target,civilian=window.nativeCivilianTraffic.target(game);
 return tug?`tug:${tug.id}`:civilian?`civilian:${civilian.id}`:rock?`asteroid:${rock.slotId}`:null;
}
function selectedCombatTarget(){
 const key=currentTargetKey();if(!key)return null;
 const id=key.startsWith('civilian:')?key.slice(9):key.startsWith('asteroid:')?'rock:'+key.slice(9):key;
 return window.nativeShipSystems.resolve(game,id,game.system);
}
function selectedFiringStatus(){
 return window.nativeCombatShots.firingStatus(game,window.nativeShipDefinitions.describe(game,game,{category:'player'}),selectedCombatTarget());
}
function updateCombatFeedback(){
 const target=game&&selectedCombatTarget();
 combatFeedback.hidden=!target||!modal.hidden||busy()||travelling()||devGalaxyView||window.nativeGalaxyMap?.isOpen||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active;
 if(combatFeedback.hidden)return;
 const status=selectedFiringStatus(),name=target.entity?.name||target.name||(target.category==='asteroid'?'Asteroid':target.category==='tug'?`Tug II #${target.entity.id+1}`:'Target');
 const labels=status.weapons.map(row=>`${row.weapon.name}: ${Math.round(row.spec.range)} u${!row.inRange?' (out of range)':!row.inArc?' (turn to aim)':!row.ready?` (recharge ${row.remaining.toFixed(1)}s)`:row.reason==='blocked'?' (blocked)':row.reason==='visuals'?' (loading)':' (ready)'}`);
 const text=`${name} · ${Math.round(status.distance)} u · ${status.ok?'Ready — hold Space to fire':status.message} · ${labels.join(' · ')} · Shift cycles all targets`;
 if(combatFeedback.textContent!==text)combatFeedback.textContent=text;
 combatFeedback.dataset.reason=status.reason||'ready';
 combatFeedback.dataset.target=String(target.id);
}
const targetShiftKeys=new Set();
let targetHoldTimer=null;
function targetInputAllowed(){
 return !!game&&modal.hidden&&!game.landed&&!game.localCruise&&!game.arrivalApproach&&!busy()&&!devGalaxyView&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active;
}
function cancelTargetPress(){
 clearTimeout(targetHoldTimer);targetHoldTimer=null;targetShiftKeys.clear();
}
function beginTargetPress(code){
 if(!targetInputAllowed()||targetShiftKeys.has(code))return;
 targetShiftKeys.add(code);
 if(targetShiftKeys.size>1)return;
 targetHoldTimer=setTimeout(()=>{
  targetHoldTimer=null;
  if(!targetInputAllowed())return;
  const hadTarget=!!currentTargetKey();
  heldFire.stop();
  window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(null);window.nativeAsteroidCombat.deselect();
  if(hadTarget){const notice='Target cleared. Tap Shift to choose a target.';message(notice);toast(notice);refresh();}
 },500);
}
function endTargetPress(code){
 if(!targetShiftKeys.delete(code)||targetShiftKeys.size)return;
 const tap=targetHoldTimer!==null;
 cancelTargetPress();
 if(tap&&targetInputAllowed())cycleTarget();
}
function fireSelectedTarget(ship){
 const combat=window.nativeAsteroidCombat;
 const tug=game.system===1?window.nativeSolEconomy.target(game):null;
 if(tug){
  const dimensions=flightShipDimensions();
  const result=window.nativeSolEconomy.fire(game,ship,dimensions.height,(victim,damage)=>{
   const notice=damage.destroyed?`Tug II #${victim.id+1} destroyed · ${damage.reputation.faction} standing -${damage.reputation.amount}.`:`Tug II #${victim.id+1}: ${Math.ceil(damage.shields)} shields, ${Math.ceil(damage.hull)} hull.`;
   message(notice);toast(notice);refresh();scheduleCombatSave();
  });
  if(!result.ok)return result;
  message(`${result.weapon} fired at Tug II #${tug.id+1}.`);return result;
 }
 const civilian=window.nativeCivilianTraffic.target(game);
 if(civilian){
  const dimensions=flightShipDimensions();
  const result=window.nativeCivilianTraffic.fire(game,ship,dimensions.height,(victim,damage)=>{
   const notice=damage.destroyed?`${victim.name} destroyed. ${damage.reputation.faction} standing -${damage.reputation.amount}.`:`${victim.name}: ${Math.ceil(damage.shields)} shields, ${Math.ceil(damage.hull)} hull${damage.disabled?' (disabled)':''}.`;
   message(notice);toast(notice);refresh();scheduleCombatSave();
  });
  if(!result.ok)return result;
  message(`${result.weapon} fired at ${civilian.name}.`);return result;
 }
 const dimensions=flightShipDimensions();
 const result=window.nativeAsteroidCombat.fire(game,ship,dimensions.width,dimensions.height,(rock,hasOre)=>{
  const notice=hasOre?'Asteroid destroyed. Ore detected: click the glowing piece to collect it.':'Asteroid destroyed. No recoverable ore.';
  message(notice);toast(notice);refresh();scheduleCombatSave();
 });
 if(result.ok)message(`${result.weapon} fired at asteroid.`);
 return result;
}
function cycleTarget(){
 if(!game||game.landed||game.localCruise||game.arrivalApproach||busy()||devGalaxyView)return;
 const ship=game.system===1?window.vexedSolFlight.shipPosition(game):game,targets=nearbyTargets(ship);
 if(!targets.length){toast('No targets in selection range. Fly closer.');return;}
 const current=currentTargetKey();
 const index=targets.findIndex(item=>item.key===current),next=targets[(index+1)%targets.length];
 heldFire.stop();
 window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(null);window.nativeAsteroidCombat.deselect();
 if(next.kind==='tug')window.nativeSolEconomy.select(next.entry.id);
 else if(next.kind==='civilian')window.nativeCivilianTraffic.select(next.entry.id);
 else window.nativeAsteroidCombat.select(next.entry);
 const notice=`Target ${index<0?1:(index+1)%targets.length+1}/${targets.length}: ${next.kind==='tug'?`Tug II #${next.entry.id+1}`:next.entry.name}. Space fires; tap Shift to switch, hold to clear.`;
 message(notice);toast(notice);refresh();
}
function fireLockedTarget(notify=true){
 if(!targetInputAllowed())return false;
 if(game.hull<=0||game.phase==='disabled'){if(notify)toast('Engines and weapons are disabled. Repair your hull to resume.');return false;}
 if(!selectedCombatTarget()){heldFire.stop();if(notify)toast('Press Shift to lock a target, then hold Space to fire.');return false;}
 const status=selectedFiringStatus();
 if(!status.ok){if(notify)toast(status.message);return false;}
 const result=fireSelectedTarget(game.system===1?window.vexedSolFlight.shipPosition(game):game);
 if(!result?.ok&&notify)toast(result?.error||'Unable to fire.');
 return !!result?.ok;
}
function scan(){if(!game||busy())return;if(mineTarget())return;window.nativeGalaxyMap?.close(false);if(!game.landed&&!game.devMode){toast('Dock at a world to survey it [E]');return}if(!game.devMode&&game.deuranium<5){toast('Survey requires 5 deuranium');return}if(!game.discovered.includes(game.system))game.discovered.push(game.system);if(!game.devMode){game.deuranium-=5;game.latinum+=45;game.nav+=12}message(`${sys(game.system).name} surveyed.${game.devMode?'':' Scientific contract paid 45 latinum.'}`);toast(game.devMode?'Survey complete':'Survey complete · +45 latinum');refresh();save()}
function repair(){if(!game||busy())return;if(game.hull<=0){toast('This hull is destroyed. Restore command data or start a new ship.');return;}if(game.phase==='disabled'){toast('Dot repair drones are handling the disabled hull. Olympics answer if deuranium runs out.');return;}window.nativeGalaxyMap?.close(false);if(!game.devMode&&(game.deuranium<10||game.latinum<40)){toast('Repair costs 10 deuranium and 40 latinum');return}if(!game.devMode){game.deuranium-=10;game.latinum-=40}const ship=shipStats(game);game.hull=game.devMode?ship.hull:Math.min(ship.hull,game.hull+Math.ceil(ship.hull*.25));game.shields=game.devMode?ship.shields:Math.min(ship.shields,game.shields+Math.ceil(ship.shields*.25));updateVisuals();message('Field repairs restored hull and shields.');refresh();save()}
const devButton=document.createElement('button');devButton.id='devToolsBtn';devButton.type='button';devButton.textContent='Dev tools';devButton.hidden=true;document.getElementById('repairBtn').after(devButton);
const galaxyReturn=document.createElement('button');galaxyReturn.id='dev-galaxy-return';galaxyReturn.type='button';galaxyReturn.textContent='Return to flight';galaxyReturn.hidden=true;document.getElementById('game').append(galaxyReturn);
function setDevGalaxyView(enabled){
 devGalaxyView=!!enabled&&!!game?.devMode;
 spaceCamera=null;
 document.body.classList.toggle('dev-galaxy-view',devGalaxyView);
 galaxyReturn.hidden=!devGalaxyView;
 window.nativeGalaxyOverview?.setActive(devGalaxyView,game);
}
galaxyReturn.onclick=()=>setDevGalaxyView(false);
function inspectNpcLocally(state,id,report){
 if(state!==game||!game?.devMode||busy())return {ok:false,error:'Local inspection requires an active Dev game.'};
 const entry=report||window.nativeShipSystems.inspect(game,id);
 if(!entry)return {ok:false,error:'Ship unavailable.'};
 const system=Number(entry.system||entry.entity?.system||game.system),anchor=window.nativeManualFlight.anchor(system)||{x:0,y:0};
 const galaxy=entry.galaxy||entry.galaxyPosition||entry.position||{x:anchor.x+entry.x,y:anchor.y+entry.y};
 if(!Number.isFinite(galaxy.x)||!Number.isFinite(galaxy.y))return {ok:false,error:'Ship position unavailable.'};
 game.system=system;game.planet=sys(system).name;game.localBody=localCatalog.homeId(system);game.localNavTarget=game.localBody;delete game.localBodySystem;localCatalog.initialize(game);window.vexedSolFlight.setTarget(game.localBody,game.system);
 game.x=galaxy.x-anchor.x-150;game.y=galaxy.y-anchor.y+100;game.speed=0;game.vx=0;game.vy=0;game.landed=false;
 game.localCruise=null;delete game.arrivalApproach;clearFlightInput();
 window.nativeCombatShots.cancel();window.nativeSystemHub?.close(false);window.nativeGalaxyMap?.close(false);
 window.vexedSpace.enterSystem(system,true);spaceCamera=null;setDevGalaxyView(false);modal.hidden=true;
 updateVisuals();refresh();save(true);message(`Dev inspection: ${entry.name||id}. NPC task continues unchanged.`);
 return {ok:true,id:entry.id};
}
window.nativeGalaxyOverview?.configure({visit:inspectNpcLocally});
function startFreighterDemo(){
 if(!game?.devMode||busy())return {ok:false,error:'Begin a Dev game first.'};
 const result=window.nativeNpcLives.startDemo(game);
 if(result.ok===false){toast(result.error);return result;}
 setDevGalaxyView(true);window.nativeGalaxyOverview.select(result.id);window.nativeGalaxyOverview.track(result.id);
 close();save(true);message('Freighter demonstration selected. Inspect locally or watch the same delivery on the map.');return result;
}
window.nativeNpcDev={getState:()=>game?.devMode?game:null,visit:id=>inspectNpcLocally(game,id),demo:startFreighterDemo,showMap:()=>{if(game?.devMode)setDevGalaxyView(true);}};
function devTools(){
 if(!game?.devMode||busy())return;
 window.nativeGalaxyMap?.close(false);
 dialog.innerHTML='<div class="dev-tools-head"><div><span>FLEET INSPECTION</span><h2>Dev tools</h2></div><button type="button" data-close aria-label="Close Dev tools">×</button></div><div class="dev-tools-grid"><div class="dev-ship-stage"><canvas data-dev-preview role="img" aria-label="Selected ship preview"></canvas><img data-dev-placeholder alt=""><div class="dev-preview-name" data-dev-preview-name></div></div><div class="dev-tools-controls"><label class="dev-select">Ship class<select data-dev-ship></select></label><div class="dev-preview-stats" data-dev-preview-stats></div><div class="dev-preview-weapons" data-dev-preview-weapons></div><button type="button" data-dev-equip>Equip ship</button><div class="dev-system-group"><label class="dev-select">System<select data-dev-system></select></label><button type="button" data-dev-jump>Jump to system</button></div></div></div>';
 const shipSelect=dialog.querySelector('[data-dev-ship]'),systemSelect=dialog.querySelector('[data-dev-system]');
 for(const ship of world.ships)shipSelect.add(new Option(ship.name,String(ship.id)));
 for(const system of world.systems)systemSelect.add(new Option(system.name,String(system.id)));
 shipSelect.value=String(game.shipType);systemSelect.value=String(game.system);
 const galaxyButton=document.createElement('button');galaxyButton.id='galaxy-map-button';galaxyButton.type='button';galaxyButton.textContent=devGalaxyView?'Return to flight view':'View whole galaxy';
 dialog.querySelector('.dev-system-group').before(galaxyButton);
 galaxyButton.onclick=()=>{setDevGalaxyView(!devGalaxyView);close();};
 const freightButton=document.createElement('button');freightButton.id='dev-freighter-life-button';freightButton.type='button';freightButton.textContent='Follow a persistent freighter delivery';galaxyButton.after(freightButton);freightButton.onclick=startFreighterDemo;
 const miningButton=document.createElement('button');miningButton.id='dev-civilian-mining-button';miningButton.type='button';miningButton.textContent='Watch civilian mining at Earth';galaxyButton.after(miningButton);
 miningButton.onclick=()=>{game.system=1;game.planet=sys(1).name;game.localBody=3;game.x=0;game.y=0;game.speed=0;game.landed=false;game.localCruise=null;game.arrivalApproach=null;window.vexedSpace.enterSystem(1,true);spaceCamera=null;setDevGalaxyView(false);const ready=window.nativeCivilianTraffic.startOreDisputeDemo(game);updateVisuals();refresh();save(true);close();const notice=ready?'A civilian is mining near Earth. Watch the other ship approach and steal its ore.':'Asteroids are still loading. The miner and ore thief will start when they are ready.';message(notice);toast(notice);};
 const disputeButton=document.createElement('button');disputeButton.id='dev-civilian-dispute-button';disputeButton.type='button';disputeButton.textContent='Watch ore theft dispute at Earth';miningButton.after(disputeButton);
 disputeButton.onclick=()=>{game.system=1;game.planet=sys(1).name;game.localBody=3;game.x=0;game.y=0;game.speed=0;game.landed=false;game.localCruise=null;game.arrivalApproach=null;window.vexedSpace.enterSystem(1,true);spaceCamera=null;setDevGalaxyView(false);const ready=window.nativeCivilianTraffic.startOreDisputeDemo(game);updateVisuals();refresh();save(true);close();const notice=ready?'Watch the miner: another civilian is approaching to steal its ore.':'Asteroids are still loading. Try the dispute preview again shortly.';message(notice);toast(notice);};
 modal.hidden=false;window.nativeDevShipPreview.attach(dialog,world.ships);
 dialog.querySelector('[data-dev-equip]').onclick=()=>{const ship=world.ships.find(entry=>entry.id===Number(shipSelect.value));if(!ship)return;const changed=window.nativeShipEquipment.changeHull(game,ship.id);if(!changed.ok){toast(changed.error);return;}unlockDev(game);updateVisuals();refresh();save(true);message(`Dev ship equipped: ${ship.name}.`);close()};
 dialog.querySelector('[data-dev-jump]').onclick=()=>{const system=sys(systemSelect.value);if(!system)return;game.system=system.id;game.planet=system.name;game.x=0;game.y=0;game.speed=0;game.landed=false;window.vexedSpace.enterSystem(system.id,true);spaceCamera=null;updateVisuals();refresh();save(true);message(`Dev jump complete: ${system.name}.`);close()};
 dialog.querySelector('[data-close]').onclick=close;
}
devButton.onclick=devTools;
window.nativeCivilianTraffic.onHail=({system,x,y,text})=>{
 if(!game||game.system!==system||!modal.hidden)return;
 const player=game.system===1?window.vexedSolFlight.shipPosition(game):game;
 if(Math.hypot(x-player.x,y-player.y)>700)return;
 message(`Civilian transmission: ${text}`);toast(text);
};
document.getElementById('tradeBtn').textContent='Market [T]';
canvas.addEventListener('click',event=>{
 if(window.nativeShipyardServices?.docked){window.nativeShipyardServices.select();return;}
 if(devGalaxyView||!game||busy()||!modal.hidden||window.nativeGalaxyMap?.isOpen||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active)return;
 const rect=canvas.getBoundingClientRect(),view=window.nativeView.measure(canvas);
 const x=(event.clientX-rect.left)*view.w/rect.width,y=(event.clientY-rect.top)*view.h/rect.height;
 const player=game.system===1?window.vexedSolFlight.shipPosition(game):game;
 if(window.nativeShipyardServices?.hit(game,{ship:player,cx:view.w/2,cy:view.h/2,zoom:1,x,y,w:view.w,h:view.h})){window.nativeShipyardServices.select();keys={};return;}
 const civilian=window.nativeCivilianTraffic.hitTest(game,{ship:player,cx:view.w/2,cy:view.h/2,zoom:1,x,y});
 if(civilian){window.nativeAsteroidCombat?.deselect();window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(civilian.id);heldFire.stop();canvas.focus({preventScroll:true});const notice=`${civilian.name} targeted. Space fires; tap Shift to switch, hold to clear.`;message(notice);toast(notice);refresh();return;}
 if(game.system===1){
  const ship=window.vexedSolFlight.shipPosition(game);
  const tug=window.nativeSolEconomy.hitTest(game,{ship,cx:view.w/2,cy:view.h/2,zoom:1,x,y});
  if(tug){window.nativeAsteroidCombat?.deselect();window.nativeCivilianTraffic.select(null);window.nativeSolEconomy.select(tug.id);heldFire.stop();canvas.focus({preventScroll:true});const notice=`Tug II #${tug.id+1} targeted. Space fires; tap Shift to switch, hold to clear.`;message(notice);toast(notice);refresh();return;}
 }
 {
  const ship=player;
  const ore=window.nativeAsteroidCombat?.oreHit(game,ship,{cx:view.w/2,cy:view.h/2,zoom:1,x,y});
  if(ore){
   if(Math.hypot(ore.rock.x-ship.x,ore.rock.y-ship.y)>360){toast('Move within 360 units to collect ore.');return}
   if(ore.rock.oreType!=='dilithium'&&window.nativeShipEquipment.cargoUsed(game)+ore.indices.length>shipStats(game).cargo){toast('Cargo hold full. Sell or deliver cargo before collecting this ore.');return;}
   for(const index of ore.indices)game.asteroidOreDrops[ore.rock.slotId]&=~(1<<index);
   if(ore.rock.oreType==='dilithium')game.dilithium=(Number(game.dilithium)||0)+ore.indices.length;
   else{game.minerals ||= {};game.minerals[ore.rock.oreType]=(Number(game.minerals[ore.rock.oreType])||0)+ore.indices.length}
   if(game.minedAsteroids?.includes(ore.rock.slotId))window.nativeAsteroidCombat.collectField(ore.rock,ore.indices);
   else for(const index of ore.indices)window.nativeAsteroidCombat.collect(ore.rock,index);
   const notice=`${ore.indices.length} ${ore.rock.oreLabel} transported aboard.`;
   message(notice);toast(notice);refresh();save(true);return;
  }
  const rock=window.nativeSolAsteroids?.hitTest({system:game.system,ship,cx:view.w/2,cy:view.h/2,zoom:1,x,y,mined:[...(game.minedAsteroids||[]),...(game.destroyedAsteroids||[]),...window.nativeCivilianTraffic.miningIds(game)]});
  if(rock){
   window.nativeSolEconomy.select(null);
   window.nativeCivilianTraffic.select(null);
   window.nativeAsteroidCombat.select(rock);heldFire.stop();canvas.focus({preventScroll:true});
   if(event.detail===2){mineTarget();return}
   message('Asteroid targeted. Space fires; tap Shift to switch, hold to clear. Double-click the asteroid to mine.');
   toast('Asteroid targeted · Space fires · Shift switches');
   refresh();return;
  }
 }
 if(!planetHit&&!planetHits.length)return;
 const clicked=planetHits.find(hit=>hit.contains(x,y));
 if(!clicked)return;
 if(clicked.id!==localCurrent()){toast('Fly closer to '+clicked.name+' to make contact');return}
 clearFlightInput();
 openEncounter();
});
canvas.tabIndex=-1;asteroidMineButton.onclick=()=>mineTarget();asteroidMineButton.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation()});document.querySelector('#save').onclick=()=>{if(!busy())save()};document.querySelector('#mapBtn').onclick=showMap;document.querySelector('#tradeBtn').onclick=()=>openHub('market');document.querySelector('#inventoryBtn').onclick=openInventory;document.querySelector('#mineBtn').onclick=scan;document.querySelector('#repairBtn').onclick=repair;
 addEventListener('keydown',e=>{if(window.nativeShipyardServices?.busy){if(e.code==='KeyE'&&!e.repeat&&window.nativeShipyardServices.docked&&!window.nativeShipyardServices.active)window.nativeShipyardServices.select();if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();return;}if(window.nativeShipInventory?.active){if((e.code==='KeyI'||e.key==='Escape')&&!e.repeat){e.preventDefault();window.nativeShipInventory.close()}return}if(e.code==='KeyI'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openInventory();return}if(travelling()){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();return}if(window.nativeSystemHub?.active||window.nativePlanetEncounter?.active)return;if(window.nativeGalaxyMap?.isOpen){if((e.key==='Escape'||e.code==='KeyM')&&!e.repeat){e.preventDefault();window.nativeGalaxyMap.close()}return}if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&modal.hidden&&game){e.preventDefault();if(!e.repeat)beginTargetPress(e.code);return}if(e.code==='Space'&&modal.hidden&&game){e.preventDefault();if(!e.repeat&&!heldFire.start(inputFrame)){if(selectedCombatTarget())toast(selectedFiringStatus().message);else fireLockedTarget();}return}if(e.key==='Escape'){close();return}if(modal.hidden&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();if(e.code==='KeyM'&&modal.hidden&&!e.repeat){e.preventDefault();showMap()}if(e.code==='KeyN'&&modal.hidden&&!e.repeat)openHub('navigation');if(e.code==='KeyT'&&modal.hidden&&!e.repeat)openHub('market');if(e.code==='KeyE'&&modal.hidden)dock()});addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space')heldFire.stop();if(e.code==='ShiftLeft'||e.code==='ShiftRight')endTargetPress(e.code)});addEventListener('keydown',e=>{if(modal.hidden&&game&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!window.nativeShipInventory?.active&&!busy()){keys[e.code]=true;if(!e.repeat)pressed[e.code]=true;}});addEventListener('blur',()=>{clearFlightInput();cancelTargetPress()});addEventListener('resize',size);
window.nativeShipyardServices?.attach({getState:()=>game,save:()=>save(true),refresh(){updateVisuals();refresh();},clearInput(){clearFlightInput();}});
window.nativePause.attach({active:()=>!!game,clearInput(){clearFlightInput();cancelTargetPress()},prepare(){window.nativeShipyardServices?.close();window.nativeGalaxyMap?.close(false);window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);window.nativeShipInventory?.close();modal.hidden=true},save:()=>save(true)});
window.nativeShipInventory.attach({getState:()=>game,deliveryNavigation,save:()=>save(true),setRepairMode(mode){const result=window.nativeShipRepairs.setRepairMode(game,mode);if(!result.ok)return result;const saved=save(true);refresh();return {...result,saved:saved.ok};},deployRepairDrones(){const result=window.nativeShipRepairs.deployPlayer(game);if(!result.ok)return result;const saved=save(true);refresh();if(saved.ok)message('Repair drones deployed. Hull repairs underway.');return {...result,saved:saved.ok};},moveInventory(options){const result=window.nativeShipEquipment.moveInventory(game,options);if(result.ok){const saved=save(true);refresh();return {...result,saved:saved.ok};}return result;},atPort:()=>hubHere(localCurrent()),moveEquipment(options){const result=window.nativeShipEquipment.move(game,options);if(result.ok){save(true);refresh();}return result;},buyEquipment(id){if(!hubHere(localCurrent()))return{ok:false,error:'Reach a port to purchase equipment.'};const result=window.nativeShipEquipment.purchase(game,id);if(result.ok){save(true);refresh();}return result;},moveWeapon(fromType,from,toType,to){
 if(!game)return false;
 const result=window.nativeWeaponLoadout.move(game,{fromType,fromIndex:from,toType,toIndex:to});
 if(!result.ok)return false;
 save(true);refresh();return true;
}});
navigation.attach({getGame:()=>game,isBusy:busy,prepareMap(action){clearFlightInput();window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);modal.hidden=true;if(action==='open'){clearTimeout(toastTimer);document.getElementById('notice').textContent=''}},travel:warp,track:trackManualSystem,cruise:mapCruise,selectLocal:selectLocalDestination});
const continueButton=document.querySelector('[data-menu="continue"]');continueButton.disabled=!savedGame('normal');continueButton.onclick=()=>resume('normal');const devContinue=document.querySelector('[data-menu="continue-dev"]');devContinue.disabled=!savedGame('dev');devContinue.onclick=()=>resume('dev');
document.getElementById('save').disabled=true;
})();
