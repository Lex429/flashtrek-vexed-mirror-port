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
function unlockDev(value){
 value.devMode=true;
 if(value.devInventoryKitVersion!==2){window.nativeShipEquipment.restockDev(value);value.devWeaponKitGranted=true}
 window.nativeShipEquipment.prepareDevCargo(value);
 for(const key of devResources)value[key]=1000000000;
 value.stocks=Object.fromEntries(goods.map(g=>[g,1000000000]));
 value.discovered=world.systems.map(system=>system.id);
 window.nativeFactionStanding.initializeDev(value);
 value.nav=100;value.hull=shipStats(value).hull;value.shields=shipStats(value).shields;
 window.nativeShipEquipment.ensure(value);
 return value;
}
let game=null,keys={},pressed={},last=performance.now(),flightShip=null,visualGeneration=0,spaceCamera=null,planetHit=null,planetHits=[],marketFromPlanet=false;
let inputFrame=0,nextDistressUi=0;
const flightControls=window.nativePlayerCombatControls.flightControls(),smartTargets=window.nativePlayerCombatControls.smartTargeting();
const targeting=window.nativePlayerTargeting.create(smartTargets);
let droneTargetId=null;
const targetTrigger=window.nativePlayerCombatControls.targetTrigger({allowed:targetInputAllowed,acquire:cycleTarget});
const heldFire=window.nativePlayerCombatControls.heldFire({targetKey:()=>currentTargetKey()||'forward',allowed:()=>targetInputAllowed()&&game.hull>0&&game.phase!=='disabled'&&!document.hidden&&(!currentTargetKey()||!!selectedCombatTarget()),request:()=>firePlayerWeapon(false)});
const gamepad=window.nativeGamepadControls.create(),controllerMenu=window.nativeGamepadControls.menuNavigation();
const controllerTargetTrigger=window.nativePlayerCombatControls.targetTrigger({allowed:targetInputAllowed,acquire:cycleTarget});
let controllerContext=null,controllerFire=false,controllerFocused=document.hasFocus(),controllerSeen=false,controllerState='',controllerNoticeTimer=null;
const controllerStatus=document.createElement('button');controllerStatus.type='button';controllerStatus.id='controller-status';controllerStatus.setAttribute('aria-live','off');controllerStatus.setAttribute('aria-haspopup','dialog');controllerStatus.onclick=()=>window.nativePause?.open('options');
controllerStatus.innerHTML='<svg viewBox="0 0 24 18" aria-hidden="true"><path d="M7 3h10c3 0 5 10 3 12-1 1-3-1-5-3H9c-2 2-4 4-5 3C2 13 4 3 7 3Z"/><path d="M7 6v5M4.5 8.5h5M16 7h.01M18 10h.01"/></svg><span>Controller: click to connect</span><i aria-hidden="true"></i>';
const controllerStatusLabel=controllerStatus.querySelector('span'),controllerNotice=document.createElement('div');controllerNotice.id='controller-notice';controllerNotice.hidden=true;controllerNotice.setAttribute('role','status');controllerNotice.setAttribute('aria-atomic','true');document.body.append(controllerStatus,controllerNotice);
const keyboardSteering=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyX','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
function updateControllerStatus(input){
 const state=input.connected?(input.supported?'connected':'unsupported'):controllerSeen?'disconnected':'waiting';
 const label=input.connected?(input.supported?`${input.label} connected`:'Controller layout unsupported'):controllerSeen?'Controller disconnected':'Controller: click to connect';
 const vibration=window.nativeControllerHaptics?.inspect(),needsSetup=!!(input.connected&&input.playstation&&vibration?.enabled&&(!vibration.supported||vibration.status==='error'));
 const signature=state+':'+label+':'+needsSetup+':'+(input.source||'');if(signature===controllerState)return;controllerState=signature;
 controllerStatus.dataset.state=state;controllerStatus.dataset.vibration=needsSetup?'setup':'ready';controllerStatus.dataset.inputSource=input.source||'';controllerStatusLabel.textContent=needsSetup?`${input.label} · vibration setup`:label;controllerStatus.title=label+' · Open controller options'+(input.source==='WebHID'?' · Direct input':'');
 if(state==='waiting')return;
 controllerSeen||=!!input.connected;clearTimeout(controllerNoticeTimer);controllerNotice.textContent=label+(needsSetup?' · Enable vibration in Options':'');controllerNotice.dataset.state=state;controllerNotice.hidden=false;
 controllerNoticeTimer=setTimeout(()=>{controllerNotice.hidden=true;},4500);
}
function controllerScreen(){
 if(window.nativePlayerDestruction?.pending)return window.nativePlayerDestruction.active?document.getElementById('player-recovery'):'destruction';
 if(!document.getElementById('startup').hidden)return 'startup';
 for(const [active,id] of [[window.nativeOpeningCinematic?.active,'opening-cinematic'],[window.nativePause?.active,'pause-menu'],[window.nativeCollectablesView?.active,'collectable-reveal'],[window.nativeShipInventory?.active,'ship-inventory'],[window.nativeShipLootView?.active,'ship-loot'],[window.nativeShipyardServices?.active,'shipyard-services'],[window.nativeGalaxyMap?.isOpen,'galaxy-map'],[window.nativePlanetEncounter?.active,'planet-encounter'],[window.nativeSystemHub?.active,'system-hub'],[window.nativeSetup?.active,'setup-ui'],[!modal.hidden,'modal'],[!menuArt.hidden,'main-menu-controls']]){
  if(active)return document.getElementById(id);
 }
 return travelling()?'travel':game?'flight':'startup';
}
function resetController(options){
 if(!options?.preserveHaptics)window.nativeControllerHaptics?.stop();
 if(controllerFire&&!keys.Space)heldFire.stop();controllerFire=false;gamepad.reset();controllerTargetTrigger.update(0);controllerMenu.clear();
}
function controllerBack(root){
 if(root.id==='opening-cinematic'){window.nativeOpeningCinematic.skip();return;}
 if(root.id==='pause-menu'){const back=root.querySelector('[data-back]');if(back.getClientRects().length)back.click();else window.nativePause.close();return;}
 if(root.id==='ship-loot'){window.nativeShipLootView.close();return;}
 if(root.id==='setup-ui'){window.nativeSetup.back();return;}
 const owners={'ship-inventory':window.nativeShipInventory,'collectable-reveal':window.nativeCollectablesView,'shipyard-services':window.nativeShipyardServices,'galaxy-map':window.nativeGalaxyMap,'planet-encounter':window.nativePlanetEncounter,'system-hub':window.nativeSystemHub};
 if(owners[root.id])owners[root.id].close();else if(root.id==='modal')close();
}
function pollController(frameTime){
 const screen=controllerScreen();
 if(screen!==controllerContext){resetController({preserveHaptics:!!window.nativePlayerDestruction?.pending});controllerContext=screen;}
 const input=gamepad.poll(frameTime,controllerFocused&&!document.hidden&&screen!=='startup'&&screen!=='travel');
 window.nativeControllerHaptics.step(gamepad.device);
 updateControllerStatus(input);
 const mapPressed=input.pressed.includes(8)||input.pressed.includes(3),inventoryPressed=input.pressed.includes(2)||(input.playstation&&input.pressed.includes(17));
 if(input.changed&&!input.connected){if(controllerFire&&!keys.Space)heldFire.stop();controllerFire=false;flightControls.reset();controllerTargetTrigger.update(0);}
 if(controllerFire&&!input.held[7]){controllerFire=false;if(!keys.Space)heldFire.stop();}
 if(input.pressed.includes(9)&&screen!=='startup'&&screen!=='travel'&&screen?.id!=='opening-cinematic'){window.nativePause.toggle();return;}
 if(typeof screen!=='string'){
  if(screen.id==='galaxy-map'){if(mapPressed)window.nativeGalaxyMap.close();else window.nativeGalaxyMap.controller(input,frameTime);return;}
  if(input.pressed.includes(1)||(screen.id==='ship-inventory'&&inventoryPressed)){controllerBack(screen);return;}
  if(input.direction)controllerMenu.move(screen,input.direction);
  if(input.pressed.includes(0))controllerMenu.activate(screen);
  return;
 }
 if(screen!=='flight')return;
 if(inventoryPressed){openInventory();return;}
 if(mapPressed){showMap(true);return;}
 if(input.pressed.includes(1)){if(game.localCruise||game.arrivalApproach)cancelCruise();else if(game.landed)dock();else if(targetInputAllowed())clearTargetLock();return;}
 if(input.pressed.includes(0)){if(game.landed){openHub('market');return;}if(selectedCombatTarget()?.entity?.phase==='disabled'){window.nativeShipLootView.open();return;}if(!mineTarget()){dock();if(game.landed)openHub('market');}return;}
 controllerTargetTrigger.update(input.held[6]?1:0);
 if(input.pressed.includes(7)&&targetInputAllowed()){controllerFire=true;if(!heldFire.start(inputFrame)){const status=selectedFiringStatus();if(!status.ok)message(status.message);}}
}
addEventListener('focus',()=>{controllerFocused=true;resetController();});
addEventListener('blur',()=>{controllerFocused=false;resetController();});
addEventListener('gamepaddisconnected',event=>{if(event.gamepad.index===gamepad.snapshot.index){resetController();flightControls.reset();}});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const flightShipDimensions=()=>window.nativeShipDefinitions.dimensions(game,'player');
let devGalaxyView=false;
const travelling=()=>!!window.vexedWarp?.active;
const paused=()=>!!window.nativeOpeningCinematic?.active||!!window.nativePause?.active||!!window.nativeShipInventory?.active||!!window.nativeCollectablesView?.active,busy=()=>travelling()||paused()||!!window.nativeShipyardServices?.busy||!!window.nativePlayerDestruction?.pending;
const sys=id=>navigation.system(id);
function fresh(){return navigation.initialize({faction:0,captain:'Captain',shipName:'ISS Wayfarer',shipClass:'Danube Runabout',weapons:window.nativeShipDefinitions.get(7).startingEquipment.weapon.map(value=>value||null),weaponInventory:[],government:'United Earth',system:1,planet:'Earth',localBody:3,x:0,y:0,angle:-Math.PI/2,speed:0,hull:100,shields:100,latinum:500,deuranium:120,antimatter:80,dilithium:25,food:40,nav:0,day:1,landed:false,discovered:[1],stocks:Object.fromEntries(goods.map(g=>[g,40]))})}
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
function save(silent=false){
 if(!game)return {ok:false,error:'No game to save.'};
 const result=window.nativeSaveStorage.write(game);
 if(!result.ok){message(result.error);return result;}
 document.querySelector(game.devMode?'[data-menu="continue-dev"]':'[data-menu="continue"]').disabled=false;
 if(result.reincarnationError)message(result.reincarnationError);else if(!silent)message('Command data saved');return result;
}
function reportSaveResult(result){if(result&&!result.ok){message(result.error);}else if(result?.reincarnationError)message(result.reincarnationError);return result;}
function scheduleCombatSave(){if(game)reportSaveResult(window.nativeSaveStorage.schedule(game,{delay:.25,maxWait:1}));}
function flushCombatSave(){if(game)reportSaveResult(window.nativeSaveStorage.flush(game));}
function clearFlightInput(options){keys={};pressed={};flightControls.reset();heldFire.stop();resetController(options);cancelTargetPress();targeting.invalidate();if(options?.flush!==false)flushCombatSave();}
function savedGame(mode){const value=window.nativeSaveStorage.read(mode);return value&&navigation.system(value.system)&&Number.isFinite(Number(value.antimatter))?value:null;}
function updateVisuals(){window.nativeShipSystems?.refreshShip(game,game,'player');const renderType=window.nativePrometheus?.typeFor(game)??game.shipType;const token=++visualGeneration;if(flightShip?.type!==Number(renderType))flightShip=null;window.vexedFlightAssets.loadShip(renderType,game.hull*window.nativeShipDefinitions.get(renderType).hull/Math.max(1,shipStats(game).hull)).then(asset=>{if(token===visualGeneration)flightShip=asset}).catch(()=>{});window.vexedFlightAssets.loadPlanet(game.system).catch(()=>{});window.vexedSolFlight.art(localCurrent(),game.system)}
window.nativeCombatShots.onPlayerImpact=impact=>window.nativePlayerCombat.visualImpact(game,impact);
window.nativeCombatShots.onPlayerHit=(state,damage,impact)=>{
 if(state===game&&damage>0)window.nativeReincarnation.danger(state);
 const phaseBefore=state.phase,result=window.nativePlayerCombat.hit(state,damage,impact);
 if(state===game&&impact?.sourceId!=null&&impact.sourceId!=='player'){const id=String(impact.sourceId);smartTargets.incoming(id.startsWith('tug:')||id.startsWith('civilian:')?id:`civilian:${id}`,window.nativeSimulation.seconds(state));}
 if(state===game&&result.ok){
  if(result.transferred){updateVisuals();refresh();return result;}
  if(!result.destroyed&&result.beforeStage!==result.afterStage)updateVisuals();
  if(result.destroyed){window.nativePlayerDestruction.begin(state);clearFlightInput({preserveHaptics:true});message('Hull destroyed.');}
  else if(result.disabled&&phaseBefore!=='disabled'){heldFire.stop();message('Hull critical. Manual steering and thrust remain available.');}
  // The regular display reads current vitals, equipment and distress status.
  // Sustained beams must not rebuild the full HUD/inventory per contact.
 }
 return result;
};
function activateState(value){droneTargetId=null;window.nativeShipLootView.close({restore:false});window.nativePlayerDestruction.reset();window.nativeCollectablesView?.close({restore:false});clearFlightInput();smartTargets.reset();window.nativePlayerCombat.reset();window.nativeEnvironmentalImpacts?.reset();cancelTargetPress();window.nativeShipInventory?.close();window.nativePause.close();window.vexedWarp.reset();window.nativeGalaxyMap?.close(false);window.nativePlanetEncounter?.close(false);window.nativeAsteroidCombat?.clear();window.nativeSolEconomy?.clearTarget();window.nativeCivilianTraffic?.clearTarget();game=navigation.initialize(value);window.nativeManualFlight.initializeRegion(game);window.nativeSimulation.ensure(game);window.nativeCollectableMotion?.initialize(game);window.nativeAsteroidMotion?.ensure(game);setDevGalaxyView(false);if(game.vitalsVersion!==2){const ship=shipStats(game);game.hull=Math.round(Math.max(0,Math.min(100,Number(game.hull)||0))*ship.hull/100);game.shields=Math.round(Math.max(0,Math.min(100,Number(game.shields)||0))*ship.shields/100);game.vitalsVersion=2;}game.localBody=Number.isInteger(Number(game.localBody))?Number(game.localBody):3;game.localContracts=Array.isArray(game.localContracts)?game.localContracts:[];game.weaponInventory=Array.isArray(game.weaponInventory)?game.weaponInventory.map(Number).filter(id=>Number.isInteger(id)&&id>0&&window.VexedMirrorWeapons?.some(item=>item.id===id)):[];window.nativeShipEquipment.ensure(game);window.nativeSolEconomy.initialize(game);window.nativeCivilianTraffic.initialize(game);window.nativeShipRepairs?.initialize(game);window.nativeNpcLives?.initialize(game);window.nativeNpcLives?.interactive?.(game);window.nativeReincarnation.initialize(game);window.nativeSaveStorage?.prepare?.(game);window.vexedSolFlight?.setTarget(game.localCruise?.to??game.localNavTarget??game.localBody,game.system);if(game.devMode)unlockDev(game);window.nativeWeaponLoadout.ensure(game);window.nativeCombatShots.restore?.(game);window.nativePrometheus?.initialize(game);window.vexedSpace.enterSystem(game.system,true);spaceCamera=null;clearFlightInput();modal.hidden=true;menuArt.hidden=true;document.body.classList.add('playing');document.getElementById('save').disabled=false;devButton.hidden=!game.devMode;window.nativeShipyardServices?.restore();window.vexedWarp.prepareAudio?.();updateVisuals();refresh();if(game.hull<=0||game.phase==='destroyed')window.nativePlayerDestruction.begin(game,{immediate:true});}

