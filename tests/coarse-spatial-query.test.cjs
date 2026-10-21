const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function setup(count=600){
 const f=await tacticalFixture(),w=f.window,s=f.state,template=copy(s.civilianTraffic.ships[0]);
 Object.assign(s,{x:-1e8,y:-1e8,previousX:-1e8,previousY:-1e8,speed:0,vx:0,vy:0});
 s.civilianTraffic.ships=Array.from({length:count},(_,index)=>{
  const x=40000+(index%30)*9000,y=40000+Math.floor(index/30)*9000;
  return {...copy(template),id:1000+index,system:1,x,y,previousX:x,previousY:y,heading:0,speed:0,vx:0,vy:0,
   hull:100,shields:100,phase:'docked',lifeVersion:1,dockingVersion:1,task:{id:'coarse:'+index,kind:'idle',status:'active',phase:'idle'},cargo:null,nextActionAt:1e9};
 });
 s.solEconomy.freighters=[];w.nativeNpcLives.initialize(s);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 return {...f,ships:s.civilianTraffic.ships,systems:w.nativeShipSystems,frames:w.nativeSimulationFrame};
}
function place(f,index,x,y,extra={}){const ship=f.ships[index];Object.assign(ship,{x,y,previousX:x,previousY:y},extra);f.systems.refreshShip(f.state,ship,'civilian',ship.system);return ship;}
const box=(x,y,r=1)=>({minX:x-r,minY:y-r,maxX:x+r,maxY:y+r});
const ids=result=>Array.from(result.bystanders,target=>target.id).filter(id=>id!=='player');
const counter=(f,name)=>f.frames.snapshot(f.state).counters[name]||0;
function changed(f,name,action){const before=counter(f,name),result=action();return {result,delta:counter(f,name)-before};}

test('fine, coarse and direct queries select bounded work without changing physical membership',async()=>{
 const f=await setup();place(f,0,10,10);
 const fine=changed(f,'spatialShipGridCells',()=>f.systems.query(f.state,box(10,10)));
 assert.equal(fine.delta,1);assert.deepEqual(ids(fine.result),[1000]);
 const beforeDirect=counter(f,'spatialShipEntryQueries'),coarse=changed(f,'spatialShipCoarseGridQueries',()=>f.systems.query(f.state,box(0,0,20000)));
 assert.equal(coarse.delta,1);assert.deepEqual(ids(coarse.result),[1000]);assert.equal(counter(f,'spatialShipEntryQueries'),beforeDirect);
 const direct=changed(f,'spatialShipEntryQueries',()=>f.systems.query(f.state,box(0,0,1e9)));
 assert.equal(direct.delta,1);assert.deepEqual(ids(direct.result),Array.from(f.ships,ship=>ship.id));
 assert.equal(counter(f,'shipSpatialBuilds'),1,'both resolutions share one persistent membership owner');f.frames.end(f.state);
});

test('coarse queries preserve former fine overflow/cell/bucket order and direct insertion order',async()=>{
 const f=await setup();place(f,0,700,0);place(f,1,0,700);place(f,2,0,0);place(f,3,10,10);place(f,4,4000,4000,{dimensions:{width:20000,height:20000}});
 const region={minX:-100,minY:-100,maxX:900,maxY:900},first=changed(f,'spatialShipCoarseGridQueries',()=>f.systems.query(f.state,region));
 assert.equal(first.delta,1);assert.deepEqual(ids(first.result),[1004,1002,1003,1001,1000]);
 const retained=first.result.bystanders.find(target=>target.id===1002);
 place(f,2,4000,0);place(f,2,0,0);
 assert.deepEqual(ids(f.systems.query(f.state,region)),[1004,1003,1002,1001,1000],'a fine-cell reinsertion retains its original bucket ordering');
 assert.equal(retained.x,0);assert.equal(retained.y,0);
 const broad=changed(f,'spatialShipCoarseGridQueries',()=>f.systems.query(f.state,box(0,0,20000)));
 assert.equal(broad.delta,1);assert.deepEqual(ids(broad.result),[1000,1001,1002,1003,1004]);f.frames.end(f.state);
});

test('coarse bucket neighbors outside their exact conservative boxes never trigger pose checks',async()=>{
 const f=await setup();place(f,0,10,10);
 for(let index=1;index<=50;index++)place(f,index,20300+index,100);
 f.systems.query(f.state,box(10,10));
 const checks=counter(f,'shipPoseChecks'),rejected=counter(f,'spatialShipBoundsRejects'),coarse=changed(f,'spatialShipCoarseGridQueries',()=>f.systems.query(f.state,box(0,0,20000)));
 assert.equal(coarse.delta,1);assert.deepEqual(ids(coarse.result),[1000]);assert.equal(counter(f,'shipPoseChecks')-checks,1);
 assert.ok(counter(f,'spatialShipBoundsRejects')-rejected>=50);f.frames.end(f.state);
});

