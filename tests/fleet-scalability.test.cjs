const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const {fixture:economyFixture}=require('./npc-economy-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

async function population(count=1000,distantSystem){
 const fixture=await tacticalFixture(),{state,window:w}=fixture,template=state.civilianTraffic.ships[0];
 state.civilianTraffic.ships=Array.from({length:count},(_,index)=>({...template,id:index+1,system:index<2?1:distantSystem??2+(index%48),
  x:index<2?index*200:1e6+index*100,y:0,previousX:index<2?index*200:1e6+index*100,previousY:0,
  lifeVersion:1,dockingVersion:1,nextActionAt:1e9,lifeScheduleToken:1,task:{id:'fixture:'+index,kind:'idle',status:'active',phase:'idle'},recentEvents:[]}));
 w.nativeNpcLives.initialize(state);return fixture;
}

test('local queries and direct inspection reuse existing membership at 1000 and 5000 records',async()=>{
 for(const count of [1000,5000])for(const distantSystem of [undefined,1]){
  const {state,window:w}=await population(count,distantSystem),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
  const members=w.nativeNpcLives.members(state,1);assert.equal(members.length,distantSystem===1?count:2);
  assert.equal(w.nativeNpcLives.members(state,1),members,'unchanged membership is reused');
  frames.begin(state);frames.step(state);systems.query(state,{minX:-100,minY:-100,maxX:400,maxY:100});
  const before=frames.snapshot(state).counters;
  for(let index=0;index<20;index++){
   frames.step(state);w.nativeSimulation.advance(state,1/60);
   const scene=systems.query(state,{minX:-100,minY:-100,maxX:400,maxY:100});
   assert.equal(scene.bystanders.filter(ship=>ship.category==='civilian').length,2);
   assert.equal(systems.resolve(state,2).entity,members[1]);
   assert.equal(systems.inspect(state,2).id,2);
  }
  const after=frames.snapshot(state).counters;
  assert.ok(after.spatialShipGridCells>before.spatialShipGridCells,'small local windows retain grid lookup at 1000/5000 records');
  assert.equal(after.shipSpatialBuilds,before.shipSpatialBuilds,'a physics step does not rebuild the ship grid');
  assert.equal(after.shipDescriptorBuilds,before.shipDescriptorBuilds,'unchanged local ships do not rebuild descriptions');
  assert.ok((after.shipPoseChecks||0)-(before.shipPoseChecks||0)<=100,'steady work follows three local actors, not galaxy population');
  frames.end(state);
 }
});

test('direct NPC inspection exposes its own current system after the observer leaves and the ship changes systems',async()=>{
 const {state,window:w}=await population(1000),lives=w.nativeNpcLives,ship=lives.find(state,2);
 state.system=4;ship.system=2;lives.refreshLocation(state,ship);const before=JSON.stringify(ship);
 const inspected=w.nativeShipSystems.inspect(state,ship.id);
 assert.equal(inspected.system,2);assert.equal(inspected.location.system,2);
 assert.notEqual(inspected.system,state.system,'local visit must not fall back to the observer system');
 assert.equal(JSON.stringify(ship),before,'inspection remains a pure read of the existing life');
});

test('scheduled far hulls enter bounded queries at current and previous authoritative poses without fleet sampling',async()=>{
 const {state,window:w}=await population(5000,1),ship=w.nativeNpcLives.find(state,2),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 Object.assign(ship,{x:-2000,y:0,previousX:-2000,previousY:0,speed:0});
 ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:2000,y:0},{maxSpeed:100,acceleration:100,braking:100,turnRate:1},0);
 ship.nextActionAt=ship.localLeg.duration;w.nativeNpcLives.refreshLocation(state,ship);
 frames.begin(state);frames.step(state);systems.query(state,{minX:-10,minY:-10,maxX:10,maxY:10});
 const builds=frames.snapshot(state).counters.shipSpatialBuilds;
 w.nativeSimulation.advance(state,ship.localLeg.duration/2);frames.step(state);
 const crossing=systems.query(state,{minX:-5,minY:-5,maxX:5,maxY:5}).bystanders.find(t=>t.entity===ship);
 assert.ok(crossing);assert.ok(Math.abs(crossing.x)<1e-6);assert.ok(crossing.previousX<crossing.x);
 assert.equal(ship.x,-2000,'read-model sampling cannot rewrite a distant saved job');
 assert.equal(frames.snapshot(state).counters.shipSpatialBuilds,builds);frames.end(state);
});

