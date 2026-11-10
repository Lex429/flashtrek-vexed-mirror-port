const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
async function setup(saved){
 const f=await fixture({saved,full:false,economic:false,traffic:true});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/civilian-population.js'),'utf8'),f.context);
 f.state.civilianTraffic.population={version:1};
 if(!saved){Object.assign(f.state,{system:2,x:0,y:0,hull:100,shields:100,landed:false});f.state.solEconomy.freighters=[];f.state.civilianTraffic.ships=[];}
 f.window.nativePlayerCombat={visualImpact:()=>{}};
 return f;
}
function add(f,{id=1,x=0,y=10000,system=2,goal,moving=!!goal}={}){
 const e={id,shipType:47,system,x,y,previousX:x,previousY:y,heading:0,speed:0,vx:0,vy:0,hull:100,shields:100,
  dimensions:{width:30,height:60},phase:moving?'cruise':'docked',lifeVersion:1,dockingVersion:1,credits:5000,cargo:{good:5,tons:4},recentEvents:[],homeBase:{system,port:0},
  task:{id:'test:'+id,kind:'idle',status:'active',phase:'idle',createdAt:0},nextActionAt:1e8};
 if(goal){e.localLeg=f.window.nativeShipMotion.planLeg(e,goal,{maxSpeed:100,acceleration:100,braking:100,turnRate:1000},f.window.nativeSimulation.seconds(f.state));e.nextActionAt=e.localLeg.startedAt+e.localLeg.duration;}
 f.state.civilianTraffic.ships.push(e);f.lives.initialize(f.state);return e;
}
test('production simulation uses the current chunk plus eight neighbors, including negative coordinates',async()=>{
 const f=await setup(),s=f.state,d=f.window.nativeShipDetail;
 let r=d.region(s);assert.equal(r.chunkSize,1024);assert.deepEqual(copy([r.minX,r.minY,r.maxX,r.maxY]),[-1024,-1024,2048,2048]);
 assert.equal(d.region(s),r);f.window.nativeSimulation.advance(s,10);assert.equal(d.region(s),r,'time and map reads cannot activate another area');
 s.x=-.01;s.y=-1024.01;r=d.region(s);assert.deepEqual(copy([r.chunkX,r.chunkY,r.minX,r.minY,r.maxX,r.maxY]),[-1,-2,-2048,-3072,1024,0]);
 assert.ok(d.contains(s,{x:-2048,y:-3072},2));assert.ok(!d.contains(s,{x:-2049,y:-3072},2));assert.ok(!d.contains(s,{x:0,y:0},4));
 s.x=1024;s.y=0;const next=d.region(s);assert.equal(next.chunkX,1);assert.ok(next.generation>r.generation);
 assert.ok(d.contains(s,{x:1024-450,y:0},2)&&d.contains(s,{x:1024+450,y:0},2),'buffer covers the uniformly scaled logical flight view at a boundary');
 delete s.civilianTraffic.population;assert.equal(d.region(s),null);assert.equal(d.radius(s),6500,'historical worlds retain their existing policy');
});
test('sleeping systems and distant same-system movers do no traffic/contact searches or artwork work',async()=>{
 const f=await setup(),s=f.state,w=f.window;Object.assign(s,{x:100000,y:100000});
 for(let i=0;i<1200;i++)add(f,{id:i+1,system:i%2?2:4,x:1000000+i*200,y:1000000,goal:{x:1001000+i*200,y:1000000}});
 const ships=copy(s.civilianTraffic.ships),loads=w.nativeShipEffects.metrics().loads,queries=[];
 const systems=w.nativeShipSystems;w.nativeShipSystems={...systems,query(state,box){queries.push(box);return systems.query(state,box);}};
 for(let frame=0;frame<60;frame++){w.nativeSimulation.advance(s,1/60);w.nativeShipTraffic.advance(s,1/60);w.nativeShipTraffic.collide(s,1/60);}
 assert.deepEqual(copy(s.civilianTraffic.ships),ships);assert.equal(w.nativeShipEffects.metrics().loads,loads);
 assert.ok(queries.every(box=>(box.system??s.system)===s.system),'no remote physical system is queried');
 assert.equal(w.nativeShipTraffic.snapshot(s).neighborChecks,0);assert.equal(w.nativeShipTraffic.snapshot(s).contacts.length,0);
 assert.equal(s.civilianTraffic.ships.length,1200);
});
test('waking a saved journey uses its current canonical pose and never sweeps an old cached position through a parked ship',async()=>{
 const f=await setup(),s=f.state,w=f.window;Object.assign(s,{x:-500,y:9500});
 const a=add(f,{x:-500,goal:{x:500,y:10000}}),b=add(f,{id:2,x:0});
 w.nativeShipTraffic.collide(s,1/60);
 Object.assign(s,{x:1000000,y:1000000});w.nativeSimulation.advance(s,30);w.nativeShipTraffic.advance(s,1/60);w.nativeShipTraffic.collide(s,1/60);
 const saved=copy(s),leg=copy(a.localLeg),before=copy({credits:a.credits,cargo:a.cargo,task:a.task,nextActionAt:a.nextActionAt});
 Object.assign(s,{x:0,y:9500});w.nativeShipTraffic.collide(s,1/60);
 const shown=w.nativeShipSystems.resolve(s,a.id,2);near(shown.x,500);near(shown.y,10000);
 assert.equal(w.nativeShipTraffic.snapshot(s).contacts.length,0);assert.equal(b.vx,0);assert.deepEqual(copy(a.localLeg),leg);
 assert.deepEqual(copy({credits:a.credits,cargo:a.cargo,task:a.task,nextActionAt:a.nextActionAt}),before);
 const g=await setup(saved);Object.assign(g.state,{x:0,y:10000});const restored=g.window.nativeShipSystems.resolve(g.state,a.id,2);
 near(restored.x,shown.x);near(restored.y,shown.y);assert.equal(g.state.civilianTraffic.ships.length,2);
});
test('a contact on the active-area edge still reaches the stationary physical chain beyond it',async()=>{
 const f=await setup(),s=f.state,w=f.window;Object.assign(s,{x:1023,y:10000});
 const a=add(f,{x:2032}),b=add(f,{id:2,x:2072}),c=add(f,{id:3,x:2112});
 Object.assign(a,{speed:100,vx:100,previousX:1992});f.lives.refreshLocation(s,a);
 w.nativeShipTraffic.collide(s,1/60);
 assert.ok(b.vx>0);assert.ok(Math.hypot(c.x-2112,c.y-10000)>.01,'connected blocker beyond the area receives physical displacement');
 for(const e of [a,b,c]){assert.equal(e.hull,100);assert.equal(e.shields,100);assert.equal(e.credits,5000);assert.equal(e.cargo.tons,4);}
});

