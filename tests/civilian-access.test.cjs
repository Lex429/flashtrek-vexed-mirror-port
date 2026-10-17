const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function tick(f,seconds,dt=.25){for(let n=0;n<Math.ceil(seconds/dt);n++)f.step(dt);}
function until(f,predicate,limit=1000){let n=0;while(!predicate()){f.step(.25);assert.ok(++n<limit*4,'Civilian job did not reach its next phase');}}
function money(f){return Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,s)=>n+s.credits,0)+(f.state.latinum||0);}
function assertAccess(f){
 const a=f.window.nativeCivilianAccess;
 for(const ship of f.state.civilianTraffic.ships){
  assert.ok(!a.blocked(ship.system),`${ship.name} entered prohibited system ${ship.system}`);
  assert.ok(a.inhabited(f.state,ship.operatingBase),`${ship.name} has an empty operating base`);
  if(!a.inhabited(f.state,ship.system)){
   assert.equal(ship.task?.kind,'mining',`${ship.name} visited an empty system without mining work`);
   assert.ok(['mining-flight','mining','collecting','transit'].includes(ship.task.phase),ship.task.phase);
   assert.ok(!f.window.nativePortDocking.inspect(f.state,ship,false),'There is no civilian port at an empty system');
  }
  if(ship.journey&&!a.inhabited(f.state,ship.journey.destination)){
   assert.ok(!a.blocked(ship.journey.destination));assert.equal(ship.task.kind,'mining');assert.equal(ship.task.phase,'mining-transit');
  }
 }
}

test('fresh civilian fleet retains its identities and size, but spawns and bases only at permitted inhabited worlds',async()=>{
 const f=await fixture({regional:true,access:true}),a=f.window.nativeCivilianAccess;
 assert.equal(f.state.civilianTraffic.ships.length,159);assert.equal(new Set(f.state.civilianTraffic.ships.map(s=>s.id)).size,159);
 for(const id of [32,33,34,51,52]){assert.ok(a.blocked(id));assert.ok(!f.state.civilianTraffic.ships.some(s=>s.system===id));}
 for(const ship of f.state.civilianTraffic.ships){assert.ok(a.inhabited(f.state,ship.system));assert.ok(a.inhabited(f.state,ship.stationSystem));}
 assertAccess(f);
 assert.deepEqual(copy(f.lives.initialize(f.state).config.connectedSystems),copy(a.markets(f.state)));
 for(const m of Object.values(f.lives.initialize(f.state).markets))assert.ok(a.inhabited(f.state,m.system),'No fabricated empty-system economy');
});

test('old prohibited residents and unsafe contracts are migrated once, preserving cargo, credits, ore and fleet identities',async()=>{
 const old=await fixture({regional:true}),ship=old.state.civilianTraffic.ships.find(s=>s.system===52&&!s.cargo);
 const result=old.lives.startDelivery(old.state,ship.id,{fromSystem:52,toSystem:34,good:5,tons:3});assert.ok(result.ok);
 const cargoShip=old.state.civilianTraffic.ships.find(s=>s.system===32);cargoShip.cargo={good:1,tons:4,owner:cargoShip.id,fromSystem:1,fromPort:3,toSystem:52,toPort:0};cargoShip.credits=4321;
 old.state.minedAsteroids=[0,52,1000000];const before=copy(old.state),balances=before.civilianTraffic.ships.map(s=>({id:s.id,credits:s.credits,cargo:s.cargo,hull:s.hull,shields:s.shields}));
 const f=await fixture({regional:true,access:true,saved:before});assertAccess(f);
 assert.deepEqual(copy(f.state.civilianTraffic.ships.map(s=>({id:s.id,credits:s.credits,cargo:s.cargo,hull:s.hull,shields:s.shields}))),balances);
 assert.deepEqual(copy(f.state.minedAsteroids),[0,52,1000000]);assert.equal(money(f),money(old));
 assert.ok(!f.lives.initialize(f.state).reservations[result.taskId]);
 for(const m of Object.values(f.lives.initialize(f.state).markets)){assert.ok(m.fundsReserved<=m.credits);assert.ok(m.incoming.every(n=>n>=0));}
 const snapshot=copy(f.state),restored=await fixture({regional:true,access:true,saved:snapshot});assertAccess(restored);
 assert.equal(money(restored),money(f));assert.deepEqual(copy(restored.state.civilianTraffic.ships.map(s=>[s.id,s.system,s.credits,s.cargo])),copy(f.state.civilianTraffic.ships.map(s=>[s.id,s.system,s.credits,s.cargo])));
});

