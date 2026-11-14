const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),base=1000000;
async function setup(){
  const f=await fixture({full:false,economic:false,traffic:true});
  Object.assign(f.state,{system:1,x:base,y:base,landed:false,hull:100,shields:100});
  f.state.solEconomy.freighters=[];f.state.civilianTraffic.ships=[];
  f.state.civilianTraffic.population={version:1};
  f.window.nativeCivilianPopulation={simulation:{version:1,chunkSize:1024,buffer:1,lookAheadSeconds:6}};
  return f;
}
function add(f,id,x,y,goal,moving=true){
  const e={id,shipType:47,system:1,x:base+x,y:base+y,heading:Math.atan2(goal.y-y,goal.x-x),speed:0,vx:0,vy:0,
    hull:100,shields:100,phase:moving?'cruise':'docked',lifeVersion:1,dockingVersion:1,credits:5000,cargo:null,recentEvents:[],homeBase:{system:1,port:3},
    task:{id:'pilot:'+id,kind:'idle',status:'active',phase:'idle',createdAt:0},nextActionAt:1e8};
  if(moving){e.localLeg=f.window.nativeShipMotion.planLeg(e,{x:base+goal.x,y:base+goal.y},f.window.nativeShipDefinitions.forEntity(f.state,e,{category:'civilian'}).movement,0);e.nextActionAt=e.localLeg.duration;}
  f.state.civilianTraffic.ships.push(e);f.lives.initialize(f.state);return e;
}
function tick(f,ships){const w=f.window,s=f.state;w.nativeSimulation.advance(s,1/60);w.nativeShipTraffic.advance(s,1/60);for(const e of ships)if(e.localLeg)w.nativeShipMotion.sampleLeg(e,e.localLeg,w.nativeSimulation.seconds(s));w.nativeShipTraffic.collide(s,1/60);}

test('balanced neighbors produce small continuous corrections instead of opposite full-strength kicks',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion;
  const ship={id:1,category:'civilian',system:1,x:0,y:0,radii:{rx:10,ry:15},definition:{},dimensions:{width:20,height:30}};
  const neighbor=(id,y)=>({...ship,id,x:0,y});
  const a=m.separationHeading(ship,[neighbor(2,80),neighbor(3,-80.001)],0);
  const b=m.separationHeading(ship,[neighbor(2,80.001),neighbor(3,-80)],0);
  assert.ok(Math.abs(a-b)<.001,'nearly symmetric neighbors must not reverse a large steering correction');
  assert.ok(Math.abs(m.separationHeading(ship,[neighbor(2,35)],0))>.05,'a close real obstacle must still influence steering');
});

test('active route flies through an intermediate waypoint and survives a JSON reload',async()=>{
  const f=await setup(),w=f.window,s=f.state,m=w.nativeShipMotion;
  const e=add(f,21,-600,200,{x:600,y:600}),profile=w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'}).movement;
  e.localLeg=m.routeLeg(e,{x:base+600,y:base+600},[{x:base,y:base+200}],profile,0);e.nextActionAt=e.localLeg.duration;
  let speedAtCorner=0,closest=Infinity,arrived=false;
  for(let i=0;i<3600;i++){
    tick(f,[e]);const d=Math.hypot(e.x-base,e.y-base-200);if(d<closest){closest=d;speedAtCorner=e.speed;}
    if(i===120){const before=JSON.stringify(e.localLeg),leg=copy(e.localLeg),a={},b={};m.sampleLeg(a,e.localLeg,w.nativeSimulation.seconds(s));m.sampleLeg(b,leg,w.nativeSimulation.seconds(s));assert.deepEqual(copy(a),copy(b));assert.equal(JSON.stringify(e.localLeg),before,'read-only sampling cannot mutate the route');}
    if(e.localLeg.pilot?.arrived){arrived=true;break;}
  }
  assert.ok(closest<180,`pilot missed the waypoint corridor: ${closest}`);
  assert.ok(speedAtCorner>15,`pilot stopped at an ordinary waypoint: ${speedAtCorner}`);
  assert.ok(arrived,`pilot failed to arrive ${JSON.stringify({x:e.x-base,y:e.y-base,speed:e.speed,leg:e.localLeg})}`);
  assert.equal(e.speed,0);
});

test('head-on active pilots choose opposite world sides and pass without contact',async()=>{
  const f=await setup(),a=add(f,22,-650,300,{x:650,y:300}),b=add(f,23,650,300,{x:-650,y:300});
  let min=Infinity,maxA=0,minB=Infinity;
  for(let i=0;i<2400;i++){tick(f,[a,b]);min=Math.min(min,Math.hypot(a.x-b.x,a.y-b.y));maxA=Math.max(maxA,a.y-base-300);minB=Math.min(minB,b.y-base-300);if(a.localLeg.pilot?.arrived&&b.localLeg.pilot?.arrived)break;}
  assert.ok(maxA>10&&minB<-10,`pilots did not retain starboard passing sides: ${maxA}, ${minB}`);
  assert.equal(f.window.nativeShipTraffic.snapshot(f.state).contacts.length,0,`contact at separation ${min}`);
  assert.ok(a.localLeg.pilot?.arrived&&b.localLeg.pilot?.arrived,'both pilots must finish the pass');
});

