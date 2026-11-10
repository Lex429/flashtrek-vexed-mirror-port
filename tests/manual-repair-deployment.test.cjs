const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function setup(saved){
 const f=await fixture({full:false,economic:false,repairs:true,saved});
 if(!saved)Object.assign(f.state,{system:47,hull:35,shields:18,deuranium:20,latinum:1000,phase:'flight',x:500,y:500});
 f.repairs=f.window.nativeShipRepairs;return f;
}
function until(f,predicate){for(let i=0;i<1600&&!predicate();i++)f.step(.25);assert.ok(predicate(),'repair did not finish');}

test('manual deployment validates hull, fitted DOTs, supplies and travel without spending anything',async()=>{
 const f=await setup(),s=f.state,api=f.repairs,eq=f.window.nativeShipEquipment.ensure(s),id=eq.slots.repairDrone[0];
 assert.equal(api.deploymentStatus(s).ok,true);
 for(const [change,expected] of [[{hull:50},'Hull fully repaired'],[{hull:0},'Hull destroyed'],[{deuranium:0},'No repair deuranium'],[{localCruise:{to:3}},'Finish travelling']]){
  const before=Object.fromEntries(Object.keys(change).map(key=>[key,s[key]]));Object.assign(s,change);const state=JSON.stringify(s);
  const result=api.deployPlayer(s);assert.equal(result.ok,false);assert.ok(result.error.startsWith(expected),result.error);assert.equal(JSON.stringify(s),state);
  for(const [key,value] of Object.entries(before))if(value===undefined)delete s[key];else s[key]=value;
 }
 f.window.nativeShipEquipment.move(s,{category:'repairDrone',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length});
 assert.equal(api.deploymentStatus(s).error,'No DOTs equipped');
 f.window.nativeShipEquipment.move(s,{category:'repairDrone',fromType:'locker',fromIndex:eq.locker.indexOf(id),toType:'slot',toIndex:0});
 eq.instances[id].hull=0;assert.equal(api.deploymentStatus(s).error,'No operational DOTs');
});

test('manual repair launches physical owned DOTs, pauses, reloads and conserves hull material without disabling the ship',async()=>{
 let f=await setup(),s=f.state;const ids=Object.keys(s.shipEquipment.instances),before=s.deuranium;
 const result=f.repairs.deployPlayer(s);assert.equal(result.ok,true);assert.equal(result.drones,1);
 assert.equal(s.hull,35);assert.equal(s.deuranium,before);assert.equal(s.phase,'flight');
 assert.equal(s.shipRepairs.missions[0].manual,true);assert.equal(f.repairs.playerDronesDeployed(s),true);
 assert.equal(f.repairs.deployPlayer(s).ok,false);assert.equal(s.shipRepairs.missions.length,1);
 assert.equal(f.repairs.deploymentStatus(s).error,'Drones already deployed');
 f.window.nativeShipInventory.active=true;f.step(10);assert.equal(s.hull,35);assert.equal(s.deuranium,before);f.window.nativeShipInventory.active=false;
 until(f,()=>s.shipRepairs.missions[0].restoredHull>2);
 f=await setup(copy(s));s=f.state;
 until(f,()=>!f.repairs.playerDronesDeployed(s));
 assert.equal(s.hull,50);assert.equal(s.shields,18);assert.equal(s.phase,'flight');assert.equal(s.latinum,1000);
 assert.ok(Math.abs(s.deuranium-(before-3))<1e-6);assert.ok(Math.abs(s.shipRepairs.ledger.consumed-3)<1e-6);
 assert.equal(s.shipRepairs.missions[0].status,'completed');assert.equal(s.repairBay.slots[0].phase,'stowed');
 assert.deepEqual(Object.keys(s.shipEquipment.instances),ids);assert.equal(f.repairs.deploymentStatus(s).error,'Hull fully repaired');
});

test('manual repairs spend fractional reserves once and return safely without automatic relaunch or distress',async()=>{
 const f=await setup(),s=f.state;s.deuranium=.2;
 assert.equal(f.repairs.deployPlayer(s).ok,true);until(f,()=>!f.repairs.playerDronesDeployed(s));
 assert.ok(Math.abs(s.hull-36)<1e-6);assert.equal(s.deuranium,0);assert.equal(s.phase,'flight');
 assert.equal(s.shipRepairs.missions[0].status,'exhausted');assert.equal(s.shipRepairs.calls.length,0);
 for(let i=0;i<20;i++)f.step(.25);
 assert.equal(s.shipRepairs.missions.length,1);assert.equal(f.repairs.deploymentStatus(s).error,'No repair deuranium');
});

