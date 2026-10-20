const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');

function field(w,count=300){
 const rocks=Array.from({length:count},(_,slotId)=>({slotId,system:1,x:slotId*100+10000,y:500,size:40,angle:.2,maxHull:20}));
 w.nativeSolAsteroids={...w.nativeSolAsteroids,placements:rocks,forSystem:()=>rocks,find:id=>rocks.find(r=>r.slotId===id),
  queryBounds(system,b,{swept=true,predictSeconds=0}={}){return rocks.filter(r=>{const radius=r.size*.5,x=swept?r.previousX??r.x:r.x,y=swept?r.previousY??r.y:r.y;
   return Math.min(x,r.x,r.x+(r.vx||0)*predictSeconds)-radius<=b.maxX&&Math.max(x,r.x,r.x+(r.vx||0)*predictSeconds)+radius>=b.minX&&Math.min(y,r.y,r.y+(r.vy||0)*predictSeconds)-radius<=b.maxY&&Math.max(y,r.y,r.y+(r.vy||0)*predictSeconds)+radius>=b.minY;});}};
 return rocks;
}

test('moving combatants refresh only their poses and retain unchanged asteroid geometry across steps',async()=>{
 const {window:w,state,ships}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame,rocks=field(w);
 frames.begin(state);frames.step(state);
 const initial=systems.scene(state),oldShip=initial.bystanders.find(s=>s.entity===ships[0]),oldRock=initial.rocks[0];
 for(let i=0;i<30;i++){
  systems.move(state,ships[0],'civilian',{heading:i/20,throttle:1},{maxSpeed:20,acceleration:20,braking:20,turnRate:2},1/60);
  systems.refreshShip(state,ships[1],'civilian');
  assert.equal(systems.scene(state),initial);
 }
 let counters=frames.snapshot(state).counters;
 assert.equal(counters.sceneCollections,1);assert.equal(counters.asteroidGeometryBuilds,rocks.length);
 assert.equal(initial.rocks[0],oldRock);assert.notEqual(systems.resolve(state,ships[0].id).x,oldShip.x);
 assert.equal(oldShip.x,1000000,'retained descriptor snapshots are not overwritten');
 frames.step(state);const next=systems.scene(state);
 assert.equal(next.rocks[0],oldRock);assert.equal(frames.snapshot(state).counters.asteroidGeometryBuilds,rocks.length);
 rocks[0].previousX=rocks[0].x;rocks[0].x+=500;rocks[0].angle+=1;
 systems.refreshAsteroid(state,rocks[0]);const moved=systems.resolve(state,'rock:0');
 assert.equal(moved.x,10500);assert.equal(next.rocks[0],moved);assert.equal(oldRock.x,10000);assert.equal(moved.dimensions,oldRock.dimensions);
 assert.equal(frames.snapshot(state).counters.asteroidGeometryBuilds,rocks.length);assert.equal(frames.snapshot(state).counters.asteroidDescriptors,rocks.length+1);frames.end(state);
});

test('one-actor resolution and local queries do not construct a complete target or asteroid scene',async()=>{
 const {window:w,state,ships}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;field(w,1000);
 ships[0].x=0;ships[0].y=0;
 for(let i=0;i<200;i++)ships.push({...ships[1],id:100+i,x:100000+i*1000,y:100000});
 frames.begin(state);frames.step(state);
 for(let i=0;i<100;i++)assert.equal(systems.resolve(state,ships[0].id).entity,ships[0]);
 assert.equal(frames.snapshot(state).counters.sceneCollections,undefined);assert.equal(frames.snapshot(state).counters.asteroidGeometryBuilds,undefined);
 const local=systems.query(state,{minX:-30,minY:-30,maxX:30,maxY:30});
 assert.ok(local.bystanders.some(s=>s.entity===ships[0]));assert.equal(local.rocks.length,0);
 const counters=frames.snapshot(state).counters;
 assert.equal(counters.sceneCollections,undefined);assert.equal(counters.asteroidGeometryBuilds,undefined);
 assert.ok(counters.spatialShipCandidates<10,'distant ships do not reach the local exact-test candidate list');
 assert.equal(counters.spatialAsteroidCandidates,0);frames.end(state);
});

