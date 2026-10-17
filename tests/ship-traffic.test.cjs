const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const body=(extra={})=>({id:1,category:'civilian',system:2,x:0,y:0,previousX:0,previousY:0,heading:0,vx:0,vy:0,
  dimensions:{width:30,height:60},radii:{rx:15,ry:30},definition:{mass:8},...extra});
async function setup(){
  const f=await fixture({full:false,economic:false,traffic:true});
  Object.assign(f.state,{system:2,x:10000,y:10000,hull:100,shields:100,landed:false});
  f.state.solEconomy.freighters=[];f.state.civilianTraffic.ships=[];
  f.window.nativePlayerCombat={visualImpact:(state,event)=>f.window.nativeShipEffects.visualImpact(state,f.window.nativeShipDefinitions.describe(state),event)};
  f.lives.initialize(f.state);return f;
}
function add(f,{id=1,x=-500,y=0,goal={x:500,y:0},system=2,moving=true,category='civilian',mass=8}={}){
  const e={id,shipType:47,system,x,y,previousX:x,previousY:y,heading:Math.atan2(goal.y-y,goal.x-x),speed:0,vx:0,vy:0,hull:100,shields:100,
    dimensions:{width:30,height:60},phase:moving?'cruise':'docked',lifeVersion:1,dockingVersion:1,credits:5000,cargo:null,recentEvents:[],homeBase:{system,port:0},
    task:{id:'test:'+id,kind:'idle',status:'active',phase:'idle',createdAt:0},nextActionAt:1e8};
  f.window.nativeShipDefinitions.register(47,{mass});
  if(moving){e.localLeg=f.window.nativeShipMotion.planLeg(e,goal,f.window.nativeShipMotion.profiles.civilian(f.window.nativeShipDefinitions.get(47,'civilian')),f.window.nativeSimulation.seconds(f.state));e.nextActionAt=e.localLeg.startedAt+e.localLeg.duration;}
  f.state.civilianTraffic.ships.push(e);f.lives.initialize(f.state);return e;
}
function tick(f,ships,dt=1/60){
  if(f.window.nativeSimulation.blocked())return;
  const w=f.window,s=f.state;w.nativeSimulation.advance(s,dt);w.nativeShipTraffic.advance(s,dt);const at=w.nativeSimulation.seconds(s);
  for(const e of ships)if(e.localLeg)w.nativeShipMotion.sampleLeg(e,e.localLeg,at);
  w.nativeShipTraffic.collide(s,dt);
}

test('swept ship contacts conserve momentum, dissipate energy and respond to relative mass and glancing angles',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion;
  const a=body({x:100,previousX:-100,vx:200}),b=body({id:2,x:30,previousX:30});
  const hit=m.shipPairContact(a,b,1);assert.ok(hit);assert.ok(hit.t>0&&hit.t<1);near(hit.a.vx+hit.b.vx,200);
  assert.ok(hit.a.vx**2+hit.b.vx**2<=200**2);assert.ok(hit.b.x-hit.a.x>=60);
  const heavy=m.shipPairContact(a,{...b,definition:{mass:80}},1);assert.ok(heavy.b.vx<hit.b.vx);assert.ok(heavy.a.vx<hit.a.vx);
  near(heavy.a.vx*8+heavy.b.vx*80,1600);
  const glance=m.shipPairContact({...a,y:20,previousY:20},b,1);assert.ok(glance);assert.ok(Math.abs(glance.b.vy)>1);
  assert.equal(m.shipPairContact({...a,y:100,previousY:100},b,1),null);
  const separating=m.shipPairContact(body({x:-30.02,previousX:-30.02,vx:-10}),body({id:2,x:30.02,previousX:30.02,vx:10}),.01);assert.equal(separating,null);
});

test('ship collection shares a physics-step view and refreshes after physical displacement and the next step',async()=>{
  const f=await setup(),w=f.window,s=f.state,e=add(f,{x:0,moving:false});
  w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
  const first=w.nativeShipSystems.collectShips(s),same=w.nativeShipSystems.collectShips(s);assert.equal(first,same);
  const ship=first.find(d=>d.entity===e);w.nativeShipSystems.applyContact(s,ship,{x:20,y:10,vx:30,vy:0});
  const moved=w.nativeShipSystems.collectShips(s);assert.notEqual(moved,first);near(moved.find(d=>d.entity===e).x,20);near(ship.x,0);
  e.shields=0;w.nativeSimulationFrame.step(s);const next=w.nativeShipSystems.collectShips(s);assert.equal(next.find(d=>d.entity===e).shields,0);
  w.nativeSimulationFrame.end(s);
});

test('rotated shield/hull footprints determine ship contact rather than broad-phase circles',async()=>{
  const {window:w}=await setup(),m=w.nativeShipMotion;
  const a=body({x:0,y:0}),b=body({id:2,x:0,y:35,previousY:35});
  assert.equal(m.shipPairContact(a,b,.1),null,'two slender ships have room beside each other');
  assert.ok(m.shipPairContact({...a,heading:Math.PI/2},b,.1),'rotation changes the contact surface');
  assert.ok(m.shipPairContact({...a,radii:{rx:25,ry:40}},b,.1),'larger shield surface touches');
});

