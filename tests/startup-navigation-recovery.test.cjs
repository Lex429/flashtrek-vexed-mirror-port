const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);

test('collision stabilization has bounded travel and identical distant and frame-rate samples',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  for(const dt of [1/144,1/60,.25]){
    let vx=180,vy=-90,x=0,y=0;
    for(let t=0;t<8-1e-8;t+=dt){const sample=m.settleVelocity(vx,vy,Math.min(dt,8-t));x+=sample.x;y+=sample.y;vx=sample.vx;vy=sample.vy;}
    const distant=m.settleVelocity(180,-90,8);near(x,distant.x);near(y,distant.y);near(vx,0);near(vy,0);
    assert.ok(Math.hypot(x,y)<78);
  }
  const afterTwo=m.settleVelocity(180,-90,2);assert.ok(Math.hypot(afterTwo.vx,afterTwo.vy)<2);
});

test('planet detours clear every obstacle along the entire route, including a second blocking body',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  const start={x:-600,y:0},goal={x:600,y:0},bodies=[{x:0,y:0,radius:130},{x:80,y:220,radius:95},{x:-190,y:-180,radius:85}];
  assert.equal(m.clearSegment(start,goal,bodies,40),false);
  const points=m.obstaclePoints(start,goal,bodies,40);assert.ok(points&&points.length>1);
  let from=start;for(const to of [...points,goal]){assert.ok(m.clearSegment(from,to,bodies,40));from=to;}
  assert.equal(m.obstaclePoints(start,{x:0,y:0},bodies,40),null);
  assert.deepEqual(JSON.parse(JSON.stringify(m.obstaclePoints(start,{x:-600,y:600},bodies,40))),[]);
});

test('inertial braking uses the hull braking rate against sideways motion',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),e={x:0,y:0,heading:0,vx:0,vy:100,speed:100};
  w.nativeShipMotion.step(e,{brake:true,heading:0},{inertial:true,maxSpeed:140,acceleration:5,braking:100,turnRate:1},.5);
  near(e.speed,50);near(e.vy,50);
});

test('a safe desired heading still brakes when inertia carries the hull toward a planet',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  const ship={id:2,category:'civilian',system:2,x:-200,y:0,heading:0,vx:150,vy:0,hullRadii:{rx:15,ry:25},radii:{rx:15,ry:25}};
  const command=m.avoidBodies(ship,{heading:Math.PI/2,throttle:1},{maxSpeed:150,braking:75},[{x:0,y:0,radius:85}]);
  assert.equal(command.brake,true);assert.equal(command.throttle,0);
  const yielding=m.avoidBodies({...ship,vx:0,vy:0},{heading:0,throttle:0,brake:true},{maxSpeed:150,braking:75},[{x:-150,y:0,radius:15}]);
  assert.equal(yielding.brake,true,'Planet steering must retain a prior emergency ship-yield brake');
});

test('close player approaches brake against actual closing speed before turning can catch up',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  const ship={id:2,category:'civilian',system:2,x:0,y:0,heading:0,vx:140,vy:0,hullRadii:{rx:15,ry:25},radii:{rx:15,ry:25},definition:{mass:8}};
  for(const velocity of [{vx:0,vy:0},{vx:-70,vy:0},{vx:0,vy:90}]){
    const player={...ship,...velocity,id:'player',category:'player',x:95};
    const command=m.avoidShips(ship,[player],{heading:Math.PI/2,throttle:1},{maxSpeed:140,braking:75,turnRate:1.5});
    assert.equal(command.brake,true,JSON.stringify(velocity));assert.equal(command.throttle,0);
  }
});

test('each faction inserts its player clear of existing hulls, planets and seeded rocks',async()=>{
  const f=await fixture({full:true,regional:true,access:true,traffic:true}),w=f.window,s=f.state;
  const fleet=JSON.stringify(s.civilianTraffic.ships);
  for(const start of w.VexedMirrorWorld.factionStarts){
    Object.assign(s,{system:start.myplanet,shipType:start.playership,x:0,y:0,angle:0,speed:0,vx:0,vy:0,landed:false});
    assert.equal(w.nativeShipTraffic.clearSpawn(s),true);
    const player=w.nativeShipDefinitions.describe(s),radius=w.nativeShipMotion.shipRadius(player);
    assert.ok(w.nativeShipMotion.clearSegment(player,player,w.nativeShipMotion.navigationBodies(s.system),radius+24));
    for(const rock of w.nativeSolAsteroids.forSystem(s.system))assert.ok(Math.hypot(player.x-rock.x,player.y-rock.y)>=radius+rock.size*.43+6);
  }
  assert.equal(JSON.stringify(s.civilianTraffic.ships),fleet,'Inserting a new player cannot move or restart existing crews');
});