test('an explicitly publishing custom pose owner can retain same-step reads while mutations still refresh its real geometry',async()=>{
 const f=await setup(),s=f.state,w=f.window;let calls=0;
 const e={id:'probe',system:2,x:0,y:10000,heading:0,hull:40,shields:0,phase:'launching',size:20};
 e.localLeg=w.nativeShipMotion.planLeg(e,{x:100,y:10000},{maxSpeed:20,acceleration:20,braking:20},0);
 const describe=()=>{calls++;return {id:e.id,category:'probe',entity:e,system:2,x:e.x,y:e.y,hull:e.hull,heading:0,dimensions:{width:e.size,height:e.size},radii:{rx:e.size/2,ry:e.size/2},definition:{}};};
 w.nativeShipSystems.register('probe',{collect:()=>[describe()],resolve:describe,retainedPose:true,hit:()=>({ok:true})});
 const query=()=>w.nativeShipSystems.query(s,{system:2,minX:-100,minY:9900,maxX:200,maxY:10100,categories:['probe']}).bystanders[0];
 const first=query(),initial=calls;assert.equal(query(),first);assert.equal(calls,initial,'same physical step must reuse the published pose');
 assert.equal(w.nativeShipSystems.resolve(s,e.id,2),first);assert.equal(calls,initial,'direct repair-style resolution must share the same published pose');
 e.hull=30;assert.equal(query().hull,30);assert.ok(calls>initial);
 e.size=70;w.nativeShipSystems.refreshShip(s,e,'probe',2);assert.equal(query().dimensions.width,70,'explicit nested geometry publication remains forceful');
 w.nativeSimulation.advance(s,.1);assert.notEqual(query(),first);assert.ok(query().x>first.x);
});
