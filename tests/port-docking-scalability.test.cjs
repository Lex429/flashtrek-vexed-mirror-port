const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const reference=fs.readFileSync(path.join(__dirname,'fixtures/port-docking-d68a0f0.js'),'utf8');

async function world(rows,reservations={},legacy=false){
 const f=await fixture({full:false,economic:false}),template=f.ship;
 f.state.civilianTraffic.ships=rows.map(row=>({...template,id:row.id,name:'Port fixture '+row.id,system:2,port:0,
  x:1e6+row.id*1000,y:1e6,previousX:undefined,previousY:undefined,speed:0,vx:0,vy:0,localLeg:null,journey:null,
  lifeVersion:1,dockingVersion:1,task:null,nextActionAt:1e9,phase:'docked',dimensions:{width:40,height:80},
  shipEquipment:undefined,weaponLoadout:undefined,repairBay:undefined,...row}));
 f.state.portDocking={version:1,sequence:9000,ships:plain(reservations)};
 f.lives.initialize(f.state);
 if(legacy)vm.runInContext(reference,f.context,{filename:'port-docking-d68a0f0.js'});
 f.api=f.window.nativePortDocking;f.find=id=>f.lives.find(f.state,id);
 return f;
}

function scenario(){
 const rows=Array.from({length:52},(_,i)=>({id:100+i,system:i<42?1:2,port:i<36?3:i<41?4:i===41?9:0,
  dimensions:{width:35+(i%7)*30,height:90+(i%9)*35}}));
 rows.push({id:9001,system:1,port:3,x:700,y:400,dimensions:{width:950,height:170},heading:Math.PI/4},
  {id:9002,system:1,port:4,x:2100,y:-600,dimensions:{width:2500,height:30},phase:'disabled'},
  {id:9003,system:1,port:3,x:380,y:75,dimensions:{width:120,height:210},phase:'warp',scriptedDemo:true});
 return rows;
}

test('indexed allocation preserves exact d68 candidate order, nine terminals, FIFO, overflow and clearing choices',async()=>{
 const rows=scenario(),current=await world(rows),old=await world(rows,{},true);
 const apply=(name,id,...args)=>{
  const actual=current.api[name](current.state,current.find(id),...args),expected=old.api[name](old.state,old.find(id),...args);
  assert.deepEqual(plain(actual),plain(expected),`${name} civilian:${id}`);
  assert.deepEqual(plain(current.state.portDocking),plain(old.state.portDocking),`${name} preserves the complete saved port owner`);
 };
 for(const row of rows.slice(0,52))apply('request',row.id,row.system,row.port);
 assert.equal(current.api.inspect(current.state,current.find(135)).kind,'overflow');
 apply('park',100,1,3);apply('request',104,1,3);apply('parked',100);
 apply('request',127,1,3);apply('request',104,1,3);apply('release',101);apply('request',105,1,3);
 apply('inspect',110);apply('release',102);apply('park',103,1,3);apply('request',106,1,3);
 apply('request',107,1,3);apply('parked',103);apply('request',107,1,3);
 apply('park',104,1,3);apply('inspect',108);apply('parked',104);apply('request',108,1,3);
 for(const f of [current,old]){f.find(123).system=2;f.find(123).port=0;f.lives.refreshLocation(f.state,f.find(123));}
 apply('request',123,2,0);apply('relocate',123,2,0);apply('reconcile',123);
});