test('a stationary neighboring hull is bypassed without losing cargo or waiting forever',async()=>{
  const f=await setup(),a=add(f,24,-650,300,{x:650,y:300}),b=add(f,25,0,300,{x:0,y:300},false);
  a.cargo={good:5,tons:4};const before=JSON.stringify(a.cargo);let arrived=false;
  for(let i=0;i<3600;i++){tick(f,[a,b]);if(a.localLeg.pilot?.arrived){arrived=true;break;}}
  assert.ok(arrived,`bypass stalled at ${a.x-base}, ${a.y-base}`);
  assert.equal(f.window.nativeShipTraffic.snapshot(f.state).contacts.length,0);
  assert.equal(JSON.stringify(a.cargo),before);assert.equal(a.credits,5000);
});

test('a blocked final berth waits safely and finishes only after the blocker leaves',async()=>{
  const f=await setup(),a=add(f,26,-650,300,{x:0,y:300}),b=add(f,27,0,300,{x:0,y:300},false);
  for(let i=0;i<900;i++)tick(f,[a,b]);
  assert.equal(a.localLeg.pilot.arrived,false);assert.equal(a.trafficControl.mode,'yielding');
  assert.ok(a.speed<1);assert.equal(f.window.nativeShipTraffic.snapshot(f.state).contacts.length,0);
  b.y+=1000;f.window.nativeShipSystems.refreshShip(f.state,b,'civilian');
  for(let i=0;i<1800&&!a.localLeg.pilot.arrived;i++)tick(f,[a,b]);
  assert.equal(a.localLeg.pilot.arrived,true,'the original berth must remain reachable after the blocker moves');
});

test('nearby encounter preference withstands a marginally different neighbor prediction',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion;
  const shape={system:1,category:'civilian',heading:0,radii:{rx:10,ry:15},dimensions:{width:20,height:30},definition:{mass:8}};
  const e={avoidanceIntent:{obstacle:'civilian:2'}};
  const ship={...shape,id:1,x:0,y:0,vx:100,vy:0,speed:100,entity:e};
  const a={...shape,id:2,x:150,y:10,vx:0,vy:0},b={...shape,id:3,x:149,y:-10,vx:0,vy:0};
  assert.equal(m.trafficAdvice(ship,[a,b],{maxSpeed:100,turnRate:2}).other.id,2);
});

test('four active crossing pilots resolve right of way and complete their original routes',async()=>{
  const f=await setup(),ships=[add(f,31,-650,300,{x:650,y:300}),add(f,32,650,300,{x:-650,y:300}),add(f,33,0,-350,{x:0,y:950}),add(f,34,0,950,{x:0,y:-350})];
  for(let i=0;i<5400;i++){tick(f,ships);if(ships.every(e=>e.localLeg.pilot?.arrived))break;}
  assert.equal(f.window.nativeShipTraffic.snapshot(f.state).contacts.length,0,JSON.stringify(f.window.nativeShipTraffic.snapshot(f.state).contacts));
  for(const e of ships)assert.ok(e.localLeg.pilot?.arrived,`crossing ship ${e.id} stalled at ${e.x-base},${e.y-base}`);
});

test('physical acceleration and turn limits remain bounded through an avoidance maneuver',async()=>{
  const f=await setup(),a=add(f,35,-650,300,{x:650,y:300}),b=add(f,36,0,300,{x:0,y:300},false),m=f.window.nativeShipMotion;
  const profile=f.window.nativeShipDefinitions.forEntity(f.state,a,{category:'civilian'}).movement;
  for(let i=0;i<1800&&!a.localLeg.pilot?.arrived;i++){
    const before={vx:a.vx,vy:a.vy,heading:a.heading};tick(f,[a,b]);
    assert.ok(Math.hypot(a.vx-before.vx,a.vy-before.vy)<=Math.max(profile.acceleration,profile.braking)/60+1e-6,'velocity changed faster than the physical engine/brakes allow');
    assert.ok(Math.abs(m.wrap(a.heading-before.heading))<=profile.turnRate/60+1e-6,'heading exceeded the hull turn rate');
  }
  assert.ok(a.localLeg.pilot.arrived);
});

test('a faster ship approaching from behind cannot make a fleeing pilot brake or turn back',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion;
  const shape={system:1,category:'civilian',heading:0,radii:{rx:10,ry:15},dimensions:{width:20,height:30},definition:{mass:8}};
  const ship={...shape,id:1,x:0,y:0,vx:100,vy:0,speed:100,entity:{}};
  const pursuer={...shape,id:2,x:-200,y:0,vx:300,vy:0,speed:300,entity:{}};
  const command=f.window.nativeShipTraffic.avoidance(f.state,ship,[pursuer],{heading:0,throttle:1},{maxSpeed:200,acceleration:100,braking:150,turnRate:2});
  assert.equal(m.trafficAdvice(ship,[pursuer],{maxSpeed:200}).overtaking,true);
  assert.ok(Math.cos(command.heading)>.9);assert.ok(!command.brake);
});
