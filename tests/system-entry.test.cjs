const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const setup=options=>fixture({full:false,economic:false,regional:true,access:true,population:true,corridors:true,traffic:true,...options});
const copy=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
const place=(f,p,frame=f.state.system)=>{const a=f.window.nativeManualFlight.anchor(frame);Object.assign(f.state,{system:frame,x:p.x-a.x,y:p.y-a.y,landed:false});};

test('the map boundary activates the destination immediately and preserves pose, velocity, cargo and physical debt',async()=>{
 const f=await setup(),{state:s,window:w}=f,m=w.nativeManualFlight,b=m.boundaries().find(b=>b.id===2),outside={x:b.x+b.rx+.01,y:b.y},inside={x:b.x+b.rx-.01,y:b.y};
 place(f,outside,1);m.initializeRegion(s);assert.equal(m.currentRegion(s).system,null);assert.equal(m.nearbySystem(s),null);
 Object.assign(s,{vx:-180,vy:37,speed:Math.hypot(180,37),angle:2.9,motionSpin:{version:1,mode:'free',velocity:.2},solFreightHold:{5:3.5}});w.nativeSimulationFrame.schedule(s).pendingSeconds=.123;
 place(f,inside,1);const position=m.position(s),goods=JSON.stringify(s.solFreightHold),reservations=JSON.stringify(s.civilianTraffic.life.reservations),spin=copy(s.motionSpin);
 assert.equal(m.nearbySystem(s).id,2);const change=m.advanceRegion(s);
 assert.equal(change.entered,true);assert.equal(s.system,2);assert.equal(s.manualFlightRegion.system,2);assert.equal(m.currentRegion(s).system,2);
 near(m.position(s).x,position.x);near(m.position(s).y,position.y);assert.equal(s.vx,-180);assert.equal(s.vy,37);assert.deepEqual(copy(s.motionSpin),spin);
 assert.equal(JSON.stringify(s.solFreightHold),goods);assert.equal(JSON.stringify(s.civilianTraffic.life.reservations),reservations);near(s.shipSimulation.schedule.pendingSeconds,.123);
 assert.ok(Math.hypot(s.x+220,s.y-75)>m.arrivalRadius*2,'Activation still waited for the planet');
 const serial=s.manualFlightRegion.sequence;for(let i=0;i<20;i++)assert.equal(m.advanceRegion(s),null);assert.equal(s.manualFlightRegion.sequence,serial);
 place(f,outside,2);assert.equal(m.advanceRegion(s).exited,true);assert.equal(s.manualFlightRegion.system,null);assert.equal(s.system,2,'Deep space keeps a valid coordinate frame');
 const restored=await setup({saved:copy(s)});restored.window.nativeManualFlight.initializeRegion(restored.state);assert.equal(restored.window.nativeManualFlight.currentRegion(restored.state).kind,'interstellar');
});

test('pause cannot activate another system and Romulus/Remus do not create duplicate physical entries',async()=>{
 const f=await setup(),{state:s,window:w}=f,m=w.nativeManualFlight;
 m.initializeRegion(s);const p=m.planetPosition(2);place(f,p,1);w.nativePause.active=true;assert.equal(m.advanceRegion(s),null);assert.equal(s.system,1);w.nativePause.active=false;
 assert.equal(m.advanceRegion(s).entered,true);
 Object.assign(s,{system:30,x:-220,y:75});m.initializeRegion(s);const sequence=s.manualFlightRegion.sequence;assert.equal(m.currentRegion(s).system,31);assert.equal(m.advanceRegion(s),null);assert.equal(s.system,30);assert.equal(s.manualFlightRegion.sequence,sequence);
});

test('unlinked free flight encounters persistent sparse asteroid cells without materializing the galaxy',async()=>{
 const f=await setup(),{window:w,state:s}=f,m=w.nativeManualFlight,p=w.nativeTravelCorridors,rocks=w.nativeSolAsteroids;
 assert.equal(p.linked(2,20),false);const a=m.planetPosition(2),b=m.planetPosition(20),seen=new Set(),before=p.metrics().sectorCells;
 p.lanes();p.sites(2);assert.equal(p.metrics().sectorCells,before,'Map metadata generated background rocks');
 for(let i=1;i<100;i++){const x=a.x+(b.x-a.x)*i/100,y=a.y+(b.y-a.y)*i/100;for(const rock of rocks.queryBounds(1,{minX:x-350,minY:y-280,maxX:x+350,maxY:y+280}))if(rock.sector)seen.add(rock.slotId);}
 assert.ok(seen.size>10,'The unlinked route is still empty');assert.ok(p.metrics().sectorCells<=512);
 const id=[...seen][0],r=rocks.find(id,1);assert.ok(Number.isSafeInteger(id)&&id>=p.sectorBase);
 assert.equal(w.nativeAsteroidCombat.autoTarget(s,{x:r.x,y:r.y},{cx:300,cy:225,zoom:1,w:600,h:450}).slotId,id,'Free-flight rocks are missing from ordinary auto targeting');
 const gone=w.nativeAsteroidCombat.completeMining(s,r);assert.equal(gone.ok,true);s.asteroidOreDrops[id]=5;
 const reload=await setup({saved:copy(s)}),restored=reload.window.nativeSolAsteroids.find(id,1);near(r.x,restored.x);near(r.y,restored.y);
 assert.ok(reload.state.minedAsteroids.includes(id));assert.equal(reload.state.asteroidOreDrops[id],5);assert.equal(reload.window.nativeAsteroidCombat.completeMining(reload.state,restored).ok,false);
 const original=copy(rocks.placements);p.ensureLane(2,20,s);assert.equal(p.linked(2,20),true);assert.deepEqual(copy(rocks.placements),original);
 const fresh=await setup({saved:copy(s)});assert.equal(fresh.window.nativeTravelCorridors.linked(2,20),true,'Saved additional lane disappeared on Continue');
});

