const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function setup(){
 const f=await fixture({full:false,economic:false,traffic:true});
 Object.assign(f.state,{system:1,x:100000,y:100000,previousX:100000,previousY:100000,speed:0,vx:0,vy:0,landed:false});
 f.state.civilianTraffic.ships=[];f.state.solEconomy.freighters=[];f.lives.initialize(f.state);return f;
}
function add(f,id,x,y,{system=2,speed=0,shipType=47,moving=false}={}){
 const ship={id,shipType,system,x,y,previousX:x,previousY:y,heading:0,speed,vx:speed,vy:0,hull:100,shields:100,phase:moving?'cruise':'docked',
  dimensions:shipType===47?{width:30,height:60}:undefined,lifeVersion:1,dockingVersion:1,credits:1200,cargo:null,oreHold:0,recentEvents:[],
  task:{id:'grid:'+id,kind:'idle',status:'active',phase:'idle',origin:{system,port:0},destination:{system,port:0},requirements:{}},nextActionAt:1e9};
 if(moving){ship.localLeg=f.window.nativeShipMotion.planLeg(ship,{x:x+10000,y},{maxSpeed:Math.max(100,speed),acceleration:100,braking:100,turnRate:1},0);ship.nextActionAt=ship.localLeg.duration;}
 f.state.civilianTraffic.ships.push(ship);f.lives.initialize(f.state);return ship;
}
function measure(f,action){const w=f.window,s=f.state;w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);action();const counters=w.nativeSimulationFrame.snapshot(s).counters;w.nativeSimulationFrame.end(s);return counters;}
async function avoidance({offset=0,remote=false}={}){
 const f=await setup(),w=f.window,s=f.state,a=add(f,1,offset,offset,{moving:true,speed:80});
 const others=Array.from({length:5},(_,index)=>add(f,index+2,offset+100+index*50,offset));
 if(remote){
  w.nativeShipDefinitions.register(9005,{name:'Remote grid stress hull',dimensions:{width:20000,height:20000},movement:{maxSpeed:100000,acceleration:100000,braking:100000,turnRate:1}});
  add(f,900,1e7,1e7,{system:4,shipType:9005,moving:true,speed:50000});
 }
 w.nativeShipSystems.collectShips(s,2);for(const ship of [a,...others])ship.cargo={good:5,tons:4,owner:ship.id};
 const before=[a,...others].map(ship=>copy({id:ship.id,credits:ship.credits,cargo:ship.cargo,taskId:ship.task.id})),original=w.nativeShipMotion;let seen;
 w.nativeShipMotion={...original,trafficAdvice(ship,neighbors,profile){const advice=original.trafficAdvice(ship,neighbors,profile);if(ship.entity===a)seen={neighbors:neighbors.map(other=>other.id),advice:advice?{other:advice.other.id,yield:advice.yield,t:advice.t,distance:advice.distance}:null};return advice;}};
 const counters=measure(f,()=>w.nativeShipTraffic.advance(s,1/60));
 assert.deepEqual([a,...others].map(ship=>copy({id:ship.id,credits:ship.credits,cargo:ship.cargo,taskId:ship.task.id})),before);
 return {seen:copy(seen),counters,goal:{x:a.localLeg.goal.x-offset,y:a.localLeg.goal.y-offset},duration:a.localLeg.duration};
}

test('sparse direct scans and dense cell traversal preserve neighbor order and avoidance decisions',async()=>{
 const sparse=await avoidance(),dense=await avoidance({offset:384});
 assert.ok(sparse.counters.trafficAvoidanceDirectActorVisits>0);assert.equal(sparse.counters.trafficAvoidanceGridCellsVisited||0,0);
 assert.ok(dense.counters.trafficAvoidanceGridCellsVisited>0);assert.equal(dense.counters.trafficAvoidanceDirectActorVisits||0,0);
 assert.deepEqual(sparse.seen,dense.seen);assert.deepEqual(sparse.seen.neighbors,[2,3,4,5,6]);
 assert.equal(sparse.counters.trafficAvoidanceReturned,5);assert.equal(dense.counters.trafficAvoidanceReturned,5);
 assert.deepEqual(sparse.goal,dense.goal);assert.ok(Math.abs(sparse.duration-dense.duration)<1e-8);
});

