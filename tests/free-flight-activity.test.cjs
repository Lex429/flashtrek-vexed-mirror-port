const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const options={full:false,economic:false,regional:true,access:true,population:true,corridors:true,traffic:true};
const copy=value=>JSON.parse(JSON.stringify(value));
function flight(f,target,speed=427.5,steering=0){
  const {state:s,window:w,ship:e,lives:l}=f,a=w.nativeManualFlight.planetPosition(1),b=w.nativeManualFlight.planetPosition(2),angle=Math.atan2(b.y-a.y,b.x-a.x)+steering;
  Object.assign(s,{system:1,x:a.x,y:a.y,landed:false,manualTargetSystem:target,angle,speed,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed});
  l.observeCourse(s,1,target);l.interrupt(s,e,'Free crew fixture');
  Object.assign(e,{system:1,port:3,x:250,y:-60,phase:'docked',nextActionAt:9999,dockingVersion:1,cargo:null,oreHold:0});
  for(const key of ['localLeg','dockingMove','dockIntent','journey','travelResume'])delete e[key];
  l.invalidateMembership(s);l.initialize(s);
}

test('Earth, Orion, a wrong destination and no navigation selection yield the same real free-flight job',async()=>{
  let expected;
  for(const target of [1,2,4,0]){
    // A small manual steering correction must not snap back to a selected star.
    const f=await fixture(options);flight(f,target,427.5,.08);
    for(let i=0;i<480&&!f.ship.task?.requirements?.activity;i++)f.step();
    const job=f.ship.task;assert.ok(job?.requirements?.activity,'No work with navigation target '+target);
    assert.equal(job.kind,'mining');assert.equal(f.lives.initialize(f.state).reservations['rock:'+job.requirements.rockId].owner,f.ship.id);
    assert.equal(f.window.nativeManualFlight.regionAtPoint(f.state,job.requirements.activity.point).kind,'interstellar','Forecast work was spent at a planet');
    const plan=copy({point:job.requirements.activity.point,rock:job.requirements.rockId,departure:job.requirements.departureAt,work:job.requirements.workAt,course:f.lives.activity(f.state).course});
    if(expected)assert.deepEqual(plan,expected,'Navigation selection changed real flight activity');else expected=plan;
  }
});

test('slow flight uses measured movement; stopping and deliberate turns cannot aim work at a stale selection',async()=>{
  const f=await fixture(options);flight(f,4,20);f.step();
  const first=f.lives.activity(f.state).course;assert.ok(first);assert.equal(first.speed,20);
  assert.ok(first.ux*f.state.vx+first.uy*f.state.vy>19.999);
  Object.assign(f.state,{vx:0,vy:0,speed:0});for(let i=0;i<125;i++)f.step();
  assert.equal(f.lives.activity(f.state).course,null);
  const assigned=copy(f.lives.activity(f.state).assigned);for(let i=0;i<180;i++)f.step();assert.deepEqual(copy(f.lives.activity(f.state).assigned),assigned);
  Object.assign(f.state,{vx:-first.ux*80,vy:-first.uy*80,speed:80});for(let i=0;i<125;i++)f.step();
  const turned=f.lives.activity(f.state).course;assert.ok(turned.ux*first.ux+turned.uy*first.uy<-.999);
});

test('ordinary expanded-fleet traders choose interstellar work for two rotation slots and retain funded stock and buyer escrow',async()=>{
  for(const legs of [0,2]){
    let f=await fixture(options);const {ship:e,state:s,lives:l}=f;l.interrupt(s,e,'Free trading crew fixture');
    Object.assign(e,{role:'freight',regionalResident:false,legs,phase:'docked',nextActionAt:0,cargo:null,oreHold:0});
    for(const key of ['localLeg','dockingMove','dockIntent','journey','travelResume'])delete e[key];
    Object.assign(s,{landed:false,speed:0,vx:0,vy:0,manualTargetSystem:1});
    f=await fixture({...options,saved:copy(s)});for(let i=0;i<120&&!['freight','trade'].includes(f.ship.task?.kind);i++)f.step();
    const job=f.ship.task;assert.ok(['freight','trade'].includes(job?.kind));assert.notEqual(job.origin.system,job.destination.system);
    const reservation=f.lives.initialize(f.state).reservations[job.id];assert.ok(reservation.sourceReserved&&reservation.destinationReserved);assert.equal(reservation.owner,f.ship.id);assert.ok(reservation.payment>0);assert.equal(f.ship.cargo,null);
  }
});

test('a new funded crossing keeps its departure window, paid cargo and buyer escrow through a turn and Continue, then delivers once',async()=>{
  let f=await fixture(options);flight(f,1);Object.assign(f.ship,{shipType:56,role:'freight',regionalResident:false});
  const definition=f.window.nativeShipDefinitions.forEntity(f.state,f.ship,{category:'civilian'});Object.assign(f.ship,{hull:definition.hull,shields:definition.shields});
  for(let i=0;i<600&&!f.ship.task?.requirements?.activity;i++)f.step();
  assert.equal(f.ship.task?.requirements?.activity?.kind,'trade');
  const task=f.ship.task.id,departure=f.ship.task.requirements.departureAt;assert.ok(departure>f.window.nativeSimulation.seconds(f.state));
  for(let i=0;i<1800&&!f.ship.cargo;i++)f.step();assert.ok(f.ship.cargo);assert.ok(!f.ship.journey,'Trade left before its fixed window');
  const saved=copy(f.state),cargo=copy(f.ship.cargo),escrow=copy(f.lives.initialize(f.state).reservations[task]);
  Object.assign(saved,{vx:-saved.vx,vy:-saved.vy,manualTargetSystem:4});f=await fixture({...options,saved});
  assert.equal(f.ship.task.id,task);assert.equal(f.ship.task.requirements.departureAt,departure);assert.deepEqual(copy(f.ship.cargo),cargo);assert.deepEqual(copy(f.lives.initialize(f.state).reservations[task]),escrow);
  Object.assign(f.state,{x:4000000,y:4000000,vx:0,vy:0,speed:0});
  for(let i=0;i<9000&&!f.ship.journey;i++)f.step();assert.ok(f.ship.journey);assert.ok(f.ship.journey.departedAt>=departure-1e-7);
  for(let i=0;i<18000&&f.ship.deliveries!==1;i++)f.step();assert.equal(f.ship.deliveries,1);assert.equal(f.ship.task.id,task);assert.equal(f.ship.cargo,null);assert.equal(f.lives.initialize(f.state).reservations[task],undefined);
  for(let i=0;i<60;i++)f.step();assert.equal(f.ship.deliveries,1);
});