test('5000 same-port records retain bounded queue reads and local reservation/civilian candidates',async t=>{
 const count=5000,rows=Array.from({length:count},(_,i)=>({id:i+1})),reservations={};
 for(const row of rows)reservations['civilian:'+row.id]={owner:'civilian:'+row.id,system:2,port:0,
  x:1e6+row.id*1000,y:1e6,radius:45,ticket:row.id,kind:row.id<=4?'berth':row.id<=16?'queue':row.id%2?'parked':'overflow',...(row.id<=4?{slot:row.id-1}:{})};
 const f=await world(rows,reservations),api=f.api;
 // Prime the authoritative physical owner once; initialization may scale with population.
 f.window.nativeShipSystems.query(f.state,{system:2,minX:-100,minY:-100,maxX:100,maxY:100,categories:['civilian']});
 let distantReads=0;
 for(const row of rows.slice(16)){
  const record=f.state.portDocking.ships['civilian:'+row.id];
  for(const field of ['x','y','radius']){let value=record[field];Object.defineProperty(record,field,{enumerable:true,configurable:true,get(){distantReads++;return value;},set(next){value=next;}});}
 }
 const before=api.metrics(f.state);
 for(let i=0;i<20;i++){
  assert.equal(api.inspect(f.state,f.find(10)).queuePosition,6);
  assert.equal(api.request(f.state,f.find(10),2,0).kind,'queue');
 }
 const afterQueue=api.metrics(f.state);
 assert.equal(afterQueue.rebuilds,before.rebuilds);assert.equal(afterQueue.pointQueries,before.pointQueries);
 assert.equal(afterQueue.localEntries-before.localEntries,40*16,'only 12 queued and four occupied berth slots participate');
 const newcomer={...f.find(1),id:6000};const allocation=api.request(f.state,newcomer,2,0),after=api.metrics(f.state);
 assert.equal(allocation.kind,'overflow');assert.equal(after.rebuilds,before.rebuilds);
 assert.ok(after.pointCandidates-afterQueue.pointCandidates<5,'far reservation circles do not receive exact clearance tests');
 assert.ok(after.hullCandidates-afterQueue.hullCandidates<5,'far civilian hulls do not receive exact clearance tests');
 assert.ok(after.pointQueries-afterQueue.pointQueries<5);
 assert.equal(distantReads,0,'steady local allocation cannot resample the distant occupancy tail');
 t.diagnostic(JSON.stringify({records:count,localEntries:afterQueue.localEntries-before.localEntries,
  allocationQueries:after.pointQueries-afterQueue.pointQueries,reservationCandidates:after.pointCandidates-afterQueue.pointCandidates,
  hullCandidates:after.hullCandidates-afterQueue.hullCandidates}));
});

for(const count of [256,257])test(`${count}-member crowded allocation samples unchanged physical poses once while retaining exact rejected-candidate choices`,async t=>{
 const rows=Array.from({length:count},(_,i)=>({id:i+1}));
 Object.assign(rows[1],{x:0,y:0,dimensions:{width:2000,height:20}});
 Object.assign(rows[count-2],{hull:0,cargo:{good:5,tons:2.875,purchasedFor:46}});
 Object.assign(rows[count-1],{phase:'warp',scriptedDemo:true});
 const current=await world(rows),old=await world(rows,{},true),calls=new Map(),lives=current.lives,pose=lives.pose;
 const systems=current.window.nativeShipSystems,query=systems.query;let queryCalls=0;
 // Separate the required initial shared index census from the allocation itself.
 query(current.state,{system:2,minX:-1,minY:-1,maxX:1,maxY:1,categories:['civilian']});
 lives.pose=(state,ship)=>{calls.set(ship.id,(calls.get(ship.id)||0)+1);return pose(state,ship);};
 current.window.nativeShipSystems={...systems,query:(...args)=>{queryCalls++;return query(...args);}};
 const before=current.api.metrics(current.state),actual=current.api.request(current.state,current.find(1),2,0),after=current.api.metrics(current.state);
 const expected=old.api.request(old.state,old.find(1),2,0);assert.deepEqual(plain(actual),plain(expected));
 assert.ok(after.pointQueries-before.pointQueries>48,'the real allocator must reject several complete candidate rings');
 assert.ok([...calls.values()].every(n=>n===1),'overlapping rejected windows cannot resample an unchanged actor');
 assert.equal(calls.get(count-1),undefined,'a zero-hull legacy record cannot enter the ready physical snapshot');
 assert.equal(calls.get(count),1,'controlled warp anchors are included exactly once');
 if(count===256){assert.equal(queryCalls,0,'bounded local membership needs no repeated shared spatial queries');assert.equal(calls.size,count-2);}
 else{assert.ok(queryCalls>48,'large membership must continue using nearby shared searches');assert.equal(calls.size,2,'far actors are not sampled when windows overlap');assert.ok(after.hullCandidates-before.hullCandidates>48);}
 assert.equal(after.hullSamples-before.hullSamples,calls.size);
 t.diagnostic(JSON.stringify({members:count,candidateQueries:after.pointQueries-before.pointQueries,spatialQueries:queryCalls,physicalSamples:calls.size}));
});