test('observing a course retains existing paid work and only makes real funded offers available to free crews',async()=>{
 const f=await setup(),{window:w,state:s,lives:l,ship:e}=f;
 const buyer=l.market(s,20,0),source=l.market(s,2,0);buyer.stock[5]=0;buyer.target[5]=100;buyer.credits=10000;source.stock[5]=40;
 const before=copy({cargo:e.cargo,task:e.task,credits:e.credits,reservations:l.initialize(s).reservations});
 assert.equal(l.observeCourse(s,2,20),true);assert.deepEqual(copy({cargo:e.cargo,task:e.task,credits:e.credits,reservations:l.initialize(s).reservations}),before);
 assert.equal(s.civilianTraffic.life.corridorInterest.from,2);assert.equal(s.civilianTraffic.life.corridorInterest.to,20);
 assert.ok(w.nativeTravelCorridors.waypoints(2,20,w.nativeManualFlight.planetPosition(2),w.nativeManualFlight.planetPosition(20),s).length>10);
 assert.equal(l.observeCourse(s,2,32),false,'A prohibited system received traffic interest');assert.equal(s.civilianTraffic.life.corridorInterest,undefined);
});

test('destination preparation is bounded, uses shared artwork and never advances distant crews or simulation time',async()=>{
 const f=await setup(),{window:w,state:s,lives:l,ship:e}=f,m=w.nativeManualFlight,b=m.boundaries().find(b=>b.id===2);
 place(f,{x:b.x+b.rx+400,y:b.y},1);Object.assign(s,{vx:-100,vy:0,angle:Math.PI,speed:100});m.initializeRegion(s);
 l.interrupt(s,e,'preparation fixture');Object.assign(e,{system:2,phase:'holding',nextActionAt:100000});l.refreshLocation(s,e);w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'});
 const calls=[];let resolve;w.vexedFlightAssets.loadPlanet=id=>{calls.push({planet:id});return Promise.resolve({});};
 w.nativeShipEffects={...w.nativeShipEffects,stageReady:()=>false,request:(type,category,options)=>{calls.push({type,category,options});return new Promise(done=>{resolve=done;});}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/system-streaming.js'),'utf8'),f.context);
 const before=JSON.stringify({at:w.nativeSimulation.seconds(s),ship:{x:e.x,y:e.y,phase:e.phase,task:e.task,cargo:e.cargo,credits:e.credits},region:s.manualFlightRegion});
 for(let i=0;i<25;i++)w.nativeSystemStreaming.advance(s,.15);
 assert.equal(JSON.stringify({at:w.nativeSimulation.seconds(s),ship:{x:e.x,y:e.y,phase:e.phase,task:e.task,cargo:e.cargo,credits:e.credits},region:s.manualFlightRegion}),before);
 assert.equal(calls.filter(c=>c.type).length,1,'More than one speculative ship load was admitted together');assert.equal(calls.find(c=>c.type).options.prefetch,true);assert.equal(calls.find(c=>c.planet).planet,2);
 const metrics=w.nativeSystemStreaming.snapshot(s);assert.equal(metrics.system,2);assert.ok(metrics.queuedTypes<=6);assert.equal(s.system,1,'Preparation activated the destination before its border');
 const count=calls.length;w.nativeSystemStreaming.advance(s,100,{active:false});assert.equal(calls.length,count);resolve({});await new Promise(done=>setImmediate(done));
});

test('speculative artwork preparation requests the current shared plate without loading unused damage states',async()=>{
 const f=await setup(),w=f.window,loads=[];
 w.vexedFlightAssets.loadShip=async(type,hull)=>{loads.push({type,hull});return {art:{},profile:{},width:30,height:60};};
 const effects=w.nativeShipEffects.fork();assert.equal(effects.stageReady(7,0),false);
 await effects.request(7,'civilian',{stage:0,prefetch:true});await new Promise(done=>setImmediate(done));
 assert.equal(loads.length,1);assert.equal(effects.stageReady(7,0),true);assert.equal(effects.stageReady(7,1),false);assert.equal(effects.optionalReady(7),false);
 assert.equal(effects.metrics().deferredStages,0,'Prefetch flooded the shared queue with three unused damage plates');
});