function activate(value){hostTime.checkpoint();simulationService.cancel();preparingTravel=false;activateState(value);simulationService.cancel();hostTime.reset();}
function begin(){const state={...fresh(),devMode:true,localPrestige:Object.fromEntries(world.systems.map(system=>[system.id,100]))};window.nativeWorldBootstrap?.apply(state);activate(state);window.nativeShipTraffic?.clearSpawn(state);const demo=window.nativeDevRepairDemo?.start(game),loot=window.nativeDevLootDemo.start(game);message(loot.ok?`Dev command ready. ${loot.ships.length} disabled Loot test ships nearby in Sol; select one and press L.`:demo?.ok?'Dev command ready. Nearby disabled cruiser: Olympic response underway.':'Dev command ready. All systems, ships, and supplies are available.');save()}
function resume(mode,restored){const saved=restored||savedGame(mode);if(!saved)return;const defaults=fresh(),value={...defaults,...saved,stocks:{...defaults.stocks,...saved.stocks}};for(const key of ['system','faction','day','nav','antimatter','deuranium','latinum','dilithium','food','x','y','angle','speed','hull','shields'])value[key]=Number.isFinite(Number(value[key]))?Number(value[key]):defaults[key];activate(value);const loot=game.devMode?window.nativeDevLootDemo.start(game):null;if(game.devMode)save(true);message(loot?.created?`${loot.ships.length} disabled Loot test ships placed nearby in Sol. Select one and press L.`:`Command data restored. Current system: ${sys(game.system).name}.`);const receipt=game.pendingTransit;if(receipt?.version===1&&receipt.report?.systemId===game.system&&Array.isArray(receipt.report.events))startJourney(receipt.report,null,true)}
window.startNativeNewGame=()=>window.nativeSetup.open();
window.startNativeFactionGame=factionStart;
window.startNativeDevGame=begin;
window.resumeNativeGame=resume;
document.addEventListener('DOMContentLoaded',()=>window.nativeWorldBootstrap?.prepare(fresh()),{once:true});
function refresh(){document.querySelector('#captain').textContent=`${game.captain} | ${game.government}`;document.querySelector('#shipLine').textContent=game.shipName;document.querySelector('#mineBtn').textContent=window.nativeAsteroidCombat?.target?'Mine asteroid':'Scan';window.vexedHud.update(game);window.nativeShipInventory?.refresh();updateDistressButton(true);}
function size(){return window.nativeView.fit(canvas,ctx)}
let starTime=0;
let lastCruiseSave=0;
let lastManualSave=0;
function updateManualFlight(now){
 const course=game.civilianTraffic?.life?.corridorInterest,target=Number(game.manualTargetSystem)||0,region=window.nativeManualFlight.currentRegion(game);
 window.nativeNpcLives?.observeCourse?.(game,course?.to===target?course.from:region.system??game.system,region.system===target?0:target);
 const change=window.nativeManualFlight.advanceRegion(game);
 if(change){
  if(change.entered){
   if(game.localCruise&&localCatalog.sameSystem(game.localCruise.system??game.system,game.system)){game.localNavTarget=Number(game.localCruise.to);game.manualTargetSystem=0;window.vexedSolFlight.setTarget(game.localNavTarget,game.system);}
   heldFire.stop();smartTargets.reset();window.nativeAsteroidCombat?.deselect();window.nativeCivilianTraffic?.clearTarget();window.nativeSolEconomy?.clearTarget();
   window.vexedSpace.enterSystem(game.system,true);spaceCamera=null;updateVisuals();refresh();
   message(`Entered ${change.next.name} by manual flight.`);
  }else if(change.exited)message(`Departed ${change.previous.name}. Interstellar space.`);
  // A spatial rebase is ordinary flight, with no fuel, cargo or calendar commit.
  // Purchases, deliveries, explicit saves and warp commits stay durable immediately.
  window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.5});lastManualSave=now;
 }
 const arrived=window.vexedSolFlight?.nearestArrival(game);
 if(arrived){updateVisuals();window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.5});message(`Approaching ${arrived.name}. ${arrived.port?'Local services are available nearby.':'No port is available here.'}`);window.nativeSystemHub?.refresh();}
 if(game.speed>0&&now-lastManualSave>5000){lastManualSave=now;window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.5});}
}
function approachDistance(diameter){
 const size=window.vexedFlightAssets.size(game.shipType);
 const dimensions=window.nativeShipDefinitions.dimensions(game);const shipRadius=Math.hypot(dimensions.width,dimensions.height)/2;
 return diameter/2+shipRadius+24;
}
function localApproachDistance(body){return approachDistance(window.vexedSolFlight.bodySize(body));}
function advanceArrivalApproach(dt,now,intent){
 const approach=game?.arrivalApproach;
 if(!approach||dt<=0)return;
 if(approach.system!==game.system){delete game.arrivalApproach;game.speed=0;save(true);return;}
 const moved=window.nativeShipSystems.move(game,game,'player',intent.command,shipStats(game).movement,dt);
 if(moved.arrived){
  delete game.arrivalApproach;window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.25});message(`Approach complete at ${localCatalog.current(game).name}.`);refresh();return;
 }
 if(now-lastCruiseSave>2000){lastCruiseSave=now;window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.5});}
}
function advanceLocalCruise(dt,now,intent){
 if(!game?.localCruise||dt<=0)return;
 const cruise=game.localCruise;
 if(intent.error){game.localCruise=null;message(intent.error);save(true);return;}
 const moved=window.nativeShipSystems.move(game,game,'player',intent.command,shipStats(game).movement,dt);
 if(moved.arrived){
  updateManualFlight(now);
  const destination=localBodies().find(body=>body.id===Number(cruise.to));
  if(!destination||!localCatalog.sameSystem(game.system,cruise.system))return;
  localCatalog.arrive(game,destination,window.vexedSolFlight.shipPosition(game));game.localNavTarget=destination.id;game.speed=0;game.localCruise=null;
  window.nativeManualFlight.initializeRegion(game);window.vexedSolFlight.setTarget(destination.id,game.system);
  updateVisuals();save(true);message(`Arrived at ${destination.name}.`);window.nativeSystemHub?.refresh();return;
 }
 if(now-lastCruiseSave>2000){lastCruiseSave=now;window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.5});}
}
let lastEconomySave=0;
// Display refresh does not select the physical timestep. The shared schedule
// retains elapsed active time and bounds catch-up work per host frame.
function advanceSimulation(dt,now,transitDebt=false){
 if(!game||window.nativeSimulation.blocked()||travelling()&&!transitDebt)return;
 const repairHullBefore=game.hull,repairStageBefore=window.nativeShipDefinitions.stage(window.nativeShipDefinitions.describe(game));
 window.nativeSimulationFrame.run(game,dt,(step,now)=>{
  window.nativeShipyardServices?.advance(game,step);window.nativeShipyardRefits?.advance(game,step);
  window.nativeAsteroidMotion?.advance(game,step);
  window.nativeCollectableMotion?.advance(game,step);
  window.nativeShipTraffic?.advance(game,step);
  if(window.nativePopulation.advanceSeconds(game,step)){window.nativePlanetEncounter?.refresh();window.nativeSystemHub?.updatePopulation();}
  window.nativeSolEconomy.advance(game,step);
  window.nativeCivilianTraffic.advance(game,step);
  window.nativeCombatShots.advance(game,step);
  window.nativeEnvironmentalImpacts?.advance(game,step);
  window.nativeShipEffects.advance(game,step);
  window.nativeAsteroidCombat.advance(game,step);
  if(game.hull>0&&game.phase!=='destroyed'&&!game.landed){
   const manual=modal.hidden&&!window.nativeShipLootView?.active&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!devGalaxyView&&!busy();
   const held=code=>manual&&(keys[code]||pressed[code]||controllerContext==='flight'&&gamepad.snapshot.keys?.[code]);
   const controllerCommand=manual&&controllerContext==='flight'&&!keyboardSteering.some(held)?window.nativeGamepadControls.flightCommand(gamepad.snapshot,game):null;
   if(controllerCommand)flightControls.reset();
   const controls=controllerCommand?{maneuvering:true,command:()=>controllerCommand,reset:()=>flightControls.reset()}:flightControls;
   const intent=window.nativePlayerCruise.command(game,held,controls,step);
   if(intent&&!intent.manual){if(game.localCruise)advanceLocalCruise(step,now,intent);else advanceArrivalApproach(step,now,intent);}
   else if(manual){const command=intent?.command||controls.command(game,held,step);window.nativeShipSystems.move(game,game,'player',window.nativePrometheus?.playerCommand(game,command)||command,undefined,step);}
   if(manual||intent){pressed={};updateManualFlight(now);}
  }
  window.nativePrometheus?.advance(game,step);
  window.nativeAsteroidMotion?.collide(game,step);
  window.nativeCollectableMotion?.collide(game,step);
  window.nativeShipTraffic?.collide(game,step);
 });
 if(game.hull!==repairHullBefore){window.vexedHud.update(game);if(window.nativeShipDefinitions.stage(window.nativeShipDefinitions.describe(game))!==repairStageBefore)updateVisuals();}
 now=window.nativeSimulation.now(game);
 if(now-lastEconomySave>8000){lastEconomySave=now;window.nativeSaveStorage.schedule(game,{delay:.1,maxWait:.5});}
}
let preparingTravel=false;
const hostTime=window.nativeSimulationHost=window.nativeSimulationFrame.createHostTime({getState:()=>game,active:()=>!window.nativeSimulation.blocked()&&!travelling()&&!preparingTravel});
// Navigation closes wall-time admission, while the same bounded task owner
// finishes accepted physics before departure can snapshot the fleet.
const simulationService=window.nativeSimulationFrame.createService({getState:()=>game,allowed:()=>!travelling()||['alignment','charging'].includes(window.vexedWarp.phase),advance(){advanceSimulation(0,window.nativeSimulation.now(game),travelling());if(game)reportSaveResult(window.nativeSaveStorage.flushDue(game));}});
// Returning from a hidden tab must not advance its suspended interval.
const checkpointHost=event=>{hostTime.checkpoint(event?.detail?.at);if(window.nativeSimulation.blocked()){simulationService.cancel();clearFlightInput();}else simulationService.request(game);};
addEventListener('native-pausechange',checkpointHost);addEventListener('native-inventorychange',checkpointHost);addEventListener('native-flightgatechange',checkpointHost);
document.addEventListener('visibilitychange',()=>checkpointHost());
addEventListener('pagehide',()=>{hostTime.checkpoint();flushCombatSave();});
addEventListener('native-reincarnation-saveerror',event=>message(event.detail.error));
// One ordinary physical step can run in the existing service after submission:
// interpolation already paints the completed pose at that display boundary.
// Two owed steps still receive bounded RAF catch-up; no time is discarded.
function draw(frameTime){inputFrame++;pollController(frameTime);if(window.nativeOpeningCinematic?.active){window.nativeCollectablesView?.visibility(false);window.nativeFlightStatus?.hide();window.nativeShipVitals?.hide();window.vexedHud?.hide();hostTime.checkpoint(frameTime);last=frameTime;requestAnimationFrame(draw);return;}const frameStarted=performance.now(),frameMs=Math.max(0,frameTime-last);hostTime.checkpoint(frameTime);const dt=hostTime.consumeDisplay();last=frameTime;window.vexedWarp?.advance?.(dt,frameTime);starTime+=dt;window.nativeSimulationFrame?.begin(game);if((game?.shipSimulation?.schedule?.pendingSeconds||0)>=window.nativeSimulationFrame.fixedStep*(2-1e-7))advanceSimulation(0,window.nativeSimulation.now(game));simulationService.request(game);const now=window.nativeSimulation.now(game);heldFire.step(inputFrame);updateDistressButton();if(game)reportSaveResult(window.nativeSaveStorage.flushDue(game));const simulationMs=performance.now()-frameStarted,renderStarted=performance.now();const recordFrame=()=>{window.nativeSimulationMetrics?.record(game,{frame:frameMs,simulation:simulationMs,render:performance.now()-renderStarted,mode:devGalaxyView?'map':'flight'});window.nativeSimulationFrame?.end(game);};const {w,h,safeBottom,scale}=size(),warpFlight=window.vexedWarp.flightEffect,zoom=1;if(!window.vexedWarp.coversWorld||window.vexedWarp.needsSceneWarmup){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);}
 window.nativePlayerDestruction.update(game);
 window.nativeSystemStreaming?.advance(game,dt,{active:!!game&&modal.hidden&&!devGalaxyView&&!paused()&&!document.hidden&&!travelling()&&!window.nativeShipInventory?.active&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active});
 const flightUiVisible=!!game&&modal.hidden&&!devGalaxyView&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!window.nativeShipInventory?.active&&!window.nativeShipyardServices?.docked;
 window.nativeFlightStatus?.update(game,{dt,visible:flightUiVisible,paused:paused()||document.hidden,warping:!!warpFlight||travelling(),speed:warpFlight?.speed??game?.speed??0});
 window.vexedHud.frame(game,{dt,visible:flightUiVisible,paused:paused()||document.hidden});
 window.nativeShipVitals?.update(game,{dt,visible:flightUiVisible,paused:paused()||document.hidden,safeBottom});
 window.nativeShipLootView.update(game,game?selectedCombatTarget():null,{visible:flightInteractionAllowed()});
 window.nativeCruiseControls.update(game,{dt,visible:!!game&&modal.hidden&&!devGalaxyView&&!travelling()&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!window.nativeShipInventory?.active&&!window.nativeShipyardServices?.docked,paused:paused()||document.hidden});
 window.nativeCollectablesView?.visibility(flightUiVisible&&!busy()&&!game?.landed);
 if(game&&targetInputAllowed()&&!document.hidden)targeting.update(game,{current:currentTargetKey()});
 window.vexedShieldGPU?.beginFrame(ctx);
 if(window.vexedWarp.coversWorld&&!window.vexedWarp.needsSceneWarmup){
  // Preserve the decorative display clock while the opaque tunnel covers the
  // world; its hidden planets, crews and lighting need no second full paint.
  window.vexedSpace.update(dt,{locx:0,locy:0,speed:0,reducedMotion:reducedMotion.matches,warp:1});
  window.nativeRadar?.paint(game,false);window.vexedShieldGPU?.endFrame(ctx,now);
  recordFrame();requestAnimationFrame(draw);return;
 }
 if(devGalaxyView&&game?.devMode&&!travelling()){
  asteroidMineButton.hidden=true;
  planetHit=null;planetHits=[];
  window.nativeGalaxyOverview.paint(ctx,{w,h},game);
  window.nativeRadar?.paint(game,false);
  window.vexedShieldGPU?.endFrame(ctx,now);
  recordFrame();requestAnimationFrame(draw);return;
 }
 window.nativePrometheus?.updateUi(game);
 const playerDescriptor=game?window.nativeShipDefinitions.describe(game,game,{category:'player'}):null;
 const renderPosition=window.nativeSimulationFrame.renderPose(game,playerDescriptor);
 const solPosition=game?.system===1?renderPosition:null;
 const cameraX=(renderPosition?.x??0)+(warpFlight?.cameraX||0),cameraY=(renderPosition?.y??0)+(warpFlight?.cameraY||0),cx=w/2,cy=h/2;
 const fogDimensions=game?.devMode&&game.system===1?flightShipDimensions():null;
 window.nativeDevFog?.frame(game,dt,{w,h,zoom,cameraX,cameraY,ship:renderPosition||game,dimensions:fogDimensions,reducedMotion:reducedMotion.matches,
  hidden:!flightUiVisible||travelling()||game?.landed||window.nativeShipyardServices?.docked,
  suspended:paused()||document.hidden||!modal.hidden||travelling()||game?.landed||window.nativeGalaxyMap?.isOpen||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active});
 syncAsteroidMineButton(renderPosition||game,{w,h,cx,cy,zoom});
 const planetX=cx-220-cameraX,planetY=cy+75-cameraY,planetSize=180;
 const planetObject={x:planetX,y:planetY,width:planetSize,height:planetSize};
 const screenPlanetX=cx+(planetX-cx)*zoom,screenPlanetY=cy+(planetY-cy)*zoom,screenPlanetSize=planetSize*zoom;
 const screenPlanet={x:screenPlanetX,y:screenPlanetY,width:screenPlanetSize,height:screenPlanetSize,contains(x,y){return ((x-screenPlanetX)/(screenPlanetSize*.48))**2+((y-screenPlanetY)/(screenPlanetSize*.48))**2<1;}};
 const solBodies=game&&window.vexedSolFlight?window.vexedSolFlight.visibleBodies(game,{w,h,cx,cy,zoom,camera:{x:cameraX,y:cameraY}}):null;
 const visualBodies=solBodies?.filter(entry=>entry.body.kind!=='belt'&&entry.body.kind!=='star');
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
  const flight=phase==='flight';
  window.vexedSpace.enterSystem(game.system);window.vexedSpace.update(dt,{locx,locy,speed:flight?Math.hypot(playerDescriptor.vx,playerDescriptor.vy):locx||locy?Math.max(0,warpFlight?.speed??game.speed):0,
   flightVx:flight?playerDescriptor.vx:undefined,flightVy:flight?playerDescriptor.vy:undefined,maxSpeed:window.nativeShipMotion.profiles.manual(shipStats(game)).maxSpeed,courseLocked:flight,reducedMotion:reducedMotion.matches,warp:phase==='arrival'?2:1,frame:Math.floor(starTime*window.VexedFlightReference.space.sourceRenderFps)});
  const warpPulse=phase==='departure'?(warpFlight.ring?.alpha||0):phase==='arrival'?1-(warpFlight.alpha||0):0;
  window.vexedSpace.render(ctx,{w,h,zoom,reducedMotion:reducedMotion.matches,warpPulse,playerX:solPosition?.x??game.x,playerY:solPosition?.y??game.y,cameraX,cameraY},planetVisuals.map(visual=>visual.disk));
  window.nativeDevFog?.paint(ctx,'back');
 }
 if(game&&modal.hidden){const shipDimensions=fogDimensions||flightShipDimensions(),shipW=shipDimensions.width,shipH=shipDimensions.height;
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
 window.nativeCollectablesView?.frame(game,{cx,cy,cameraX,cameraY,w,h,scale,safeBottom,paused:paused()||document.hidden});
 // All ships, their lights and combat effects pass in front of planets.
 window.nativeSolAsteroids?.paint(ctx,{system:game.system,ship:renderPosition||game,cx,cy,zoom,w,h,mined:[...(game.minedAsteroids||[]),...(game.destroyedAsteroids||[])],damage:game.asteroidDamage||{},hiddenId:window.nativeAsteroidCombat?.miningId,hiddenIds:window.nativeCivilianTraffic.miningIds(game)});
 window.nativeShipSpriteCache.beginFrame?.(ctx,{width:w,height:h});window.nativeHullBatch?.begin(ctx);
 if(game.system===1&&solPosition)window.nativeSolEconomy.paint(ctx,{state:game,ship:solPosition,cx,cy,w,h,zoom});
 window.nativeCivilianTraffic.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,w,h,zoom});
 if(!window.nativePrometheus?.paintPlayer(ctx,game,playerDescriptor,{ship:renderPosition||game,cx,cy,w,h,zoom,appearance:{light:window.vexedSpace.light}}))window.nativeShipEffects.paintShip(ctx,playerDescriptor,{ship:renderPosition||game,cx,cy,w,h,asset:warpFlight?window.vexedWarp.flightShip||flightShip:flightShip,
  x:warpFlight?warpFlight.shipX+cx-300:cx,y:warpFlight?warpFlight.shipY+cy-225:cy,dimensions:shipDimensions,warpEffect:warpFlight,
  visualTime:warpFlight?starTime*1000:undefined,appearance:{light:window.vexedSpace.light,warpPulse:warpFlight?.pulse??(warpFlight?.kind?1:0),...window.nativeShipyardServices?.appearance(game)}});
 window.nativeHullBatch?.end(ctx);window.nativeShipSpriteCache.endFrame?.(ctx);
 window.vexedShieldGPU?.endFrame(ctx,now);
 window.nativeDevFog?.paint(ctx,'front');
 window.vexedFlightAssets.drawWarpRing(ctx,warpFlight?.ring?{...warpFlight.ring,x:warpFlight.ring.x+cx-300,y:warpFlight.ring.y+cy-225}:null,shipW);
 window.vexedFlightAssets.drawWarpFlash(ctx,warpFlight?.flash?{...warpFlight.flash,x:warpFlight.flash.x+cx-300,y:warpFlight.flash.y+cy-225}:null);
 window.nativeCombatShots.paintAll(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,now,w,h});
 window.nativeShipEffects.paint(game,ctx,{ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeRepairVisuals?.paint(game,ctx,{ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeCivilianTraffic.paintMining(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,w,h});
 window.nativeAsteroidCombat?.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,now,w,h});
 window.nativeEnvironmentalImpacts?.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,w,h});
 const droneLock=selectedDroneTarget();
 if(droneLock){const p=window.nativeSimulationFrame.renderPose(game,droneLock);window.nativeAsteroidCombat.drawTargetFrame(ctx,{name:'DOT repair drone',kind:'REPAIR DRONE',size:Math.max(24,droneLock.dimensions.width),color:'#ffd66e',shield:0,hull:droneLock.hull/droneLock.definition.hull},cx+(p.x-(renderPosition||game).x)*zoom,cy+(p.y-(renderPosition||game).y)*zoom,zoom,cx);}
 targeting.paint(ctx,game,{ship:renderPosition||game,cx,cy,zoom,w,h,current:currentTargetKey(),visible:targetInputAllowed()&&!heldFire.active&&!document.hidden});
 window.nativeMarsShipyard?.paint(ctx,{state:game,ship:renderPosition||game,cx,cy,zoom,w,h,now});
 ctx.restore();
 if(game.landed&&!warpFlight&&!window.nativeShipyardServices?.docked){ctx.fillStyle='#06101bdc';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#e7f7ff';ctx.font='22px system-ui';ctx.fillText(`PORT OF ${sys(game.system).name.toUpperCase()}`,w/2,h/2-12);ctx.font='13px system-ui';ctx.fillStyle='#9db8ce';ctx.fillText('Docked · open Trade to buy and sell cargo',w/2,h/2+18);ctx.textAlign='left'}
 }
 window.nativeRadar?.paint(game,!!game&&modal.hidden&&!travelling()&&!paused()&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active);
 window.vexedWarp.acknowledgeScene?.(game?.system);
 recordFrame();requestAnimationFrame(draw)}requestAnimationFrame(draw);
