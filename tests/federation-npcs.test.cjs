const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v)),root=path.join(__dirname,'../html-games/broken-mirror-port');
function install(f){for(const file of ['constitution-ships.js','federation-ships.js','federation-fleet.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context,{filename:file});f.lives.initialize(f.state);}

test('regular NPC generation includes every finished normal Federation hull without increasing fleet or medical totals',async()=>{
 const f=await fixture({federation:true,population:true,regional:true,access:true,repairs:true,corridors:true}),w=f.window,s=f.state;
 // Startup can commission a rare class through the same real berth queue.
 // Do not assume weighted initial slots alone contain every expanded class.
 for(let i=0;i<5400&&w.nativeFederationFleet.types.some(type=>!s.civilianTraffic.ships.some(e=>e.shipType===type));i++)f.step(1/60);
 const seen=new Set(s.civilianTraffic.ships.map(e=>e.shipType));
 for(const type of w.nativeFederationFleet.types)assert.ok(seen.has(type),'Missing ordinary NPC hull '+type);
 assert.equal(s.civilianTraffic.ships.length,1200);assert.equal(s.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 for(const e of s.civilianTraffic.ships.filter(e=>e.federationDutyVersion)){
  assert.ok(w.nativeFederationFleet.has(e.shipType));assert.equal(e.role,w.nativeFederationFleet.duty(e.shipType));
  assert.equal(Number(w.VexedMirrorWorld.systems.find(system=>system.id===(e.operatingBase??e.stationSystem)).governmentId),1);
 }
 assert.ok(!seen.has(426)&&!seen.has(427)&&!seen.has(414));
 // Real scheduled duties, rather than display-only copies of the hulls.
 for(let i=0;i<180;i++)f.step(.25);
 const patrols=s.civilianTraffic.ships.filter(e=>e.role==='patrol');
 assert.ok(patrols.some(e=>e.journey&&e.task?.requirements.fleetPatrol),'No saved patrol journey was dispatched');
 assert.ok(s.civilianTraffic.ships.some(e=>e.federationDutyVersion&&e.role==='freight'&&e.task),'Support hulls have no real work');
});

test('extending a version-one fleet ledger appends missing classes once without resetting assignments or issued assets',async()=>{
 const f=await fixture({population:true,regional:true,access:true,repairs:true,corridors:true}),s=f.state,w=f.window;
 for(const file of ['constitution-ships.js','federation-ships.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context,{filename:file});
 const source=fs.readFileSync(path.join(root,'federation-fleet.js'),'utf8');
 vm.runInContext(source.replace('id=>id!==58','id=>id<433&&id!==58').replace('rosterVersion:2,',''),f.context);
 const old=f.lives.initialize(s).federationFleet;old.assigned=7;old.commissioned=5;old.equipmentIssued=11;old.hullsIssued={33:2};
 const pending=[...old.pending],ships=JSON.stringify(s.civilianTraffic.ships),reservations=JSON.stringify(s.civilianTraffic.life.reservations);
 vm.runInContext(source,f.context);const ledger=f.lives.initialize(s).federationFleet;
 assert.equal(ledger,old);assert.equal(ledger.assigned,7);assert.equal(ledger.commissioned,5);assert.equal(ledger.equipmentIssued,11);assert.deepEqual(plain(ledger.hullsIssued),{33:2});
 assert.deepEqual(Array.from(ledger.pending).slice(0,pending.length),pending);assert.equal(ledger.rosterVersion,2);
 for(let type=433;type<=445;type++)assert.ok(ledger.pending.includes(type),'Missing new hull '+type);
 const queued=Array.from(ledger.pending);f.lives.initialize(s);assert.deepEqual(Array.from(ledger.pending),queued,'Repeated initialization duplicated queued hulls');
 assert.equal(JSON.stringify(s.civilianTraffic.ships),ships);assert.equal(JSON.stringify(s.civilianTraffic.life.reservations),reservations);
 function plain(value){return JSON.parse(JSON.stringify(value));}
});

test('installing NPC duty on an existing save queues refits while preserving paid jobs, owned cargo, poses and money',async()=>{
 const f=await fixture({population:true,regional:true,access:true,repairs:true,corridors:true}),s=f.state,w=f.window;
 const e=s.civilianTraffic.ships.find(e=>Number(e.ownerGovernmentId)===1&&!e.regionalResident&&e.hull>0&&!e.cargo&&!e.journey);
 assert.ok(e);const result=f.lives.startDelivery(s,e.id,{fromSystem:e.system,fromPort:e.system===1?e.port:0,toSystem:e.system===1?4:1,toPort:3,good:5,tons:2});assert.ok(result.ok,result.error);
 const fields=['id','name','shipType','system','x','y','hull','shields','credits','cargo','shipEquipment','task','journey','nextActionAt'];
 const before=s.civilianTraffic.ships.map(e=>Object.fromEntries(fields.map(k=>[k,copy(e[k]??null)]))),escrow=copy(f.lives.initialize(s).reservations);
 install(f);
 assert.equal(s.civilianTraffic.ships.length,1200);assert.equal(s.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 assert.ok(f.lives.initialize(s).federationFleet.pending.length>0);
 for(const old of before){const current=f.lives.find(s,old.id);for(const field of fields)assert.deepEqual(copy(current[field]??null),old[field],old.id+'/'+field);}
 assert.deepEqual(copy(f.lives.initialize(s).reservations),escrow);
 e.federationAssignment={version:1,type:38};const type=e.shipType,task=copy(e.task);
 for(let i=0;i<20;i++)f.step(1/60);
 assert.equal(e.shipType,type);assert.equal(e.task.id,task.id,'A funded task was interrupted by fleet commissioning');
 w.nativePause.active=true;const frozen=JSON.stringify(e);for(let i=0;i<10;i++)f.step(.25);assert.equal(JSON.stringify(e),frozen);
});

test('a free docked crew commissions once through shared hull fitting, retains gear and starts real patrols after Continue',async()=>{
 let f=await fixture({full:false,economic:false,repairs:true}),w=f.window,s=f.state,e=f.ship;
 s.civilianTraffic.population={version:1};install(f);f.lives.interrupt(s,e,'Free docked crew fixture');
 w.nativePortDocking.release(s,e);const berth=w.nativePortDocking.request(s,e,e.system,e.port);assert.equal(berth.kind,'berth');
 Object.assign(e,{x:berth.x,y:berth.y,phase:'docked',hull:w.nativeShipDefinitions.forEntity(s,e).hull,nextActionAt:w.nativeSimulation.seconds(s)});
 delete e.localLeg;delete e.dockingMove;e.federationAssignment={version:1,type:33};
 f.lives.refreshLocation(s,e);w.nativeShipEquipment.ensure(s,e);f.lives.invalidateMembership(s);f.lives.initialize(s);
 const oldIds=Object.keys(e.shipEquipment.instances),credits=e.credits,id=e.id,point={x:e.x,y:e.y};
 f.step(.1);
 assert.equal(e.shipType,33);assert.equal(e.id,id);assert.equal(e.credits,credits);assert.equal(e.x,point.x);assert.equal(e.y,point.y);
 for(const key of oldIds)assert.ok(e.shipEquipment.instances[key],'Owned gear was lost at commissioning');
 assert.equal(e.federationDutyVersion,1);assert.equal(e.federationAssignment,undefined);assert.equal(e.role,'patrol');
 assert.equal(w.nativeShipSystems.resolve(s,id)?.entity,e,'The hull is a real physical target');
 const commissioned=copy(f.lives.initialize(s).federationFleet),owned=Object.keys(e.shipEquipment.instances).sort();
 const saved=copy(s);f=await fixture({federation:true,full:false,economic:false,repairs:true,saved});w=f.window;s=f.state;e=f.lives.find(s,id);
 assert.equal(e.shipType,33);assert.deepEqual(Object.keys(e.shipEquipment.instances).sort(),owned);assert.deepEqual(copy(f.lives.initialize(s).federationFleet),commissioned);
 for(let i=0;i<2400&&!e.task?.requirements.fleetPatrol;i++)f.step(.1);
 assert.equal(e.task?.requirements.fleetPatrol,true,'Commissioned crew did not receive a real patrol task');
 assert.equal(f.lives.initialize(s).federationFleet.commissioned,1);
});

test('an existing crew approaches its refit berth and commissions before ordinary parking releases that berth',async()=>{
 const f=await fixture({full:false,economic:false,repairs:true}),w=f.window,s=f.state,e=f.ship;
 s.civilianTraffic.population={version:1};install(f);f.lives.interrupt(s,e,'Idle crew approaching fleet refit');
 e.hull=w.nativeShipDefinitions.forEntity(s,e).hull;e.federationAssignment={version:1,type:36};
 const start={x:e.x,y:e.y};
 for(let i=0;i<2400&&!e.federationDutyVersion;i++)f.step(.1);
 assert.equal(e.shipType,36,'Fleet refit was trapped in a berth/parking cycle: '+JSON.stringify({phase:e.phase,task:e.task?.phase,berth:w.nativePortDocking.inspect(s,e,false)}));
 assert.ok(Math.hypot(e.x-start.x,e.y-start.y)>1,'The crew must physically approach its port');
 assert.equal(f.lives.initialize(s).federationFleet.commissioned,1);
});
