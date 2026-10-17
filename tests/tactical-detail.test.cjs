const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function near(f){f.state.x=1000000;f.state.y=0;assert.equal(f.window.nativeNpcLives.detail(f.state,f.ships[0]),'detailed');}
const quiet=f=>{assert.equal(f.calls.steering,0);assert.equal(f.calls.firing,0);assert.equal(f.calls.scenes,0);};

test('same-system distance ends tactical contact before steering, firing or collecting a scene',async()=>{
 const f=await tacticalFixture();near(f);f.start();assert.equal(f.state.civilianTraffic.retaliations.length,1);
 for(let i=0;i<30;i++)f.step();assert.ok(f.calls.steering>0);assert.ok(f.calls.firing>0);
 const cargo=plain(f.ships[0].cargo),equipment=plain(f.ships[0].weaponLoadout),health=f.ships[0].hull;
 f.state.x=0;f.clearCounts();for(let i=0;i<60;i++)f.step();quiet(f);
 assert.equal(f.state.civilianTraffic.retaliations.length,0);assert.equal(f.ships[0].hull,health);assert.deepEqual(plain(f.ships[0].cargo),cargo);assert.deepEqual(plain(f.ships[0].weaponLoadout),equipment);
 assert.notEqual(f.ships[0].phase,'fighting');assert.ok(f.ships[0].nextActionAt!==null,'task owner schedules commercial survivor');
 near(f);f.clearCounts();f.step();quiet(f);assert.equal(f.state.civilianTraffic.retaliations.length,0,'return does not resurrect a departed fight');
});

test('distant hits never create a full-rate retaliation; repeated boundary crossings require a new actual hit',async()=>{
 const f=await tacticalFixture();f.start();f.clearCounts();for(let i=0;i<60;i++)f.step();quiet(f);assert.equal(f.calls.prepared,0);assert.equal(f.state.civilianTraffic.retaliations.length,0);
 for(let i=0;i<12;i++){
  near(f);f.start();assert.equal(f.state.civilianTraffic.retaliations.length,1);
  f.state.x=f.ships[0].x-f.window.nativeShipDetail.radius(f.state)-1;f.clearCounts();f.step();quiet(f);
  assert.equal(f.state.civilianTraffic.retaliations.length,0);
 }
});

test('cross-system departure and save/load close old contact without resetting identities or owned recharge',async()=>{
 const f=await tacticalFixture();near(f);f.start();for(let i=0;i<30;i++)f.step();
 f.state.system=2;const saved=plain(f.state),identity=saved.civilianTraffic.ships[0].identity,loadout=plain(saved.civilianTraffic.ships[0].weaponLoadout);
 const restored=await tacticalFixture({state:saved});restored.clearCounts();restored.step();quiet(restored);
 assert.equal(restored.state.civilianTraffic.retaliations.length,0);assert.equal(restored.ships[0].identity,identity);assert.deepEqual(plain(restored.ships[0].weaponLoadout),loadout);
});

test('a distant saved dispute uses the same break-contact policy and lightweight inspection does not activate it',async()=>{
 const f=await tacticalFixture();const [a,b]=f.ships,traffic=f.state.civilianTraffic;
 traffic.disputes=[{id:77,system:1,a:a.id,b:b.id,combatVersion:3,startedAt:0,nextA:0,nextB:0,pending:[],reason:'saved dispute'}];
 for(const ship of f.ships){ship.disputeId=77;ship.phase='fighting';}
 a.scriptedDemo='mining';a.miningRockSlot=null;b.scriptedDemo='ore-dispute';
 f.clearCounts();for(let i=0;i<10;i++)f.window.nativeShipSystems.inspectAll(f.state);quiet(f);
 f.step();quiet(f);assert.equal(traffic.disputes.length,0);assert.equal(traffic.combatReports.length,1);
 for(const ship of f.ships){assert.equal(ship.disputeId,undefined);assert.equal(ship.scriptedDemo,undefined);assert.notEqual(ship.phase,'fighting');}
});

test('detail eligibility uses authoritative sampled legs, the configured radius and category-independent geometry',async()=>{
 const f=await tacticalFixture(),{window:w,state}=f,ship=f.ships[0];state.x=0;state.y=0;
 state.civilianTraffic.life.config.detailedRadius=100;
 Object.assign(ship,{x:9999,y:0,localLeg:w.nativeShipMotion.planLeg({x:0,y:0,heading:0,speed:0},{x:10,y:0},{maxSpeed:10,acceleration:5,braking:5},0),nextActionAt:100});
 assert.equal(w.nativeShipDetail.isDetailed(state,ship),true,'analytical pose takes precedence over coarse stored position');
 for(const category of ['civilian','tug']){
  const entity={x:100,y:0,hull:100,system:1,phase:'docked'};
  assert.equal(w.nativeShipDetail.isDetailed(state,{entity,category,system:1}),true);
  entity.x=100.001;assert.equal(w.nativeShipDetail.isDetailed(state,{entity,category,system:1}),false);
 }
 ship.journey={};assert.equal(w.nativeShipDetail.isDetailed(state,ship),false);
});

test('ending an obsolete dispute cannot interrupt a later task owned by the same persistent ship',async()=>{
 const f=await tacticalFixture(),[a,b]=f.ships,t=f.state.civilianTraffic;
 a.disputeId=88;b.disputeId=88;a.phase=b.phase='fighting';
 const task=a.task,deadline=a.nextActionAt;
 t.disputes=[{id:77,system:1,a:a.id,b:b.id,startedAt:0,reason:'obsolete record',volleys:0}];f.step();
 assert.equal(a.disputeId,88);assert.equal(a.phase,'fighting');assert.equal(a.task,task);assert.equal(a.nextActionAt,deadline);
});

test('launched shots remain owned by the firing lifecycle after offscreen contact ends',async()=>{
 const f=await tacticalFixture({simulateShots:true});near(f);f.start();
 for(let i=0;i<120&&!(f.state.weaponCombat?.events.length);i++)f.step();const before=f.state.weaponCombat.events.length;
 assert.ok(before>0,'an actual shot was launched');f.state.x=0;f.clearCounts();
 for(let i=0;i<600;i++)f.step();assert.equal(f.calls.steering,0);assert.equal(f.calls.firing,0);
 assert.equal(f.state.weaponCombat.events.length,0,'launched shots resolve or expire independently of AI contact');
 f.clearCounts();for(let i=0;i<60;i++)f.step();quiet(f);
});