test('Manual is the default and prevents automatic player deployment even while disabled',async()=>{
 for(const phase of ['flight','disabled']){
  const f=await setup(),s=f.state;Object.assign(s,{hull:phase==='disabled'?10:35,phase});
  assert.equal(f.repairs.repairMode(s),'manual');
  const hull=s.hull,material=s.deuranium;
  for(let i=0;i<24;i++)f.step(.25);
  assert.equal(s.hull,hull);assert.equal(s.deuranium,material);
  assert.equal(f.repairs.playerDronesDeployed(s),false);assert.equal(s.shipRepairs.calls.length,0);
  assert.equal(f.repairs.deployPlayer(s,{automatic:true}).ok,false);
  assert.equal(f.repairs.deployPlayer(s).ok,true);
  until(f,()=>!f.repairs.playerDronesDeployed(s));assert.equal(s.hull,50);assert.equal(s.phase,'flight');
 }
});

test('engine repair permits immediate manual flight while optional hull recovery preserves owned drones and material',async()=>{
 const f=await setup(),s=f.state,w=f.window,eq=w.nativeShipEquipment.ensure(s),engine=eq.instances[eq.slots.engineering[0]];
 Object.assign(s,{hull:5,shields:0,phase:'disabled',speed:0,vx:0,vy:0,angle:0,minerals:{gallicite:10}});engine.condition=0;
 const ids=Object.keys(eq.instances),money=s.latinum,material=s.deuranium;
 const repaired=f.repairs.repairDevice(s,engine.id,{save:()=>({ok:true})});
 assert.ok(repaired.ok);assert.match(repaired.message,/Manual steering and thrust are available/);assert.equal(engine.condition,100);
 w.nativeShipSystems.move(s,s,'player',{manualFlight:true,throttle:1,turn:1},undefined,.1);
 assert.ok(s.speed>0);assert.ok(s.angle>0);assert.equal(s.hull,5);assert.equal(s.phase,'disabled');
 w.nativeShipSystems.move(s,s,'player',{manualFlight:true,brake:true},undefined,.2);
 const recovery=f.repairs.recoverPlayer(s);assert.ok(recovery.ok);assert.equal(f.repairs.repairMode(s),'manual');
 assert.ok(f.repairs.recoverPlayer(s).ok);assert.equal(s.shipRepairs.missions.length,1);
 assert.equal(s.phase,'disabled');assert.equal(s.hull,5);assert.equal(s.deuranium,material);
 until(f,()=>s.phase==='flight');assert.equal(f.repairs.playerDronesDeployed(s),false);
 assert.equal(s.hull,50);assert.equal(s.latinum,money);assert.ok(Math.abs(s.deuranium-(material-9))<1e-6);
 assert.deepEqual(Object.keys(eq.instances),ids);assert.equal(engine.condition,100);
 w.nativeShipSystems.move(s,s,'player',{throttle:1,turn:1},undefined,.1);
 assert.ok(s.speed>0);assert.ok(s.angle>0);
});

test('explicit recovery requests one saved medical call when supplies or fitted drones are unavailable',async()=>{
 for(const reason of ['supplies','drones']){
  let f=await setup(),s=f.state;Object.assign(s,{hull:10,phase:'disabled'});
  if(reason==='supplies')s.deuranium=0;
  else{
   const eq=f.window.nativeShipEquipment.ensure(s);
   f.window.nativeShipEquipment.move(s,{category:'repairDrone',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length});
  }
  const before={money:s.latinum,material:s.deuranium,ids:Object.keys(s.shipEquipment.instances)};
  const first=f.repairs.recoverPlayer(s),again=f.repairs.recoverPlayer(s);
  assert.ok(first.ok);assert.equal(first.callId,again.callId);assert.equal(s.shipRepairs.calls.length,1);assert.equal(s.shipRepairs.missions.length,0);
  f=await setup(copy(s));s=f.state;
  assert.equal(f.repairs.recoverPlayer(s).callId,first.callId);assert.equal(s.shipRepairs.calls.length,1);
  assert.equal(s.phase,'disabled');assert.equal(s.hull,10);assert.equal(f.repairs.repairMode(s),'manual');
  assert.deepEqual({money:s.latinum,material:s.deuranium,ids:Object.keys(s.shipEquipment.instances)},before);
 }
});

test('recovery clears a fully repaired stale disable flag without reviving a destroyed or unrepaired hull',async()=>{
 const f=await setup(),s=f.state;s.hull=50;s.phase='disabled';
 assert.ok(f.repairs.recoverPlayer(s).ok);assert.equal(s.phase,'flight');assert.equal(s.deuranium,20);
 s.phase='destroyed';s.hull=0;const before=JSON.stringify(s);
 assert.equal(f.repairs.recoverPlayer(s).ok,false);assert.equal(JSON.stringify(s),before);
});

test('distress eligibility reads actual repair shortage without changing hull, supplies or equipment',async()=>{
 const f=await setup(),s=f.state,api=f.repairs;
 assert.equal(api.playerDistressStatus(s).reason,'self-repair');
 s.deuranium=2;const before=JSON.stringify(s),status=api.playerDistressStatus(s);
 assert.equal(status.ok,true);assert.equal(status.needed,3);assert.equal(status.held,2);assert.equal(s.phase,'flight');
 assert.equal(JSON.stringify(s),before);
 s.deuranium=3;assert.equal(api.playerDistressStatus(s).ok,false);
 s.hull=50;s.deuranium=0;assert.equal(api.playerDistressStatus(s).reason,'healthy');
 s.hull=0;s.phase='destroyed';assert.equal(api.requestPlayerDistress(s).ok,false);
});

