const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const count=(w,s,key)=>w.nativeSimulationFrame.snapshot(s).counters[key]||0;

async function setup(){
 const f=await tacticalFixture(),{window:w,state:s}=f,ship=s.civilianTraffic.ships[0];s.civilianTraffic.ships=[ship];
 Object.assign(ship,{lifeVersion:1,dockingVersion:1,phase:'cruise',system:1,x:1e7,y:0,previousX:1e7,previousY:0,heading:Math.PI,speed:0,vx:0,vy:0,cargo:null,
  task:{id:'temporal-route',kind:'idle',status:'active',phase:'idle'},nextActionAt:1e9});
 for(const key of ['journey','disputeId','retaliationId','projectileEvade','scriptedDemo','motionKick','motionSpin'])delete ship[key];
 ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:0,y:0},{maxSpeed:200,acceleration:100,braking:100,turnRate:1},0);
 w.nativeNpcLives.refreshLocation(s,ship);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const query=box=>w.nativeShipSystems.query(s,{system:1,minX:-1,minY:-1,maxX:1,maxY:1,categories:['civilian'],...box}).bystanders;
 query();return {...f,ship,query};
}

test('future endpoints stay out of local candidates while bounded expiry maintains authoritative route poses',async()=>{
 const {window:w,state:s,ship,query}=await setup(),beforeChecks=count(w,s,'shipPoseChecks'),beforeCandidates=count(w,s,'spatialShipCandidates'),beforeRejects=count(w,s,'spatialShipTemporalRejects'),beforeExpiry=count(w,s,'spatialShipHorizonRefreshes');
 const retained=w.nativeShipSystems.resolve(s,ship.id),saved=JSON.stringify(ship),deadline=ship.nextActionAt;
 for(let index=0;index<120;index++){w.nativeSimulationFrame.step(s);w.nativeSimulation.advance(s,1/60);assert.equal(query().length,0);}
 const expiry=count(w,s,'spatialShipHorizonRefreshes')-beforeExpiry;assert.equal(expiry,10,'two simulation seconds service ten 0.2-second envelopes');
 assert.equal(count(w,s,'shipPoseChecks'),beforeChecks+1+expiry,'only the explicit lookup and due expiry maintenance sample the distant pose');
 assert.equal(count(w,s,'spatialShipTemporalRejects'),beforeRejects,'the distant complete route never reaches temporal rejection');
 assert.ok(count(w,s,'spatialShipCandidates')-beforeCandidates<=120,'local broadphase work may include the player but not the irrelevant future route');
 assert.equal(JSON.stringify(ship),saved,'a query cannot move or reschedule the authoritative actor');assert.equal(retained.x,1e7);
 const expected={...ship};w.nativeShipMotion.sampleLeg(expected,ship.localLeg,w.nativeSimulation.seconds(s));
 const current=w.nativeShipSystems.resolve(s,ship.id);close(current.x,expected.x);close(current.y,expected.y);assert.ok(current.x<retained.x);assert.notEqual(current,retained);assert.equal(retained.x,1e7);assert.equal(ship.nextActionAt,deadline);
 w.nativeSimulationFrame.end(s);
});

test('reachable current poses, fixed-step sweeps and velocity forecasts survive the temporal rejection',async()=>{
 const {window:w,state:s,ship,query}=await setup(),profile={maxSpeed:2000,acceleration:40000,braking:40000,turnRate:1};
 Object.assign(ship,{x:200,y:-100,previousX:200,previousY:-100,heading:Math.PI/2,dimensions:{width:4,height:4}});
 ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:200,y:100},profile,0);ship.nextActionAt=ship.localLeg.duration;w.nativeShipSystems.refreshShip(s,ship,'civilian');
 const old=w.nativeShipSystems.resolve(s,ship.id);w.nativeSimulation.advance(s,.08);w.nativeSimulationFrame.step(s);
 const expected={...ship},previous={...ship};w.nativeShipMotion.sampleLeg(expected,ship.localLeg,.08);w.nativeShipMotion.sampleLeg(previous,ship.localLeg,.08-1/60);
 const found=query({minX:199,minY:expected.y-1,maxX:201,maxY:expected.y+1,swept:false})[0];close(found.y,expected.y);close(found.previousY,previous.y);assert.equal(old.y,-100);
 assert.ok(query({minX:199,minY:previous.y-1,maxX:201,maxY:previous.y+1,swept:true}).some(t=>t.id===ship.id));
 const forecast=expected.y+expected.vy*.2;assert.ok(query({minX:199,minY:forecast-1,maxX:201,maxY:forecast+1,swept:false,predictSeconds:.2}).some(t=>t.id===ship.id));
 w.nativeSimulationFrame.end(s);
});

test('legacy composite turn metadata and clamped deadlines keep exact authoritative poses',async()=>{
 const {window:w,state:s,ship,query}=await setup(),motion=w.nativeShipMotion,profile={maxSpeed:200,acceleration:100,braking:100,turnRate:.5};
 Object.assign(ship,{x:1e7,y:0,heading:0,speed:0});ship.localLeg=motion.routeLeg(ship,{x:0,y:0},[{x:1e7,y:600}],profile,0,.5);delete ship.localLeg.turnVersion;
 ship.nextActionAt=1;w.nativeShipSystems.refreshShip(s,ship,'civilian');
 w.nativeSimulation.advance(s,3);w.nativeSimulationFrame.step(s);assert.equal(query().length,0);
 const expected={...ship},previous={...ship};motion.sampleLeg(expected,ship.localLeg,1);motion.sampleLeg(previous,ship.localLeg,1);
 const current=query({minX:expected.x-1,minY:expected.y-1,maxX:expected.x+1,maxY:expected.y+1})[0];
 close(current.x,expected.x);close(current.y,expected.y);close(current.previousX,previous.x);close(current.previousY,previous.y);close(current.heading,expected.heading);
 assert.equal(ship.nextActionAt,1);w.nativeSimulationFrame.end(s);
});