test('registered repair-style resolvers refresh custom IDs, movement and damage without collecting an asteroid scene',async()=>{
 const {window:w,state}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;field(w,1000);
 const drone={id:'owned-dot:1',shipType:47,system:1,x:500,y:0,previousX:500,previousY:0,heading:0,vx:0,vy:0,speed:0,hull:100,shields:40,phase:'repairing'};
 const targetId='repair:carrier:17';let collections=0;
 const describe=()=>({...w.nativeShipDefinitions.describe(state,drone,{category:'service-drone'}),id:targetId,ownership:'carrier:17'});
 systems.register('service-drone',{collect:()=>{collections++;return [describe()];},resolve:(_,id)=>String(id)===targetId?describe():null,
  hit:(_,target,amount,impact)=>w.nativeShipDamage.apply(target,amount,impact)});
 frames.begin(state);frames.step(state);
 const original=systems.resolve(state,targetId);assert.equal(original.entity,drone);assert.equal(original.ownership,'carrier:17');assert.equal(collections,0);
 systems.query(state,{minX:450,minY:-50,maxX:550,maxY:50});assert.equal(collections,1,'a spatial census collects the category only when actually needed');
 systems.move(state,drone,'service-drone',{heading:0,throttle:1},{maxSpeed:10,acceleration:10,braking:10,turnRate:1},.1);
 const moved=systems.resolve(state,targetId);assert.ok(moved.x>original.x);assert.equal(moved.id,targetId);assert.equal(moved.ownership,'carrier:17');assert.equal(original.x,500);
 const hit=systems.applyHit(state,{target:moved,point:{x:moved.x-20,y:0},from:{x:0,y:0}},{damage:60,kind:'beam'},{id:'player',system:1});
 assert.equal(hit.shields,0);assert.equal(hit.hull,80);assert.equal(systems.resolve(state,targetId).shields,0);assert.equal(collections,1);
 drone.phase='warp';assert.equal(systems.resolve(state,targetId),null,'direct adapter results still obey physical membership');
 drone.phase='repairing';drone.system=2;assert.equal(systems.resolve(state,targetId,1),null,'direct adapter results cannot cross systems');
 const work=frames.snapshot(state).counters;assert.equal(work.sceneCollections,undefined);assert.equal(work.asteroidGeometryBuilds,undefined);assert.equal(work.asteroidDescriptors,undefined);
 frames.end(state);
});

test('offscreen asteroid motion stays lazy and later swept queries read its current authoritative pose',async()=>{
 const {window:w,state}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame,rocks=field(w,3);
 frames.begin(state);frames.step(state);
 const retained=systems.query(state,{minX:9980,minY:480,maxX:10020,maxY:520}).rocks[0];
 assert.equal(retained.rockId,0);assert.equal(frames.snapshot(state).counters.asteroidDescriptors,1);
 for(let step=0;step<20;step++)for(const rock of rocks){rock.previousX=rock.x;rock.previousY=rock.y;rock.x+=100;rock.angle+=.1;systems.refreshAsteroid(state,rock);}
 assert.equal(frames.snapshot(state).counters.asteroidDescriptors,1,'moving far rocks must not prepare descriptors just to notify the registry');
 assert.equal(frames.snapshot(state).counters.sceneCollections,undefined);
 assert.equal(systems.query(state,{minX:-10,minY:-10,maxX:10,maxY:10}).rocks.length,0);
 Object.assign(rocks[0],{previousX:-200,previousY:0,x:200,y:0,vx:400,vy:0});systems.refreshAsteroid(state,rocks[0]);
 const crossing=systems.collisionScene(state).querySwept({x:0,y:-10},{x:0,y:10},1).rocks[0];
 assert.equal(crossing.rockId,0);assert.equal(crossing.x,200);assert.equal(crossing.previousX,-200);
 assert.equal(retained.x,10000,'a previously retained snapshot remains unchanged');
 assert.equal(frames.snapshot(state).counters.asteroidDescriptors,2);assert.equal(frames.snapshot(state).counters.asteroidGeometryBuilds,1);
 state.destroyedAsteroids.push(0);systems.refreshAsteroid(state,rocks[0]);
 assert.equal(systems.collisionScene(state).querySwept({x:0,y:-10},{x:0,y:10},1).rocks.length,0,'depletion is still authoritative without preparing a full scene');
 frames.end(state);
});