function showMap(controller=false){if(game&&!busy()){window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);window.nativeGalaxyMap.open({controller:controller===true})}}
function openInventory(){if(window.nativePlayerDestruction?.pending||window.nativeShipyardServices?.busy)return;if(!game||travelling()||window.nativePause?.active||!modal.hidden||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active||window.nativeGalaxyMap?.isOpen)return;window.nativeShipInventory.open()}
function trackManualSystem(id){
 const destination=window.nativeManualFlight.guidance(game,id);
 if(!destination)return{ok:false,error:'This system has no known position.'};
 game.manualTargetSystem=destination.id;
 window.nativeNpcLives?.observeCourse?.(game,window.nativeManualFlight.currentRegion(game).system??game.system,destination.id);
 save(true);message(`Manual course to ${destination.name}. Steer toward the radar arrow.`);
 return{ok:true,message:`Tracking ${destination.name} for manual flight.`};
}
window.nativeManualFlight.clearTracking=()=>{if(game?.manualTargetSystem){game.manualTargetSystem=0;save(true);}};
function startJourney(report,next,resumed=false,destinationLabel,journey){
 if(!resumed&&window.nativeShipRepairs?.playerDronesDeployed(game))return {ok:false,error:'Recover your repair drones before travelling.'};
 const origin=game,targetId=journey?.id??report.systemId,guidance=journey?navigation.destination(origin,{system:targetId,body:journey.bodyId}):window.nativeManualFlight.guidance(origin,targetId);
 const from=window.nativeManualFlight.anchor(report?.originId??origin.system),to=window.nativeManualFlight.anchor(targetId);
 const heading=resumed&&Number.isFinite(report.courseAngle)?report.courseAngle-Math.PI/2:resumed?Math.atan2(to.y-from.y,to.x-from.x):Math.atan2(guidance.dy,guidance.dx);
 const courseAngle=heading+Math.PI/2;
 let planned=null,departureReady=false;
 const initial=report||{originId:origin.system,systemId:targetId,shipType:origin.shipType,hull:origin.hull};
 if(resumed)next=game;
 preparingTravel=true;hostTime.checkpoint();window.nativeCombatShots.cancel();clearFlightInput({flush:false});setDevGalaxyView(false);modal.hidden=true;
 const started=window.vexedWarp.start({report:initial,resumed,destinationLabel,originAngle:origin.angle+Math.PI/2,courseAngle,arrivalAngle:courseAngle,originShip:flightShip,shipWidth:flightShipDimensions().width,
  async prepareDeparture(signal){
   if(!departureReady){
    // Close admission first, then pay the last accepted physical steps in
    // bounded tasks. Preparing the navigation UI must not reopen this clock.
    while(!window.nativeSimulationFrame.transitionReady(origin)){
     await new Promise(resolve=>setTimeout(resolve,16));if(signal.aborted)throw Error('Departure cancelled.');
     if(window.nativeSimulation.blocked())continue;
     window.nativeSimulationFrame.begin(origin);
     try{advanceSimulation(0,window.nativeSimulation.now(origin),true);}finally{window.nativeSimulationFrame.end(origin);}
    }
    if(origin.hull<=0||origin.phase==='disabled')throw Error('Repair your disabled hull before warping.');
    const originSaved=await window.nativeSaveStorage.writeAsync(origin,{signal});if(!originSaved.ok)throw Error(originSaved.error);
    departureReady=true;
   }
  },
  async prepareTransit(signal){
   if(!planned){
    planned=await window.nativeWorldBootstrap.planTravel(origin,journey,{signal});next=planned.next;report=planned.report;report.courseAngle=courseAngle;
    next.lastJourney=report;next.localBody=report.destinationBodyId??localCatalog.homeId(next.system);next.localBodySystem=next.system;next.localSystemVersion=localCatalog.version;next.localNavTarget=next.localBody;next.localCruise=null;next.manualTargetSystem=0;delete next.arrivalApproach;
    const body=localCatalog.bodies(next.system).find(body=>body.id===next.localBody),goal=window.vexedSolFlight.bodyPosition(body),distance=approachDistance(window.vexedSolFlight.bodySize(body))+280;
    const position=next.system===73&&window.nativeBadlands?window.nativeBadlands.arrival(heading):{x:goal.x-Math.cos(heading)*distance,y:goal.y-Math.sin(heading)*distance};
    next.x=position.x-(next.system===1?body.x:0);next.y=position.y-(next.system===1?body.y:0);
    window.nativeShipMotion.stop(next);next.angle=heading;window.nativeManualFlight.initializeRegion(next);
   }
   return report;
  },
  prepareDestination(signal,onProgress){return window.nativeSystemStreaming.prepareArrival(next,{view:size(),angle:courseAngle,signal,onProgress});},
  async commit(signal){
   next.pendingTransit={version:1,phase:'report',report};
   const saved=await window.nativeSaveStorage.writeAsync(next,{signal});if(!saved.ok)throw Error(saved.error);
   game=next;hostTime.reset();window.nativePlayerCombat.reset();window.nativeEnvironmentalImpacts.reset();
   window.vexedSpace.enterSystem(game.system,true);window.vexedSolFlight.setTarget(game.localBody,game.system);spaceCamera=null;updateVisuals();refresh();message(`Transit to ${report.destinationName||report.systemName} complete. Preparing arrival.`);
  },
  async beginArrival(signal){
   const current=game,before={phase:current.pendingTransit.phase,angle:current.angle};current.pendingTransit.phase='arrival';current.angle=heading;current.landed=false;
   const saved=await window.nativeSaveStorage.writeAsync(current,{signal});if(!saved.ok){current.pendingTransit.phase=before.phase;current.angle=before.angle;throw Error(saved.error);}
   if(game!==current||signal.aborted)throw Error('Arrival cancelled.');
  },
  async finish(signal){
   const current=game,receipt=current.pendingTransit,body=localCatalog.bodies(current.system).find(body=>body.id===(report.destinationBodyId??localCurrent())),goal=window.vexedSolFlight.bodyPosition(body),position=window.vexedSolFlight.shipPosition(current);
   const dx=goal.x-position.x,dy=goal.y-position.y,distance=Math.hypot(dx,dy),clearance=approachDistance(window.vexedSolFlight.bodySize(body));
   current.arrivalApproach={system:current.system,x:(distance>clearance?goal.x-dx/distance*clearance:position.x)-(current.system===1?body.x:0),y:(distance>clearance?goal.y-dy/distance*clearance:position.y)-(current.system===1?body.y:0)};
   current.speed=window.vexedRebirthWarp.arrivalSpeed;current.vx=Math.cos(heading)*current.speed;current.vy=Math.sin(heading)*current.speed;delete current.pendingTransit;
   if(current.system===73&&window.nativeBadlands){delete current.arrivalApproach;window.nativeShipMotion.stop(current);}
   const saved=await window.nativeSaveStorage.writeAsync(current,{signal});if(!saved.ok){current.pendingTransit=receipt;delete current.arrivalApproach;window.nativeShipMotion.stop(current);throw Error(saved.error);}
   if(game!==current||signal.aborted)throw Error('Arrival cancelled.');
   preparingTravel=false;hostTime.checkpoint();message(`Arrived at ${report.destinationName||report.systemName}. ${report.elapsedDays} days elapsed; ${report.fuelUsed} antimatter consumed.`);refresh();canvas.focus({preventScroll:true});
  },
  cancel(wasCommitted){preparingTravel=false;hostTime.checkpoint();if(wasCommitted){delete game.pendingTransit;save(true);}message(wasCommitted?`Arrived at ${report.destinationName||report.systemName}.`:'Transit interrupted. Your original course and resources are unchanged.');refresh();canvas.focus({preventScroll:true});}
 });
 preparingTravel=false;hostTime.checkpoint();return started;
}
function warp(journey){const sections=window.nativePrometheus?.blockedTravel(game);if(sections){message(sections.error);return sections;}
 if(game.phase==='disabled'||game.hull<=0)return {ok:false,error:'Repair your disabled hull before warping.'};
 if(busy())return {ok:false,error:'A journey is already in progress.'};
 if(window.nativeShipRepairs?.playerDronesDeployed(game))return {ok:false,error:'Recover your repair drones before travelling.'};
 preparingTravel=true;hostTime.checkpoint();
 return startJourney(null,null,false,journey.name,journey);
}
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
function repairDevice(instanceId){
 if(!game)return {ok:false,error:'No ship is active.'};
 const result=window.nativeShipRepairs.repairDevice(game,instanceId,{save:()=>save(true)});
 if(result.ok){refresh();message(result.message);}return result;
}
function repairShields(atPort=false){
 if(!game)return {ok:false,error:'No ship is active.'};
 const result=window.nativeShipRepairs.repairShields(game,{atPort,save:()=>save(true)});
 if(result.ok){refresh();message(result.message);}return result;
}
function requestDistressCall(){
 if(!game)return {ok:false,error:'No ship is active.'};
 if(travelling()||window.nativePause?.active||window.nativeShipyardServices?.busy)return {ok:false,error:'Finish the current action before sending a distress call.'};
 const result=window.nativeShipRepairs.requestPlayerDistress(game,{save:()=>save(true)});
 message(result.message||result.error);refresh();return result;
}
function updateDistressButton(force=false){
 if(!force&&last<nextDistressUi)return;nextDistressUi=last+250;
 const button=document.getElementById('distressBtn'),status=window.nativeShipRepairs.playerDistressStatus(game);
 const disabled=!status.ok||busy()||!modal.hidden||devGalaxyView;
 if(button.disabled!==disabled)button.disabled=disabled;
 const label=status.label||'Distress Call';if(button.textContent!==label)button.textContent=label;
 const pending=String(!!status.pending);if(button.dataset.pending!==pending)button.dataset.pending=pending;
 if(button.getAttribute('aria-description')!==status.message)button.setAttribute('aria-description',status.message);
}
function hubShieldRepair(port){
 if(!hubHere(port))return {ok:false,error:'Reach this port for shield repairs.'};
 return repairShields(true);
}
function hubUpgradeThrusters(port){
 if(!hubHere(port))return {ok:false,error:'Reach this port to upgrade thrusters.'};
 const result=window.nativeShipyardRefits.upgradeThrusters(game,()=>save(true),{atPort:true});
 if(result.ok){refresh();message(result.message);}return result;
}
function hubCruise(id,selection){
 if(window.nativeShipRepairs?.playerDronesDeployed(game))return {ok:false,error:'Recover your repair drones before cruising.'};
 if(game.phase==='disabled'||game.hull<=0)return{ok:false,error:'Repair the critical hull before engaging cruise.'};

 const before={localCruise:game.localCruise,arrivalApproach:game.arrivalApproach,landed:game.landed,manualTargetSystem:game.manualTargetSystem,localNavTarget:game.localNavTarget};
 const result=window.nativePlayerCruise.start(game,selection||{system:game.system,body:id});if(!result.ok)return result;
 const to=result.destination;
 game.manualTargetSystem=localCatalog.sameSystem(to.system,game.system)?0:to.physicalSystem;
 if(localCatalog.sameSystem(to.system,game.system)){game.localNavTarget=to.bodyId;window.vexedSolFlight.setTarget(to.bodyId,game.system);}
 const saved=save(true);if(!saved.ok){Object.assign(game,before);window.vexedSolFlight.setTarget(game.localNavTarget??localCurrent(),game.system);return saved;}
 flightControls.reset();lastCruiseSave=window.nativeSimulation.now(game);message(`Cruising to ${to.name}. Steer anytime; cancel cruise with C.`);return{ok:true,message:`Course set for ${to.name}.`};
}
function cancelCruise(){
 if(!game||!game.localCruise&&!game.arrivalApproach)return {ok:false,error:'Cruise is not active.'};
 if(busy())return {ok:false,error:'Return to flight to cancel cruise.'};
 const before={localCruise:game.localCruise,arrivalApproach:game.arrivalApproach,manualTargetSystem:game.manualTargetSystem};
 game.localCruise=null;delete game.arrivalApproach;game.manualTargetSystem=0;
 const saved=save(true);if(!saved.ok){Object.assign(game,before);return saved;}
 window.nativePlayerCruise.reset(game);flightControls.reset();message('Cruise cancelled. Manual control.');canvas.focus({preventScroll:true});return {ok:true};
}
function selectLocalDestination(id){
 const destination=localBodies().find(body=>body.id===Number(id));
 if(!game||!destination)return{ok:false,error:'Choose a local destination in this system.'};
 game.manualTargetSystem=0;game.localNavTarget=destination.id;window.vexedSolFlight.setTarget(destination.id,game.system);save(true);
 message(`${destination.name} selected for navigation.`);
 return{ok:true,message:`${destination.name} selected on the flight radar.`};
}
function mapCruise(id,selection){
 return hubCruise(id,selection);
}
function deliveryNavigation(id,action){
 const contract=game?.localContracts?.find(job=>Number(job.id)===Number(id));
 if(!contract)return{ok:false,error:'This delivery is no longer aboard.'};
 const destination=window.nativePlayerContracts.address(contract);
 if(!window.nativePlayerContracts.endpoint(game,destination.system,destination.port))return{ok:false,error:'This delivery has no inhabited destination port.'};
 if(action==='cruise')return hubCruise(destination.port,{system:destination.system,body:destination.port});
 if(action!=='select')return{ok:false,error:'Unknown navigation action.'};
 if(game.localCruise||game.arrivalApproach)return{ok:false,error:'Finish the current approach before selecting another destination.'};
 if(!localCatalog.sameSystem(game.system,destination.system))return window.nativeNavigation.call('track',destination.system);
 game.localNavTarget=destination.port;window.vexedSolFlight.setTarget(destination.port,game.system);save(true);
 message(`${destination.name} selected for manual navigation.`);
 return{ok:true,message:`${destination.name} selected on the flight radar.`};
}
function hubBuyShip(id,port){
 if(!hubHere(port))return{ok:false,error:'Reach this port to buy a ship.'};
 const original=game.system===1?({1:[7,16],2:[6,7],3:[7,34,36,9,8,4],4:[7,18],5:[6,12,17,10],7:[3,15],8:[2,13],9:[5,10],10:[1,26]})[port]||[]:sys(game.system).planetShopItemIds;
 const offers=window.nativeFederationShips?.offers(game,port,original)||original;
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
function hubInterstellar(from,toSystem,to,good,tons){
 if(!hubHere(from)||game.arrivalApproach)return{ok:false,error:'Reach the origin port to load cargo.'};
 const result=window.nativeNpcLives.loadPlayerFreight(game,{fromSystem:game.system,fromPort:from,toSystem,toPort:to,good,tons});
 if(result.ok)save(true);
 return result;
}
function hubFreightPermit(from,toSystem,to,good){
 if(!hubHere(from)||game.arrivalApproach)return{ok:false,error:'Reach the loading port to request a permit.'};
 const result=window.nativeNpcLives.buyPlayerFreightPermit(game,{fromSystem:game.system,fromPort:from,toSystem,toPort:to,good},()=>save(true));
 if(result.ok)refresh();return result;
}
function hubDeliver(id){
 const contract=game.localContracts?.find(entry=>entry.id===id);
 if(!contract||!localCatalog.sameSystem(game.system,contract.toSystem??1)||!hubHere(contract.to))return{ok:false,error:'Reach the destination port in the correct system to deliver this cargo.'};
 const result=contract.kind==='interstellar'?window.nativeNpcLives.deliverPlayerFreight(game,id):window.nativeSolEconomy.deliver(game,id);if(result.ok){save(true);refresh()}return result;
}
function openHub(tab='navigation'){
 if(!game||busy())return;
 cancelTargetPress();
 if(tab==='navigation'){showMap();return;}
 window.nativeGalaxyMap?.close(false);window.nativePlanetEncounter?.close(false);modal.hidden=true;clearFlightInput();
 window.nativeSystemHub.open({getState:()=>game,price:hubPrice,cruise:hubCruise,trade:hubTrade,freightTrade:hubFreightTrade,buyShip:hubBuyShip,upgradeTug:hubUpgradeTug,upgradeThrusters:hubUpgradeThrusters,sellMineral:hubSellMineral,refineDeuranium:hubRefineDeuranium,upgradeMinerals:hubUpgradeMinerals,prospect:hubProspect,contract:hubContract,interstellar:hubInterstellar,permit:hubFreightPermit,deliver:hubDeliver,openMap:showMap,openEncounter},tab);
 window.nativeGameSounds?.ui(tab==='market'?'trade':'navigation');
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
 window.nativePlanetEncounter.open({getState:()=>game,price:hubPrice,trade:hubTrade,buyShip:hubBuyShip,buyWeapon:hubBuyWeapon,buyEquipment:hubBuyEquipment,buyMiningTool:hubBuyMiningTool,repair:hubRepair,repairShields:hubShieldRepair,upgradeThrusters:hubUpgradeThrusters,sellMineral:hubSellMineral,refineDeuranium:hubRefineDeuranium,upgradeMinerals:hubUpgradeMinerals,prospect:hubProspect,quote:hubCargoPay,contract:hubContract,interstellar:hubInterstellar,permit:hubFreightPermit,deliver:hubDeliver});
}
function trade(){if(!game||busy())return;window.nativeGalaxyMap?.close(false);const hailed=window.nativePlanetComm?.active;if(!game.landed&&!game.devMode&&!hailed&&!marketFromPlanet){message('Click the planet or dock nearby [E]');return}if(hailed)marketFromPlanet=true;window.nativePlanetComm?.close(false);dialog.innerHTML=`<p style="color:var(--cyan);letter-spacing:.12em">LOCAL EXCHANGE · ${sys(game.system).name.toUpperCase()}</p><h2>Cargo market</h2><p>Exchange goods at local rates. One unit per transaction.</p><div class="market">${goods.map((g,i)=>{const price=([18,24,45,8][i])+((game.system*7+i*13)%19);return`<div><b>${g}</b><br><small>In hold: ${game.devMode?'∞':game[g.toLowerCase()]}</small></div><div>${game.devMode?'FREE':price+' L'}</div><button data-buy="${g}" data-price="${price}">Buy</button><button data-sell="${g}" data-price="${Math.max(1,price-4)}">Sell</button>`}).join('')}</div><p id="marketmsg" class="muted"></p><div class="row"><button data-close>Close</button></div>`;dialog.querySelector('[data-close]').onclick=close;dialog.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>tradeOne(b.dataset.buy,Number(b.dataset.price),true));dialog.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>tradeOne(b.dataset.sell,Number(b.dataset.price),false));modal.hidden=false}
function tradeOne(item,price,buy){const key=item.toLowerCase(),msg=dialog.querySelector('#marketmsg');if(game.devMode){msg.textContent=`${item} is unlimited in Dev mode.`;return}if(buy&&game.latinum<price){msg.textContent='Not enough latinum.';return}if(buy&&game.stocks[item]<=0){msg.textContent='Market depleted.';return}if(!buy&&game[key]<1){msg.textContent='No cargo available to sell.';return}game[key]+=buy?1:-1;game.latinum+=buy?-price:price;game.stocks[item]+=buy?-1:1;msg.textContent=`${buy?'Bought':'Sold'} 1 ${item}.`;refresh();save();trade()}
function dock(){const sections=window.nativePrometheus?.blockedTravel(game);if(sections){message(sections.error);return;}if(window.nativeShipyardServices?.docked){window.nativeShipyardServices.select();return;}if(!game||busy())return;const yard=window.nativeMarsShipyard?.position(game),pose=game.system===1?window.vexedSolFlight.shipPosition(game):game;if(yard&&Math.hypot(yard.x-pose.x,yard.y-pose.y)<300){window.nativeShipyardServices.select();return;}if(game.localCruise||game.arrivalApproach){message('Finish the current approach before docking');return}if(game.landed){game.landed=false;window.nativeShipSystems?.invalidateShips(game);message('Undocked.');return}{const body=localCatalog.current(game),ship=window.vexedSolFlight.shipPosition(game);if(!body?.port){message('There is no port at this body');return}if(Math.hypot(body.x-220-ship.x,body.y+75-ship.y)>Math.max(180,window.vexedSolFlight.bodySize(body)*1.4,localApproachDistance(body)+20)){message('Fly closer to '+body.name+' to dock');return}}game.landed=true;game.speed=0;window.nativeShipSystems?.invalidateShips(game);message(`Docked at ${localCatalog.current(game).name}. Local services available.`);refresh()}
function mineTarget(){
 const rock=window.nativeAsteroidCombat?.target;
 if(!rock)return false;
 const ship=game.system===1?window.vexedSolFlight.shipPosition(game):game;
 if(game.landed||game.localCruise||game.arrivalApproach||game.speed>20){message('Stop near the asteroid to mine it');return true}
 const result=window.nativeAsteroidCombat.mine(game,ship,(rock,hasOre)=>{
  const notice=hasOre?'Ore released.':'Asteroid mined.';
  message(notice);refresh();save(true);
 });
 if(!result.ok)message(result.error);else{smartTargets.attention('asteroid:'+rock.slotId,window.nativeSimulation.seconds(game),'mine');targeting.invalidate();message(result.message);}
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
function currentTargetKey(){
 const drone=selectedDroneTarget();if(drone)return 'repair-drone:'+drone.id;
 const tug=game.system===1?window.nativeSolEconomy.target(game):null,rock=window.nativeAsteroidCombat.target,civilian=window.nativeCivilianTraffic.target(game);
 return tug?`tug:${tug.id}`:civilian?`civilian:${civilian.id}`:rock?`asteroid:${rock.slotId}`:null;
}
function selectedCombatTarget(){
 const key=currentTargetKey();if(!key)return null;
 if(key.startsWith('repair-drone:'))return selectedDroneTarget();
 const id=key.startsWith('civilian:')?key.slice(9):key.startsWith('asteroid:')?'rock:'+key.slice(9):key;
 return window.nativeShipSystems.resolve(game,id,game.system);
}
function selectedDroneTarget(){
 if(droneTargetId===null||!game)return null;
 const target=window.nativeShipRepairs.resolveDrone(game,droneTargetId,game.system);if(!target)droneTargetId=null;return target;
}
function selectedFiringStatus(){
 return window.nativeCombatShots.firingStatus(game,window.nativeShipDefinitions.describe(game,game,{category:'player'}),selectedCombatTarget(),{forward:!currentTargetKey()});
}
const targetShiftKeys=new Set();
let targetHoldTimer=null;
function targetInputAllowed(){
 return flightInteractionAllowed()&&!window.nativeShipLootView?.active;
}
function flightInteractionAllowed(){
 return !!game&&game.hull>0&&!document.hidden&&modal.hidden&&!game.landed&&!game.localCruise&&!game.arrivalApproach&&!busy()&&!devGalaxyView&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active;
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
  clearTargetLock();
 },500);
}
function endTargetPress(code){
 if(!targetShiftKeys.delete(code)||targetShiftKeys.size)return;
 const tap=targetHoldTimer!==null;
 cancelTargetPress();
 if(tap&&targetInputAllowed())cycleTarget();
}
function fireSelectedTarget(ship){
 const drone=selectedDroneTarget();
 if(drone){
  const firedState=game;
  const result=window.nativeCombatShots.fireFor({state:firedState,shooter:window.nativeShipDefinitions.describe(firedState,firedState,{category:'player'}),
   getTarget:()=>window.nativeShipRepairs.resolveDrone(firedState,drone.id,drone.system),owner:'player',onResolved(hit){
    if(hit.kind==='hit'){const dead=hit.damage?.destroyed,sameDrone=hit.target?.category==='repair-drone'&&String(hit.target.id)===String(drone.id);
     message(sameDrone?(dead?'DOT destroyed. Its repairs have stopped.':'DOT hit.'):'Shot intercepted by another object.');if(dead)save(true);else scheduleCombatSave();refresh();}
   }});
  if(result.ok)message(`${result.weapon} fired at DOT.`);return result;
 }
 const combat=window.nativeAsteroidCombat;
 const tug=game.system===1?window.nativeSolEconomy.target(game):null;
 if(tug){
  const dimensions=flightShipDimensions();
  const result=window.nativeSolEconomy.fire(game,ship,dimensions.height,(victim,damage)=>{
   const notice=damage.destroyed?`Tug II #${victim.id+1} destroyed · ${damage.reputation.faction} standing -${damage.reputation.amount}.`:`Tug II #${victim.id+1}: ${Math.ceil(damage.shields)} shields, ${Math.ceil(damage.hull)} hull.`;
   message(notice);refresh();scheduleCombatSave();
  });
  if(!result.ok)return result;
  message(`${result.weapon} fired at Tug II #${tug.id+1}.`);return result;
 }
 const civilian=window.nativeCivilianTraffic.target(game);
 if(civilian){
  const dimensions=flightShipDimensions();
  const result=window.nativeCivilianTraffic.fire(game,ship,dimensions.height,(victim,damage)=>{
   const notice=damage.destroyed?`${victim.name} destroyed. ${damage.reputation.faction} standing -${damage.reputation.amount}.`:`${victim.name}: ${Math.ceil(damage.shields)} shields, ${Math.ceil(damage.hull)} hull${damage.disabled?' (disabled)':''}.`;
   message(notice);refresh();scheduleCombatSave();
  });
  if(!result.ok)return result;
  message(`${result.weapon} fired at ${civilian.name}.`);return result;
 }
 const dimensions=flightShipDimensions();
 const result=window.nativeAsteroidCombat.fire(game,ship,dimensions.width,dimensions.height,(rock,hasOre)=>{
  const notice=hasOre?'Asteroid destroyed. Ore detected.':'Asteroid destroyed. No recoverable ore.';
  message(notice);refresh();scheduleCombatSave();
 });
 if(result.ok)message(`${result.weapon} fired at asteroid.`);
 return result;
}
function clearTargetLock(){
 const hadTarget=!!currentTargetKey();droneTargetId=null;heldFire.stop();window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(null);window.nativeAsteroidCombat.deselect();targeting.invalidate();
 if(hadTarget){message('Target cleared.');refresh();}return hadTarget;
}
function cycleTarget(){
 if(!targetInputAllowed())return false;
 const next=targeting.choose(game,currentTargetKey());
 if(!next){message('No targets in selection range.');return false;}
 heldFire.stop();
 droneTargetId=null;
 window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(null);window.nativeAsteroidCombat.deselect();
 if(next.kind==='tug')window.nativeSolEconomy.select(next.entry.id);
 else if(next.kind==='civilian')window.nativeCivilianTraffic.select(next.entry.id);
 else if(next.kind==='repair-drone')droneTargetId=next.entry.id;
 else window.nativeAsteroidCombat.select(next.entry);
 const notice=`${next.danger?'Combat':'Target'} lock: ${next.kind==='tug'?`Tug II #${next.entry.id+1}`:next.kind==='repair-drone'?'DOT repair drone':next.entry.name}.`;
 message(notice);refresh();return true;
}
window.nativeShipLootView.attach({state:()=>game,target:selectedCombatTarget,allowed:flightInteractionAllowed,save:()=>save(true),refresh,message,open:()=>clearFlightInput(),close:()=>clearFlightInput()});
window.nativeTargetingActions=Object.freeze({acquire:cycleTarget,clear(){if(targetInputAllowed())return clearTargetLock();return false;},trigger:value=>targetTrigger.update(value),snapshot:()=>({...targeting.snapshot(),lock:game?currentTargetKey():null})});