test('one indexed system arrival updates shared membership without reconstructing unchanged fleets',async()=>{
 const {state,window:w}=await population(5000,1),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame,ship=w.nativeNpcLives.find(state,2);
 frames.begin(state);frames.step(state);
 systems.query(state,{system:1,minX:-100,minY:-100,maxX:400,maxY:100});
 systems.query(state,{system:4,minX:-100,minY:-100,maxX:400,maxY:100});
 const builds=frames.snapshot(state).counters.shipSpatialBuilds;
 ship.system=4;w.nativeNpcLives.refreshLocation(state,ship);
 assert.equal(systems.query(state,{system:1,minX:-100,minY:-100,maxX:400,maxY:100}).bystanders.some(t=>t.entity===ship),false);
 assert.ok(systems.query(state,{system:4,minX:-100,minY:-100,maxX:400,maxY:100}).bystanders.some(t=>t.entity===ship));
 assert.equal(frames.snapshot(state).counters.shipSpatialBuilds,builds);frames.end(state);
});

test('a stopped or removed fast actor cannot leave forecast queries permanently enlarged',async()=>{
 const {state,window:w}=await population(1000,1),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame,ship=w.nativeNpcLives.find(state,1000);
 ship.vx=1e6;frames.begin(state);frames.step(state);
 systems.query(state,{minX:-10,minY:-10,maxX:10,maxY:10,predictSeconds:6});
 const first=frames.snapshot(state).counters.spatialShipCandidates;
 ship.vx=0;systems.refreshShip(state,ship,'civilian',1);
 systems.query(state,{minX:-10,minY:-10,maxX:10,maxY:10,predictSeconds:6});
 const second=frames.snapshot(state).counters.spatialShipCandidates-first;
 assert.ok(first>900);assert.ok(second<10,'persistent motion summaries shrink after an actual velocity change');frames.end(state);
});

test('same-clock nested equipment and technology mutations refresh effective hardware without replacing owned deadlines',async()=>{
 const {state,window:w,context}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/regional-minerals.js'),'utf8'),context);
 state.shipType=10;w.nativeShipEquipment.ensure(state);const eq=state.shipEquipment;
 const weapon=eq.instances[eq.slots.weapon.find(Boolean)];if(weapon)weapon.readyAt=123;
 const engine=eq.instances[eq.slots.engineering[0]],engineId=engine.id,shieldId=eq.slots.shield[0];
 frames.begin(state);frames.step(state);systems.query(state,{minX:-100,minY:-100,maxX:100,maxY:100});
 const initial=systems.resolve(state,'player');engine.upgrades.tugEngineLevel=2;
 systems.refreshShip(state,state,'player');const upgraded=systems.resolve(state,'player');
 assert.ok(upgraded.definition.movement.maxSpeed>initial.definition.movement.maxSpeed);
 assert.equal(initial.definition.speedOrOtherStationValue,w.nativeShipDefinitions.get(10).speedOrOtherStationValue,'the retained description keeps its previous stats');
 state.mineralUpgrades={10:{hull:1,shield:2,engine:1,weapons:2,drive:1}};systems.refreshShip(state,state,'player');
 const mineral=systems.resolve(state,'player');assert.ok(mineral.definition.hull>upgraded.definition.hull);assert.equal(mineral.definition.weaponDamageMultiplier,1.16);
 assert.equal(w.nativeShipEquipment.move(state,{category:'shield',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length}).ok,true);
 assert.equal(systems.resolve(state,'player').definition.shields,0);
 assert.equal(w.nativeShipEquipment.move(state,{category:'shield',fromType:'locker',fromIndex:eq.locker.indexOf(shieldId),toType:'slot',toIndex:0}).ok,true);
 assert.ok(systems.resolve(state,'player').definition.shields>0);assert.equal(eq.slots.engineering[0],engineId);assert.equal(eq.slots.shield[0],shieldId);
 if(weapon)assert.equal(weapon.readyAt,123);frames.end(state);
});