test('spatial searches conservatively admit crossing ships, rotating shields, forecast motion and moved rocks',async()=>{
 const {window:w,state,ships}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame,rocks=field(w,1);
 Object.assign(ships[0],{x:600,y:0,previousX:-600,previousY:0,vx:1200,vy:0});
 Object.assign(ships[1],{x:0,y:1000,previousX:0,previousY:1000,vx:0,vy:-1000});
 rocks[0].x=200;rocks[0].y=0;rocks[0].previousX=-200;rocks[0].previousY=0;
 frames.begin(state);frames.step(state);
 const crossed=systems.collisionScene(state).querySwept({x:0,y:-2},{x:0,y:2},1);
 assert.ok(crossed.bystanders.some(s=>s.entity===ships[0]));assert.equal(crossed.rocks[0].rockId,0);
 const instant=systems.query(state,{minX:-2,minY:-2,maxX:2,maxY:2,swept:false});
 assert.ok(!instant.bystanders.some(s=>s.entity===ships[0]));assert.equal(instant.rocks.length,0);
 const predicted=systems.query(state,{minX:-2,minY:-2,maxX:2,maxY:2,predictSeconds:1});
 assert.ok(predicted.bystanders.some(s=>s.entity===ships[1]));
 Object.assign(ships[0],{x:0,y:0,previousX:0,previousY:0,heading:0,dimensions:{width:20,height:240},shields:50});systems.refreshShip(state,ships[0],'civilian');
 const edge=systems.query(state,{minX:120,minY:-1,maxX:140,maxY:1});assert.ok(edge.bystanders.some(s=>s.entity===ships[0]),'maximum oriented shield extent remains conservative at every heading');
 ships[0].heading=Math.PI/2;systems.refreshShip(state,ships[0],'civilian');assert.ok(systems.query(state,{minX:120,minY:-1,maxX:140,maxY:1}).bystanders.some(s=>s.entity===ships[0]));
 Object.assign(ships[0],{x:1e8,y:0,previousX:-1e8,previousY:0});systems.refreshShip(state,ships[0],'civilian');
 assert.ok(systems.query(state,{minX:-2,minY:-2,maxX:2,maxY:2}).bystanders.some(s=>s.entity===ships[0]),'long sweeps use bounded overflow storage without dropping their swept contact');
 frames.end(state);
});

test('completed-step queries reuse valid poses through drawing and explicit mutations invalidate them',async()=>{
 const {window:w,state,ships}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;field(w,1);
 frames.begin(state);frames.step(state);const cached=systems.scene(state);frames.end(state);
 assert.equal(frames.current(state),null);assert.equal(systems.scene(state),cached);
 ships[0].x+=100;systems.refreshShip(state,ships[0],'civilian');assert.equal(systems.scene(state),cached);assert.equal(systems.resolve(state,ships[0].id).x,ships[0].x);
 ships[0].phase='destroyed';systems.refreshShip(state,ships[0],'civilian');assert.equal(systems.resolve(state,ships[0].id),null);assert.ok(!systems.scene(state).bystanders.some(s=>s.entity===ships[0]));
 const before=systems.scene(state);w.nativeSimulation.advance(state,.1);assert.notEqual(systems.scene(state),before,'clock advancement outside a host frame expires its pose collection');
 state.landed=true;systems.refreshShip(state,state,'player');assert.ok(!systems.query(state,{minX:-100,minY:-100,maxX:100,maxY:100}).bystanders.some(s=>s.id==='player'));
 state.landed=false;systems.refreshShip(state,state,'player');assert.ok(systems.query(state,{minX:-100,minY:-100,maxX:100,maxY:100}).bystanders.some(s=>s.id==='player'));
 w.vexedWarp={active:true};systems.refreshShip(state,state,'player');assert.ok(!systems.query(state,{minX:-100,minY:-100,maxX:100,maxY:100}).bystanders.some(s=>s.id==='player'));
 w.vexedWarp.active=false;systems.refreshShip(state,state,'player');state.system=2;systems.refreshShip(state,state,'player');
 assert.ok(!systems.query(state,{system:1,minX:-100,minY:-100,maxX:100,maxY:100}).bystanders.some(s=>s.id==='player'),'a completed old-system cache cannot keep a player who changed systems');
});

