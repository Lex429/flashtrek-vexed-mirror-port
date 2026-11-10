const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const options={full:false,economic:false,regional:true,access:true,population:true,corridors:true,traffic:true};
const copy=v=>JSON.parse(JSON.stringify(v));
function course(f){const {state:s,window:w}=f,a=w.nativeManualFlight.planetPosition(1),b=w.nativeManualFlight.planetPosition(2),length=Math.hypot(b.x-a.x,b.y-a.y);Object.assign(s,{system:1,x:a.x,y:a.y,landed:false,manualTargetSystem:2,speed:427.5,vx:(b.x-a.x)/length*427.5,vy:(b.y-a.y)/length*427.5});f.lives.observeCourse(s,1,2);}
function until(f,predicate,seconds=180){for(let i=0;i<seconds*60&&!predicate();i++)f.step();assert.ok(predicate(),'Timed out at '+f.window.nativeSimulation.seconds(f.state));}
function free(f){const {state:s,ship:e,lives:l}=f;l.interrupt(s,e,'Idle crew fixture');Object.assign(e,{system:1,port:3,x:250,y:-60,phase:'docked',nextActionAt:9999,dockingVersion:1,cargo:null,oreHold:0});for(const key of ['localLeg','dockingMove','dockIntent','journey','travelResume'])delete e[key];l.invalidateMembership(s);l.initialize(s);}
function owned(f){const s=f.state,e=f.ship,l=f.lives.initialize(s);return copy({id:e.task?.id,phase:e.task?.phase,cargo:e.cargo,credits:e.credits,nextActionAt:e.nextActionAt,reservations:l.reservations});}

test('idle crews reserve real forecast ore, physically travel, retain their plan through turning/reload and consume one entitlement',async()=>{
 let f=await fixture(options);free(f);course(f);const initial=f.ship.credits,position={x:f.ship.x,y:f.ship.y};
 until(f,()=>!!f.ship.task?.requirements?.activity,5);const {ship:e,state:s,window:w}=f,job=copy(e.task),id=job.requirements.rockId;
 assert.equal(job.kind,'mining');assert.equal(job.requirements.activity.kind,'mining');assert.ok(w.nativeSolAsteroids.find(id,e.system));assert.equal(f.lives.initialize(s).reservations['rock:'+id].owner,e.id);assert.equal(e.credits,initial);assert.deepEqual({x:e.x,y:e.y},position);
 assert.ok(e.journey||job.phase==='mining-departure');const target=copy(job.requirements.activity.point),departure=job.requirements.departureAt;
 Object.assign(s,{vx:-s.vx,vy:-s.vy,manualTargetSystem:4});for(let i=0;i<180;i++)f.step();assert.deepEqual(copy(e.task.requirements.activity.point),target);assert.equal(e.task.requirements.departureAt,departure);
 const saved=copy(s),deadline=e.nextActionAt;f=await fixture({...options,saved});assert.equal(f.ship.task.id,job.id);assert.equal(f.ship.nextActionAt,deadline);assert.deepEqual(copy(f.ship.task.requirements.activity.point),target);
 until(f,()=>f.ship.phase==='mining',150);assert.equal(f.ship.system,job.requirements.miningSystem);assert.ok(Math.hypot(f.ship.x-f.window.nativeSolAsteroids.find(id,f.ship.system).x,f.ship.y-f.window.nativeSolAsteroids.find(id,f.ship.system).y)<=300);
 until(f,()=>f.ship.task.minedAt!==undefined,20);assert.equal(f.ship.mined,4);assert.equal(f.state.minedAsteroids.filter(x=>x===id).length,1);for(let i=0;i<120;i++)f.step();assert.equal(f.ship.mined,4);
});

test('forecast planning cannot replace an existing funded delivery or its escrow, owned cargo and deadline',async()=>{
 const f=await fixture(options);course(f);const destination=f.lives.market(f.state,2);destination.stock[5]=0;destination.target[5]=100;destination.credits=10000;
 const result=f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});assert.ok(result.ok);
 const before=owned(f);f.lives.advance(f.state,1/60);assert.deepEqual(owned(f),before);assert.deepEqual(copy(f.lives.activity(f.state).assignments),[]);
});

