const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const beforePose=ship=>({x:ship.x,y:ship.y,heading:ship.heading,system:ship.system,shipType:ship.shipType,speed:ship.speed,vx:ship.vx,vy:ship.vy});
async function setup(){
 const f=await tacticalFixture(),w=f.window,s=f.state,ship=s.civilianTraffic.ships[0];
 Object.assign(ship,{lifeVersion:1,dockingVersion:1,phase:'cruise',x:1e6,y:0,previousX:1e6,previousY:0,heading:0,speed:0,vx:0,vy:0,cargo:null,
  task:{id:'scheduled-cache',kind:'idle',status:'active',phase:'idle',origin:{system:1,port:3},destination:{system:1,port:3}},nextActionAt:1e9});
 ship.localLeg=w.nativeShipMotion.planLeg(ship,{x:1e6+1000,y:0},{maxSpeed:100,acceleration:100,braking:100,turnRate:1},0);
 w.nativeNpcLives.refreshLocation(s,ship);w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);
 return {...f,ship};
}
test('large empty queries reject stored conservative bounds before description work instead of scanning empty grid cells',async()=>{
 const {window:w,state:s}=await tacticalFixture(),systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 frames.begin(s);frames.step(s);systems.query(s,{minX:-1,minY:-1,maxX:1,maxY:1});const before=frames.snapshot(s).counters;
 for(let index=0;index<20;index++)assert.equal(systems.query(s,{minX:10000,minY:10000,maxX:20000,maxY:20000}).bystanders.length,0);
 const after=frames.snapshot(s).counters;assert.equal(after.shipDescriptorBuilds,before.shipDescriptorBuilds);assert.equal(after.spatialShipGridCells,before.spatialShipGridCells);
 assert.equal(after.spatialShipEntryQueries-(before.spatialShipEntryQueries||0),20);assert.ok(after.spatialShipEntryBounds-(before.spatialShipEntryBounds||0)<=60,'only the three existing physical bounds are examined per large empty query');frames.end(s);
});
test('unobserved scheduled poses retain conservative route membership and become current on every bounded read',async()=>{
 const f=await setup(),{window:w,state:s,ship}=f,systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 const initial=systems.query(s,{minX:1e6-50,minY:-50,maxX:1e6+50,maxY:50}).bystanders.find(target=>target.entity===ship),builds=frames.snapshot(s).counters.shipDescriptorBuilds;
 for(let index=1;index<=60;index++){
  frames.step(s);w.nativeSimulation.advance(s,1/60);const before=beforePose(ship);w.nativeShipMotion.sampleLeg(ship,ship.localLeg,w.nativeSimulation.seconds(s));systems.sampledShip(s,ship,'civilian',1,before);
 }
 assert.equal(frames.snapshot(s).counters.shipDescriptorBuilds,builds,'a route owner need not rebuild unobserved physical descriptions');
 const future=ship.x+ship.vx*20;assert.ok(systems.query(s,{minX:future-1,minY:-1,maxX:future+1,maxY:1,predictSeconds:20}).bystanders.some(target=>target.entity===ship),'forecast expansion follows rising sampled velocity even beyond the committed leg bounds');
 const current=systems.query(s,{minX:ship.x-1,minY:-1,maxX:ship.x+1,maxY:1}).bystanders.find(target=>target.entity===ship);
 close(current.x,ship.x);assert.ok(current.previousX<current.x);assert.equal(initial.x,1e6,'previously retained descriptions remain immutable');
 assert.equal(frames.snapshot(s).counters.shipSpatialBuilds,1);assert.ok(frames.snapshot(s).counters.shipPoseDeferrals>=60);
 frames.schedule(s).pendingSeconds=1/120;const rendered=frames.renderPose(s,current);assert.ok(rendered.x>=current.previousX&&rendered.x<=current.x);assert.equal(ship.x,current.x);frames.end(s);
});
test('a retained scene stays current while pose reuse avoids a second description and condition changes refresh immediately',async()=>{
 const f=await setup(),{window:w,state:s,ship}=f,systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 systems.query(s,{minX:ship.x-50,minY:-50,maxX:ship.x+50,maxY:50});frames.step(s);w.nativeSimulation.advance(s,.1);
 const scene=systems.scene(s),target=scene.bystanders.find(target=>target.entity===ship),builds=frames.snapshot(s).counters.shipDescriptorBuilds,before=beforePose(ship);
 w.nativeShipMotion.sampleLeg(ship,ship.localLeg,w.nativeSimulation.seconds(s));systems.sampledShip(s,ship,'civilian',1,before);
 assert.equal(systems.scene(s),scene);close(scene.bystanders.find(target=>target.entity===ship).x,ship.x);assert.equal(frames.snapshot(s).counters.shipDescriptorBuilds,builds);
 ship.shields=0;systems.sampledShip(s,ship,'civilian',1,beforePose(ship));const unshielded=scene.bystanders.find(target=>target.entity===ship);
 assert.equal(unshielded.shields,0);assert.ok(target.shields>0);assert.notEqual(unshielded,target);assert.equal(unshielded.radii,unshielded.hullRadii);
 w.nativeShipDefinitions.register(ship.shipType,{dimensions:{width:900,height:1200}});systems.sampledShip(s,ship,'civilian',1,beforePose(ship));
 assert.equal(scene.bystanders.find(target=>target.entity===ship).dimensions.width,900,'definition changes cannot reuse old route geometry');frames.end(s);
});
test('the NPC route owner copies an authoritative sampled pose including spin and kick without changing collisions or saved deadlines',async()=>{
 const f=await setup(),{window:w,state:s,ship}=f,systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 s.x=ship.x;s.y=ship.y;ship.motionKick={version:1,mode:'scheduled',at:0,x:0,y:0,vx:12,vy:7,duration:3};ship.motionSpin={version:1,mode:'scheduled',at:0,angle:.1,velocity:.3};
 w.nativeNpcLives.refreshLocation(s,ship);const deadline=ship.nextActionAt,leg=ship.localLeg;
 for(let index=0;index<20;index++){
  frames.step(s);w.nativeSimulation.advance(s,1/60);const at=w.nativeSimulation.seconds(s),expected={...ship};w.nativeShipMotion.sampleLeg(expected,leg,at);
  w.nativeCivilianTraffic.advance(s,1/60);close(ship.x,expected.x);close(ship.y,expected.y);close(ship.heading,expected.heading);close(ship.vx,expected.vx);close(ship.vy,expected.vy);
  const current=systems.resolve(s,ship.id);close(current.x,ship.x);close(current.y,ship.y);assert.equal(ship.localLeg,leg);assert.equal(ship.nextActionAt,deadline);
 }
 assert.ok(frames.snapshot(s).counters.shipPoseAcknowledgements>0);const saved=JSON.parse(JSON.stringify(s)),restored=await tacticalFixture({state:saved});
 const live=w.nativeNpcLives.pose(s,ship),loaded=restored.window.nativeNpcLives.pose(saved,restored.window.nativeNpcLives.find(saved,ship.id));close(live.x,loaded.x);close(live.y,loaded.y);frames.end(s);
});
test('unchanged committed route queries reuse hardware and exact previous poses while scalar upgrades and damage stay current',async()=>{
 const f=await setup(),{window:w,state:s,ship}=f,systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 ship.shipType=10;delete ship.shipEquipment;delete ship.weaponLoadout;systems.refreshShip(s,ship,'civilian');systems.query(s,{minX:ship.x-50,minY:-50,maxX:ship.x+50,maxY:50});const first=systems.resolve(s,ship.id),builds=frames.snapshot(s).counters.shipDescriptorBuilds;
 let previous=first;
 for(let index=0;index<20;index++){
  frames.step(s);w.nativeSimulation.advance(s,1/60);const at=w.nativeSimulation.seconds(s),expected={...ship};w.nativeShipMotion.sampleLeg(expected,ship.localLeg,at-1/60);
  const current=systems.resolve(s,ship.id);close(current.previousX,expected.x);close(current.previousY,expected.y);assert.equal(current.definition,first.definition);assert.equal(current.dimensions,first.dimensions);assert.ok(previous.x<=current.x);previous=current;
 }
 assert.equal(frames.snapshot(s).counters.shipDescriptorBuilds,builds);assert.ok(frames.snapshot(s).counters.shipPoseDescriptions>=20);
 const deadline=ship.nextActionAt;ship.tugEngineLevel=2;const upgraded=systems.resolve(s,ship.id);assert.ok(upgraded.definition.movement.maxSpeed>first.definition.movement.maxSpeed);assert.equal(ship.nextActionAt,deadline);
 ship.shields=0;const unshielded=systems.resolve(s,ship.id);assert.equal(unshielded.radii,unshielded.hullRadii);assert.ok(upgraded.shields>0);
 w.nativeShipEquipment.ensure(s,ship);systems.refreshShip(s,ship,'civilian');const fitted=systems.resolve(s,ship.id),eq=ship.shipEquipment,engine=eq.instances[eq.slots.engineering[0]];
 engine.upgrades.tugEngineLevel=1;const nested=systems.resolve(s,ship.id);assert.notEqual(nested.definition.movement.maxSpeed,fitted.definition.movement.maxSpeed);
 ship.motionKick={version:1,mode:'scheduled',at:0,x:0,y:0,vx:20,vy:0,duration:3};const kicked=systems.resolve(s,ship.id);assert.ok(kicked.x>nested.x);assert.ok(frames.snapshot(s).counters.shipDescriptorBuilds>builds);frames.end(s);
});
test('custom scheduled categories keep their own resolver geometry when extra configuration changes',async()=>{
 const f=await setup(),{window:w,state:s,ship}=f,systems=w.nativeShipSystems;let wide=false;
 const describe=()=>({...w.nativeShipDefinitions.describe(s,ship,{category:'station'}),id:'custom-station',dimensions:{width:wide?900:30,height:60}});
 systems.register('station',{collect:()=>[describe()],resolve:(_,id)=>id==='custom-station'?describe():null,hit:()=>({ok:true})});
 assert.equal(systems.query(s,{minX:ship.x-1,minY:-1,maxX:ship.x+1,maxY:1,categories:['station']}).bystanders[0].dimensions.width,30);
 wide=true;assert.equal(systems.resolve(s,'custom-station').dimensions.width,900,'a custom adapter is not eligible for built-in route geometry reuse');w.nativeSimulationFrame.end(s);
});