test('explicit distress persists once, survives Continue and retains the player fleet and materials',async()=>{
 let f=await setup(),s=f.state;s.deuranium=0;
 const before={money:s.latinum,hull:s.hull,ids:Object.keys(s.shipEquipment.instances),fleet:s.civilianTraffic.ships.map(e=>e.id)};
 let writes=0,saved;
 const first=f.repairs.requestPlayerDistress(s,{save(){writes++;saved=copy(s);return {ok:true};}});
 assert.ok(first.ok);assert.equal(saved.shipRepairs.calls[0].id,first.callId);assert.equal(saved.shipRepairs.calls[0].playerRequested,true);
 assert.equal(f.repairs.requestPlayerDistress(s,{save(){writes++;return {ok:true};}}).callId,first.callId);
 assert.equal(writes,1);assert.equal(s.shipRepairs.calls.length,1);assert.equal(s.shipRepairs.missions.length,0);
 f=await setup(saved);s=f.state;
 assert.equal(f.repairs.playerDistressStatus(s).pending,true);assert.equal(f.repairs.requestPlayerDistress(s).callId,first.callId);
 assert.equal(s.deuranium,0);assert.equal(s.phase,'flight');assert.equal(f.repairs.repairMode(s),'manual');
 assert.deepEqual({money:s.latinum,hull:s.hull,ids:Object.keys(s.shipEquipment.instances),fleet:s.civilianTraffic.ships.map(e=>e.id)},before);
});

test('a rejected distress save rolls the signal and scheduler back without broadcasting or charging',async()=>{
 const f=await setup(),s=f.state;s.deuranium=0;const before=JSON.stringify(s);
 const failed=f.repairs.requestPlayerDistress(s,{save:()=>({ok:false,error:'Storage unavailable'})});
 assert.equal(failed.ok,false);assert.equal(failed.error,'Storage unavailable');assert.equal(JSON.stringify(s),before);
 assert.equal(f.repairs.playerDistressStatus(s).ok,true);
});

test('Auto starts on ordinary hull damage, waits through pause and finishes after switching to Manual and reloading',async()=>{
 let f=await setup(),s=f.state;
 f.window.nativeShipInventory.active=true;
 assert.equal(f.repairs.setRepairMode(s,'auto').ok,true);
 f.step(10);assert.equal(f.repairs.playerDronesDeployed(s),false);
 f.window.nativeShipInventory.active=false;f.step(.25);
 const mission=s.shipRepairs.missions.find(m=>m.automatic);assert.ok(mission);assert.equal(s.phase,'flight');
 until(f,()=>mission.restoredHull>1);
 f.repairs.setRepairMode(s,'manual');
 f=await setup(copy(s));s=f.state;assert.equal(f.repairs.repairMode(s),'manual');
 until(f,()=>!f.repairs.playerDronesDeployed(s));assert.equal(s.hull,50);
 assert.ok(Math.abs(s.deuranium-17)<1e-6);assert.equal(s.shipRepairs.missions[0].status,'completed');
 s.hull=40;for(let i=0;i<24;i++)f.step(.25);
 assert.equal(s.hull,40);assert.equal(s.shipRepairs.missions.length,1);
 f.repairs.setRepairMode(s,'auto');f.step(.25);
 assert.equal(s.shipRepairs.missions.length,2);assert.equal(s.shipRepairs.missions[1].automatic,true);
 until(f,()=>!f.repairs.playerDronesDeployed(s));assert.equal(s.hull,50);
 assert.ok(Math.abs(s.deuranium-15)<1e-6);
 assert.equal(f.window.nativeShipEquipment.changeHull(s,58).ok,true);assert.equal(f.repairs.repairMode(s),'auto');
});

test('Auto preserves resource and equipment requirements and invalid mode changes preserve the save',async()=>{
 const f=await setup(),s=f.state;f.repairs.setRepairMode(s,'auto');s.deuranium=0;
 for(let i=0;i<12;i++)f.step(.25);
 assert.equal(s.hull,35);assert.equal(f.repairs.playerDronesDeployed(s),false);
 s.deuranium=20;const eq=f.window.nativeShipEquipment.ensure(s);
 assert.equal(f.window.nativeShipEquipment.move(s,{category:'repairDrone',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length}).ok,true);
 for(let i=0;i<12;i++)f.step(.25);
 assert.equal(s.hull,35);assert.equal(s.deuranium,20);assert.equal(f.repairs.playerDronesDeployed(s),false);
 const before=JSON.stringify(s);assert.equal(f.repairs.setRepairMode(s,'invalid').ok,false);assert.equal(JSON.stringify(s),before);
});