test('pause, map inspection and landed history do not dispatch activity jobs; same-clock refresh is bounded',async()=>{
 const f=await fixture(options);free(f);course(f);const before=owned(f);
 for(const mode of ['pause','map','landed']){f.window.nativePause.active=mode==='pause';f.window.nativeGalaxyMap={isOpen:mode==='map'};f.state.landed=mode==='landed';f.lives.advance(f.state,1/60);assert.equal(f.lives.activity(f.state),null);assert.deepEqual(owned(f),before);}
 f.window.nativePause.active=false;f.window.nativeGalaxyMap.isOpen=false;f.state.landed=false;f.lives.advance(f.state,1/60);const value=f.lives.activity(f.state);assert.equal(value.passes,1);assert.ok(value.assignments.length<=10);
 for(let i=0;i<100;i++)f.lives.advance(f.state,1/60);assert.equal(f.lives.activity(f.state).passes,1);const snapshot=f.lives.activity(f.state);snapshot.assigned.mining=999;snapshot.assignments.push({});assert.notEqual(f.lives.activity(f.state).assigned.mining,999);assert.ok(f.lives.activity(f.state).assignments.length<=10);
});

test('an interstellar disabled record remains discoverable and keeps its world position across observer coordinate frames and Continue',async()=>{
 const f=await fixture(options),{window:w,state:s,ship:e,lives:l}=f,site=w.nativeTravelCorridors.lanes().find(x=>x.from===1&&x.to===2).sites[3];free(f);Object.assign(e,{x:site.x,y:site.y,hull:20,shields:0});l.refreshLocation(s,e);l.interrupt(s,e,'disabled');
 assert.equal(e.interstellarContact,true);const point=copy(l.galaxyPosition(s,e)),a=w.nativeManualFlight.anchor(2);Object.assign(s,{system:2,x:point.x-a.x,y:point.y-a.y,landed:false});
 w.nativeSimulation.advance(s,.3);l.advance(s,.3);assert.equal(e.system,2);assert.equal(e.phase,'disabled');assert.ok(Math.hypot(l.galaxyPosition(s,e).x-point.x,l.galaxyPosition(s,e).y-point.y)<1e-6);assert.equal(w.nativeShipSystems.resolve(s,e.id,2).entity,e);
 const r=await fixture({...options,saved:copy(s)});assert.equal(r.ship.phase,'disabled');assert.ok(r.lives.queryTransits(r.state,{minX:point.x-20,minY:point.y-20,maxX:point.x+20,maxY:point.y+20}).some(e=>e.id===r.ship.id));
});

test('an ongoing medical response survives a coordinate-frame crossing with the same casualty, drones and supplies',async()=>{
 const f=await fixture({...options,repairs:true}),{window:w,state:s,ship:e,lives:l}=f,site=w.nativeTravelCorridors.lanes().find(x=>x.from===1&&x.to===2).sites[3];
 free(f);Object.assign(e,{x:site.x,y:site.y,hull:10,shields:0,repairDeuranium:0});l.refreshLocation(s,e);l.interrupt(s,e,'disabled');
 const medic=s.civilianTraffic.ships.find(x=>x.shipType===58);l.interrupt(s,medic,'Standby fixture');Object.assign(medic,{system:1,x:site.x-280,y:site.y,phase:'docked',repairDeuranium:200,nextActionAt:9999});l.refreshLocation(s,medic);
 Object.assign(s,{system:1,x:site.x,y:site.y+500,landed:false});until(f,()=>!!w.nativeShipRepairs.missionFor(s,w.nativeShipRepairs.ref('civilian',e)),40);
 const mission=w.nativeShipRepairs.missionFor(s,w.nativeShipRepairs.ref('civilian',e)),before={id:mission.id,droneIds:[...mission.drones],supplies:medic.repairDeuranium},patient=l.galaxyPosition(s,e),origin=w.nativeManualFlight.anchor(2);
 Object.assign(s,{system:2,x:patient.x-origin.x,y:patient.y-origin.y+500});for(let i=0;i<60;i++)f.step();
 assert.equal(e.system,2);assert.equal(medic.system,2);assert.equal(w.nativeShipRepairs.missionFor(s,w.nativeShipRepairs.ref('civilian',e))?.id,before.id);assert.deepEqual([...mission.drones],before.droneIds);assert.ok(medic.repairDeuranium<=before.supplies);
 const drones=medic.repairBay.slots.filter(d=>mission.drones.includes(d.id));assert.ok(drones.every(d=>d.system===2));assert.ok(Math.hypot(l.galaxyPosition(s,e).x-patient.x,l.galaxyPosition(s,e).y-patient.y)<1);
 until(f,()=>e.phase!=='disabled',90);assert.ok(e.hull>10);assert.ok(medic.repairDeuranium<before.supplies);
});