test('civilian delivery APIs refuse all prohibited and uninhabited markets before reserving stock or money',async()=>{
 const f=await fixture({regional:true,access:true,full:false,economic:false});
 for(const id of [5,10,17,24,26,32,33,34,39,51,52]){
  const before=JSON.stringify(f.state),result=f.lives.startDelivery(f.state,f.ship.id,{toSystem:id,good:5,tons:1});
  assert.equal(result.ok,false);assert.equal(JSON.stringify(f.state),before);
 }
 f.state.planetPopulations={34:999,52:999};assert.ok(f.window.nativeCivilianAccess.blocked(34));assert.ok(f.window.nativeCivilianAccess.blocked(52));
});

test('immediate policy relocations use shared hull clearance even when more crews move than a normal frame docking budget',async()=>{
 const f=await fixture({regional:true,access:true}),moved=f.state.civilianTraffic.ships.slice(0,25);
 for(const ship of moved){f.lives.interrupt(f.state,ship,'migration clearance fixture');Object.assign(ship,{system:51,stationSystem:51,operatingBase:51});f.lives.refreshLocation(f.state,ship);}
 f.state.planetPopulationCounts={2:0};f.window.nativeSimulationFrame.begin(f.state);f.step(.25);assertAccess(f);
 const records=moved.map(ship=>f.window.nativePortDocking.inspect(f.state,ship,false));assert.ok(records.every(Boolean));
 for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++)if(records[i].system===records[j].system){const a=records[i],b=records[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+40-1e-6);}
 assert.ok((f.window.nativeSimulationFrame.snapshot(f.state).counters.dockAllocations||0)<=16);f.window.nativeSimulationFrame.end(f.state);
});

test('mining-only expeditions reserve a real asteroid, pause/reload in transit, collect once and deliver to an inhabited buyer',async()=>{
 let f=await fixture({regional:true,access:true,full:false,economic:false});
 Object.assign(f.ship,{role:'mining',operatingBase:1,miningTrips:1});f.lives.resumeWork(f.state,f.ship,'mining expedition fixture');
 until(f,()=>f.ship.task?.phase==='mining-transit');const mineSystem=f.ship.journey.destination,rockId=f.ship.task.requirements.rockId;
 assert.ok(!f.window.nativeCivilianAccess.inhabited(f.state,mineSystem));assert.ok(!f.window.nativeCivilianAccess.blocked(mineSystem));
 assert.ok(f.window.nativeCivilianAccess.inhabited(f.state,f.ship.task.destination.system));
 const initialMoney=money(f),initialMined=f.ship.mined||0;tick(f,2);const saved=copy(f.state);
 f=await fixture({regional:true,access:true,economic:false,saved});const deadline=f.ship.journey.arrivalAt;
 f.window.nativePause.active=true;tick(f,10);assert.equal(f.ship.journey.arrivalAt,deadline);assert.equal(f.window.nativeSimulation.seconds(f.state),saved.shipSimulation.seconds);f.window.nativePause.active=false;
 until(f,()=>f.ship.task.phase==='collecting');assert.equal(f.ship.system,mineSystem);assertAccess(f);assert.equal(f.state.asteroidOreDrops[rockId],15);
 until(f,()=>f.ship.task.phase==='transit');assert.equal(f.ship.cargo.tons,4);assert.equal(f.ship.cargo.toSystem,f.ship.task.destination.system);assert.equal(f.state.asteroidOreDrops[rockId],0);
 f=await fixture({regional:true,access:true,economic:false,saved:copy(f.state)});assertAccess(f);
 until(f,()=>f.ship.deliveries>0);assert.ok(f.window.nativeCivilianAccess.inhabited(f.state,f.ship.system));assert.equal(f.ship.mined,initialMined+4);assert.equal(f.state.minedAsteroids.filter(id=>id===rockId).length,1);assert.equal(f.ship.cargo,null);assert.equal(money(f),initialMoney);
 assert.ok(!Object.values(f.lives.initialize(f.state).markets).some(m=>m.system===mineSystem));assert.equal(f.window.nativeSolAsteroids.metrics().images,0);
});