test('fast oversized actors in another system cannot enlarge local avoidance or alter its decisions',async()=>{
 const local=await avoidance(),remote=await avoidance({remote:true});
 assert.deepEqual(remote.seen,local.seen);assert.deepEqual(remote.goal,local.goal);assert.ok(Math.abs(remote.duration-local.duration)<1e-8);
 assert.equal(remote.counters.trafficAvoidanceGridCellsVisited||0,0);
 assert.equal(remote.counters.trafficAvoidanceDirectActorVisits,local.counters.trafficAvoidanceDirectActorVisits+1,'the remote system visits only its own actor');
});

test('dense contact searches preserve fast interception, physical chains and owned cargo',async()=>{
 const f=await setup(),w=f.window,s=f.state,a=add(f,1,0,0,{speed:100}),b=add(f,2,40,0),c=add(f,3,80,0);
 // Real scheduled residents make the cell path preferable without adding
 // objects to this actual swept contact neighborhood.
 for(let index=0;index<30;index++)add(f,10+index,10000+index*1000,10000,{moving:true,speed:1});
 w.nativeShipSystems.collectShips(s,2);a.previousX=-40;
 for(const ship of [a,b,c])ship.cargo={good:5,tons:4,owner:ship.id};
 const before=[a,b,c].map(ship=>copy({cargo:ship.cargo,credits:ship.credits,hull:ship.hull,shields:ship.shields,task:ship.task}));
 w.nativeShipTraffic.collide(s,1/60);w.nativeSimulation.advance(s,.2);
 const counters=measure(f,()=>w.nativeShipTraffic.collide(s,.2));
 assert.ok(a.vx<100&&b.vx>0&&c.vx>0);assert.ok(counters.shipContactPairTests>=2);
 assert.ok((counters.shipContactGridCellsVisited||0)+(counters.shipContactDirectActorVisits||0)>0);
 assert.deepEqual([a,b,c].map(ship=>copy({cargo:ship.cargo,credits:ship.credits,hull:ship.hull,shields:ship.shields,task:ship.task})),before);
});

test('another system\'s large fast sweep cannot enlarge local physical pair searches',async()=>{
 async function run(remote){
  const f=await setup(),w=f.window,s=f.state,a=add(f,1,0,0,{speed:100}),b=add(f,2,40,0),c=add(f,3,80,0);
  if(remote){
   w.nativeShipDefinitions.register(9005,{name:'Remote sweep stress hull',dimensions:{width:20000,height:20000},movement:{maxSpeed:100000,acceleration:100000,braking:100000,turnRate:1}});
   add(f,900,1e7,1e7,{system:4,shipType:9005,moving:true,speed:50000});
  }
  a.previousX=-40;w.nativeShipTraffic.collide(s,1/60);w.nativeSimulation.advance(s,.2);
  const counters=measure(f,()=>w.nativeShipTraffic.collide(s,.2));
  return {counters,poses:[a,b,c].map(ship=>({x:ship.x,y:ship.y,vx:ship.vx,vy:ship.vy,hull:ship.hull,shields:ship.shields}))};
 }
 const local=await run(false),remote=await run(true);
 assert.deepEqual(remote.poses,local.poses,'only same-system physical bodies contribute to the response');
 assert.equal(remote.counters.shipContactPairCandidates,local.counters.shipContactPairCandidates);
 assert.equal(remote.counters.shipContactPairTests,local.counters.shipContactPairTests);
 assert.ok(remote.counters.shipContactDirectActorVisits>0,'the large isolated sweep uses bounded local-entry lookup');
});