function firePlayerWeapon(notify=true){
 if(!targetInputAllowed())return false;
 if(game.hull<=0||game.phase==='disabled'){if(notify)message('Weapons are disabled by critical hull damage.');return false;}
 const lock=currentTargetKey();
 if(lock&&!selectedCombatTarget()){heldFire.stop();if(notify)message('Target unavailable.');return false;}
 const status=selectedFiringStatus();
 if(!status.ok){if(['lock','no-weapons','unarmed'].includes(status.reason))heldFire.stop();if(notify)message(status.message);return false;}
 reportSaveResult(window.nativeReincarnation.beforeDanger(game));
 const result=lock?fireSelectedTarget(game.system===1?window.vexedSolFlight.shipPosition(game):game):
  window.nativeCombatShots.fire({state:game,forward:true,onResolved(result){if(result.kind==='hit'){message('Manual shot hit.');refresh();}scheduleCombatSave();}});
 if(result?.ok){
  if(lock){smartTargets.attention(lock,window.nativeSimulation.seconds(game),'combat');targeting.invalidate();}
  else{message(`${result.weapon} fired straight ahead.`);scheduleCombatSave();}
 }
 if(!result?.ok&&notify)message(result?.error||'Unable to fire.');
 return !!result?.ok;
}
function scan(){if(!game||busy())return;if(mineTarget())return;window.nativeGalaxyMap?.close(false);if(!game.landed&&!game.devMode){message('Dock at a world to survey it [E]');return}if(!game.devMode&&game.deuranium<5){message('Survey requires 5 deuranium');return}if(!game.discovered.includes(game.system))game.discovered.push(game.system);if(!game.devMode){game.deuranium-=5;game.latinum+=45;game.nav+=12}message(`${sys(game.system).name} surveyed.${game.devMode?'':' Scientific contract paid 45 latinum.'}`);message(game.devMode?'Survey complete':'Survey complete · +45 latinum');refresh();save()}
function repair(){
 if(!game||busy())return;
 if(!game.devMode&&game.hull<=0){message('This hull is destroyed. Restore command data or start a new ship.');return;}
 if(!game.devMode&&game.phase==='disabled'){
  const result=window.nativeShipRepairs.recoverPlayer(game);
  message(result.message||result.error);if(result.ok){save(true);refresh();}return;
 }
 window.nativeGalaxyMap?.close(false);
 if(!game.devMode&&(game.deuranium<10||game.latinum<40)){message('Repair costs 10 deuranium and 40 latinum');return;}
 if(!game.devMode){game.deuranium-=10;game.latinum-=40;}
 if(game.devMode){
  const eq=window.nativeShipEquipment.ensure(game);
  for(const kind of ['engineering','shield'])for(const id of eq.slots[kind])if(eq.instances[id])eq.instances[id].condition=100;
 }
 const ship=shipStats(game);
 game.hull=game.devMode?ship.hull:Math.min(ship.hull,game.hull+Math.ceil(ship.hull*.25));
 game.shields=game.devMode?ship.shields:Math.min(ship.shields,game.shields+Math.ceil(ship.shields*.25));
 if(game.devMode&&['disabled','destroyed'].includes(game.phase)){
  game.phase=game.landed?'docked':'flight';window.nativeShipMotion.stop(game);
 }
 updateVisuals();message(game.devMode?'Dev repair fully restored hull, shields and fitted devices.':'Field repairs restored hull and shields.');refresh();save();
}
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
 if(result.ok===false){message(result.error);return result;}
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
 window.nativeDevFog?.controls(dialog,game);
 const galaxyButton=document.createElement('button');galaxyButton.id='galaxy-map-button';galaxyButton.type='button';galaxyButton.textContent=devGalaxyView?'Return to flight view':'View whole galaxy';
 dialog.querySelector('.dev-system-group').before(galaxyButton);
 galaxyButton.onclick=()=>{setDevGalaxyView(!devGalaxyView);close();};
 const freightButton=document.createElement('button');freightButton.id='dev-freighter-life-button';freightButton.type='button';freightButton.textContent='Follow a persistent freighter delivery';galaxyButton.after(freightButton);freightButton.onclick=startFreighterDemo;
 const miningButton=document.createElement('button');miningButton.id='dev-civilian-mining-button';miningButton.type='button';miningButton.textContent='Watch civilian mining at Earth';galaxyButton.after(miningButton);
 miningButton.onclick=()=>{game.system=1;game.planet=sys(1).name;game.localBody=3;game.x=0;game.y=0;game.speed=0;game.landed=false;game.localCruise=null;game.arrivalApproach=null;window.vexedSpace.enterSystem(1,true);spaceCamera=null;setDevGalaxyView(false);const ready=window.nativeCivilianTraffic.startOreDisputeDemo(game);updateVisuals();refresh();save(true);close();const notice=ready?'A civilian is mining near Earth. Watch the other ship approach and steal its ore.':'Asteroids are still loading. The miner and ore thief will start when they are ready.';message(notice);};
 const disputeButton=document.createElement('button');disputeButton.id='dev-civilian-dispute-button';disputeButton.type='button';disputeButton.textContent='Watch ore theft dispute at Earth';miningButton.after(disputeButton);
 disputeButton.onclick=()=>{game.system=1;game.planet=sys(1).name;game.localBody=3;game.x=0;game.y=0;game.speed=0;game.landed=false;game.localCruise=null;game.arrivalApproach=null;window.vexedSpace.enterSystem(1,true);spaceCamera=null;setDevGalaxyView(false);const ready=window.nativeCivilianTraffic.startOreDisputeDemo(game);updateVisuals();refresh();save(true);close();const notice=ready?'Watch the miner: another civilian is approaching to steal its ore.':'Asteroids are still loading. Try the dispute preview again shortly.';message(notice);};
 modal.hidden=false;window.nativeDevShipPreview.attach(dialog,world.ships);
 dialog.querySelector('[data-dev-equip]').onclick=()=>{const ship=world.ships.find(entry=>entry.id===Number(shipSelect.value));if(!ship)return;const changed=window.nativeShipEquipment.changeHull(game,ship.id);if(!changed.ok){message(changed.error);return;}unlockDev(game);updateVisuals();refresh();save(true);message(`Dev ship equipped: ${ship.name}.`);close()};
 dialog.querySelector('[data-dev-jump]').onclick=()=>{const system=sys(systemSelect.value);if(!system)return;game.system=system.id;game.planet=system.name;game.x=0;game.y=0;game.speed=0;game.landed=false;window.vexedSpace.enterSystem(system.id,true);spaceCamera=null;updateVisuals();refresh();save(true);message(`Dev jump complete: ${system.name}.`);close()};
 dialog.querySelector('[data-close]').onclick=close;
}
devButton.onclick=devTools;
document.getElementById('tradeBtn').textContent='Market [T]';
canvas.addEventListener('click',event=>{
 if(window.nativeShipyardServices?.docked){window.nativeShipyardServices.select();return;}
 if(devGalaxyView||!game||busy()||!modal.hidden||window.nativeGalaxyMap?.isOpen||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active)return;
 window.nativeShipLootView.close({restore:false});
 const rect=canvas.getBoundingClientRect(),view=window.nativeView.measure(canvas);
 const x=(event.clientX-rect.left)*view.w/rect.width,y=(event.clientY-rect.top)*view.h/rect.height;
 const player=game.system===1?window.vexedSolFlight.shipPosition(game):game;
 const drone=targeting.droneHitTest(game,{ship:player,cx:view.w/2,cy:view.h/2,zoom:1,x,y});
 if(drone){droneTargetId=drone.id;window.nativeAsteroidCombat.deselect();window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(null);heldFire.stop();canvas.focus({preventScroll:true});smartTargets.attention(currentTargetKey(),window.nativeSimulation.seconds(game));message('DOT repair drone targeted.');refresh();return;}
 droneTargetId=null;
 if(window.nativeShipyardServices?.hit(game,{ship:player,cx:view.w/2,cy:view.h/2,zoom:1,x,y,w:view.w,h:view.h})){window.nativeShipyardServices.select();keys={};return;}
 const civilian=window.nativeCivilianTraffic.hitTest(game,{ship:player,cx:view.w/2,cy:view.h/2,zoom:1,x,y});
 if(civilian){window.nativeAsteroidCombat?.deselect();window.nativeSolEconomy.select(null);window.nativeCivilianTraffic.select(civilian.id);heldFire.stop();canvas.focus({preventScroll:true});const notice=`${civilian.name} targeted.`;smartTargets.attention(currentTargetKey(),window.nativeSimulation.seconds(game));message(notice);refresh();return;}
 if(game.system===1){
  const ship=window.vexedSolFlight.shipPosition(game);
  const tug=window.nativeSolEconomy.hitTest(game,{ship,cx:view.w/2,cy:view.h/2,zoom:1,x,y});
  if(tug){window.nativeAsteroidCombat?.deselect();window.nativeCivilianTraffic.select(null);window.nativeSolEconomy.select(tug.id);heldFire.stop();canvas.focus({preventScroll:true});const notice=`Tug II #${tug.id+1} targeted.`;smartTargets.attention(currentTargetKey(),window.nativeSimulation.seconds(game));message(notice);refresh();return;}
 }
 {
  const ship=player;
  const ore=window.nativeAsteroidCombat?.oreHit(game,ship,{cx:view.w/2,cy:view.h/2,zoom:1,x,y});
  if(ore){
   if(Math.hypot(ore.rock.x-ship.x,ore.rock.y-ship.y)>360){message('Move within 360 units to collect ore.');return}
   if(!game.devMode&&ore.rock.oreType!=='dilithium'&&window.nativeShipEquipment.cargoUsed(game)+ore.indices.length>shipStats(game).cargo){message('Cargo hold full. Sell or deliver cargo before collecting this ore.');return;}
   for(const index of ore.indices)game.asteroidOreDrops[ore.rock.slotId]&=~(1<<index);
   if(ore.rock.oreType==='dilithium')game.dilithium=(Number(game.dilithium)||0)+ore.indices.length;
   else{game.minerals ||= {};game.minerals[ore.rock.oreType]=(Number(game.minerals[ore.rock.oreType])||0)+ore.indices.length}
   if(game.minedAsteroids?.includes(ore.rock.slotId))window.nativeAsteroidCombat.collectField(ore.rock,ore.indices);
   else for(const index of ore.indices)window.nativeAsteroidCombat.collect(ore.rock,index);
   window.nativeGameSounds?.transport(game);
   const notice=`${ore.indices.length} ${ore.rock.oreLabel} transported aboard.`;
   message(notice);refresh();save(true);return;
  }
  const rock=window.nativeSolAsteroids?.hitTest({system:game.system,ship,cx:view.w/2,cy:view.h/2,zoom:1,x,y,mined:[...(game.minedAsteroids||[]),...(game.destroyedAsteroids||[]),...window.nativeCivilianTraffic.miningIds(game)]});
  if(rock){
   window.nativeSolEconomy.select(null);
   window.nativeCivilianTraffic.select(null);
   window.nativeAsteroidCombat.select(rock);smartTargets.attention(currentTargetKey(),window.nativeSimulation.seconds(game));heldFire.stop();canvas.focus({preventScroll:true});
   if(event.detail===2){mineTarget();return}
   message('Asteroid targeted. Double-click the asteroid to mine.');
   message('Asteroid targeted.');
   refresh();return;
  }
 }
 if(!planetHit&&!planetHits.length)return;
 const clicked=planetHits.find(hit=>hit.contains(x,y));
 if(!clicked)return;
 if(clicked.id!==localCurrent()){message('Fly closer to '+clicked.name+' to make contact');return}
 clearFlightInput();
 openEncounter();
});
canvas.tabIndex=-1;asteroidMineButton.onclick=()=>mineTarget();asteroidMineButton.addEventListener('keydown',event=>{if(event.code==='Space')event.stopPropagation()});document.querySelector('#save').onclick=()=>{if(!busy())save()};document.querySelector('#mapBtn').onclick=showMap;document.querySelector('#tradeBtn').onclick=()=>openHub('market');document.querySelector('#inventoryBtn').onclick=openInventory;document.querySelector('#mineBtn').onclick=scan;document.querySelector('#repairBtn').onclick=repair;document.querySelector('#distressBtn').onclick=requestDistressCall;
 addEventListener('keydown',e=>{if(window.nativeShipyardServices?.busy){if(e.code==='KeyE'&&!e.repeat&&window.nativeShipyardServices.docked&&!window.nativeShipyardServices.active)window.nativeShipyardServices.select();if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();return;}if(window.nativeCollectablesView?.active)return;if(window.nativeShipInventory?.active){if((e.code==='KeyI'||e.key==='Escape')&&!e.repeat){e.preventDefault();window.nativeShipInventory.close()}return}if(e.code==='KeyC'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(game?.localCruise||game?.arrivalApproach)&&modal.hidden&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!busy()){e.preventDefault();cancelCruise();return;}if(e.code==='KeyI'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openInventory();return}if(travelling()){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();return}if(window.nativeSystemHub?.active||window.nativePlanetEncounter?.active)return;if(window.nativeGalaxyMap?.isOpen){if((e.key==='Escape'||e.code==='KeyM')&&!e.repeat){e.preventDefault();window.nativeGalaxyMap.close()}return}if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&modal.hidden&&game){e.preventDefault();if(!e.repeat)beginTargetPress(e.code);return}if(e.code==='Space'&&modal.hidden&&game){e.preventDefault();if(!e.repeat&&!heldFire.start(inputFrame)){const status=selectedFiringStatus();if(!status.ok)message(status.message);}return}if(e.key==='Escape'){close();return}if(modal.hidden&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();if(e.code==='KeyM'&&modal.hidden&&!e.repeat){e.preventDefault();showMap()}if(e.code==='KeyN'&&modal.hidden&&!e.repeat)openHub('navigation');if(e.code==='KeyT'&&modal.hidden&&!e.repeat)openHub('market');if(e.code==='KeyE'&&modal.hidden)dock()});addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space'&&!controllerFire)heldFire.stop();if(e.code==='ShiftLeft'||e.code==='ShiftRight')endTargetPress(e.code)});addEventListener('keydown',e=>{if(modal.hidden&&game&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active&&!window.nativeShipInventory?.active&&!busy()){keys[e.code]=true;if(!e.repeat)pressed[e.code]=true;}});addEventListener('blur',()=>{clearFlightInput();cancelTargetPress()});addEventListener('resize',size);