test('a new captain can join visible existing activity without moving or cloning the crew',async()=>{
  const f=await fixture({full:false,economic:false,traffic:true}),w=f.window,s=f.state;
  s.solEconomy.freighters=[];Object.assign(s,{system:2,x:0,y:0,angle:0,vx:0,vy:0,speed:0});
  Object.assign(f.ship,{system:2,x:1000,y:0,vx:80,vy:0,speed:80,phase:'cruise'});
  f.ship.localLeg=w.nativeShipMotion.planLeg(f.ship,{x:2000,y:0},w.nativeShipDefinitions.forEntity(s,f.ship,{category:'civilian'}).movement,w.nativeSimulation.seconds(s));
  f.lives.refreshLocation(s,f.ship);w.nativeShipSystems.invalidate(s);
  const crew=JSON.stringify(s.civilianTraffic.ships);
  assert.equal(w.nativeShipTraffic.clearSpawn(s,{nearTraffic:true}),true);
  assert.ok(Math.hypot(s.x-f.ship.x,s.y-f.ship.y)<350);
  assert.equal(JSON.stringify(s.civilianTraffic.ships),crew);
});

test('normal visibility loads one current plate without preparing optional damage geometry',async()=>{
  const f=await fixture({full:false,economic:false}),w=f.window,calls=[];
  const load=w.vexedFlightAssets.loadShip;w.vexedFlightAssets.loadShip=async(...args)=>{calls.push(args);return load(...args);};
  const descriptor=w.nativeShipDefinitions.describe(f.state,f.ship,{category:'civilian'});
  assert.equal(w.nativeShipEffects.asset(descriptor),null);await new Promise(resolve=>setImmediate(resolve));
  assert.ok(w.nativeShipEffects.asset(descriptor));assert.equal(calls.length,1);
  assert.equal(w.nativeShipEffects.ready(descriptor.shipType,'civilian'),true);
  assert.equal(w.nativeShipEffects.optionalReady(descriptor.shipType,'civilian'),false);
  assert.equal(w.nativeShipEffects.metrics().optionalReady,0);
  await w.nativeShipEffects.prepare(descriptor.shipType,'civilian');assert.equal(w.nativeShipEffects.metrics().optionalReady,1);
  assert.equal(w.nativeShipEffects.optionalReady(descriptor.shipType,'civilian'),true);
});

test('a fresh world has real tasks in progress and applying startup again preserves the save exactly',async()=>{
  const f=await fixture({full:true,regional:true,access:true,repairs:true,traffic:true}),w=f.window;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/world-bootstrap.js'),'utf8'),f.context);
  const s={system:1,shipType:7,x:0,y:0,angle:0,speed:0,hull:100,shields:100,weapons:[1],latinum:500,deuranium:120,minedAsteroids:[],destroyedAsteroids:[]};
  const cold=JSON.parse(JSON.stringify(s));w.nativeWorldBootstrap.initialize(cold,0);
  const money=value=>Object.values(value.civilianTraffic.life.markets).reduce((n,m)=>n+m.credits,0)+value.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0)+value.latinum;
  const initialMoney=money(cold),ledger0=cold.civilianTraffic.life.economicLedger;
  w.nativeWorldBootstrap.initialize(s);
  const ledger=s.civilianTraffic.life.economicLedger;
  assert.equal(money(s),initialMoney+ledger.initialMarketCredits-ledger0.initialMarketCredits+ledger.householdSpending-ledger0.householdSpending);
  assert.equal(w.nativeSolAsteroids.metrics().images,0);
  assert.equal(s.worldBootstrap.historySeconds,45);assert.equal(s.latinum,500);assert.equal(s.deuranium,120);
  assert.equal(s.civilianTraffic.ships.length,f.state.civilianTraffic.ships.length);
  const phases=new Set(s.civilianTraffic.ships.map(e=>e.task?.phase||e.phase));assert.ok(phases.size>=4,[...phases]);
  assert.ok(s.civilianTraffic.ships.some(e=>e.localLeg&&e.speed>0));
  assert.ok(s.civilianTraffic.ships.some(e=>e.journey||e.cargo));
  for(const ship of s.civilianTraffic.ships){assert.ok(Number.isFinite(ship.x)&&Number.isFinite(ship.y));if(ship.localLeg)assert.ok(ship.nextActionAt>=w.nativeSimulation.seconds(s)-1e-7);}
  const before=JSON.stringify(s);w.nativeWorldBootstrap.apply(s);assert.equal(JSON.stringify(s),before);
  const restored=JSON.parse(before);w.nativeWorldBootstrap.initialize(restored);assert.equal(JSON.stringify(restored),before);
});
