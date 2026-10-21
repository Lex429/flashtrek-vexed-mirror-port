const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function setup(count=1){
 const f=await tacticalFixture(),w=f.window,s=f.state,template=copy(s.civilianTraffic.ships[0]),ships=[];
 for(let index=0;index<count;index++){
  const x=1e7+index*200,y=1e7,ship={...copy(template),id:index+100,system:1,x,y,previousX:x,previousY:y,heading:-Math.PI*3/4,speed:0,vx:0,vy:0,
   phase:'cruise',lifeVersion:1,dockingVersion:1,cargo:null,oreHold:0,task:{id:'route:'+index,kind:'idle',status:'active',phase:'idle'},nextActionAt:1e9};
  ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:0,y:0},{maxSpeed:100,acceleration:100,braking:100,turnRate:1},0);ships.push(ship);
 }
 s.civilianTraffic.ships=ships;s.solEconomy.freighters=[];w.nativeNpcLives.initialize(s);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 return {...f,ships,ship:ships[0],systems:w.nativeShipSystems,frames:w.nativeSimulationFrame};
}
function box(x,y,padding=1){return {minX:x-padding,minY:y-padding,maxX:x+padding,maxY:y+padding};}
function expected(f,at){const pose={...f.ship};f.window.nativeShipMotion.sampleLeg(pose,f.ship.localLeg,at);return pose;}

test('5000 long scheduled routes do not overflow every unrelated nearby collision query',async()=>{
 const f=await setup(5000),{window:w,state:s,systems,frames}=f;
 systems.query(s,box(0,0));const before=frames.snapshot(s).counters;
 for(let index=0;index<10;index++){w.nativeSimulation.advance(s,.05);frames.step(s);const result=systems.query(s,box(0,0));assert.equal(result.bystanders.filter(target=>target.category==='civilian').length,0);}
 const after=frames.snapshot(s).counters;
 assert.ok((after.spatialShipCandidates||0)-(before.spatialShipCandidates||0)<100,'distant complete routes do not enter local exact/temporal tests');
 assert.ok((after.spatialShipTemporalChecks||0)-(before.spatialShipTemporalChecks||0)<100);
 assert.equal(after.shipSpatialBuilds,before.shipSpatialBuilds,'expiry updates the existing grid rather than reconstructing the fleet');
 assert.ok(after.spatialShipHorizonRefreshes>=10000,'elapsed time refreshes every due moving envelope');
 assert.ok(after.spatialShipGridBoundsUpdates>before.spatialShipGridBoundsUpdates);
 assert.ok((after.spatialShipGridCellWrites||0)-(before.spatialShipGridCellWrites||0)<100000,'ordinary expiry does not reinsert six seconds of travel per ship');frames.end(s);
});

test('expiry is simulation-time based, exact at its boundary and retains immutable previous poses',async()=>{
 const f=await setup(),{window:w,state:s,ship,systems,frames}=f;
 const initial=systems.resolve(s,ship.id);systems.query(s,box(initial.x,initial.y));
 w.nativeSimulation.advance(s,.199);systems.query(s,box(initial.x,initial.y));assert.equal(frames.snapshot(s).counters.spatialShipHorizonRefreshes||0,0);
 w.nativeSimulation.advance(s,.001);const pose=expected(f,.2),current=systems.query(s,box(pose.x,pose.y)).bystanders.find(target=>target.entity===ship);
 assert.ok(current);near(current.x,pose.x);assert.ok(current.previousX>current.x);assert.equal(initial.x,1e7);
 const count=frames.snapshot(s).counters.spatialShipHorizonRefreshes;assert.equal(count,1);
 for(let index=0;index<10;index++)systems.query(s,box(pose.x,pose.y));assert.equal(frames.snapshot(s).counters.spatialShipHorizonRefreshes,count,'paused/unchanged-clock reads do not expire envelopes');frames.end(s);
});

test('forward and backward clock jumps refresh finite route bounds before candidate lookup',async()=>{
 const f=await setup(),{window:w,state:s,ship,systems,frames}=f;
 systems.query(s,box(ship.x,ship.y));w.nativeSimulation.advance(s,100);
 const pose=expected(f,100),current=systems.query(s,box(pose.x,pose.y)).bystanders.find(target=>target.entity===ship);assert.ok(current);near(current.x,pose.x);
 s.shipSimulation.seconds=.05;const prior=expected(f,.05),rewound=systems.query(s,box(prior.x,prior.y)).bystanders.find(target=>target.entity===ship);assert.ok(rewound);near(rewound.x,prior.x);
 assert.equal(current.x,pose.x,'a clock reset cannot rewrite a retained descriptor');frames.end(s);
});

test('rewind after direct resolution or full-scene preparation expires envelopes before the first later query',async()=>{
 for(const read of ['resolve','scene'])for(const initialQuery of [false,true]){
  const f=await setup(),{window:w,state:s,ship,systems,frames}=f;
  if(initialQuery)systems.query(s,box(ship.x,ship.y));
  w.nativeSimulation.advance(s,100);
  const at100=read==='resolve'?systems.resolve(s,ship.id):systems.scene(s).bystanders.find(target=>target.entity===ship);
  assert.ok(at100);s.shipSimulation.seconds=50;const pose=expected(f,50);
  const current=systems.query(s,box(pose.x,pose.y)).bystanders.find(target=>target.entity===ship);
  assert.ok(current,`${read} cannot hide the first query's clock reversal`);near(current.x,pose.x);assert.notEqual(current.x,at100.x);frames.end(s);
 }
});

