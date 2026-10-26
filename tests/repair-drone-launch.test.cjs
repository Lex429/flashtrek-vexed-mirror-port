const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
async function setup(saved){
 const f=await fixture({full:false,economic:false,repairs:true,traffic:true,saved});
 if(!saved){Object.assign(f.state,{system:47,x:9000,y:9000,angle:.7,hull:10,shields:0,deuranium:100,phase:'disabled'});f.state.solEconomy.freighters=[];}
 f.repairs=f.window.nativeShipRepairs;return f;
}
function until(f,predicate){for(let i=0;i<30000&&!predicate();i++)f.step(1/60);assert.ok(predicate(),'flight stage did not finish');}

test('a disabled player DOT emerges from the hull, flies out and docks inside the same bay across reloads',async()=>{
 let f=await setup(),s=f.state;assert.equal(f.repairs.deployPlayer(s).ok,true);
 let d=s.repairBay.slots[0];const id=d.id,mission=s.shipRepairs.missions[0],bay=f.repairs.bayGeometry(f.repairs.pose(s,mission.carrier));
 near(d.x,bay.dock.x);near(d.y,bay.dock.y);
 assert.equal(d.localLeg.version,3);assert.equal(d.bayTransit.stage,'exit');
 near(d.localLeg.segments[0].goal.x,bay.exit.x);near(d.localLeg.segments[0].goal.y,bay.exit.y);
 const hatchDistance=Math.hypot(bay.dock.x-s.x,bay.dock.y-s.y),outsideDistance=Math.hypot(bay.exit.x-s.x,bay.exit.y-s.y);
 assert.ok(hatchDistance<outsideDistance-20);
 for(let i=0;i<12;i++)f.step(1/60);
 assert.ok(Math.hypot(d.x-bay.dock.x,d.y-bay.dock.y)>0);
 assert.ok(Math.hypot(d.x-bay.dock.x,d.y-bay.dock.y)<Math.hypot(bay.exit.x-bay.dock.x,bay.exit.y-bay.dock.y));
 assert.equal(s.hull,10);assert.equal(s.deuranium,100);
 const before={x:d.x,y:d.y};f=await setup(copy(s));s=f.state;d=s.shipEquipment.instances[id];
 near(d.x,before.x);near(d.y,before.y);assert.equal(d.bayTransit.stage,'exit');
 until(f,()=>d.phase==='repairing');assert.equal(d.bayTransit,undefined);
 until(f,()=>d.bayTransit?.stage==='enter');
 const recovery=f.repairs.bayGeometry(f.repairs.pose(s,s.shipRepairs.missions[0].carrier));
 near(d.localLeg.goal.x,recovery.dock.x);near(d.localLeg.goal.y,recovery.dock.y);
 const delayed=f.window.nativeShipMotion.routeLeg(d,recovery.dock,[],f.window.nativeShipDefinitions.get(9001).movement,f.window.nativeSimulation.seconds(s),.75);
 assert.equal(f.repairs.reroute(s,d,delayed),true);
 near(d.bayTransit.endsAt,delayed.startedAt+delayed.duration);
 f.step(1/60);assert.equal(d.phase,'returning');
 f=await setup(copy(s));s=f.state;d=s.shipEquipment.instances[id];
 until(f,()=>d.phase==='stowed');
 const dock=f.repairs.bayGeometry(f.repairs.pose(s,s.shipRepairs.missions[0].carrier)).dock;
 near(d.x,dock.x);near(d.y,dock.y);near(s.hull,50);near(s.deuranium,92);
 assert.equal(s.shipRepairs.missions[0].status,'completed');assert.equal(d.id,id);
});

test('same-mission maintenance craft use swept hull clearance near the bay and still avoid real collisions',async()=>{
 const f=await setup(),s=f.state,w=f.window;f.repairs.deployPlayer(s);
 const base=f.repairs.drones(s,s.system)[0],movement=base.definition.movement;
 const a={...base,x:0,y:0,previousX:0,previousY:0,vx:85,vy:0,heading:0,at:0,
  entity:{...base.entity,missionId:'repair:test',bayTransit:null,localLeg:{version:2,goal:{x:100,y:0}}}};
 const b={...base,id:'peer',x:25,y:8,previousX:25,previousY:8,vx:0,vy:0,
  entity:{...base.entity,id:'peer',missionId:'repair:test',bayTransit:null,localLeg:null}};
 assert.equal(w.nativeShipMotion.trafficAdvice(a,[b],movement),null);
 assert.ok(w.nativeShipMotion.trafficAdvice(a,[{...b,y:0,previousY:0}],movement),'A real crossing still requires avoidance');
 assert.ok(w.nativeShipMotion.trafficAdvice(a,[{...b,entity:{...b.entity,missionId:'another-mission'}}],movement),'Unrelated craft keep the ordinary traffic buffer');
});

