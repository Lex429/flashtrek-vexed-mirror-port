const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../html-games/broken-mirror-port');
async function fixture(saved){
  const window={nativePause:{active:false},nativeShipInventory:{active:false},nativeSystemHub:{sol:[]},
    vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:30,height:60}),loadShip:async()=>({art:{},profile:{},width:30,height:60})},
    vexedSolFlight:{shipPosition:s=>({x:s.x,y:s.y}),bodySize:()=>128},nativeSolAsteroids:{placements:[],image:()=>({complete:false})},starterShips:new Map(),
    showcaseWeaponAppearance:{units:.91976},showcaseShieldRadii:(w,h)=>({rx:w*.6,ry:h*.6}),createShowcaseWeaponVisual:i=>({...i}),showcaseHullBurst:{burst(){},update(){}}};
  const context=vm.createContext({window,document:{hidden:false},console,performance,fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'../flashtrek-broken-mirror/showcase-assets',url.split('/').pop().split('?')[0]),'utf8'))})});
  for(const file of ['world-data.js','weapon-catalog.js','simulation-clock.js','ship-motion.js','ship-definitions.js','ship-damage.js','ship-effects.js','weapon-loadout.js','weapon-rules.js','combat-shots.js','ship-systems.js','rebirth-warp.js','faction-standing.js','sol-economy.js','civilian-combat-ai.js','civilian-traffic.js','asteroid-combat.js','manual-flight.js','npc-lives.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  await window.nativeCombatShots.ready;
  const state=saved||{system:1,shipType:7,x:0,y:0,angle:0,speed:0,hull:100,shields:100,weapons:[1],localPrestige:{},minedAsteroids:[],destroyedAsteroids:[]};
  window.nativeSimulation.ensure(state);window.nativeSolEconomy.initialize(state);window.nativeCivilianTraffic.initialize(state);
  if(!saved){const ship=state.civilianTraffic.ships.find(s=>s.id===2);state.civilianTraffic.ships=[ship];Object.assign(ship,{system:1,port:3,x:-60,y:150,phase:'docked',timer:1000,cargo:null,credits:1000});}
  window.nativeNpcLives.initialize(state);
  const step=(dt=.1)=>{window.nativeSimulation.advance(state,dt);window.nativeCivilianTraffic.advance(state,dt);};
  const ship=state.civilianTraffic.ships[0],lives=window.nativeNpcLives;
  const start=()=>lives.startDelivery(state,ship.id,{fromSystem:1,fromPort:3,toSystem:2,toPort:0,good:5,tons:4});
  const until=(predicate,max=3000)=>{for(let i=0;i<max&&!predicate();i++)step(.1);assert.ok(predicate(),'scheduled condition reached');};
  return {window,state,ship,lives,step,start,until};
}
test('one saved ship loads real stock, travels, approaches, docks and transfers goods and money once',async()=>{
  const {state,ship,lives,start,until,step}=await fixture();
  const source=lives.market(state,1,3),destination=lives.market(state,2,0),beforeSource=source.stock[5],beforeDestination=destination.stock[5];
  const money=source.credits+destination.credits+ship.credits,id=ship.id;
  assert.ok(start().ok);assert.equal(source.reserved[5],4);assert.equal(source.stock[5],beforeSource);
  until(()=>ship.task?.phase==='transit');assert.equal(source.stock[5],beforeSource-4);assert.equal(source.reserved[5],0);assert.equal(ship.cargo.tons,4);
  const journey=ship.journey;assert.equal(journey.duration,Math.max(lives.initialize(state).config.minJourneySeconds,journey.distance/journey.speed));
  assert.deepEqual([...journey.route],[1,2]);assert.equal(journey.elapsedDays,journey.duration/120);
  until(()=>ship.task?.status==='completed');assert.equal(ship.id,id);assert.equal(ship.system,2);assert.equal(destination.stock[5],beforeDestination+4);assert.equal(ship.cargo,null);assert.equal(ship.deliveries,1);
  assert.equal(source.credits+destination.credits+ship.credits,money);
  const deliveries=ship.deliveries,stock=destination.stock[5];for(let i=0;i<10;i++)step(.1);
  assert.equal(ship.deliveries,deliveries);assert.equal(destination.stock[5],stock);
  assert.ok(ship.recentEvents.some(e=>e.kind==='docked'));assert.ok(ship.recentEvents.some(e=>e.kind==='delivered'));
});
test('distant completion and midway JSON restore preserve cargo, journey identity and exact outcome',async()=>{
  const first=await fixture();assert.ok(first.start().ok);first.until(()=>first.ship.journey);first.step(first.ship.journey.duration*.4);
  const saved=JSON.parse(JSON.stringify(first.state)),restored=await fixture(saved),taskId=first.ship.task.id,journey=JSON.stringify(first.ship.journey);
  assert.equal(restored.ship.task.id,taskId);assert.equal(JSON.stringify(restored.ship.journey),journey);assert.equal(restored.ship.cargo.tons,4);
  restored.state.system=47;restored.state.x=0;restored.state.y=0;
  first.until(()=>first.ship.task.status==='completed');restored.until(()=>restored.ship.task.status==='completed');
  assert.equal(restored.ship.deliveries,first.ship.deliveries);assert.equal(restored.ship.credits,first.ship.credits);assert.deepEqual([...restored.lives.market(restored.state,2,0).stock],[...first.lives.market(first.state,2,0).stock]);
});
test('detail transitions use the same shared motion pose and map position without resetting tasks',async()=>{
  const {window,state,ship,lives,start,until,step}=await fixture();start();until(()=>ship.journey);step(ship.journey.duration+1);until(()=>ship.localLeg);
  state.system=47;step(.5);const pose=lives.galaxyPosition(state,ship),taskId=ship.task.id;
  state.system=ship.system;const anchor=window.nativeManualFlight.anchor(ship.system);state.x=pose.x-anchor.x;state.y=pose.y-anchor.y;
  assert.equal(lives.detail(state,ship),'detailed');lives.advance(state,.00001);const after=lives.galaxyPosition(state,ship);
  assert.ok(Math.hypot(after.x-pose.x,after.y-pose.y)<1e-7);assert.equal(ship.task.id,taskId);assert.equal(ship.cargo.tons,4);
  const marker=lives.descriptors(state)[0];assert.ok(Math.abs(marker.x+anchor.x-marker.galaxy.x)<1e-7);assert.ok(Math.abs(ship.x-marker.x)<1e-7);
});
test('interruption releases only reservations; disabled cargo stays aboard, destroyed cargo is explicitly lost',async()=>{
  const one=await fixture(),source=one.lives.market(one.state,1,3),stock=source.stock[5];one.start();one.lives.interrupt(one.state,one.ship,'disabled');
  assert.equal(source.reserved[5],0);assert.equal(source.stock[5],stock);assert.equal(one.ship.task.status,'failed');
  const two=await fixture();two.start();two.until(()=>two.ship.cargo);const loaded=two.lives.market(two.state,1,3).stock[5];two.lives.interrupt(two.state,two.ship,'disabled');assert.equal(two.ship.cargo.tons,4);assert.equal(two.lives.market(two.state,1,3).stock[5],loaded);
  two.lives.interrupt(two.state,two.ship,'destroyed');assert.equal(two.ship.cargo,null);assert.equal(two.state.civilianTraffic.life.strandedCargo[0].cargo.tons,4);assert.equal(two.state.civilianTraffic.life.strandedCargo[0].status,'lost');
});
test('mining reserves a real asteroid claim and creates the common ore entitlement exactly once',async()=>{
  const {window,state,ship,lives,step,until}=await fixture();ship.role='mining';ship.nextActionAt=0;ship.timer=0;
  // Rebuild a saved scheduler deadline through JSON, as real save restoration does.
  const next=await fixture(JSON.parse(JSON.stringify(state)));next.window.nativeSolAsteroids.placements.push({slotId:991,x:0,y:0,size:50,oreLabel:'ore'});next.state.civilianTraffic.ships[0].nextActionAt=0;
  next.step(.1);next.until(()=>next.ship.task?.minedAt!==undefined);
  assert.equal(next.ship.task.minedTons,4);assert.equal(next.ship.cargo.tons,4);assert.equal(next.state.asteroidOreDrops[991],0);assert.equal(next.state.minedAsteroids.filter(id=>id===991).length,1);
  assert.equal(next.window.nativeAsteroidCombat.completeMining(next.state,991).ok,false);
});
test('large advances use a bounded scheduler and map reads never prepare artwork or steer all ships',async()=>{
  const {window,state,lives,step}=await fixture();let prepared=0;window.nativeShipEffects={...window.nativeShipEffects,prepare:()=>prepared++};
  const ship=state.civilianTraffic.ships[0];for(let id=3;id<203;id++)state.civilianTraffic.ships.push({...JSON.parse(JSON.stringify(ship)),id,system:4,x:id*20,lifeVersion:undefined,task:undefined,nextActionAt:0,timer:0});
  lives.initialize(state).config.eventBudget=16;state.system=47;step(1e7);
  assert.ok(lives.metrics(state).scheduledEvents<=16);assert.ok(lives.metrics(state).backlog>0);assert.equal(lives.metrics(state).detailedShips,0);
  for(let i=0;i<10;i++)lives.descriptors(state);assert.equal(prepared,0);
});
test('pause and inventory stop tasks and recharge without a second civilian clock',async()=>{
  const {window,state,ship,start,step}=await fixture();start();window.nativeShipInventory.active=true;const before=JSON.stringify(ship.task),clock=window.nativeSimulation.seconds(state);step(100);
  assert.equal(window.nativeSimulation.seconds(state),clock);assert.equal(JSON.stringify(ship.task),before);window.nativeShipInventory.active=false;step(4);assert.ok(ship.cargo);
});
test('legacy empty interstellar travel preserves progress, arrives and completes a reposition task',async()=>{
  const first=await fixture(),saved=JSON.parse(JSON.stringify(first.state)),ship=saved.civilianTraffic.ships[0];
  for(const field of ['lifeVersion','task','journey','localLeg','nextActionAt'])delete ship[field];
  Object.assign(ship,{phase:'warp',destinationSystem:2,timer:4,warpDuration:12,cargo:null});
  const restored=await fixture(saved);assert.equal(restored.ship.task.kind,'reposition');assert.ok(restored.ship.journey);assert.equal(restored.ship.journey.arrivalAt,4);
  restored.until(()=>restored.ship.task.status==='completed');assert.equal(restored.ship.system,2);assert.equal(restored.ship.cargo,null);assert.equal(restored.ship.deliveries,0);
});
test('real Sol player purchases cannot spend stock reserved for a saved civilian delivery',async()=>{
  const {window,state,ship,lives,start,until}=await fixture();state.devMode=true;state.solFreightHold={};
  const source=lives.market(state,1,3);source.stock[5]=14;assert.ok(start().ok);
  assert.equal(state.solEconomy.stockReserved[3],source.reserved);
  assert.ok(window.nativeSolEconomy.buySell(state,3,5,true,10).ok);assert.equal(source.stock[5],4);
  assert.equal(window.nativeSolEconomy.buySell(state,3,5,true,10).ok,false);
  until(()=>ship.cargo);assert.equal(ship.cargo.tons,4);assert.equal(source.stock[5],0);assert.equal(source.reserved[5],0);
});
test('mining transport retains its saved duration and pauses midway without duplicating ore',async()=>{
  const one=await fixture();one.ship.role='mining';one.ship.nextActionAt=0;one.ship.timer=0;
  const saved=JSON.parse(JSON.stringify(one.state)),two=await fixture(saved),rock={slotId:992,x:0,y:0,size:50,oreLabel:'ore'};
  two.window.nativeSolAsteroids.placements.push(rock);two.step(.1);two.until(()=>two.ship.task.phase==='collecting');
  assert.equal(two.ship.cargo,null);assert.equal(two.state.asteroidOreDrops[992],15);
  const cutAt=two.ship.task.cutAt;assert.equal(two.ship.nextActionAt-cutAt,two.window.nativeAsteroidCombat.miningTiming.transportSeconds);
  two.step(1);two.window.nativePause.active=true;two.step(100);assert.equal(two.ship.cargo,null);two.window.nativePause.active=false;
  const resumed=await fixture(JSON.parse(JSON.stringify(two.state)));resumed.window.nativeSolAsteroids.placements.push(rock);
  assert.equal(resumed.ship.task.phase,'collecting');assert.equal(resumed.ship.task.cutAt,cutAt);resumed.until(()=>resumed.ship.task.minedAt!==undefined);
  assert.equal(resumed.ship.cargo.tons,4);assert.equal(resumed.state.asteroidOreDrops[992],0);assert.equal(resumed.state.minedAsteroids.filter(id=>id===992).length,1);
});
test('first local render after a distant leg uses the current shared pose without changing saved life',async()=>{
  const {window,state,ship,lives,start,until,step}=await fixture();start();until(()=>ship.journey);state.system=47;step(ship.journey.duration+.5);until(()=>ship.localLeg);
  step(.73);state.system=ship.system;const expected=lives.pose(state,ship),before=JSON.stringify(ship);let painted=null;
  window.nativeShipEffects={...window.nativeShipEffects,paintShip(_ctx,descriptor){painted=descriptor;}};
  window.nativeCivilianTraffic.paint({},{state,ship:{x:expected.x,y:expected.y},cx:640,cy:425,w:1280,h:850,zoom:1});
  assert.ok(painted);assert.equal(painted.x,expected.x);assert.equal(painted.y,expected.y);assert.equal(painted.heading,expected.heading);assert.equal(JSON.stringify(ship),before);
});
test('shield-only service is paid, partial service respects money, and an insolvent ship idles',async()=>{
  const setup=async credits=>{const one=await fixture();Object.assign(one.ship,{shields:0,credits,timer:0,nextActionAt:0});return fixture(JSON.parse(JSON.stringify(one.state)));};
  const one=await setup(1000),treasury=one.lives.market(one.state,1,3).credits;one.step(.1);
  assert.equal(one.ship.task.kind,'repair');const cost=one.ship.task.requirements.cost;assert.ok(cost>0);assert.equal(one.ship.credits,1000-cost);assert.equal(one.lives.market(one.state,1,3).credits,treasury+cost);
  one.until(()=>one.ship.task.status==='completed');assert.equal(one.ship.shields,one.window.nativeShipDefinitions.get(one.ship.shipType,'civilian').shields);
  const partial=await setup(1);partial.step(.1);assert.equal(partial.ship.task.requirements.cost,1);partial.until(()=>partial.ship.task.status==='completed');assert.ok(partial.ship.shields>0&&partial.ship.shields<100);assert.equal(partial.ship.credits,0);
  const idle=await setup(0);idle.step(.1);assert.equal(idle.ship.task.kind,'idle');assert.equal(idle.ship.shields,0);assert.equal(idle.ship.credits,0);
});

test('legacy loaded warp migration preserves the remaining journey and never departs a second time',async()=>{
  const initial=await fixture(),saved=JSON.parse(JSON.stringify(initial.state)),ship=saved.civilianTraffic.ships[0];
  Object.assign(ship,{phase:'warp',system:1,destinationSystem:2,timer:2,warpDuration:10,credits:123,cargo:{good:5,tons:4,fromSystem:1,fromPort:3,toSystem:2,toPort:0}});
  for(const field of ['lifeVersion','task','journey','localLeg','nextActionAt'])delete ship[field];
  saved.shipSimulation.seconds=90;
  const restored=await fixture(saved),taskId=restored.ship.task.id,arrivalAt=restored.ship.journey.arrivalAt;
  assert.equal(restored.ship.task.phase,'transit');assert.equal(arrivalAt,92);
  const source=restored.lives.market(restored.state,1,3),stock=source.stock[5];
  restored.step(1);assert.equal(restored.ship.journey.arrivalAt,arrivalAt);assert.equal(restored.ship.cargo.tons,4);
  restored.step(1);assert.equal(restored.ship.system,2);assert.equal(restored.ship.journey,null);assert.equal(restored.ship.task.phase,'approaching');
  assert.equal(restored.ship.task.id,taskId);assert.equal(restored.ship.credits,123);assert.equal(source.stock[5],stock);
  assert.equal(restored.ship.recentEvents.filter(event=>event.kind==='departure').length,0);
  restored.until(()=>restored.ship.task.status==='completed');assert.equal(restored.ship.deliveries,1);assert.equal(restored.ship.cargo,null);
});