window.nativeCollectablesView?.attach({getState:()=>game,notice:message,openCollection(){window.nativeShipInventory.open({page:'collectables'});},transport(id){
 if(!game||busy()||devGalaxyView||!modal.hidden||window.nativeGalaxyMap?.isOpen||window.nativeSystemHub?.active||window.nativePlanetEncounter?.active)return {ok:false,error:'Return to flight to transport this item.'};
 clearFlightInput();const result=window.nativeCollectables.collect(game,id,{save:()=>save(true)});
 if(result.ok){window.nativeGameSounds?.transport(game);refresh();message(`${result.item.name} transported aboard. Added to Collectables.`);}else message(result.error);
 return result;
}});
window.nativeShipyardServices?.attach({getState:()=>game,save:()=>save(true),refresh(){updateVisuals();refresh();},clearInput(){clearFlightInput();}});
window.nativePrometheus?.attach({getState:()=>game,getTarget:selectedCombatTarget,allowed:()=>flightInteractionAllowed()&&!window.nativeSimulation.blocked(),notice:message,save:()=>save(true),changed(){updateVisuals();refresh();}});
window.nativeGameSounds?.attach(()=>game);
window.nativeControllerHaptics.attach({getState:()=>game,allowed:()=>!!game&&controllerFocused&&!document.hidden&&modal.hidden&&!busy()&&!window.nativeSimulation.blocked()&&!window.nativeGalaxyMap?.isOpen&&!window.nativeSystemHub?.active&&!window.nativePlanetEncounter?.active,testAllowed:()=>controllerFocused&&!document.hidden});
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.nativeControllerHaptics.stop();});
addEventListener('pagehide',()=>window.nativeControllerHaptics.stop());
window.nativePlayerDestruction.attach({saved:()=>window.nativeReincarnation.saved(game),prepare(){clearFlightInput({flush:false,preserveHaptics:true});window.nativeCollectablesView?.close({restore:false});window.nativeShipInventory?.close();window.nativeShipyardServices?.close();window.nativeGalaxyMap?.close(false);window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);modal.hidden=true;},restore(){const mode=game?.devMode?'dev':'normal',result=window.nativeReincarnation.prepare(window.nativeReincarnation.saved(game));if(!result.ok)return result;const written=window.nativeSaveStorage.write(result.state);if(!written.ok)return written;resume(mode,result.state);message(result.relocated?'Reincarnated outside hostile space. The earlier timeline is restored.':'Reincarnated. The earlier timeline is restored.');return {ok:!!game&&game.hull>0};},menu(){window.nativePlayerDestruction.reset();clearFlightInput({flush:false});simulationService.cancel();window.nativePlayerCombat.reset();window.nativeEnvironmentalImpacts?.reset();game=null;flightShip=null;spaceCamera=null;hostTime.reset();modal.hidden=true;menuArt.hidden=false;document.body.classList.remove('playing','paused');document.getElementById('save').disabled=true;devButton.hidden=true;window.vexedHud.hide();window.nativeShipVitals?.hide();window.nativeFlightStatus?.hide();menuSpace.prepare();document.querySelector('[data-menu="new"]').focus({preventScroll:true});message('Main menu');}});
window.nativePause.attach({active:()=>!!game,clearInput(){clearFlightInput();cancelTargetPress()},prepare(){window.nativeCollectablesView?.close({restore:false});window.nativeShipyardServices?.close();window.nativeGalaxyMap?.close(false);window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);window.nativeShipInventory?.close();modal.hidden=true},save:()=>save(true)});
window.nativeShipInventory.attach({getState:()=>game,deliveryNavigation,requestDistressCall,save:()=>save(true),repairDevice,setRepairMode(mode){const result=window.nativeShipRepairs.setRepairMode(game,mode);if(!result.ok)return result;const saved=save(true);refresh();return {...result,saved:saved.ok};},deployRepairDrones(){const result=window.nativeShipRepairs.deployPlayer(game);if(!result.ok)return result;const saved=save(true);refresh();if(saved.ok)message('Repair drones deployed. Hull repairs underway.');return {...result,saved:saved.ok};},moveInventory(options){const result=window.nativeShipEquipment.moveInventory(game,options);if(result.ok){const saved=save(true);refresh();return {...result,saved:saved.ok};}return result;},atPort:()=>hubHere(localCurrent()),moveEquipment(options){const result=window.nativeShipEquipment.move(game,options);if(result.ok){save(true);refresh();}return result;},buyEquipment(id){if(!hubHere(localCurrent()))return{ok:false,error:'Reach a port to purchase equipment.'};const result=window.nativeShipEquipment.purchase(game,id);if(result.ok){save(true);refresh();}return result;},moveWeapon(fromType,from,toType,to){
 if(!game)return false;
 const result=window.nativeWeaponLoadout.move(game,{fromType,fromIndex:from,toType,toIndex:to});
 if(!result.ok)return false;
 save(true);refresh();return true;
}});
navigation.attach({getGame:()=>game,isBusy:busy,prepareMap(){clearFlightInput();window.nativeSystemHub?.close(false);window.nativePlanetEncounter?.close(false);modal.hidden=true;},travel:warp,track:trackManualSystem,cruise:mapCruise,cancelCruise,selectLocal:selectLocalDestination});
const continueButton=document.querySelector('[data-menu="continue"]');continueButton.disabled=!savedGame('normal');continueButton.onclick=()=>resume('normal');const devContinue=document.querySelector('[data-menu="continue-dev"]');devContinue.disabled=!savedGame('dev');devContinue.onclick=()=>resume('dev');
document.getElementById('save').disabled=true;
})();