test('bay passage permits only the equipped DOT and its actual carrier inside the short hatch corridor',async()=>{
 const f=await setup(),s=f.state,w=f.window;f.repairs.deployPlayer(s);
 const drone=f.repairs.drones(s,s.system)[0],carrier=f.repairs.pose(s,drone.entity.carrier);
 assert.equal(f.repairs.bayPassage(drone,carrier),true);
 assert.equal(w.nativeShipMotion.shipPairContact(drone,carrier,1/60),null);
 const other={...carrier,category:'civilian',id:999,entity:{...carrier.entity,id:999}};
 assert.equal(f.repairs.bayPassage(drone,other),false);
 assert.ok(w.nativeShipMotion.shipPairContact(drone,other,1/60),'Another hull must remain physical');
 assert.equal(f.repairs.bayPassage({...drone,x:drone.x+100,y:drone.y+100},carrier),false);
 drone.entity.bayTransit.endsAt=-1;assert.equal(f.repairs.bayPassage(drone,carrier),false);
});

test('Olympic DOTs depart in sequence from their carrier rather than appearing around the casualty',async()=>{
 const f=await setup(),s=f.state,w=f.window,medic=s.civilianTraffic.ships.find(e=>e.shipType===58);
 Object.assign(medic,{system:47,x:9300,y:9000,heading:-.4,phase:'docked',repairDeuranium:100,journey:null});
 const carrier=f.repairs.ref('civilian',medic),target=f.repairs.ref('player',s),mission=f.repairs.launch(s,carrier,target);
 assert.equal(mission.drones.length,6);
 const bay=f.repairs.bayGeometry(f.repairs.pose(s,carrier));
 for(const id of mission.drones){const d=medic.shipEquipment.instances[id];near(d.x,bay.dock.x);near(d.y,bay.dock.y);assert.equal(d.bayTransit.stage,'exit');}
 const visible=f.repairs.drones(s,47).filter(d=>d.entity.missionId===mission.id);
 assert.equal(visible.length,1);near(visible[0].x,bay.dock.x);near(visible[0].y,bay.dock.y);
 const second=medic.shipEquipment.instances[mission.drones[1]];assert.ok(second.localLeg.startedAt>mission.startedAt);
});

test('a delayed DOT departs from the current carrier position and unlaunched DOTs remain in their bays if supplies run out',async()=>{
 const f=await setup(),s=f.state,w=f.window;
 w.nativeShipEquipment.changeHull(s,58);Object.assign(s,{hull:330,phase:'flight'});
 const eq=w.nativeShipEquipment.ensure(s);for(let i=1;i<6;i++)w.nativeShipEquipment.grant(s,'basic-dot',{location:'slot',slot:i});
 f.repairs.deployPlayer(s);const m=s.shipRepairs.missions[0],second=eq.instances[m.drones[1]];
 const original={...second.localLeg.start};s.x+=100;s.y+=20;
 w.nativeSimulation.advance(s,.8);f.repairs.advance(s,.8);
 const current=f.repairs.bayGeometry(f.repairs.pose(s,m.carrier)).dock;
 near(second.localLeg.start.x,current.x);near(second.localLeg.start.y,current.y);
 assert.ok(Math.hypot(second.x-original.x,second.y-original.y)>90);assert.equal(second.bayTransit.waiting,undefined);
 s.deuranium=0;w.nativeSimulation.advance(s,.1);f.repairs.advance(s,.1);
 for(const id of m.drones.slice(2)){assert.equal(eq.instances[id].phase,'stowed');assert.equal(eq.instances[id].bayTransit,undefined);}
 assert.ok(!f.repairs.drones(s,47).some(d=>m.drones.slice(2).includes(d.id)));
});