test('a raw nearby pose change and custom scheduled geometry remain observable through the previous fine bucket',async()=>{
 const f=await setup(),ship=place(f,0,145,100),region={minX:0,minY:0,maxX:320,maxY:0};
 assert.ok(!ids(f.systems.query(f.state,region)).includes(ship.id));
 ship.y=0;const moved=changed(f,'spatialShipCoarseGridQueries',()=>f.systems.query(f.state,region));
 assert.equal(moved.delta,1);assert.ok(ids(moved.result).includes(ship.id));
 let wide=false;const station={id:'mutable-station',shipType:47,system:1,x:0,y:0,previousX:0,previousY:0,heading:0,speed:0,vx:0,vy:0,hull:100,shields:0,phase:'cruise'};
 station.localLeg=f.window.nativeShipMotion.planLeg(station,{x:1000,y:0},{maxSpeed:100,acceleration:100,braking:100,turnRate:1},0);
 const describe=()=>({...f.window.nativeShipDefinitions.describe(f.state,station,{category:'mutable-station'}),id:station.id,dimensions:{width:wide?900:30,height:60}});
 f.systems.register('mutable-station',{collect:()=>[describe()],resolve:(_,id)=>id===station.id?describe():null,hit:()=>({ok:true})});
 const old=f.systems.query(f.state,box(0,0)).bystanders.find(target=>target.id===station.id);assert.ok(old);
 assert.ok(!ids(f.systems.query(f.state,box(150,0))).includes(station.id));wide=true;
 assert.ok(ids(f.systems.query(f.state,box(150,0))).includes(station.id),'the custom owner can update geometry when the previous fine lookup would observe it');
 assert.equal(old.dimensions.width,30);f.frames.end(f.state);
});

test('fine/coarse boundary motion, destruction and system moves remove old memberships',async()=>{
 const f=await setup(),ship=place(f,0,4080,4080);
 const initial=f.systems.query(f.state,box(4080,4080)).bystanders.find(target=>target.entity===ship);assert.ok(initial);
 place(f,0,-4100,-4100);assert.ok(!ids(f.systems.query(f.state,box(4080,4080))).includes(ship.id));assert.ok(ids(f.systems.query(f.state,box(-4100,-4100))).includes(ship.id));
 ship.system=4;f.window.nativeNpcLives.refreshLocation(f.state,ship);
 assert.ok(!ids(f.systems.query(f.state,{system:1,...box(-4100,-4100,20000)})).includes(ship.id));
 assert.ok(ids(f.systems.query(f.state,{system:4,...box(-4100,-4100)})).includes(ship.id));
 ship.hull=0;ship.phase='destroyed';f.systems.refreshShip(f.state,ship,'civilian',4);
 assert.equal(f.systems.resolve(f.state,ship.id,4),null);assert.ok(!ids(f.systems.query(f.state,{system:4,...box(-4100,-4100,20000)})).includes(ship.id));
 assert.equal(initial.system,1);assert.equal(initial.hull,100);assert.equal(initial.x,4080);f.frames.end(f.state);
});

test('separate coarse overflow keeps very large hulls and long sweeps conservative',async()=>{
 const f=await setup();place(f,0,1e6,1e6,{dimensions:{width:1e7,height:1e7}});
 place(f,1,50000,0,{previousX:-50000,previousY:0,vx:100000});
 const broad=changed(f,'spatialShipCoarseGridQueries',()=>f.systems.query(f.state,box(0,0,20000)));
 assert.equal(broad.delta,1);assert.ok(ids(broad.result).includes(1000));assert.ok(ids(broad.result).includes(1001));
 const instant=f.systems.query(f.state,{...box(0,0),swept:false});assert.ok(ids(instant).includes(1000));assert.ok(!ids(instant).includes(1001));
 place(f,0,1e6,1e6,{dimensions:{width:30,height:60}});assert.ok(!ids(f.systems.query(f.state,box(0,0,20000))).includes(1000));
 f.frames.end(f.state);
});