test('flight transit queries use indexed galaxy bounds and retain current crossing poses through reload',async()=>{
 const {state,window:w}=await population(5000),lives=w.nativeNpcLives,frames=w.nativeSimulationFrame;
 for(const ship of state.civilianTraffic.ships){const x=1e6+ship.id*1000;ship.phase='warp';ship.journey={version:1,origin:ship.system,destination:4,departedAt:0,duration:100,arrivalAt:100,progress:0,
  galaxyFrom:{x,y:1e6},galaxyTo:{x:x+1e5,y:1e6+2000},from:{x:ship.x,y:ship.y},to:{x:0,y:0}};lives.refreshLocation(state,ship);}
 const crossing=lives.find(state,1);crossing.journey={...crossing.journey,galaxyFrom:{x:-10000,y:0},galaxyTo:{x:10000,y:0}};lives.refreshLocation(state,crossing);
 const before=JSON.stringify(crossing.journey),box={minX:-10,minY:-10,maxX:10,maxY:10};frames.begin(state);frames.step(state);
 assert.equal(lives.queryTransits(state,box).length,0);w.nativeSimulation.advance(state,50);frames.step(state);
 assert.deepEqual(Array.from(lives.queryTransits(state,box),ship=>ship.id),[1]);
 assert.equal(JSON.stringify(crossing.journey),before,'visibility must not advance or rewrite a saved journey');
 assert.ok(frames.snapshot(state).counters.transitSpatialCandidates<10,'unrelated galaxy routes do not reach current visual tests');
 const saved=JSON.parse(JSON.stringify(state)),restored=await tacticalFixture({state:saved});
 assert.deepEqual(Array.from(restored.window.nativeNpcLives.queryTransits(saved,box),ship=>ship.id),[1]);
 delete crossing.journey;crossing.phase='docked';lives.refreshLocation(state,crossing);assert.equal(lives.queryTransits(state,box).length,0);frames.end(state);
});

