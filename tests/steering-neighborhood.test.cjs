const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=x=>JSON.parse(JSON.stringify(x)),ids=rows=>plain(rows.map(r=>String(r.id))).sort();
async function setup(){
 const f=await fixture({full:false,economic:false});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/civilian-population.js'),'utf8'),f.context);
 Object.assign(f.state,{system:2,x:0,y:10000,landed:false});f.state.civilianTraffic.population={version:1};f.state.civilianTraffic.ships=[];f.state.solEconomy.freighters=[];
 f.lives.initialize(f.state);return f;
}
function ship(id,x,y=10000){return {id,shipType:47,system:2,x,y,previousX:x,previousY:y,heading:0,speed:0,vx:0,vy:0,hull:100,shields:100,dimensions:{width:30,height:60},phase:'docked',lifeVersion:1,dockingVersion:1,credits:5000,cargo:null,recentEvents:[],homeBase:{system:2,port:0},task:{id:'test:'+id,kind:'idle',status:'active',phase:'idle',createdAt:0},nextActionAt:1e8};}
test('nearby controllers share one bounded canonical search per physical step, without describing a distant fleet repeatedly',async()=>{
 const f=await setup(),s=f.state,w=f.window,near=Array.from({length:12},(_,i)=>ship(i+1,(i-6)*40));
 s.civilianTraffic.ships=[...near,...Array.from({length:1000},(_,i)=>ship(i+1000,1000000+i*200))];f.lives.initialize(s);
 w.nativeShipSystems.countShips(s,2);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const boxes=near.map(e=>({system:2,minX:e.x-350,minY:e.y-350,maxX:e.x+350,maxY:e.y+350,predictSeconds:2,categories:['civilian']}));
 const results=boxes.map(box=>w.nativeShipSystems.neighborhood(s,box));
 const counters=w.nativeSimulationFrame.snapshot(s).counters;
 assert.equal(counters.steeringNeighborhoodBuilds,1);assert.equal(counters.steeringNeighborhoodReads,12);
 assert.ok(counters.shipPoseChecks<30,JSON.stringify(counters));
 for(let i=0;i<boxes.length;i++)assert.deepEqual(ids(results[i].bystanders),ids(w.nativeShipSystems.query(s,boxes[i]).bystanders));
 assert.equal(s.civilianTraffic.ships.length,1012);w.nativeSimulationFrame.end(s);
});
test('same-step motion, hull expansion, membership and the next clock update the bounded read model without changing old descriptor snapshots',async()=>{
 const f=await setup(),s=f.state,w=f.window,a=ship(1,0),b=ship(2,120),far=ship(3,10000);
 s.civilianTraffic.ships=[a,b,far];f.lives.initialize(s);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const box={system:2,minX:-350,minY:9700,maxX:350,maxY:10300,predictSeconds:2,categories:['civilian']};
 const first=w.nativeShipSystems.neighborhood(s,box),old=first.bystanders.find(e=>e.id===1);
 a.x=5000;a.previousX=5000;w.nativeShipSystems.refreshShip(s,a,'civilian',2);
 assert.equal(w.nativeShipSystems.neighborhood(s,box).bystanders.some(e=>e.id===1),false);assert.equal(old.x,0);
 far.x=1000;far.previousX=1000;far.dimensions={width:3000,height:60};w.nativeShipSystems.refreshShip(s,far,'civilian',2);
 let actual=w.nativeShipSystems.neighborhood(s,box);assert.ok(actual.bystanders.some(e=>e.id===3),'published wider geometry must enter an existing neighborhood');
 assert.deepEqual(ids(actual.bystanders),ids(w.nativeShipSystems.query(s,box).bystanders));
 const newcomer=ship(4,40);s.civilianTraffic.ships.push(newcomer);f.lives.initialize(s);
 actual=w.nativeShipSystems.neighborhood(s,box);assert.ok(actual.bystanders.some(e=>e.id===4));
 assert.deepEqual(ids(actual.bystanders),ids(w.nativeShipSystems.query(s,box).bystanders));
 w.nativeSimulation.advance(s,.1);w.nativeSimulationFrame.step(s);
 assert.deepEqual(ids(w.nativeShipSystems.neighborhood(s,box).bystanders),ids(w.nativeShipSystems.query(s,box).bystanders));
 w.nativeSimulationFrame.end(s);
});
test('moved and depleted rocks update the same neighborhood while ordinary raw-edit queries retain their independent validation',async()=>{
 const f=await setup(),s=f.state,w=f.window;await w.nativeSolAsteroids.ready;
 const rock=w.nativeSolAsteroids.placements[0],other=w.nativeSolAsteroids.placements[1],x=rock.x,y=rock.y;
 Object.assign(s,{system:1,x,y:y+500});w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const box={system:1,minX:x-100,minY:y-100,maxX:x+100,maxY:y+100,categories:['asteroid']};
 const old=w.nativeShipSystems.neighborhood(s,box).rocks.find(e=>e.rockId===rock.slotId);assert.ok(old);
 w.nativeSolAsteroids.relocate(rock,{x:x+10000,y,previousX:x+10000,previousY:y});w.nativeShipSystems.refreshAsteroid(s,rock);
 assert.equal(w.nativeShipSystems.neighborhood(s,box).rocks.some(e=>e.rockId===rock.slotId),false);assert.equal(old.x,x);
 w.nativeSolAsteroids.relocate(other,{x,y,previousX:x,previousY:y});w.nativeShipSystems.refreshAsteroid(s,other);
 assert.ok(w.nativeShipSystems.neighborhood(s,box).rocks.some(e=>e.rockId===other.slotId));
 s.minedAsteroids.push(other.slotId);w.nativeShipSystems.refreshAsteroid(s,other);
 assert.equal(w.nativeShipSystems.neighborhood(s,box).rocks.some(e=>e.rockId===other.slotId),false);
 assert.deepEqual(ids(w.nativeShipSystems.neighborhood(s,box).rocks),ids(w.nativeShipSystems.query(s,box).rocks));
 w.nativeSimulationFrame.end(s);
});
test('shared neighborhoods preserve instant versus swept contacts and leave raw-edit validation in ordinary queries',async()=>{
 const f=await setup(),s=f.state,w=f.window,a=ship(1,200);a.previousX=-200;
 s.civilianTraffic.ships=[a];f.lives.initialize(s);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const shared={querySwept:(_from,_to,_padding=0,{instant=false}={})=>w.nativeShipSystems.neighborhood(s,{system:2,minX:-20,minY:10000,maxX:20,maxY:10000,swept:!instant})},ordinary=w.nativeShipSystems.collisionScene(s,{system:2}),from={x:-20,y:10000},to={x:20,y:10000};
 assert.notEqual(shared,ordinary);
 const swept=shared.querySwept(from,to);assert.ok(swept.bystanders.some(t=>t.id===1));const old=swept.bystanders.find(t=>t.id===1);
 assert.equal(shared.querySwept(from,to,0,{instant:true}).bystanders.some(t=>t.id===1),false);
 a.x=0;a.previousX=0;
 assert.equal(shared.querySwept(from,to,0,{instant:true}).bystanders.some(t=>t.id===1),false,'unpublished raw edits require ordinary validation');
 assert.ok(ordinary.querySwept(from,to,0,{instant:true}).bystanders.some(t=>t.id===1));
 assert.ok(shared.querySwept(from,to,0,{instant:true}).bystanders.some(t=>t.id===1));assert.equal(old.x,200);
 a.x=120;a.previousX=120;w.nativeShipSystems.refreshShip(s,a,'civilian',2);
 assert.equal(shared.querySwept(from,to,0,{instant:true}).bystanders.some(t=>t.id===1),false);
 w.nativeSimulationFrame.end(s);
});
test('a committed-route sample publishes to an existing neighborhood and distant launched queries keep their own bounded search',async()=>{
 const f=await setup(),s=f.state,w=f.window,a=ship(1,0),far=ship(2,1000000);
 a.localLeg=w.nativeShipMotion.planLeg(a,{x:1000,y:10000},{maxSpeed:100,acceleration:100,braking:100,turnRate:1},0);a.phase='cruise';
 s.civilianTraffic.ships=[a,far];f.lives.initialize(s);
 w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 const options={system:2,minX:-50,minY:9950,maxX:50,maxY:10050},old=w.nativeShipSystems.neighborhood(s,options).bystanders.find(t=>t.id===1);assert.ok(old);
 a.localLeg.startedAt=-2;w.nativeShipMotion.sampleLeg(a,a.localLeg,w.nativeSimulation.seconds(s));assert.ok(a.x>100);
 w.nativeShipSystems.sampledShip(s,a,'civilian',2);
 assert.equal(w.nativeShipSystems.neighborhood(s,options).bystanders.some(t=>t.id===1),false);assert.equal(old.x,0);
 const before=w.nativeSimulationFrame.snapshot(s).counters.steeringNeighborhoodBuilds;
 const distant=w.nativeShipSystems.neighborhood(s,{system:2,minX:999950,minY:9950,maxX:1000050,maxY:10050});
 assert.ok(distant.bystanders.some(t=>t.id===2));assert.equal(w.nativeSimulationFrame.snapshot(s).counters.steeringNeighborhoodBuilds,before,'far launched contacts must not expand the active neighborhood through empty space');
 w.nativeSimulationFrame.end(s);
});