test('coarse searches retain rotating shield surfaces, collapse and current first-hit interception',async()=>{
 const f=await setup(),w=f.window,s=f.state;Object.assign(s,{x:56,y:256,previousX:56,previousY:256});
 const blocker=place(f,0,256,306,{dimensions:{width:20,height:180},heading:Math.PI/2}),target=place(f,1,456,256);
 const source=f.systems.resolve(s,'player'),locked=f.systems.resolve(s,target.id),scene=f.systems.collisionScene(s);
 const hit=()=>w.nativeWeaponRules.firstContact({x:56,y:256},{x:506,y:256},source,locked,scene,locked.radii,locked.dimensions,0,{instant:true});
 assert.equal(hit().target.id,blocker.id,'the active near shield intercepts the selected target line');
 const old=f.systems.resolve(s,blocker.id);blocker.shields=0;f.systems.refreshShip(s,blocker,'civilian',1);
 assert.equal(f.systems.resolve(s,blocker.id).radii,f.systems.resolve(s,blocker.id).hullRadii);assert.equal(old.shields,100);
 place(f,0,256,306,{heading:0});assert.equal(hit().target.id,target.id,'rotation and depletion expose the current unobstructed target');
 place(f,0,256,256,{heading:Math.PI/2});assert.equal(hit().target.id,blocker.id);assert.ok(counter(f,'spatialShipCoarseGridQueries')>0);f.frames.end(s);
});

test('a fast ship entering the coarse firing query before resolution absorbs one real beam hit',async()=>{
 const f=await setup(),w=f.window,s=f.state;Object.assign(s,{x:100,y:100,previousX:100,previousY:100});
 const blocker=place(f,0,250,1000),target=place(f,1,400,400),source=f.systems.resolve(s,'player'),locked=f.systems.resolve(s,target.id);
 const before={blockerShield:blocker.shields,blockerHull:blocker.hull,targetShield:target.shields,targetHull:target.hull};
 const shot=w.nativeCombatShots.fireFor({state:s,shooter:source,target:locked});assert.equal(shot.ok,true);
 place(f,0,250,250,{previousY:-1000,vy:15000,speed:15000});
 const queries=counter(f,'spatialShipCoarseGridQueries');w.nativeSimulation.advance(s,.08);w.nativeCombatShots.advance(s,.08);
 assert.ok(blocker.shields<before.blockerShield,'the actual first physical ship absorbs shield damage');assert.equal(blocker.hull,before.blockerHull);
 assert.equal(target.shields,before.targetShield);assert.equal(target.hull,before.targetHull);assert.ok(counter(f,'spatialShipCoarseGridQueries')>queries);
 const health={shields:blocker.shields,hull:blocker.hull};w.nativeSimulation.advance(s,.02);w.nativeCombatShots.advance(s,.02);
 assert.deepEqual({shields:blocker.shields,hull:blocker.hull},health,'render tracking/next advance does not apply the same hit twice');f.frames.end(s);
});

test('route expiry, zero stored velocity, long prediction and rewinds refresh both spatial resolutions',async()=>{
 const f=await setup(),w=f.window,s=f.state,ship=place(f,0,0,0);
 ship.phase='cruise';ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:1e6,y:0},{maxSpeed:1000,acceleration:1000,braking:1000,turnRate:1},0);f.systems.refreshShip(s,ship,'civilian',1);
 f.systems.query(s,box(0,0));w.nativeSimulation.advance(s,.1);
 const pose={...ship};w.nativeShipMotion.sampleLeg(pose,ship.localLeg,.1);assert.equal(ship.vx,0);
 assert.ok(ids(f.systems.query(s,{...box(pose.x+pose.vx*6,0),predictSeconds:6})).includes(ship.id));
 w.nativeSimulation.advance(s,99.9);const late=f.systems.resolve(s,ship.id);s.shipSimulation.seconds=50;
 const rewound={...ship};w.nativeShipMotion.sampleLeg(rewound,ship.localLeg,50);
 assert.ok(ids(f.systems.query(s,box(rewound.x,rewound.y))).includes(ship.id));assert.equal(late.x,99500);
 const long=changed(f,'spatialShipLongForecastQueries',()=>f.systems.query(s,{...box(rewound.x+rewound.vx*20,0),predictSeconds:20}));
 assert.equal(long.delta,1);assert.ok(ids(long.result).includes(ship.id));assert.ok(counter(f,'spatialShipHorizonRefreshes')>0);f.frames.end(s);
});

test('same-length membership replacement and registered geometry changes cannot leave coarse ghosts',async()=>{
 const f=await setup(),ship=place(f,0,0,0);f.systems.query(f.state,box(0,0,20000));
 const replacement={...copy(ship),x:50000,y:50000,previousX:50000,previousY:50000};f.state.civilianTraffic.ships[0]=replacement;f.window.nativeNpcLives.initialize(f.state);f.systems.invalidateShips(f.state,1);
 assert.ok(!ids(f.systems.query(f.state,box(0,0,20000))).includes(ship.id));assert.equal(f.systems.resolve(f.state,replacement.id).entity,replacement);
 f.window.nativeShipDefinitions.register(replacement.shipType,{dimensions:{width:200000,height:200000}});f.systems.refreshShip(f.state,replacement,'civilian',1);
 assert.ok(ids(f.systems.query(f.state,box(0,0,20000))).includes(replacement.id),'definition expansion crosses coarse cells through the same registry');f.frames.end(f.state);
});