test('large rotated and moving civilian hulls preserve the former circumscribed-circle clearance',async()=>{
 const rows=[{id:1},{id:2,x:1100,y:650,dimensions:{width:2300,height:35}}],current=await world(rows),old=await world(rows,{},true);
 const compare=()=>{
  const actual=current.api.request(current.state,current.find(1),2,0),expected=old.api.request(old.state,old.find(1),2,0);
  assert.deepEqual(plain(actual),plain(expected));
  for(const f of [current,old])f.api.release(f.state,f.find(1));return {x:actual.x,y:actual.y,radius:actual.radius};
 };
 const blocked=compare();assert.notEqual(blocked.y,0,'large circle must block the first candidate even outside the rotated thin hull');
 for(const heading of [Math.PI/4,Math.PI/2,Math.PI]){
  for(const f of [current,old]){const ship=f.find(2);ship.heading=heading;f.window.nativeShipSystems.refreshShip(f.state,ship,'civilian');}
  assert.deepEqual(plain(compare()),plain(blocked),'rotating a hull cannot shrink legacy parking clearance');
 }
 for(const f of [current,old]){const ship=f.find(2);ship.x=9000;ship.y=9000;f.window.nativeShipSystems.refreshShip(f.state,ship,'civilian');}
 const open=compare();assert.equal(open.y,0);
 for(const f of [current,old]){const ship=f.find(2);ship.x=open.x;ship.y=open.y;ship.phase='disabled';f.window.nativeShipSystems.refreshShip(f.state,ship,'civilian');}
 assert.notEqual(compare().y,0,'same-clock disabled physical blockers still own their clearance');
 for(const f of [current,old]){const ship=f.find(2);ship.phase='destroyed';f.window.nativeShipSystems.refreshShip(f.state,ship,'civilian');}
 assert.deepEqual(plain(compare()),plain(open),'destroyed physical members leave the spatial owner');
});

test('scheduled hull poses and legacy scripted warp anchors match the old choices',async()=>{
 const rows=[{id:1},{id:2,x:4000,y:0,dimensions:{width:140,height:300}},{id:3,x:470,y:0,phase:'warp',scriptedDemo:true}];
 const current=await world(rows),old=await world(rows,{},true);
 for(const f of [current,old]){
  const ship=f.find(2);ship.localLeg=f.window.nativeShipMotion.planLeg(ship,{x:470,y:0},{maxSpeed:100,acceleration:100,braking:100,turnRate:2},0);
  ship.nextActionAt=ship.localLeg.duration;f.lives.refreshLocation(f.state,ship);
  f.window.nativeSimulation.advance(f.state,ship.localLeg.duration);
 }
 const actual=current.api.request(current.state,current.find(1),2,0),expected=old.api.request(old.state,old.find(1),2,0);
 assert.deepEqual(plain(actual),plain(expected));assert.notEqual(actual.y,0);
 assert.equal(current.find(2).x,4000,'allocation samples a distant route without rewriting the saved actor');
 assert.ok(current.lives.controlled(current.state).includes(current.find(3)),'fixture exercises the retained scripted owner');
});

