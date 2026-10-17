const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.resolve(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function setup(saved){
  const f=await fixture({regional:true,access:true,economic:false,full:false,saved});
  f.context.Image=class {complete=false;naturalWidth=0;};
  f.window.nativePlayerCombat={visualImpact(){}};
  for(const file of ['html-games/flashtrek-broken-mirror/debris-impacts.js','html-games/broken-mirror-port/explosion-impacts.js','html-games/broken-mirror-port/asteroid-motion.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context,{filename:file});
  if(!saved){Object.assign(f.state,{system:43,x:-60,y:0,previousX:-80,previousY:0,angle:0,speed:80,vx:80,vy:0,dimensions:{width:30,height:60},hull:100,shields:100});f.state.civilianTraffic.ships=[];f.state.solEconomy.freighters=[];}
  f.window.nativeAsteroidMotion.ensure(f.state);
  return f;
}
function ship(overrides={}){return {x:-42,y:0,previousX:-70,previousY:0,vx:100,vy:0,heading:0,radii:{rx:18,ry:30},dimensions:{width:30,height:60},definition:{mass:8},...overrides};}
function contact(f,{size=40,speed=80,shields=100,y=0}={}){
  const w=f.window,s=f.state,rock=w.nativeSolAsteroids.forSystem(43)[0];rock.size=size;rock.maxHull=100;
  w.nativeSolAsteroids.relocate(rock,{x:0,y:0,angle:0});
  const entity=s;
  Object.assign(entity,{x:-45,y,previousX:-80,previousY:y,angle:0,heading:0,speed,vx:speed,vy:0,shields});
  w.nativeAsteroidMotion.collide(s,.25);return {rock,entity,pose:s.asteroidMotion.rocks[rock.slotId]};
}

test('four distinct debris fragments remove exactly 25% each; overlap never repeats damage',async()=>{
  const f=await setup(),w=f.window,s=f.state,r=w.nativeSolAsteroids.forSystem(43)[0];r.maxHull=20;
  const fragment=()=>({x:r.x+100,y:r.y,size:4,system:43});
  const first=fragment();w.nativeEnvironmentalImpacts.debris(s,first,r.x-100,r.y);
  assert.equal(s.asteroidDamage[r.slotId],5);
  w.nativeEnvironmentalImpacts.debris(s,first,r.x-100,r.y);assert.equal(s.asteroidDamage[r.slotId],5);
  for(let i=2;i<=4;i++){w.nativeEnvironmentalImpacts.debris(s,fragment(),r.x-100,r.y);if(i<4){assert.equal(s.asteroidDamage[r.slotId],i*5);assert.ok(!s.destroyedAsteroids.includes(r.slotId));}}
  assert.equal(s.destroyedAsteroids.filter(id=>id===r.slotId).length,1);
  assert.equal(w.nativeAsteroidCombat.debrisHit(s,r.slotId).ok,false);
});

test('all combat-hit strengths destroy rocks, preserve combat ore rules and cannot mint ore twice',async()=>{
  const f=await setup(),w=f.window,s=f.state,rocks=w.nativeSolAsteroids.forSystem(43);
  for(const [index,amount] of [0,.001,1,1000].entries()){
    const rock=rocks[index];rock.guaranteedOre=true;rock.maxHull=1000;
    const target=w.nativeShipSystems.resolve(s,'rock:'+rock.slotId);
    const hit=w.nativeShipSystems.applyHit(s,{target,point:{x:rock.x,y:rock.y}},{damage:amount,kind:'beam'},{id:'player',system:43});
    assert.equal(hit.destroyed,true);assert.equal(s.asteroidOreDrops[rock.slotId],1);
    assert.equal(w.nativeAsteroidCombat.weaponHit(s,rock.slotId,amount).ok,false);
    assert.equal(w.nativeAsteroidCombat.completeMining(s,rock.slotId).ok,false);
  }
  const neighbor=rocks[10];w.nativeEnvironmentalImpacts.explode(s,neighbor,{radius:500,sourceKey:'asteroid:'+rocks[0].slotId});
  w.nativeSimulation.advance(s,1);w.nativeEnvironmentalImpacts.advance(s,1);
  assert.ok(!s.destroyedAsteroids.includes(neighbor.slotId),'shattered-rock pressure cannot bypass 25% debris damage');
});

test('mass-weighted pushes conserve linear momentum; small rocks move faster and heavy rocks resist ships',async()=>{
  const {window:w}=await setup(),input=ship({x:-35}),small=w.nativeShipMotion.asteroidContact(input,{x:0,y:0,size:25},.3),large=w.nativeShipMotion.asteroidContact(input,{x:0,y:0,size:70},.3);
  assert.ok(small&&large);assert.ok(small.rock.vx>large.rock.vx);assert.ok(small.ship.vx>large.ship.vx);
  for(const hit of [small,large]){near(hit.shipMass*hit.ship.vx+hit.rockMass*hit.rock.vx,hit.shipMass*100);near(hit.shipMass*hit.ship.vy+hit.rockMass*hit.rock.vy,0);}
  const gentle=w.nativeShipMotion.asteroidContact(ship({vx:20}),{x:0,y:0,size:40},.3);
  assert.equal(gentle.damageFraction,0);assert.ok(large.damageFraction>0);
});

test('glancing contact deflects and spins; swept collision catches a fast crossing and ignores misses',async()=>{
  const {window:w}=await setup(),motion=w.nativeShipMotion;
  const glance=motion.asteroidContact(ship({x:-36,y:16,previousY:16}),{x:0,y:0,size:40},.3);
  assert.ok(glance);assert.ok(Math.abs(glance.rock.vy)>1);assert.ok(Math.abs(glance.rock.spin)>.001);
  const fast=motion.asteroidContact(ship({x:150,previousX:-150,vx:600}),{x:0,y:0,size:40},.5);
  assert.ok(fast&&fast.t>0&&fast.t<1);assert.ok(fast.rock.x>0);
  assert.equal(motion.asteroidContact(ship({x:150,previousX:-150,y:200,previousY:200}),{x:0,y:0,size:40},.5),null);
});

test('weapons sweep against a drifting rock crossing their path instead of its final position alone',async()=>{
  const {window:w}=await setup(),rock={slotId:4300999,x:50,y:60,previousX:50,previousY:-60,size:20};
  const result=w.nativeWeaponRules.firstContact({x:0,y:0},{x:100,y:0},{id:'player'},null,{rocks:[rock],bystanders:[]});
  assert.equal(result.kind,'hit');assert.equal(result.target.rockId,rock.slotId);assert.ok(result.t>0&&result.t<1);
  assert.ok(Number.isFinite(result.point.x)&&Number.isFinite(result.point.y));
});

test('mining follows a displaced claim and never cuts or grants ore at its abandoned location',async()=>{
  const f=await fixture({regional:true,access:true,full:false,economic:false}),w=f.window,s=f.state;
  Object.assign(f.ship,{role:'mining',operatingBase:1,miningTrips:0});f.lives.resumeWork(s,f.ship);
  let steps=0;while(f.ship.task?.phase!=='mining-flight'){f.step(.25);assert.ok(++steps<100);}
  const id=f.ship.task.requirements.rockId,rock=w.nativeSolAsteroids.find(id),deadline=f.ship.nextActionAt,goal=f.ship.localLeg.goal.x;
  w.nativeSolAsteroids.relocate(rock,{x:rock.x+1000,y:rock.y,angle:rock.angle});
  while(w.nativeSimulation.seconds(s)<deadline+.3){f.step(.25);assert.ok(++steps<2000);}
  assert.equal(f.ship.task.phase,'mining-flight');assert.ok(f.ship.localLeg.goal.x>goal+900);assert.ok(!s.minedAsteroids.includes(id));assert.equal(s.asteroidOreDrops?.[id],undefined);
  while(f.ship.task?.phase!=='collecting'){f.step(.25);assert.ok(++steps<4000);}
  assert.equal(s.asteroidOreDrops[id],15);assert.equal(s.minedAsteroids.filter(x=>x===id).length,1);
  // A player whose drifting target leaves the laser's range gets no remote cut.
  const playerRock=w.nativeSolAsteroids.forSystem(1).find(r=>!s.minedAsteroids.includes(r.slotId)&&r.slotId!==id);
  Object.assign(s,{x:playerRock.x-100,y:playerRock.y,miningTool:true});w.nativeAsteroidCombat.select(playerRock);
  assert.ok(w.nativeAsteroidCombat.mine(s,s).ok);
  w.nativeSolAsteroids.relocate(playerRock,{x:playerRock.x+1000,y:playerRock.y,angle:playerRock.angle});
  w.nativeSimulation.advance(s,8);w.nativeAsteroidCombat.advance(s,8);
  assert.equal(s.miningOperation,undefined);assert.ok(!s.minedAsteroids.includes(playerRock.slotId));assert.equal(s.asteroidOreDrops[playerRock.slotId],undefined);
});

test('shield and hull contacts use different surfaces without subtracting ship health',async()=>{
  const f=await setup(),{rock,entity,pose}=contact(f,{speed:40});
  assert.ok(pose&&pose.vx>0);assert.ok(rock.x>0);assert.equal(entity.hull,100);assert.equal(entity.shields,100);
  assert.equal(f.state.asteroidDamage?.[rock.slotId],undefined);
  assert.equal(f.window.nativeAsteroidMotion.snapshot().contacts[0].shielded,true);
  const g=await setup(),out=contact(g,{speed:40,shields:0});
  assert.equal(out.pose,undefined,'the same pass reaches shields before it reaches the smaller hull');
  out.entity.x=-35;out.entity.previousX=-60;g.window.nativeAsteroidMotion.collide(g.state,.25);
  assert.equal(g.window.nativeAsteroidMotion.snapshot().contacts[0].shielded,false);assert.equal(out.entity.hull,100);
});

test('pushed rocks keep drifting offscreen across grid cells, pause, JSON reload and independent saves',async()=>{
  let f=await setup(),{rock,pose}=contact(f,{speed:60});const id=rock.slotId,start={x:rock.x,y:rock.y},vx=pose.vx;
  f.state.system=1;f.window.nativeSimulation.advance(f.state,20);f.window.nativeAsteroidMotion.advance(f.state,20);
  near(rock.x,start.x+vx*20);assert.ok(f.window.nativeSolAsteroids.nearby(43,rock,1).includes(rock),'spatial grid follows displacement');
  assert.ok(!f.window.nativeSolAsteroids.nearby(43,start,1).includes(rock));
  const stopped=copy(f.state.asteroidMotion);f.window.nativePause.active=true;f.window.nativeAsteroidMotion.advance(f.state,10);assert.deepEqual(copy(f.state.asteroidMotion),stopped);f.window.nativePause.active=false;
  const saved=copy(f.state),oldX=rock.x;f=await setup(saved);rock=f.window.nativeSolAsteroids.find(id);near(rock.x,oldX);
  f.window.nativeSimulation.advance(f.state,10);f.window.nativeAsteroidMotion.advance(f.state,10);near(rock.x,oldX+vx*10);
  const original=await fixture({regional:true}),seed=original.window.nativeSolAsteroids.find(id);
  const fresh={...copy(f.state),asteroidMotion:undefined};f.window.nativeAsteroidMotion.ensure(fresh);near(rock.x,seed.x);near(rock.y,seed.y);
});

test('destroyed moving rocks freeze ore/burst origins and collisions stay deduplicated and paused',async()=>{
  const f=await setup(),w=f.window,s=f.state,{rock}=contact(f,{speed:120});
  const before=s.asteroidDamage[rock.slotId];w.nativeAsteroidMotion.collide(s,.25);assert.equal(s.asteroidDamage[rock.slotId],before);
  w.nativePause.active=true;const snap=copy(s);w.nativeAsteroidMotion.collide(s,.25);assert.deepEqual(copy(s),snap);w.nativePause.active=false;
  assert.equal(w.nativeAsteroidCombat.weaponHit(s,rock.slotId,.01).destroyed,true);const origin={x:rock.x,y:rock.y};
  w.nativeSimulation.advance(s,100);w.nativeAsteroidMotion.advance(s,100);near(rock.x,origin.x);near(rock.y,origin.y);assert.equal(s.asteroidMotion.rocks[rock.slotId].vx,0);
});

test('thirty minutes of production civilian jobs with physical asteroids retains identities, funded work and ore entitlements through reload',async()=>{
  let f=await fixture({regional:true,access:true,physics:true});
  const identities=copy(f.state.civilianTraffic.ships.map(s=>s.id)),tugs=f.state.solEconomy.freighters.length;
  for(let half=0;half<2;half++){
    for(let i=0;i<3600;i++)f.step(.25);
    assert.deepEqual(copy(f.state.civilianTraffic.ships.map(s=>s.id)),identities);assert.equal(f.state.solEconomy.freighters.length,tugs);
    const mined=f.state.minedAsteroids||[],destroyed=f.state.destroyedAsteroids||[];assert.equal(new Set(mined).size,mined.length);assert.equal(new Set(destroyed).size,destroyed.length);
    assert.ok(mined.every(id=>!destroyed.includes(id)));
    for(const ship of f.state.civilianTraffic.ships){assert.ok(Number.isFinite(ship.x)&&Number.isFinite(ship.y));assert.ok(ship.credits>=0);assert.ok((ship.task?.minedTons||0)<=4);}
    for(const mask of Object.values(f.state.asteroidOreDrops||{}))assert.ok(mask>=0&&mask<=15);
    if(!half)f=await fixture({regional:true,access:true,physics:true,saved:copy(f.state)});
  }
  assert.ok(f.state.civilianTraffic.ships.reduce((n,s)=>n+(s.mined||0),0)>0);
  assert.ok(f.state.solEconomy.freighters.reduce((n,s)=>n+(s.deliveries||0),0)>0);
});