test('same-clock geometry, damage and nested hardware mutations refresh before temporal filtering',async()=>{
 const {window:w,state:s,ship,query}=await setup();ship.shipType=10;w.nativeShipEquipment.ensure(s,ship);w.nativeShipSystems.refreshShip(s,ship,'civilian');
 const old=w.nativeShipSystems.resolve(s,ship.id),deadline=ship.nextActionAt,engine=ship.shipEquipment.instances[ship.shipEquipment.slots.engineering[0]],before=count(w,s,'shipDescriptorBuilds');
 engine.upgrades.tugEngineLevel=2;ship.shields=0;ship.hull=75;ship.dimensions={width:800,height:1200};query();
 const fresh=w.nativeShipSystems.resolve(s,ship.id);assert.ok(count(w,s,'shipDescriptorBuilds')>before);assert.notEqual(fresh.definition,old.definition);
 assert.equal(fresh.radii,fresh.hullRadii);assert.equal(fresh.dimensions.width,800);assert.equal(fresh.hull,75);assert.equal(ship.nextActionAt,deadline);assert.ok(old.shields>0);
 w.nativeShipDefinitions.register(10,{dimensions:{width:80,height:90},geometry:{shield:{rx:12,ry:18}}});delete ship.dimensions;w.nativeShipSystems.refreshShip(s,ship,'civilian');
 assert.equal(w.nativeShipSystems.resolve(s,ship.id).dimensions.width,80);w.nativeSimulationFrame.end(s);
});

test('kicks, spins and unsupported commands retain full bounds while relevant queries refresh raw pose changes',async()=>{
 const {window:w,state:s,ship,query}=await setup();
 for(const mutate of [
  ()=>{ship.motionKick={version:1,mode:'scheduled',at:0,x:0,y:0,vx:10,vy:0,duration:3};},
  ()=>{delete ship.motionKick;ship.motionSpin={version:1,mode:'scheduled',at:0,angle:0,velocity:.4};},
  ()=>{delete ship.motionSpin;ship.localLeg={...ship.localLeg,version:1};},
 ]){
  mutate();w.nativeShipSystems.refreshShip(s,ship,'civilian');const before=count(w,s,'shipPoseChecks'),checks=count(w,s,'spatialShipTemporalChecks');w.nativeSimulation.advance(s,.01);query();
  assert.equal(count(w,s,'shipPoseChecks'),before+1);assert.equal(count(w,s,'spatialShipTemporalChecks'),checks);
 }
 ship.localLeg={...ship.localLeg,version:2};w.nativeShipSystems.refreshShip(s,ship,'civilian');
 const old=w.nativeShipSystems.resolve(s,ship.id),oldX=old.x;ship.x+=1;const saved=JSON.stringify(ship),at=w.nativeSimulation.seconds(s),expected={...ship},previous={...ship};
 w.nativeShipMotion.sampleLeg(expected,ship.localLeg,at);w.nativeShipMotion.sampleLeg(previous,ship.localLeg,at-1/60);
 const area={minX:expected.x-1,minY:expected.y-1,maxX:expected.x+1,maxY:expected.y+1},before=count(w,s,'shipPoseChecks'),current=query(area)[0];
 assert.equal(count(w,s,'shipPoseChecks'),before+1,'a relevant query reconciles the raw changed fields');
 assert.ok(current);assert.notEqual(current,old);close(current.x,expected.x);close(current.y,expected.y);close(current.previousX,previous.x);close(current.previousY,previous.y);
 assert.equal(old.x,oldX,'the retained pose remains immutable');assert.equal(JSON.stringify(ship),saved,'sampling the committed leg cannot rewrite its live entity');
 assert.equal(query(area)[0],current,'the reconciled same-clock descriptor is reusable');w.nativeSimulationFrame.end(s);
});

test('a fast scheduled blocker entering after beam launch takes exactly one physical hit',async()=>{
 const {window:w,state:s}=await tacticalFixture(),target=s.civilianTraffic.ships[0],blocker=s.civilianTraffic.ships[1];
 Object.assign(target,{x:400,y:0,previousX:400,previousY:0,phase:'docked',speed:0,vx:0,vy:0});
 Object.assign(blocker,{x:200,y:-100,previousX:200,previousY:-100,heading:Math.PI/2,phase:'cruise',dimensions:{width:4,height:4},speed:0,vx:0,vy:0,task:{id:'crossing',status:'active',phase:'idle'}});
 blocker.localLeg=w.nativeShipMotion.planLeg(blocker,{x:200,y:100},{maxSpeed:2000,acceleration:40000,braking:40000,turnRate:1},0);blocker.nextActionAt=blocker.localLeg.duration;
 w.nativeNpcLives.refreshLocation(s,target);w.nativeNpcLives.refreshLocation(s,blocker);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const fired=w.nativeCombatShots.fireFor({state:s,shooter:w.nativeShipSystems.resolve(s,'player'),target:w.nativeShipSystems.resolve(s,target.id)});assert.equal(fired.ok,true);
 const targetShield=target.shields,blockerShield=blocker.shields;w.nativeSimulation.advance(s,.075);w.nativeSimulationFrame.step(s);w.nativeCombatShots.advance(s,.075);
 assert.equal(fired.event.hitTargetId,blocker.id);assert.ok(blocker.shields<blockerShield);assert.equal(target.shields,targetShield);
 const shield=blocker.shields;w.nativeCombatShots.advance(s,.08);assert.equal(blocker.shields,shield,'visual or repeated resolution cannot apply damage again');w.nativeSimulationFrame.end(s);
});