test('a medical ship already travelling to a casualty reaches it after the observer changes coordinate frames',async()=>{
 const f=await fixture({...options,repairs:true}),{window:w,state:s,ship:e,lives:l}=f,site=w.nativeTravelCorridors.lanes().find(x=>x.from===1&&x.to===2).sites[3];
 free(f);Object.assign(e,{x:site.x,y:site.y,hull:10,shields:0,repairDeuranium:0});l.refreshLocation(s,e);l.interrupt(s,e,'disabled');
 const medic=s.civilianTraffic.ships.find(x=>x.shipType===58),origin=w.nativeManualFlight.anchor(4);l.interrupt(s,medic,'Dispatch fixture');Object.assign(medic,{system:4,x:site.x-origin.x-4000,y:site.y-origin.y,phase:'docked',repairDeuranium:200,nextActionAt:9999});l.refreshLocation(s,medic);
 Object.assign(s,{system:1,x:site.x,y:site.y+500,landed:false});until(f,()=>medic.task?.kind==='medical',5);assert.ok(medic.journey||medic.travelResume);
 const call=copy(s.shipRepairs.calls.find(c=>c.target.id===e.id)),frame=w.nativeManualFlight.anchor(2);Object.assign(s,{system:2,x:site.x-frame.x,y:site.y-frame.y+500});
 until(f,()=>!!w.nativeShipRepairs.missionFor(s,w.nativeShipRepairs.ref('civilian',e)),120);assert.equal(e.system,2);assert.equal(medic.system,2);assert.equal(s.shipRepairs.calls.find(c=>c.target.id===e.id).id,call.id);
});

test('reserved prospect surveys can produce an ordinary armed dispute while retaining separate real ore claims',async()=>{
 const f=await fixture({...options,full:true}),{window:w,state:s,lives:l}=f,site=w.nativeTravelCorridors.lanes().find(x=>x.from===1&&x.to===2).sites[3],ids=w.nativeTravelCorridors.rockIds(site);
 const [a,b]=s.civilianTraffic.ships.filter(e=>e.shipType===47).slice(0,2);Object.assign(s,{system:1,x:site.x,y:site.y+500,landed:false});
 for(const [index,e] of [a,b].entries()){
  l.interrupt(s,e,'Prospect survey fixture');Object.assign(e,{system:1,x:site.x+index*160,y:site.y,phase:'holding',nextActionAt:9999,cargo:null,crewTraits:{version:1,caution:.3,aggression:.9}});
  e.task={id:'survey:'+e.id,kind:'mining',phase:'mining-survey',status:'active',origin:{system:1,port:3},destination:{system:1,port:1},requirements:{corridorSite:site.id,rockId:ids[index],workAt:9999,capacity:150}};e.miningRockSlot=ids[index];e.miningReservation=ids[index];l.initialize(s).reservations['rock:'+ids[index]]={owner:e.id,taskId:e.task.id};l.refreshLocation(s,e);
 }
 const life=l.initialize(s),before=copy(life.reservations);life.social={version:1,nextAt:0,cursor:0,conversations:0,disputes:0,seed:2000};l.social(s);
 assert.ok(s.civilianTraffic.disputes.some(d=>[d.a,d.b].includes(a.id)&&[d.a,d.b].includes(b.id)));assert.deepEqual(copy(life.reservations),before);
 until(f,()=>s.weaponCombat?.events.some(e=>[a.id,b.id].includes(e.sourceId)),12);assert.equal(a.cargo,null);assert.equal(b.cargo,null);for(const id of ids.slice(0,2))assert.deepEqual(copy(life.reservations['rock:'+id]),before['rock:'+id]);
});