test('published edits, nested clearing, raw invalidation and reload keep port membership and spatial choices correct',async()=>{
 const rows=Array.from({length:18},(_,i)=>({id:100+i})),current=await world(rows),old=await world(rows,{},true);
 for(const f of [current,old])for(const row of rows)f.api.request(f.state,f.find(row.id),2,0);
 const compare=id=>assert.deepEqual(plain(current.api.inspect(current.state,current.find(id))),plain(old.api.inspect(old.state,old.find(id))));
 for(const f of [current,old]){const record=f.api.park(f.state,f.find(100),2,0);record.clearing.slot=3;record.clearing.x+=8000;record.ticket=-1;}
 compare(104);
 for(const f of [current,old]){delete f.state.portDocking.ships['civilian:103'];f.state.portDocking.ships['civilian:105'].ticket=-20;}
 compare(105);
 assert.deepEqual(plain(current.api.request(current.state,current.find(105),2,0)),plain(old.api.request(old.state,old.find(105),2,0)));
 // Retained raw aliases are explicitly notified, as with the shared fleet owner.
 const raw=plain(current.state.portDocking.ships),retainedRow=raw['civilian:104'],retainedClearing=raw['civilian:100'];current.state.portDocking.ships=raw;
 current.api.inspect(current.state,current.find(104));
 retainedRow.ticket=-100;old.state.portDocking.ships['civilian:104'].ticket=-100;
 retainedClearing.clearing={x:490,y:0,radius:900,slot:0};old.state.portDocking.ships['civilian:100'].clearing={x:490,y:0,radius:900,slot:0};
 current.api.invalidate(current.state);compare(104);
 for(let i=0;i<4;i++){current.api.invalidate(current.state);compare(104);}
 current.state.portDocking.ships['civilian:104'].ticket=500;old.state.portDocking.ships['civilian:104'].ticket=500;compare(104);
 for(const f of [current,old]){
  const stale=f.state.portDocking.ships['civilian:105'];f.state.portDocking.ships['civilian:105']={...plain(stale),ticket:-200,kind:'queue'};
  stale.kind='berth';stale.system=4;stale.clearing={x:460,y:0,radius:4000,slot:2};
 }
 compare(105);assert.deepEqual(plain(current.state.portDocking),plain(old.state.portDocking),'a detached observed row cannot resurrect its old membership or point');
 for(const f of [current,old])Object.defineProperty(f.state.portDocking.ships['civilian:104'],'ticket',{value:-500,enumerable:true,configurable:true,writable:true});
 current.api.invalidate(current.state);compare(104);
 const saved=plain(current.state),restored=await fixture({saved:plain(saved),economic:false});
 assert.deepEqual(plain(restored.state.portDocking),saved.portDocking,'JSON reload retains only the version-1 owner data');
 assert.deepEqual(plain(restored.window.nativePortDocking.inspect(restored.state,restored.lives.find(restored.state,104))),plain(current.api.inspect(current.state,current.find(104))));
 assert.deepEqual(plain(current.api.request(current.state,current.find(117),2,0)),plain(old.api.request(old.state,old.find(117),2,0)));
});

test('finite negative legacy reservation radii use a conservative broadphase without changing exact old clearance',async()=>{
 for(const clearing of [false,true]){
  const point={x:512,y:0,radius:-20},record={owner:'civilian:2',system:2,port:0,ticket:1,kind:'parked',
   ...(clearing?{x:1e6,y:1e6,radius:45,clearing:{...point,slot:1}}:point)},rows=[{id:1},{id:2}];
  const current=await world(rows,{'civilian:2':record}),old=await world(rows,{'civilian:2':record},true);
  const actual=current.api.request(current.state,current.find(1),2,0),expected=old.api.request(old.state,old.find(1),2,0);
  assert.deepEqual(plain(actual),plain(expected));assert.notEqual(actual.y,0);
  const saved=current.state.portDocking.ships['civilian:2'];assert.equal(clearing?saved.clearing.radius:saved.radius,-20,'query cannot normalize saved values');
 }
});

test('initializing-owner fallback retains old choices and inspection does not create saved occupancy',async()=>{
 const rows=[{id:1},{id:2,x:470,y:0,dimensions:{width:600,height:100}}],current=await world(rows),old=await world(rows,{},true);
 current.window.nativeNpcLives.ready=()=>false;
 assert.deepEqual(plain(current.api.request(current.state,current.find(1),2,0)),plain(old.api.request(old.state,old.find(1),2,0)));
 assert.ok(current.api.metrics(current.state).initialFallbacks>0);
 delete current.state.portDocking;
 assert.equal(current.api.inspect(current.state,current.find(1)),null);assert.equal(current.state.portDocking,undefined);
});

test('a zero-hull legacy ghost remains saved with cargo but is not an invisible physical berth blocker',async()=>{
 const f=await world([{id:1},{id:2,x:470,y:0,hull:0,phase:'docked',cargo:{good:5,tons:2.875,purchasedFor:46}}]),ship=f.find(2),before=plain(ship);
 const allocated=f.api.request(f.state,f.find(1),2,0);
 assert.equal(allocated.y,0,'zero-hull actors are excluded by the existing shared physical owner');
 assert.deepEqual(plain(ship),before,'allocation cannot destroy or normalize a record or its retained cargo');
 assert.equal(f.state.civilianTraffic.ships.length,2);
});