test('legacy departure and arrival visuals retain indexed current visibility outside physical membership',async()=>{
 const {state,window:w}=await population(1000),lives=w.nativeNpcLives,ship=lives.find(state,1),warp=w.vexedRebirthWarp;
 Object.assign(ship,{system:1,x:0,y:0,phase:'warp',warpVisual:{kind:'departure',elapsedMs:500,angle:Math.PI/2}});lives.refreshLocation(state,ship);
 const origin=w.nativeManualFlight.anchor(1),effect=warp.worldEffect('departure',500,Math.PI/2,0,0),box={minX:origin.x+effect.shipX-5,minY:origin.y+effect.shipY-5,maxX:origin.x+effect.shipX+5,maxY:origin.y+effect.shipY+5};
 const before=JSON.stringify(ship.warpVisual);assert.equal(w.nativeShipSystems.query(state,{minX:-100,minY:-100,maxX:100,maxY:100}).bystanders.some(t=>t.entity===ship),false);
 assert.deepEqual(Array.from(lives.queryTransits(state,box),entry=>entry.id),[ship.id]);assert.equal(JSON.stringify(ship.warpVisual),before);
 let painted=0;w.nativeShipEffects={...w.nativeShipEffects,paintShip(_,descriptor){assert.equal(descriptor.entity,ship);painted++;}};w.vexedFlightAssets.drawWarpRing=()=>{};
 w.nativeCivilianTraffic.paint({},{state,ship:{x:effect.shipX,y:effect.shipY},cx:50,cy:50,w:100,h:100,zoom:1});assert.equal(painted,1);
 ship.phase='arriving';ship.warpVisual={kind:'arrival',elapsedMs:0,angle:Math.PI/2};lives.refreshLocation(state,ship);
 const arrival=warp.worldEffect('arrival',0,Math.PI/2,0,0),arrivalBox={minX:origin.x+arrival.shipX-5,minY:origin.y+arrival.shipY-5,maxX:origin.x+arrival.shipX+5,maxY:origin.y+arrival.shipY+5};
 assert.deepEqual(Array.from(lives.queryTransits(state,arrivalBox),entry=>entry.id),[ship.id]);
 w.nativeShipDefinitions.register(9912,{dimensions:{width:300,height:800}});assert.equal(lives.queryTransits(state,arrivalBox).includes(ship),true,'definition invalidation cannot cycle the transit index');
 delete ship.warpVisual;ship.phase='docked';lives.refreshLocation(state,ship);assert.equal(lives.queryTransits(state,arrivalBox).includes(ship),false);
});

test('civilian and tug paint share interpolated ship and target-frame coordinates without rebuilding descriptions',async()=>{
 for(const category of ['civilian','tug']){
  const f=category==='civilian'?await tacticalFixture():await economyFixture({full:false,economic:false}),{state,window:w,context}=f,systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/effect-visibility.js'),'utf8'),context);
  const entity=category==='civilian'?w.nativeNpcLives.find(state,1):state.solEconomy.freighters[0];
  Object.assign(entity,{system:1,x:0,y:0,previousX:0,previousY:0,heading:0,speed:0,phase:category==='civilian'?'docked':'waiting'});delete entity.localLeg;delete entity.lifeLeg;
  systems.refreshShip(state,entity,category,1);systems.query(state,{minX:-100,minY:-100,maxX:100,maxY:100});
  frames.begin(state);frames.step(state);frames.schedule(state).pendingSeconds=1/120;entity.x=40;systems.refreshShip(state,entity,category,1);
  const before=frames.snapshot(state).counters.shipDescriptorBuilds;let painted=0,frameX;
  w.nativeShipEffects={...w.nativeShipEffects,paintShip(_,descriptor,view){if(descriptor.entity!==entity)return;painted++;assert.equal(descriptor.x,20);assert.equal(view.x,undefined,'screen coordinates must follow the same interpolated descriptor as beam contacts');}};
  w.nativeAsteroidCombat.drawTargetFrame=(_,target,x)=>{frameX=x;};
  const owner=category==='civilian'?w.nativeCivilianTraffic:w.nativeSolEconomy;owner.select(entity.id);owner.paint({},{state,ship:{x:0,y:0},cx:50,cy:50,w:100,h:100,zoom:1});
  assert.equal(painted,1);assert.equal(frameX,70);assert.equal(entity.x,40);assert.equal(frames.snapshot(state).counters.shipDescriptorBuilds,before);frames.end(state);
 }
});