test('head-on traffic passes consistently, avoids contact and reaches both original destinations',async()=>{
  const f=await setup(),a=add(f),b=add(f,{id:2,x:500,goal:{x:-500,y:0}});let min=Infinity;
  for(let i=0;i<2400;i++){tick(f,[a,b]);min=Math.min(min,Math.hypot(a.x-b.x,a.y-b.y));}
  assert.ok(min>60,`clearance ${min}`);near(a.x,500);near(b.x,-500);near(a.y,0);near(b.y,0);
  assert.ok(f.window.nativeShipTraffic.snapshot(f.state).plans>=2);assert.equal(f.window.nativeShipTraffic.snapshot(f.state).contacts.length,0);
});

test('crossing traffic yields predictably and both ships keep making progress',async()=>{
  const f=await setup(),a=add(f),b=add(f,{id:2,x:0,y:-500,goal:{x:0,y:500}});let min=Infinity,yielded=false;
  for(let i=0;i<2400;i++){tick(f,[a,b]);yielded||=a.trafficControl?.mode==='yielding'||b.trafficControl?.mode==='yielding';min=Math.min(min,Math.hypot(a.x-b.x,a.y-b.y));}
  assert.ok(yielded);assert.ok(min>60,`clearance ${min}`);near(a.x,500);near(b.y,500);
});

test('a civilian detours around a parked player without steering the player or losing its job/cargo',async()=>{
  const f=await setup();Object.assign(f.state,{x:0,y:0,angle:0,speed:0,vx:0,vy:0});
  const a=add(f);a.cargo={good:5,tons:4};const job=copy(a.task),deadline=a.nextActionAt,player=copy({x:f.state.x,y:f.state.y,angle:f.state.angle});let min=Infinity;
  for(let i=0;i<2400;i++){tick(f,[a]);min=Math.min(min,Math.hypot(a.x,a.y));}
  assert.ok(min>60,`clearance ${min}`);near(a.x,500);near(a.y,0);assert.ok(a.nextActionAt>deadline);
  assert.deepEqual(copy(a.task),job);assert.deepEqual(copy(a.cargo),{good:5,tons:4});assert.deepEqual({x:f.state.x,y:f.state.y,angle:f.state.angle},player);
});

test('blocked arrival waits, retains cargo and resumes once the obstacle clears',async()=>{
  const f=await setup(),a=add(f,{goal:{x:0,y:0}}),obstacle=add(f,{id:2,x:0,moving:false});a.cargo={good:5,tons:4};
  const deadline=a.nextActionAt;
  for(let i=0;i<1200;i++)tick(f,[a]);const stopped=a.x;
  for(let i=0;i<16800;i++)tick(f,[a]);near(a.x,stopped);
  assert.ok(a.x<-60);assert.ok(a.nextActionAt>deadline);assert.equal(a.cargo.tons,4);assert.equal(a.trafficControl.mode,'yielding');
  obstacle.x=10000;for(let i=0;i<1200;i++)tick(f,[a]);near(a.x,0);near(a.y,0);
});

test('yield commands brake at the configured rate before holding, rather than freezing a moving ship',async()=>{
  const {window:w}=await setup(),m=w.nativeShipMotion,entity={x:0,y:0,heading:0,speed:100,vx:100,vy:0};
  const route=m.routeLeg(entity,{x:1000,y:0},[],{maxSpeed:100,acceleration:50,braking:50},0,.8),pose={...entity};
  m.sampleLeg(pose,route,.5);near(pose.speed,75);near(pose.x,43.75);
  m.sampleLeg(pose,route,2.4);near(pose.speed,0);near(pose.x,100);
  m.sampleLeg(pose,route,route.duration);near(pose.x,1000);near(pose.speed,0);
});

test('four crossing pilots resolve priorities without an endless traffic deadlock',async()=>{
  const f=await setup(),ships=[add(f),add(f,{id:2,x:500,goal:{x:-500,y:0}}),add(f,{id:3,x:0,y:-500,goal:{x:0,y:500}}),add(f,{id:4,x:0,y:500,goal:{x:0,y:-500}})];
  for(let i=0;i<7200;i++)tick(f,ships);
  for(const e of ships){near(e.x,e.localLeg.goal.x);near(e.y,e.localLeg.goal.y);}
  assert.equal(f.window.nativeShipTraffic.snapshot(f.state).contacts.length,0);
});

