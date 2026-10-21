const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function setup(){
 const f=await fixture({full:false,economic:false,traffic:true});
 Object.assign(f.state,{system:2,x:10000,y:10000,previousX:10000,previousY:10000,speed:0,vx:0,vy:0,landed:false});
 f.state.civilianTraffic.ships=[];f.state.solEconomy.freighters=[];f.lives.initialize(f.state);return f;
}
function add(f,id,x,{y=0,system=2,speed=0,shields=100,category='civilian'}={}){
 const ship={id,shipType:47,system,x,y,previousX:x,previousY:y,heading:0,speed,vx:speed,vy:0,hull:100,shields,
  dimensions:{width:30,height:60},phase:'docked',lifeVersion:1,dockingVersion:1,credits:1200,cargo:null,oreHold:0,
  task:{id:'contact:'+category+':'+id,kind:'idle',status:'active',phase:'idle',origin:{system,port:0},destination:{system,port:0},requirements:{}},nextActionAt:1e9,recentEvents:[]};
 (category==='tug'?f.state.solEconomy.freighters:f.state.civilianTraffic.ships).push(ship);
 f.lives.initialize(f.state);return ship;
}
function frame(f,action){const w=f.window,s=f.state;w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);action();const counters=w.nativeSimulationFrame.snapshot(s).counters;w.nativeSimulationFrame.end(s);return counters;}
const owned=ship=>copy({id:ship.id,cargo:ship.cargo,credits:ship.credits,task:ship.task,shipEquipment:ship.shipEquipment});

test('six-second avoidance neighbors do not seed unrelated offscreen physical contact walks',async()=>{
 const f=await setup(),w=f.window,s=f.state,ship=add(f,1,-1000);
 ship.cargo=null;ship.phase='cruise';ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:1000,y:0},{maxSpeed:120,acceleration:120,braking:120,turnRate:1},0);
 ship.nextActionAt=ship.localLeg.duration;
 const future=[add(f,2,-700),add(f,3,-500),add(f,4,-300)];w.nativeNpcLives.refreshLocation(s,ship);
 let sawFuture=false;const original=w.nativeShipMotion;
 w.nativeShipMotion={...original,trafficAdvice(actor,neighbors,profile){if(actor.entity===ship)sawFuture||=neighbors.some(other=>future.includes(other.entity));return original.trafficAdvice(actor,neighbors,profile);}};
 w.nativeShipTraffic.collide(s,1/60);w.nativeSimulation.advance(s,.4);
 const before=future.map(owned),counters=frame(f,()=>{w.nativeShipTraffic.advance(s,.4);w.nativeShipTraffic.collide(s,.4);});
 assert.ok(sawFuture,'ordinary avoidance still perceives relevant future hulls');
 assert.equal(counters.shipContactNeighborhoods,1,'only the real offscreen mover seeds a physical neighborhood');
 assert.equal(counters.shipContactCandidates,1,'that actual sweep contains only the moving body');
 assert.equal(counters.shipContactPairTests||0,0);assert.deepEqual(future.map(owned),before);
});

test('narrow physical seeds preserve fast offscreen interception and connected momentum transfer',async()=>{
 const f=await setup(),w=f.window,s=f.state,a=add(f,1,0,{speed:100}),b=add(f,2,40),c=add(f,3,80);
 a.previousX=-40;for(const ship of [a,b,c])ship.cargo={good:5,tons:4};const before=[a,b,c].map(owned);
 const counters=frame(f,()=>w.nativeShipTraffic.collide(s,.4));
 assert.ok(a.vx<100&&b.vx>0&&c.vx>0,'stationary hulls intercept and transmit the physical impact');
 assert.ok(counters.shipContactPairTests>=2);assert.ok(counters.shipContactPairCandidates>=counters.shipContactPairTests);
 assert.deepEqual([a,b,c].map(owned),before);for(const ship of [a,b,c]){assert.equal(ship.hull,100);assert.equal(ship.shields,100);}
});

test('rotation-only offscreen actors remain physical with active or depleted shields',async()=>{
 for(const shields of [0,100]){
  const f=await setup(),w=f.window,s=f.state,a=add(f,1,0,{shields}),b=add(f,2,40,{y:10,shields});
  a.motionSpin={version:1,mode:'free',velocity:2};w.nativeNpcLives.refreshLocation(s,a);
  const start={x:b.x,y:b.y};const counters=frame(f,()=>w.nativeShipTraffic.collide(s,.2));
  assert.ok(counters.shipContactPairTests>0);assert.ok(b.x!==start.x||b.y!==start.y,'a rotating hull still resolves physical overlap');
  assert.equal(a.hull,100);assert.equal(b.hull,100);assert.equal(a.shields,shields);assert.equal(b.shields,shields);
 }
});