test('large station overflow bounds and fast intervening hulls remain conservative under rotation and shield collapse',async()=>{
 const {state,window:w}=await tacticalFixture(),systems=w.nativeShipSystems,station={id:'alpha',shipType:9910,system:1,x:2e6,y:2e6,heading:0,hull:1e6,shields:1e6,phase:'stationary'};
 w.nativeShipDefinitions.register(9910,{dimensions:{width:50000,height:50000},physical:{mass:1e6}});
 const describe=()=>({...w.nativeShipDefinitions.describe(state,station,{category:'station'}),id:'station:alpha'});
 systems.register('station',{collect:()=>[describe()],resolve:(_,id)=>id==='station:alpha'?describe():null,hit:()=>({ok:true})});
 const edge={minX:station.x-30000,minY:station.y-10,maxX:station.x-29990,maxY:station.y+10};
 const initial=systems.query(state,edge).bystanders.find(ship=>ship.id==='station:alpha');assert.ok(initial);
 assert.equal(systems.query(state,{minX:-10,minY:-10,maxX:10,maxY:10}).bystanders.some(ship=>ship.id==='station:alpha'),false);
 const fast=state.civilianTraffic.ships[0];Object.assign(fast,{dimensions:{width:10,height:20},previousX:station.x-60000,previousY:station.y,x:station.x+60000,y:station.y,vx:7.2e6});systems.refreshShip(state,fast,'civilian',1);
 const center={minX:station.x-1,minY:station.y-1,maxX:station.x+1,maxY:station.y+1};
 assert.ok(systems.query(state,center).bystanders.some(ship=>ship.entity===fast));
 assert.equal(systems.query(state,{...center,swept:false}).bystanders.some(ship=>ship.entity===fast),false);
 station.heading=Math.PI/3;station.shields=0;systems.refreshShip(state,station,'station',1);
 const current=systems.resolve(state,'station:alpha');assert.equal(current.radii,current.hullRadii);assert.equal(initial.shields,1e6);assert.equal(initial.heading,0);
});

test('fleet array mutations reconcile IDs and system membership without changing the saved representation',async()=>{
 const {state,window:w}=await population(30),lives=w.nativeNpcLives,ships=state.civilianTraffic.ships;
 const original=ships[1],replacement={...original,id:900,system:4};
 ships.splice(1,1,replacement);assert.equal(lives.find(state,2),null);assert.equal(lives.find(state,900),replacement);
 ships.push({...original,id:901,system:1});assert.equal(lives.find(state,901).id,901);
 ships.reverse();assert.equal(lives.find(state,900),replacement);
 ships.splice(ships.indexOf(replacement),1);assert.equal(lives.find(state,900),null);
 assert.ok(Array.isArray(ships));const saved=JSON.parse(JSON.stringify(state));assert.ok(Array.isArray(saved.civilianTraffic.ships));
 const restored=await tacticalFixture({state:saved});assert.equal(restored.window.nativeNpcLives.find(saved,901).id,901);
 assert.equal(restored.window.nativeNpcLives.members(saved,1).length,2);
});

test('explicit invalidation reconciles a retained raw array alias and complete saved-array replacement',async()=>{
 const {state,window:w}=await population(12),lives=w.nativeNpcLives,raw=Array.from(state.civilianTraffic.ships);
 state.civilianTraffic.ships=raw;lives.initialize(state);
 raw[0]={...raw[0],id:700,system:4};w.nativeShipSystems.invalidate(state);
 assert.equal(lives.find(state,1),null);assert.equal(lives.find(state,700),raw[0]);
 state.civilianTraffic.ships=[{...raw[0],id:701,system:1}];
 assert.equal(lives.find(state,700),null);assert.equal(lives.find(state,701).system,1);
});

test('persistent local grid follows movement, shield collapse, system moves and removal without overwriting snapshots',async()=>{
 const {state,window:w}=await population(1000),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame,ship=w.nativeNpcLives.find(state,2);
 frames.begin(state);frames.step(state);const old=systems.query(state,{minX:150,minY:-40,maxX:250,maxY:40}).bystanders.find(t=>t.entity===ship);
 Object.assign(ship,{previousX:ship.x,previousY:ship.y,x:1200,y:0,heading:Math.PI,shields:0,vx:60000});systems.refreshShip(state,ship,'civilian',1);
 const crossing=systems.query(state,{minX:590,minY:-2,maxX:610,maxY:2});assert.ok(crossing.bystanders.some(t=>t.entity===ship));
 assert.equal(old.x,200);assert.equal(old.shields,100);
 assert.equal(systems.resolve(state,2).shields,0);assert.equal(systems.resolve(state,2).x,1200);
 ship.system=4;w.nativeNpcLives.refreshLocation(state,ship);
 assert.equal(systems.resolve(state,2,1),null);assert.equal(systems.resolve(state,2,4).entity,ship);
 ship.phase='destroyed';ship.hull=0;systems.refreshShip(state,ship,'civilian',4);
 assert.equal(systems.query(state,{system:4,minX:0,minY:-100,maxX:2000,maxY:100}).bystanders.some(t=>t.entity===ship),false);
 assert.equal(frames.snapshot(state).counters.asteroidGeometryBuilds,undefined);frames.end(state);
});

