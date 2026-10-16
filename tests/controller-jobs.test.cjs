const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../html-games/broken-mirror-port');

async function fleet(){
  const document={hidden:false},random=Object.create(Math);random.random=()=>.99;
  const window={nativePause:{active:false},nativeShipInventory:{active:false},
    vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:30,height:60}),loadShip:async()=>({art:{},profile:{},width:30,height:60})},
    vexedSolFlight:{shipPosition:state=>({x:state.x,y:state.y}),bodySize:()=>128},
    nativeSolAsteroids:{placements:[],image:()=>({complete:false})},starterShips:new Map(),
    showcaseWeaponAppearance:{units:.91976},showcaseShieldRadii:(w,h)=>({rx:w*.6,ry:h*.6}),createShowcaseWeaponVisual:input=>({...input}),
    showcaseHullBurst:{burst(){},update(){}},nativeSystemHub:{sol:[]}};
  const context=vm.createContext({window,document,Math:random,console,performance:{now:()=>999999},
    fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'../flashtrek-broken-mirror/showcase-assets',url.split('/').pop().split('?')[0]),'utf8'))})});
  for(const file of ['world-data.js','weapon-catalog.js','simulation-clock.js','ship-motion.js','ship-definitions.js','ship-damage.js','ship-effects.js','weapon-loadout.js','weapon-rules.js','combat-shots.js','ship-systems.js','rebirth-warp.js','faction-standing.js','sol-economy.js','civilian-combat-ai.js','civilian-traffic.js','asteroid-combat.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  await window.nativeCombatShots.ready;
  const state={system:1,shipType:7,x:100000,y:100000,angle:0,speed:0,hull:100,shields:100,weapons:[1],localPrestige:{},minedAsteroids:[],destroyedAsteroids:[]};
  window.nativeSimulation.ensure(state);window.nativeSolEconomy.initialize(state);window.nativeCivilianTraffic.initialize(state);
  const step=(dt=1/30,{economy=true,civilians=true}={})=>{
    window.nativeSimulation.advance(state,dt);
    if(economy)window.nativeSolEconomy.advance(state,dt);
    if(civilians)window.nativeCivilianTraffic.advance(state,dt);
    window.nativeCombatShots.advance(state,dt);window.nativeAsteroidCombat.advance(state,dt);window.nativeShipEffects.advance(state,dt);
  };
  return {window,state,step};
}

test('ordinary freight traffic completes deliveries using shared path following',async()=>{
  const {window,state,step}=await fleet();
  const original=JSON.stringify(state.solEconomy.ports);
  for(let i=0;i<7200;i++)step(1/30,{civilians:false});
  assert.notEqual(JSON.stringify(state.solEconomy.ports),original);
  assert.ok(state.solEconomy.log.some(message=>message.includes('received')),state.solEconomy.log.join('\n'));
  for(const tug of state.solEconomy.freighters){assert.ok(Number.isFinite(tug.x)&&Number.isFinite(tug.y));assert.ok(tug.speed<=window.nativeShipMotion.profiles.tug().maxSpeed+.001);}
});

test('civilian mining completes and transfers ore in simulation without painting',async()=>{
  const {window,state,step}=await fleet();
  const rock={slotId:90001,demo:true,x:0,y:0,size:50,name:'Test ore',region:'Local Field',oreLabel:'deuranium'};
  window.nativeSolAsteroids.placements.push(rock);state.devMode=true;
  assert.ok(window.nativeCivilianTraffic.startMiningDemo(state,{force:true,theft:false}));state.devMode=false;
  const miner=state.civilianTraffic.ships.find(ship=>ship.id===0);
  for(let i=0;i<365;i++)step(1/30,{economy:false});
  assert.ok(state.minedAsteroids.includes(rock.slotId));
  assert.equal(miner.oreHold,4);assert.equal(state.asteroidOreDrops[rock.slotId],0);
  assert.ok(state.civilianTraffic.log.some(message=>message.includes('transported')));
});

test('civilian trading and delivery decisions keep their business consequences',async()=>{
  const {state,step}=await fleet();
  const [seller,buyer]=state.civilianTraffic.ships;
  Object.assign(seller,{system:1,port:3,phase:'docked',x:0,y:0,timer:100,cargo:{good:0,tons:12,toSystem:1,toPort:5}});
  Object.assign(buyer,{system:1,port:3,phase:'docked',x:30,y:0,timer:100,cargo:null,credits:1000});
  state.civilianTraffic.ships=[seller,buyer];
  state.shipSimulation.seconds=40;state.civilianTraffic.clock=40;
  const sellerCredits=seller.credits,buyerCredits=buyer.credits;
  for(let i=0;i<35;i++)step(1/30,{economy:false});
  assert.equal(buyer.cargo.tons,8);assert.equal(seller.cargo.tons,4);
  assert.equal(seller.credits,sellerCredits+120);assert.equal(buyer.credits,buyerCredits-120);
  assert.equal(seller.deals,1);assert.equal(buyer.deals,1);
});

test('player mining pauses and restores its saved operation without a render callback',async()=>{
  const {window,state,step}=await fleet();
  const rock={slotId:90002,x:state.x+50,y:state.y,size:50,name:'Test ore',region:'Local Field'};
  window.nativeSolAsteroids.placements.push(rock);state.miningTool=true;
  window.nativeAsteroidCombat.select(rock);
  assert.ok(window.nativeAsteroidCombat.mine(state,{x:state.x,y:state.y}).ok);
  const saved=JSON.parse(JSON.stringify(state));
  window.nativeAsteroidCombat.clear();window.nativePause.active=true;
  for(let i=0;i<250;i++)step(1/30,{economy:false,civilians:false});
  assert.equal(state.minedAsteroids.length,0);
  window.nativePause.active=false;
  for(let i=0;i<220;i++){
    window.nativeSimulation.advance(saved,1/30);window.nativeAsteroidCombat.advance(saved,1/30);
  }
  assert.deepEqual([...saved.minedAsteroids],[rock.slotId]);assert.equal(saved.asteroidOreDrops[rock.slotId],15);
  assert.equal(saved.miningOperation.finished,true);
});

test('legacy civilian deadlines preserve remaining time when player and NPC clocks differ',async()=>{
  const {window,state}=await fleet();
  state.shipSimulation={version:1,seconds:80,legacyClocks:{player:80,civilian:20}};
  const traffic=state.civilianTraffic,ship=traffic.ships[0];
  delete traffic.timingVersion;traffic.clock=20;
  Object.assign(ship,{miningStartedAt:18,retaliationUntil:35,disputeCooldownUntil:40});
  ship.combatAI={until:22,nextEvade:24,lastHitAt:19};
  traffic.encounters={1:{next:25}};traffic.meetings={'0:1':15};
  window.nativeCivilianTraffic.initialize(state);
  assert.equal(ship.retaliationUntil,95);assert.equal(ship.miningStartedAt,78);
  assert.equal(ship.combatAI.nextEvade,84);assert.equal(traffic.encounters[1].next,85);
  assert.equal(traffic.meetings['0:1'],75);
  const migrated=JSON.stringify(traffic);window.nativeCivilianTraffic.initialize(state);
  assert.equal(JSON.stringify(traffic),migrated,'clock migration is idempotent');
});

test('a restored NPC shot updates its saved combat report without runtime callbacks',async()=>{
  const {window,state}=await fleet(),source=state.civilianTraffic.ships[0];
  Object.assign(source,{x:state.x,y:state.y+100,heading:0,speed:0});
  state.civilianTraffic.ships=[source];state.solEconomy.freighters=[];
  const record={id:'saved-report',hits:0,misses:0};state.civilianTraffic.retaliations=[record];
  const rock={slotId:90003,x:source.x+150,y:source.y,size:30,maxHull:1};window.nativeSolAsteroids.placements.push(rock);
  const beam=window.VexedMirrorWeapons.find(weapon=>weapon.damage>0&&window.nativeCombatShots.weaponVisual(weapon).kind==='beam');
  window.nativeWeaponLoadout.refit(state,[beam.id],{holder:source});
  const result=window.nativeCombatShots.fireFor({state,shooter:window.nativeShipDefinitions.describe(state,source,{category:'civilian'}),
    target:window.nativeShipSystems.resolve(state,'rock:'+rock.slotId),owner:record.id});
  assert.ok(result.ok,result.error);
  const restored=JSON.parse(JSON.stringify(state));window.nativeCombatShots.restore(restored);
  window.nativeSimulation.advance(restored,.1);window.nativeCombatShots.advance(restored,.1);
  assert.equal(restored.civilianTraffic.retaliations[0].hits,1);assert.equal(record.hits,0);
  assert.ok(restored.destroyedAsteroids.includes(rock.slotId));
});
