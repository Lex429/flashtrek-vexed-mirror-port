const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} / ${b}`);

test('short braking legs and holds obey the hull turn rate through every waypoint',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  const profile={maxSpeed:80,acceleration:100,braking:100,turnRate:.5},start={x:0,y:0,heading:Math.PI,speed:3,vx:3,vy:0};
  const route=m.routeLeg(start,{x:.1,y:.1},[{x:.1,y:0}],profile,0,.8),pose={...start};
  let previous=pose.heading;
  for(let at=.005;at<=route.duration+.005;at+=.005){m.sampleLeg(pose,route,at);assert.ok(Math.abs(m.wrap(pose.heading-previous))<=profile.turnRate*.005+1e-8,`heading snapped at ${at}`);previous=pose.heading;}
  near(pose.x,.1,'original destination X');near(pose.y,.1,'original destination Y');near(pose.speed,0,'arrival speed');
  const restored=copy(route),again={...start};m.sampleLeg(again,restored,route.duration);near(again.heading,pose.heading,'saved heading');
});

test('legacy short composite legs keep committed deadlines without snapping on completion',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion,profile={maxSpeed:80,acceleration:100,braking:100,turnRate:.5};
  const start={x:0,y:0,heading:Math.PI,speed:0},part=m.planLeg(start,{x:.1,y:0},profile,0);
  part.duration=part.travelSeconds;delete part.travelSeconds;delete part.turnRate;
  const next=m.planLeg({x:.1,y:0,heading:0,speed:0},{x:.2,y:0},profile,part.duration);
  const route={version:3,valid:true,start:{x:0,y:0},goal:{x:.2,y:0},startedAt:0,duration:part.duration+next.duration,segments:[part,next]},saved=JSON.stringify(route);
  const before={...start},after={...start};m.sampleLeg(before,route,part.duration-1e-6);m.sampleLeg(after,route,part.duration+1e-6);
  assert.ok(Math.abs(m.wrap(after.heading-before.heading))<=profile.turnRate*2e-6+1e-8);
  assert.equal(JSON.stringify(route),saved,'sampling does not migrate or mutate committed routes');
});

test('passing pilots keep useful maneuvers, respect turn rates, and reach original goals without repeated replanning',async()=>{
  const f=await fixture({full:false,economic:false,traffic:true}),w=f.window,s=f.state,m=w.nativeShipMotion;
  Object.assign(s,{system:2,x:10000,y:10000,hull:100,landed:false});s.solEconomy.freighters=[];s.civilianTraffic.ships=[];
  w.nativeNpcLives.initialize(s);
  const profile={maxSpeed:80,acceleration:100,braking:100,turnRate:1};w.nativeShipDefinitions.register(47,{movement:profile});
  const ships=[-500,500].map((x,index)=>{
    const e={id:10+index,shipType:47,system:2,x,y:0,heading:index?Math.PI:0,speed:0,vx:0,vy:0,hull:100,shields:0,phase:'cruise',dimensions:{width:30,height:60},
      lifeVersion:1,dockingVersion:1,credits:5000,cargo:null,task:{id:'passing:'+index,kind:'idle',status:'active',phase:'idle'},nextActionAt:1e8};
    e.localLeg=m.planLeg(e,{x:-x,y:0},profile,0);s.civilianTraffic.ships.push(e);return e;
  });
  w.nativeNpcLives.initialize(s);for(const e of ships)e.cargo={good:5,tons:2};w.nativeShipSystems.invalidateShips(s);
  let minimum=Infinity;const headings=ships.map(e=>e.heading);
  for(let n=0;n<1600;n++){
    w.nativeSimulation.advance(s,.025);w.nativeShipTraffic.advance(s,.025);
    ships.forEach((e,index)=>{m.sampleLeg(e,e.localLeg,w.nativeSimulation.seconds(s));assert.ok(Math.abs(m.wrap(e.heading-headings[index]))<=profile.turnRate*.025+1e-6,'physical heading discontinuity');headings[index]=e.heading;w.nativeShipSystems.refreshShip(s,e,'civilian',2);});
    w.nativeShipTraffic.collide(s,.025);minimum=Math.min(minimum,Math.hypot(ships[0].x-ships[1].x,ships[0].y-ships[1].y));
  }
  near(ships[0].x,500,'first original goal');near(ships[1].x,-500,'second original goal');
  assert.ok(minimum>50,`passing clearance ${minimum}`);assert.equal(w.nativeShipTraffic.snapshot(s).contacts.length,0);
  assert.ok(w.nativeShipTraffic.snapshot(s).plans<=8,`unnecessary replanning ${w.nativeShipTraffic.snapshot(s).plans}`);
  for(const e of ships)assert.equal(e.cargo.tons,2);
});

async function repairFixture(saved,traffic=false){
  const f=await fixture({full:false,economic:false,repairs:true,saved,traffic}),s=f.state,w=f.window;
  if(!saved){
    Object.assign(s,{system:47,x:10000,y:10000,landed:false});s.solEconomy.freighters=[];
    for(const e of s.civilianTraffic.ships){e.nextActionAt=null;e.lifeScheduleToken++;delete e.localLeg;delete e.journey;e.system=4;}
    Object.assign(f.ship,{system:47,x:10000,y:10000,heading:.4,speed:0,vx:0,vy:0,hull:10,shields:0,phase:'disabled',repairDeuranium:30,cargo:{good:5,tons:2}});
    w.nativeShipRepairs.observe(s,f.ship,'civilian');
  }
  f.repair=w.nativeShipRepairs;
  f.tick=(dt=.05)=>{w.nativeSimulation.advance(s,dt);f.repair.advance(s,dt);};return f;
}

test('Dots emerge from a definition bay, remain close to drifting rotating armor, and return with owned state intact',async()=>{
  let f=await repairFixture(),{window:w,state:s,ship:e,repair:r}=f;
  const slot=e.repairBay.slots[0];slot.hull=17;slot.readyAt=123;
  const ids=copy(e.repairBay.slots.map(d=>d.id)),before=r.bayPoint(r.pose(s,r.ref('civilian',e)));
  const mission=r.launch(s,r.ref('civilian',e),r.ref('civilian',e));assert.ok(mission);
  near(slot.x,before.x,'configured bay X');near(slot.y,before.y,'configured bay Y');
  assert.ok(w.nativeShipDefinitions.get(r.rules.basicType,'repair-drone').dimensions.height<11.7);
  for(let n=0;n<400&&!e.repairBay.slots.every(d=>d.phase==='repairing');n++)f.tick();
  assert.ok(e.repairBay.slots.every(d=>d.phase==='repairing'),'all launched craft reach the armor');
  for(let n=0;n<120;n++){
    e.x+=.12;e.y+=.04;e.heading=w.nativeShipMotion.wrap(e.heading+.008);w.nativeShipSystems.refreshShip(s,e,'civilian',47);f.tick();
    const target=r.pose(s,r.ref('civilian',e));
    for(const d of e.repairBay.slots){const station=r.stationPoint(target,d),point=r.workPoint(target,d);assert.ok(Math.hypot(d.x-station.x,d.y-station.y)<1,'working craft follows current armor pose');assert.ok(Math.hypot(d.x-point.x,d.y-point.y)<5,'welding stays close to actual hull');}
  }
  near(mission.restoredHull,mission.spent*r.rules.hullPerTon,'repair material accounting');
  const g=await repairFixture(copy(s));f=g;w=f.window;s=f.state;e=f.ship;r=f.repair;
  assert.deepEqual(copy(e.repairBay.slots.map(d=>d.id)),ids);assert.equal(e.repairBay.slots[0].hull,17);assert.equal(e.repairBay.slots[0].readyAt,123);assert.equal(e.cargo.tons,2);
  e.hull=w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'}).hull;
  for(let n=0;n<1000&&!e.repairBay.slots.every(d=>d.phase==='stowed');n++)f.tick();
  assert.ok(e.repairBay.slots.every(d=>d.phase==='stowed'),'craft return into the same bay');assert.deepEqual(copy(e.repairBay.slots.map(d=>d.id)),ids);assert.equal(e.cargo.tons,2);
});

test('repair polling bounds safety reconciliation while distant records retain equipment and identities',async()=>{
  const f=await repairFixture(),{window:w,state:s,repair:r}=f;
  f.ship.phase='docked';r.observe(s,f.ship,'civilian');
  const template=copy(f.ship),ships=s.civilianTraffic.ships;
  for(let id=1000;id<6000;id++)ships.push({...copy(template),id,system:4,phase:'docked',shipEquipment:undefined,repairBay:undefined});
  r.invalidateMembership(s);f.tick(1);
  let descriptions=0;const definitions=w.nativeShipDefinitions;
  w.nativeShipDefinitions={...definitions,forEntity(...args){descriptions++;return definitions.forEntity(...args);}};
  const count=ships.length;for(let n=0;n<3;n++)f.tick(1);
  assert.ok(descriptions<=64*3+20,`population-wide repair work repeated: ${descriptions}`);assert.equal(ships.length,count);assert.equal(r.drones(s).length,0);
});

test('a repair craft catches a fast drifting casualty instead of braking forever behind stale attachment goals',async()=>{
  const f=await repairFixture(),{window:w,state:s,ship:e,repair:r}=f;
  r.launch(s,r.ref('civilian',e),r.ref('civilian',e));
  for(let n=0;n<400&&!e.repairBay.slots.every(d=>d.phase==='repairing');n++)f.tick();
  assert.ok(e.repairBay.slots.every(d=>d.phase==='repairing'));
  const before=e.hull;e.vx=52;e.vy=0;e.speed=52;
  for(let n=0;n<300;n++){
    e.x+=52/60;e.heading+=.1/60;w.nativeShipSystems.refreshShip(s,e,'civilian',47);f.tick(1/60);
    if(n>240){const target=r.pose(s,r.ref('civilian',e));for(const d of e.repairBay.slots){const station=r.stationPoint(target,d);assert.ok(Math.hypot(d.x-station.x,d.y-station.y)<1.2,'craft never caught current moving station');}}
  }
  assert.ok(e.hull>before,'a moving casualty receives real repair');const mission=s.shipRepairs.missions[0];near(mission.restoredHull,mission.spent*r.rules.hullPerTon,'moving repair material conservation');
});

test('self-repair inherits real carrier momentum while keeping ordinary drone thrust and physical contacts',async()=>{
  let f=await repairFixture(undefined,true),{window:w,state:s,ship:e,repair:r}=f,m=w.nativeShipMotion;
  Object.assign(s,{x:10050,y:10300});Object.assign(e,{vx:135,vy:0,speed:135,motionKick:{version:1,mode:'free',vx:135,vy:0}});
  w.nativeShipSystems.refreshShip(s,e,'civilian',47);
  const start=e.x,mission=r.launch(s,r.ref('civilian',e),r.ref('civilian',e));assert.ok(mission);
  const dotProfile=w.nativeShipDefinitions.get(r.rules.basicType,'repair-drone').movement;
  for(let n=0;n<900;n++){
    w.nativeSimulation.advance(s,1/60);r.advance(s,1/60);w.nativeShipTraffic.collide(s,1/60);
    if(n===450){
      const ids=copy(e.repairBay.slots.map(d=>d.id)),spent=s.shipRepairs.ledger.consumed;
      assert.ok(e.repairBay.slots.every(d=>d.motionKick?.inherited),'launch frame marker must survive active shared integration');
      f=await repairFixture(copy(s),true);({window:w,state:s,ship:e,repair:r}=f);m=w.nativeShipMotion;
      assert.deepEqual(copy(e.repairBay.slots.map(d=>d.id)),ids);assert.ok(e.repairBay.slots.every(d=>d.motionKick?.inherited),'reload lost actual carried momentum');near(s.shipRepairs.ledger.consumed,spent,'reload cannot consume repair material');
    }
    if(n>600)for(const d of e.repairBay.slots){
      assert.equal(d.phase,'repairing',`coasting carrier left its repair craft behind: ${JSON.stringify({carrier:{x:e.x,y:e.y,vx:e.vx,vy:e.vy},drone:{x:d.x,y:d.y,vx:d.vx,vy:d.vy,kick:d.motionKick},control:d.trafficControl})}`);const p=r.pose(s,r.ref('civilian',e)),station=r.stationPoint(p,d),kick=m.kickSample(d.motionKick,w.nativeSimulation.seconds(s));
      assert.ok(Math.hypot(d.x-station.x,d.y-station.y)<2,'drone lost the moving work station');
      assert.ok(Math.hypot(d.vx-kick.vx,d.vy-kick.vy)<=dotProfile.maxSpeed+1e-5,'inherited momentum must not grant extra engine speed');
    }
  }
  const completedWork=s.shipRepairs.missions.find(item=>item.id===mission.id);
  assert.ok(e.x-start>1900,'authoritative coasting time or momentum was discarded');assert.ok(completedWork.restoredHull>10);near(completedWork.restoredHull,completedWork.spent*r.rules.hullPerTon,'coasting repair material accounting');
});

test('resolving one launched Dot preserves the owned actor without describing the rest of the mission',async()=>{
  const f=await repairFixture(),{window:w,state:s,repair:r}=f,medic=s.civilianTraffic.ships.find(e=>e.shipType===58);
  Object.assign(medic,{system:47,x:11000,y:10000,phase:'disabled',hull:10,shields:0,repairDeuranium:100});r.observe(s,medic,'civilian');
  assert.ok(r.launch(s,r.ref('civilian',medic),r.ref('civilian',medic)));f.tick(5);
  const drones=r.drones(s,47).filter(d=>d.entity.carrier.id===medic.id);assert.equal(drones.length,6);w.nativeShipSystems.collectShips(s,47);
  const definition=w.nativeShipDefinitions;let described=0;
  w.nativeShipDefinitions={...definition,describe(...args){described++;return definition.describe(...args);}};
  const before=JSON.stringify(s),target=w.nativeShipSystems.resolve(s,drones[3].id,47);
  assert.equal(target.entity,drones[3].entity);assert.equal(target.hull,drones[3].hull);assert.equal(target.entity.readyAt,drones[3].entity.readyAt);
  assert.ok(described<=2,`one actor query described ${described} ships`);assert.equal(JSON.stringify(s),before,'querying cannot spend supplies or move craft');
});

test('a custom disabled station stays outside repair ownership instead of creating an unresolvable distress call',async()=>{
  const f=await repairFixture(),{window:w,state:s,repair:r}=f;
  f.ship.phase='docked';r.observe(s,f.ship,'civilian');
  const station={id:'foundation-station',shipType:47,system:47,x:12000,y:10000,heading:0,hull:10,shields:0,phase:'disabled'},before=JSON.stringify(station);
  const describe=()=>({...w.nativeShipDefinitions.describe(s,station,{category:'station'}),id:'station:'+station.id});
  w.nativeShipSystems.register('station',{collect:(_,system)=>system===47?[describe()]:[],resolve:(_,id)=>id==='station:'+station.id?describe():null,hit:()=>({ok:false})});
  w.nativeShipSystems.collectShips(s,47);w.nativeShipSystems.refreshShip(s,station,'station',47);
  const calls=s.shipRepairs.calls.length,ledger=JSON.stringify(s.shipRepairs.ledger);f.tick(1);
  assert.equal(JSON.stringify(station),before,'an unowned extension cannot receive repair equipment or state');
  assert.equal(s.shipRepairs.calls.length,calls);assert.equal(JSON.stringify(s.shipRepairs.ledger),ledger);
});