test('custom actors leave the same persistent index immediately when stowed',async()=>{
 const {state,window:w}=await population(10),systems=w.nativeShipSystems,entity={id:'owned',system:1,x:700,y:0,heading:0,shipType:47,hull:100,shields:0,phase:'working'};
 const describe=()=>({...w.nativeShipDefinitions.describe(state,entity,{category:'service'}),id:'service:owned'});
 systems.register('service',{collect:()=>entity.phase==='stowed'?[]:[describe()],resolve:(_,id)=>id==='service:owned'&&entity.phase!=='stowed'?describe():null,hit:()=>({ok:true})});
 assert.ok(systems.query(state,{minX:600,minY:-100,maxX:800,maxY:100}).bystanders.some(t=>t.entity===entity));
 entity.phase='stowed';systems.refreshShip(state,entity,'service',1);
 assert.equal(systems.query(state,{minX:600,minY:-100,maxX:800,maxY:100}).bystanders.some(t=>t.entity===entity),false);
 assert.equal(systems.resolve(state,'service:owned'),null);
});

test('legacy registered adapters without a direct resolver keep current physical metadata after shared movement',async()=>{
 const {state,window:w}=await population(20),systems=w.nativeShipSystems,entity={id:'legacy-owned',system:1,x:900,y:0,heading:0,shipType:47,hull:100,shields:0,phase:'working'};
 systems.register('legacy-service',{collect:()=>[{...w.nativeShipDefinitions.describe(state,entity,{category:'legacy-service'}),id:'legacy:owned',ownership:'original-adapter'}],hit:()=>({ok:true})});
 const before=systems.query(state,{minX:800,minY:-100,maxX:1000,maxY:100}).bystanders.find(t=>t.id==='legacy:owned');assert.ok(before);
 systems.move(state,entity,'legacy-service',{heading:0,throttle:1},{maxSpeed:20,acceleration:20,braking:20,turnRate:1},.25);
 const current=systems.query(state,{minX:800,minY:-100,maxX:1000,maxY:100}).bystanders.find(t=>t.id==='legacy:owned');
 assert.ok(current.x>before.x);assert.equal(before.x,900);assert.equal(current.ownership,'original-adapter');assert.equal(current.entity,entity);
});