test('an actual funded job completing between physical polls retains its final sweep and escrow',async()=>{
 const f=await fixture({full:false,economic:false,traffic:true}),w=f.window,s=f.state,ship=f.ship;
 s.solEconomy.freighters=[];Object.assign(s,{system:4,x:10000,y:10000,speed:0,vx:0,vy:0});
 assert.equal(f.lives.startDelivery(s,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good:5,tons:4}).ok,true);
 assert.ok(ship.localLeg&&ship.task.phase==='pickup-flight');
 const deadline=ship.nextActionAt,goal={...ship.localLeg.goal};w.nativeShipTraffic.collide(s,1/60);
 w.nativeSimulation.advance(s,deadline-.1-w.nativeSimulation.seconds(s));w.nativeCivilianTraffic.advance(s,.01);w.nativeShipTraffic.collide(s,.2);
 const blocker=add(f,999,goal.x,{y:goal.y,system:1});blocker.cargo=null;
 w.nativeSimulation.advance(s,.11);w.nativeCivilianTraffic.advance(s,.11);
 assert.equal(ship.localLeg,undefined,'the real life owner completed and removed the scheduled leg');
 assert.equal(ship.task.phase,'loading');assert.equal(w.nativeNpcLives.mobile(s).includes(ship),false);
 w.nativeSimulation.advance(s,.1);
 const before=owned(ship),reservations=copy(f.lives.initialize(s).reservations),source=f.lives.market(s,1,3),buyer=f.lives.market(s,1,5),money=[source.credits,buyer.credits,source.fundsReserved,buyer.fundsReserved];
 const counters=frame(f,()=>w.nativeShipTraffic.collide(s,.1));
 assert.equal(counters.shipContactStoppedSweeps,1);assert.ok(counters.shipContactPairTests>0);
 assert.ok(Math.hypot(ship.x-blocker.x,ship.y-blocker.y)>1,'the late blocker resolves through shared physical contact');
 assert.deepEqual(owned(ship),before);assert.deepEqual(copy(f.lives.initialize(s).reservations),reservations);
 assert.deepEqual([source.credits,buyer.credits,source.fundsReserved,buyer.fundsReserved],money);
});

test('stopped tug retention resolves its namespaced body without borrowing a civilian identity',async()=>{
 const f=await setup(),w=f.window,s=f.state,tug=add(f,1,0,{system:1,speed:10,category:'tug'}),civilian=add(f,1,1e5,{system:1});
 w.nativeShipTraffic.collide(s,1/60);w.nativeSimulation.advance(s,.2);w.nativeShipTraffic.collide(s,.2);
 Object.assign(tug,{speed:0,vx:0,vy:0});w.nativeSolEconomy.invalidateMembership(s);w.nativeShipSystems.refreshShip(s,tug,'tug',1);
 const before=owned(civilian);w.nativeSimulation.advance(s,.2);
 const counters=frame(f,()=>w.nativeShipTraffic.collide(s,.2));
 assert.equal(counters.shipContactStoppedSweeps,1);assert.deepEqual(owned(civilian),before);
 w.nativeSimulation.advance(s,.2);const again=frame(f,()=>w.nativeShipTraffic.collide(s,.2));
 assert.equal(again.shipContactStoppedSweeps||0,0,'stopped bodies are retained for one physical poll');
});

test('a replacement body reusing an ID cannot inherit an old physical sweep',async()=>{
 const f=await setup(),w=f.window,s=f.state,old=add(f,1,0,{speed:10}),blocker=add(f,2,150);
 w.nativeShipTraffic.collide(s,1/60);w.nativeSimulation.advance(s,.2);w.nativeShipTraffic.collide(s,.2);
 const replacement={...copy(old),x:300,previousX:300,speed:20,vx:20};
 s.civilianTraffic.ships=[replacement,blocker];w.nativeNpcLives.initialize(s);w.nativeSimulation.advance(s,.2);
 const counters=frame(f,()=>w.nativeShipTraffic.collide(s,.2));
 assert.equal(blocker.x,150);assert.equal(blocker.vx,0);assert.equal(counters.shipContactPairTests||0,0);
 assert.equal(counters.shipContactStoppedSweeps||0,0);
});