test('direct shared shield damage refreshes the spatial surface exactly once without a scene rebuild',async()=>{
 const {window:w,state,ships}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 Object.assign(ships[0],{x:0,y:0,previousX:0,previousY:0,dimensions:{width:20,height:240},shields:50});
 frames.begin(state);frames.step(state);
 const region={minX:130,minY:-1,maxX:131,maxY:1},before=systems.resolve(state,ships[0].id);
 assert.ok(systems.query(state,region).bystanders.some(s=>s.entity===ships[0]));
 const hit=w.nativeShipDamage.apply(before,50,{from:{x:-200,y:0}});
 assert.equal(hit.absorbed,50);assert.equal(ships[0].shields,0);assert.equal(ships[0].hull,100);
 assert.ok(!systems.query(state,region).bystanders.some(s=>s.entity===ships[0]));
 assert.equal(before.shields,50);assert.equal(frames.snapshot(state).counters.sceneCollections,undefined);frames.end(state);
});

test('effective equipment statistics and shape caches update without rebuilding on ordinary motion',async()=>{
 const {window:w,state,context}=await tacticalFixture(),defs=w.nativeShipDefinitions,frames=w.nativeSimulationFrame;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/regional-minerals.js'),'utf8'),context);
 state.shipType=10;state.tugEngineLevel=1;w.nativeShipEquipment.ensure(state);
 frames.begin(state);frames.step(state);
 const first=defs.describe(state),firstHull=first.definition.hull,firstSpeed=first.definition.speedOrOtherStationValue;
 for(let i=0;i<100;i++){state.angle=i/10;state.x++;const next=defs.describe(state);assert.equal(next.definition,first.definition);assert.equal(next.hullRadii,first.hullRadii);}
 assert.equal(frames.snapshot(state).counters.effectiveStatsBuilds,1);
 const eq=state.shipEquipment,engine=eq.instances[eq.slots.engineering[0]];engine.upgrades.tugEngineLevel=2;
 const upgraded=defs.describe(state);assert.ok(upgraded.definition.speedOrOtherStationValue>firstSpeed);assert.notEqual(upgraded.definition,first.definition);
 state.mineralUpgrades={10:{hull:1,shield:2,engine:1,weapons:2,drive:1}};
 const mineral=defs.describe(state);assert.equal(mineral.definition.hull,Math.round(firstHull*1.1));assert.equal(mineral.definition.weaponDamageMultiplier,1.16);
 eq.slots.shield[0]=null;assert.equal(defs.describe(state).definition.shields,0);
 eq.slots.engineering[0]=null;assert.equal(defs.describe(state).definition.movement.maxSpeed,0);
 eq.slots.engineering[0]=engine.id;const engineId=engine.id;delete eq.instances[engineId];assert.equal(defs.describe(state).definition.engineOnline,false,'a dangling fitted ID is not powered equipment');eq.instances[engineId]=engine;
 assert.equal(defs.describe(state).definition.engineOnline,true);
 const copy=defs.forEntity(state);copy.hull=1;assert.notEqual(defs.forEntity(state).hull,1);
 const old=defs.describe(state);state.shields=0;const depleted=defs.describe(state);assert.equal(depleted.radii,depleted.hullRadii);assert.equal(old.definition,depleted.definition,'shield charge changes the surface without rebuilding effective stats');
 defs.register(10,{hull:400});assert.equal(defs.describe(state).definition.hull,440,'registered definition changes expire cached effective statistics');
 frames.end(state);
});