test('offscreen free movers immediately hit stationary ships and preserve physical contact chains',async()=>{
 for(const count of [3,5000]){
  const f=await economyFixture({full:false,economic:false,traffic:true}),w=f.window,s=f.state,template=JSON.parse(JSON.stringify(s.civilianTraffic.ships[0]));
  Object.assign(s,{system:1,x:10000,y:10000,speed:0,vx:0,vy:0,landed:false});
  const make=(id,x,moving=false)=>{const ship={...template,id,system:1,x,y:0,previousX:x-(moving?40:0),previousY:0,heading:0,speed:moving?100:0,vx:moving?100:0,vy:0,
   hull:1000,shields:1000,phase:'docked',dimensions:{width:30,height:60},lifeVersion:1,dockingVersion:1,nextActionAt:1e9,cargo:{good:5,tons:4},oreHold:0,credits:1200,
   task:{id:'free-contact:'+id,kind:'idle',status:'active',phase:'idle',origin:{system:1,port:3},destination:{system:1,port:3},requirements:{good:5,tons:4}}};for(const key of ['localLeg','lifeLeg','journey','motionKick','motionSpin','dockingMove'])delete ship[key];return ship;};
  const moving=make(1,0,true),stationary=make(2,40),chain=make(3,80);stationary.phase='waiting';
  s.civilianTraffic.ships=[moving,chain,...Array.from({length:count-3},(_,i)=>({...make(10+i,2e6+i*100),y:2e6,previousY:2e6}))];s.solEconomy.freighters=[stationary];w.nativeNpcLives.initialize(s);
  w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);w.nativeShipTraffic.collide(s,.4);
  assert.ok(moving.vx<100);assert.ok(stationary.vx>0,'a stationary offscreen tug physically intercepts the moving civilian immediately');assert.ok(chain.vx>0,'the second hull transmits momentum through the connected collision chain');
  for(const ship of [moving,stationary,chain]){assert.equal(ship.hull,1000);assert.equal(ship.shields,1000);assert.equal(ship.cargo.tons,4);assert.equal(ship.credits,1200);}
  assert.ok((w.nativeSimulationFrame.snapshot(s).counters.shipContactCandidates||0)<30,'contact discovery follows the physical neighborhood');w.nativeSimulationFrame.end(s);
 }
});

test('an offscreen scheduled hull physically strikes an asteroid without camera or artwork activation',async()=>{
 for(const population of [1,5000]){
 const f=await economyFixture({full:false,economic:false,physics:true,traffic:true}),w=f.window,s=f.state,rock=w.nativeSolAsteroids.placements[0];
 const e={...s.civilianTraffic.ships[0],id:800,system:1,x:rock.x-250,y:rock.y,previousX:rock.x-250,previousY:rock.y,heading:0,
  speed:0,vx:0,vy:0,hull:100,shields:100,phase:'cruise',lifeVersion:1,dockingVersion:1,journey:null,
  task:{id:'offscreen-physical',kind:'idle',status:'active',phase:'idle'},cargo:null,oreHold:2,credits:1234,nextActionAt:1e9};
 s.civilianTraffic.ships=[e,...Array.from({length:population-1},(_,index)=>({...e,id:1000+index,phase:'docked',oreHold:0,credits:0,
  x:2e6+index*100,y:2e6,previousX:2e6+index*100,previousY:2e6,localLeg:null,
  task:{id:'far-idle:'+index,kind:'idle',status:'active',phase:'idle'}}))];s.solEconomy.freighters=[];s.x=1e6;s.y=1e6;s.system=1;
 e.localLeg=w.nativeShipMotion.planLeg(e,{x:rock.x+250,y:rock.y},{maxSpeed:100,acceleration:100,braking:100,turnRate:1},w.nativeSimulation.seconds(s));
 w.nativeNpcLives.initialize(s);w.nativeShipSystems.invalidate(s);w.nativeSimulationFrame.begin(s);
 for(let i=0;i<360;i++){
  w.nativeSimulationFrame.step(s);w.nativeSimulation.advance(s,1/60);w.nativeAsteroidMotion.advance(s,1/60);w.nativeAsteroidMotion.collide(s,1/60);
 }
 const contacts=w.nativeAsteroidMotion.snapshot().contacts;
 assert.ok(contacts.some(event=>event.ship===e.id&&event.rockId===rock.slotId),'the far job must hit the actual first rock');
 assert.ok(Math.abs(rock.vx||0)+Math.abs(rock.vy||0)>0,'the physical rock receives momentum');
 assert.equal(e.hull,100);assert.equal(e.oreHold,2);assert.equal(e.credits,1234);
 assert.equal(w.nativeNpcLives.detail(s,e),'distant');w.nativeSimulationFrame.end(s);
 }
});