test('the repair owner rejects a now-stowed drone from final-sweep retention',async()=>{
 const f=await fixture({full:false,economic:false,traffic:true,repairs:true}),w=f.window,s=f.state,carrier=f.ship;
 Object.assign(s,{system:2,x:10000,y:10000});s.solEconomy.freighters=[];
 carrier.hull=25;carrier.phase='disabled';carrier.repairDeuranium=20;
 const ref={category:'civilian',id:carrier.id,generation:carrier.lifeGeneration||0};
 const mission=w.nativeShipRepairs.launch(s,ref,ref,w.nativeSimulation.seconds(s));assert.ok(mission);
 w.nativeShipTraffic.collide(s,1/60);w.nativeSimulation.advance(s,.3);w.nativeShipTraffic.collide(s,.3);
 const drone=carrier.shipEquipment.instances[mission.drones[0]];assert.ok(w.nativeShipRepairs.drones(s).some(target=>target.entity===drone));
 drone.phase='stowed';w.nativeShipMotion.stop(drone);delete drone.localLeg;
 assert.equal(w.nativeShipSystems.resolve(s,drone.id,drone.system),null,'the registered owner is authoritative for stowing');
 w.nativeSimulation.advance(s,.2);const counters=frame(f,()=>w.nativeShipTraffic.collide(s,.2));
 assert.equal(counters.shipContactStoppedSweeps||0,0);assert.equal(drone.phase,'stowed');
});

test('5000 regional lives create real scheduled jobs while contact work follows physical actors',async()=>{
 const f=await fixture({full:true,regional:true,economic:true,traffic:true}),w=f.window,s=f.state,original=[...s.civilianTraffic.ships],templates=copy(original),start=w.nativeSimulation.seconds(s),next=Math.max(...original.map(ship=>ship.id))+1;
 for(let index=0;index<5000-original.length-s.solEconomy.freighters.length-1;index++){
  const ship=copy(templates[index%templates.length]),id=next+index,x=1e7+index*200,y=1e7;
  Object.assign(ship,{id,name:'Independent fixture '+id,x,y,previousX:x,previousY:y,heading:0,speed:0,vx:0,vy:0,phase:'docked',task:null,journey:null,
   lifeVersion:1,dockingVersion:1,nextActionAt:start+1+((index*37+4292026)%120)*.25});
  for(const key of ['localLeg','lifeLeg','dockingMove','motionKick','motionSpin','disputeId','retaliationId','combatAI','combatInterruption','scriptedDemo'])delete ship[key];
  const equipment=ship.shipEquipment;if(equipment){const remap=new Map(Object.keys(equipment.instances).map((old,slot)=>[old,'fixture:'+id+':'+slot]));equipment.instances=Object.fromEntries(Object.entries(equipment.instances).map(([old,item])=>[remap.get(old),{...item,id:remap.get(old)}]));equipment.owner='civilian:'+id+':0';for(const bank of Object.keys(equipment.slots))equipment.slots[bank]=equipment.slots[bank].map(old=>old?remap.get(old):null);equipment.locker=equipment.locker.map(old=>remap.get(old));}
  s.civilianTraffic.ships.push(ship);
 }
 s.civilianTraffic.nextId=next+5000;w.nativeNpcLives.initialize(s);Object.assign(s,{x:-100000,y:-100000,speed:0,vx:0,vy:0});
 let neighborhoods=0,seeds=0,queries=0;
 for(let step=0;step<180;step++){const counters=frame(f,()=>f.step());neighborhoods+=counters.shipContactNeighborhoods||0;seeds+=counters.shipContactActorSeeds||0;queries+=counters.spatialQueries||0;}
 assert.equal(s.civilianTraffic.ships.length+s.solEconomy.freighters.length+1,5000);
 assert.ok(s.civilianTraffic.ships.slice(0,original.length).every((ship,index)=>ship===original[index]),'the saved fleet owner identities remain present');
 const added=s.civilianTraffic.ships.slice(original.length),working=added.filter(ship=>ship.task&&ship.task.kind!=='idle');
 assert.ok(working.length>20,'the actual life scheduler selected useful regional jobs');assert.ok(added.some(ship=>ship.localLeg),'actual jobs created physical routes');
 assert.ok(neighborhoods<=seeds+100,'forecast-only stationary hulls do not become recursive contact seeds');
 assert.ok(neighborhoods>0&&queries>0);assert.equal(new Set(s.civilianTraffic.ships.map(ship=>ship.id)).size,s.civilianTraffic.ships.length);
 for(const reservation of Object.values(f.lives.initialize(s).reservations))assert.ok(w.nativeNpcLives.find(s,reservation.owner),'each reservation still belongs to its existing life');
});