test('passing routes survive save/reload, pause and read-only sampling with identical poses',async()=>{
  const f=await setup(),a=add(f),b=add(f,{id:2,x:0,moving:false});
  for(let i=0;i<240&&!a.trafficControl;i++)tick(f,[a]);assert.equal(a.localLeg.version,3);
  const saved=copy(f.state),at=f.window.nativeSimulation.seconds(f.state),m=f.window.nativeShipMotion,expected=copy(a);
  m.sampleLeg(expected,expected.localLeg,at+1);const before=JSON.stringify(a);f.lives.pose(f.state,a);assert.equal(JSON.stringify(a),before);
  f.window.nativePause.active=true;tick(f,[a,b],1);assert.equal(JSON.stringify(a),before);f.window.nativePause.active=false;
  const g=await fixture({saved,full:false,economic:false,traffic:true}),restored=g.state.civilianTraffic.ships.find(s=>s.id===a.id);
  g.window.nativeShipMotion.sampleLeg(restored,restored.localLeg,at+1);near(restored.x,expected.x);near(restored.y,expected.y);near(restored.nextActionAt,a.nextActionAt);
});

test('actual contacts push every role, preserve health and cargo, and do not replay a shield impact each step',async()=>{
  for(const category of ['civilian','tug'])for(const shielded of [true,false]){
    const f=await setup(),s=f.state,w=f.window;Object.assign(s,{x:0,y:0,angle:0,vx:100,vy:0,speed:100,previousX:-50,previousY:0,shields:shielded?100:0});
    const other=add(f,{id:2,x:40,moving:false});other.shields=shielded?100:0;other.cargo={good:5,tons:4};
    if(category==='tug'){s.civilianTraffic.ships=[];s.solEconomy.freighters=[other];other.system=1;s.system=1;}
    const initial={hull:other.hull,shields:other.shields,cargo:copy(other.cargo)};
    w.nativeShipTraffic.collide(s,.5);assert.ok(other.vx>0);assert.ok(s.vx<100);assert.ok(other.motionKick);
    assert.deepEqual({hull:other.hull,shields:other.shields,cargo:copy(other.cargo)},initial);
    assert.equal(w.nativeShipTraffic.snapshot(s).contacts.length,1);w.nativeShipTraffic.collide(s,.5);assert.equal(w.nativeShipTraffic.snapshot(s).contacts.length,1);
    const d=w.nativeShipDefinitions.describe(s,other,{category});assert.ok(shielded?w.nativeShipEffects.snapshot(d).flash: true);
  }
});

test('offscreen traffic uses the same avoidance and contacts without creating art or changing population',async()=>{
  const f=await setup();f.state.system=4;const a=add(f),b=add(f,{id:2,x:0,moving:false});const count=f.state.civilianTraffic.ships.length,loads=f.window.nativeShipEffects.metrics().loads;
  for(let i=0;i<2400;i++)tick(f,[a,b]);near(a.x,500);assert.equal(f.state.civilianTraffic.ships.length,count);assert.equal(f.window.nativeShipEffects.metrics().loads,loads);
});

test('a funded delivery cannot unload through a parked player; restored traffic resumes and settles once at the real berth',async()=>{
  let f=await fixture({full:false,economic:false,traffic:true});f.state.solEconomy.freighters=[];
  const {ship,lives,state}=f;Object.assign(state,{x:10000,y:10000});
  const source=lives.market(state,1,3),buyer=lives.market(state,1,5),good=5,tons=4;
  const sourceBefore=source.stock[good],buyerBefore=buyer.stock[good],money=source.credits+buyer.credits+ship.credits;
  assert.equal(lives.startDelivery(state,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good,tons}).ok,true);
  const until=(g,p,seconds=300)=>{for(let i=0;i<seconds*60&&!p();i++)g.step();assert.ok(p(),'delivery phase reached');};
  until(f,()=>ship.cargo&&ship.localLeg&&ship.task.phase==='approaching');
  const endpoint={...ship.localLeg.goal},deadline=ship.nextActionAt;Object.assign(state,{x:endpoint.x,y:endpoint.y,previousX:endpoint.x,previousY:endpoint.y,speed:0,vx:0,vy:0});
  for(let i=0;i<2400;i++)f.step();assert.equal(ship.cargo.tons,tons);assert.equal(buyer.stock[good],buyerBefore);assert.equal(ship.deliveries||0,0);assert.ok(ship.nextActionAt>deadline);
  const saved=copy(state),id=ship.id;f=await fixture({saved,full:false,economic:false,traffic:true});const restored=f.lives.find(f.state,id);
  Object.assign(f.state,{x:10000,y:10000,previousX:10000,previousY:10000});
  until(f,()=>restored.deliveries===1);
  const src=f.lives.market(f.state,1,3),dst=f.lives.market(f.state,1,5);
  assert.equal(src.stock[good],sourceBefore-tons);assert.equal(dst.stock[good],buyerBefore+tons);assert.equal(restored.cargo,null);
  assert.equal(src.credits+dst.credits+restored.credits,money);assert.equal(dst.fundsReserved,0);assert.equal(dst.incoming[good],0);
  assert.equal(restored.recentEvents.filter(e=>e.kind==='delivered').length,1);
});