test('civilian access follows actual population changes and exhausted mining trips return instead of idling at empty worlds',async()=>{
 const f=await fixture({regional:true,access:true,full:false,economic:false});Object.assign(f.ship,{role:'mining',miningTrips:1});f.lives.resumeWork(f.state,f.ship);
 until(f,()=>f.ship.task?.phase==='mining-transit');const rockId=f.ship.task.requirements.rockId;f.window.nativeAsteroidCombat.completeMining(f.state,rockId);
 until(f,()=>f.ship.task?.requirements?.returning);assert.ok(f.ship.journey);assertAccess(f);
 until(f,()=>f.window.nativeCivilianAccess.inhabited(f.state,f.ship.system)&&!f.ship.journey);
 const previous=f.ship.system;f.state.planetPopulationCounts={[previous]:0};f.step(.25);assert.notEqual(f.ship.system,previous);assertAccess(f);
});

test('an old mining label cannot keep a saved civilian at an empty system without an owned intact claim',async()=>{
 let f=await fixture({regional:true,access:true,full:false,economic:false});Object.assign(f.ship,{role:'mining',miningTrips:1});f.lives.resumeWork(f.state,f.ship);
 until(f,()=>f.ship.task?.phase==='mining');const id=f.ship.task.requirements.rockId;
 assert.ok(!f.window.nativeCivilianAccess.inhabited(f.state,f.ship.system));
 f.state.destroyedAsteroids=[...(f.state.destroyedAsteroids||[]),id];
 const before=copy(f.state),balance=f.ship.credits;f=await fixture({regional:true,access:true,economic:false,saved:before});
 assert.ok(f.window.nativeCivilianAccess.inhabited(f.state,f.ship.system));assert.equal(f.ship.credits,balance);assert.ok(f.state.destroyedAsteroids.includes(id));assert.ok(!f.state.minedAsteroids?.includes(id));assertAccess(f);
});

test('thirty minutes of civilian work never uses excluded systems or empty-system commerce and preserves the fleet and money ledger',async()=>{
 const f=await fixture({regional:true,access:true}),initial=money(f),start=copy(f.lives.initialize(f.state).economicLedger);
 for(let i=0;i<7200;i++){f.step(.25);if(i%4===0)assertAccess(f);}
 const l=f.lives.initialize(f.state).economicLedger;assertAccess(f);assert.equal(f.state.civilianTraffic.ships.length,159);
 assert.equal(money(f),initial+l.initialMarketCredits-start.initialMarketCredits+l.householdSpending-start.householdSpending);
 assert.ok(f.state.civilianTraffic.ships.some(s=>(s.miningTrips||0)>1));assert.ok(f.state.civilianTraffic.ships.reduce((n,s)=>n+(s.deliveries||0),0)>300);
 assert.equal(f.lives.metrics(f.state).backlog,0);assert.equal(f.window.nativeSolAsteroids.metrics().images,0);
 for(const m of Object.values(f.lives.initialize(f.state).markets))assert.ok(f.window.nativeCivilianAccess.inhabited(f.state,m.system));
});