test('verified route speed keeps six-second forecasts conservative while stored velocity is still zero',async()=>{
 const f=await setup(),{window:w,state:s,ship,systems,frames}=f;
 Object.assign(ship,{x:0,y:0,previousX:0,previousY:0,heading:0,speed:0,vx:0,vy:0});
 ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:1e6,y:0},{maxSpeed:1000,acceleration:1000,braking:1000,turnRate:1},0);systems.refreshShip(s,ship,'civilian',1);
 systems.query(s,box(0,0));w.nativeSimulation.advance(s,.1);const pose=expected(f,.1);
 assert.equal(ship.vx,0,'a distant owner has not been sampled');
 const current=systems.query(s,{...box(pose.x+pose.vx*6,0),predictSeconds:6}).bystanders.find(target=>target.entity===ship);
 assert.ok(current,'the verified speed band finds accelerated motion beyond the short stored envelope');near(current.x,pose.x);near(current.vx,pose.vx);
 const before={x:ship.x,y:ship.y,heading:ship.heading,system:ship.system,shipType:ship.shipType,speed:ship.speed,vx:ship.vx,vy:ship.vy};
 w.nativeShipMotion.sampleLeg(ship,ship.localLeg,.1);systems.sampledShip(s,ship,'civilian',1,before);
 w.nativeSimulation.advance(s,.05);const later=expected(f,.15);
 assert.ok(systems.query(s,{...box(later.x+later.vx*6,0),predictSeconds:6}).bystanders.some(target=>target.entity===ship),'pose notifications retain the route speed floor');frames.end(s);
});

test('six-second prediction and longer fallback use current authoritative velocity beyond committed route endpoints',async()=>{
 const f=await setup(),{window:w,state:s,ship,systems,frames}=f;
 Object.assign(ship,{x:0,y:0,previousX:0,previousY:0,heading:0,speed:1000,vx:1000,vy:0});
 ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:1e6,y:0},{maxSpeed:1000,acceleration:1000,braking:1000,turnRate:1},0);systems.refreshShip(s,ship,'civilian',1);
 systems.query(s,box(0,0));w.nativeSimulation.advance(s,.5);const pose=expected(f,.5);
 assert.ok(systems.query(s,{...box(pose.x+pose.vx*6,0),predictSeconds:6}).bystanders.some(target=>target.entity===ship),'expired horizon refresh precedes the six-second lookup');
 w.nativeSimulation.advance(s,ship.localLeg.duration-.6);const late=expected(f,w.nativeSimulation.seconds(s)),future=late.x+late.vx*20;
 assert.ok(future>ship.localLeg.goal.x);assert.ok(systems.query(s,{...box(future,0),predictSeconds:20}).bystanders.some(target=>target.entity===ship),'long prediction conservatively falls back beyond the finite envelope and route goal');
 assert.ok(frames.snapshot(s).counters.spatialShipLongForecastQueries>0);frames.end(s);
});

test('unsupported discontinuous routes and impulses retain whole-route conservative membership',async()=>{
 for(const mode of ['gap','kick','spin']){
  const f=await setup(),{window:w,state:s,ship,systems,frames}=f,part=ship.localLeg;
  if(mode==='gap')ship.localLeg={version:3,valid:true,startedAt:0,duration:part.duration*2+.1,start:part.start,goal:part.goal,segments:[part,{...copy(part),startedAt:part.duration+.1,start:{x:5e6,y:5e6}}]};
  if(mode==='kick')ship.motionKick={version:1,mode:'scheduled',at:0,x:0,y:0,vx:12,vy:7,duration:3};
  if(mode==='spin')ship.motionSpin={version:1,mode:'scheduled',at:0,angle:.1,velocity:.3};
  systems.refreshShip(s,ship,'civilian',1);systems.query(s,box(ship.x,ship.y));w.nativeSimulation.advance(s,.4);
  const pose=expected(f,.4);assert.ok(systems.query(s,box(pose.x,pose.y)).bystanders.some(target=>target.entity===ship));
  assert.equal(frames.snapshot(s).counters.spatialShipHorizonRefreshes||0,0,'unbounded/unsupported paths do not enter the finite-expiry index');frames.end(s);
 }
});

test('damage, fitted upgrades, geometry revisions and system changes replace only current route entries',async()=>{
 const f=await setup(),{window:w,state:s,ship,systems,frames}=f;
 ship.shipType=10;delete ship.shipEquipment;delete ship.weaponLoadout;systems.refreshShip(s,ship,'civilian',1);
 const first=systems.resolve(s,ship.id);ship.shields=0;systems.refreshShip(s,ship,'civilian',1);const bare=systems.query(s,box(ship.x,ship.y)).bystanders.find(target=>target.entity===ship);
 assert.equal(bare.radii,bare.hullRadii);assert.ok(first.shields>0);assert.notEqual(bare,first);
 const eq=w.nativeShipEquipment.ensure(s,ship),engine=eq.instances[eq.slots.engineering[0]];engine.upgrades.tugEngineLevel=2;systems.refreshShip(s,ship,'civilian',1);const upgraded=systems.resolve(s,ship.id);
 assert.ok(upgraded.definition.movement.maxSpeed>first.definition.movement.maxSpeed);assert.equal(first.definition.movement.maxSpeed,bare.definition.movement.maxSpeed);
 w.nativeShipDefinitions.register(10,{dimensions:{width:900,height:1200}});systems.refreshShip(s,ship,'civilian',1);assert.equal(systems.resolve(s,ship.id).dimensions.width,900);
 ship.system=4;w.nativeNpcLives.refreshLocation(s,ship);assert.ok(!systems.query(s,{system:1,...box(ship.x,ship.y)}).bystanders.some(target=>target.entity===ship));
 assert.ok(systems.query(s,{system:4,...box(ship.x,ship.y)}).bystanders.some(target=>target.entity===ship));assert.equal(first.system,1);frames.end(s);
});
