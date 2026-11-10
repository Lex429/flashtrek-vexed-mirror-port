const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(saved){
 const f=await fixture({full:false,economic:false,repairs:true,saved});
 if(!saved)Object.assign(f.state,{system:2,x:1e6,y:1e6,angle:.4,hull:50,shields:0,phase:'flight',landed:false,minerals:{gallicite:30}});
 const eq=f.window.nativeShipEquipment.ensure(f.state),engine=eq.instances[eq.slots.engineering[0]];
 const stats=()=>f.window.nativeShipDefinitions.forEntity(f.state);
 const move=(command={},profile,dt=1/60)=>f.window.nativeShipSystems.move(f.state,f.state,'player',command,profile,dt);
 return {...f,eq,engine,stats,move};
}
function velocity(f,speed=f.stats().movement.maxSpeed){Object.assign(f.state,{speed,vx:Math.cos(f.state.angle)*speed,vy:Math.sin(f.state.angle)*speed});}

test('real hull damage lowers rated speed immediately but decelerates existing velocity at the remaining braking rate',async()=>{
 const f=await setup();velocity(f);const s=f.state,initial=s.speed,heading=s.angle;
 f.window.nativeShipDamage.apply(f.window.nativeShipDefinitions.describe(s),25);
 near(f.engine.condition,50);const p=f.stats().movement;near(p.maxSpeed,initial/2);
 let previous=s.speed;
 for(let i=0;i<120;i++){
  f.move({throttle:1});assert.ok(s.speed<=previous+1e-8);assert.ok(previous-s.speed<=p.braking/60+1e-8);
  if(i===0)assert.ok(s.speed>p.maxSpeed,'Damage snapped speed to the new cap');
  near(Math.atan2(s.vy,s.vx),heading);previous=s.speed;
 }
 near(s.speed,p.maxSpeed);
});

test('coasting, braking, reverse and cruise shed excess speed without a discontinuity',async()=>{
 for(const command of [{},{brake:true},{reverse:true},{turn:.5},{goal:{x:2e6,y:2e6}}]){
  const f=await setup();velocity(f);const initial=f.state.speed;f.engine.condition=25;
  const p=f.stats().movement;f.move(command);
  assert.ok(f.state.speed>p.maxSpeed);assert.ok(f.state.speed<initial);assert.ok(initial-f.state.speed<=p.braking/60+1e-8);
 }
 const f=await setup();velocity(f);f.engine.condition=25;
 const p=f.window.nativeShipMotion.profiles.cruise(f.stats().movement.maxSpeed,.25),initial=f.state.speed;
 f.move({goal:{x:2e6,y:2e6}},p);assert.ok(f.state.speed>p.maxSpeed);assert.ok(initial-f.state.speed<=p.braking/60+1e-8);
});

test('complete engine failure hands off smoothly to hull thrusters and ore repair restores main thrust',async()=>{
 const f=await setup();velocity(f);f.engine.condition=50;f.move({throttle:1});
 const s=f.state,initial=s.speed;f.engine.condition=0;const p=f.stats().movement;
 f.move({throttle:1});assert.ok(s.speed>p.maxSpeed);assert.ok(initial-s.speed<=p.braking/60+1e-8);
 for(let i=0;i<1000;i++)f.move({throttle:1});near(s.speed,p.maxSpeed);
 const heading=s.angle;f.move({turn:1,brake:true},undefined,.1);assert.ok(s.angle>heading);assert.ok(s.speed<p.maxSpeed);
 assert.equal(s.phase,'flight');assert.equal(f.eq.slots.engineering[0],f.engine.id);const speed=s.speed;
 const repaired=f.window.nativeShipRepairs.repairDevice(s,f.engine.id);assert.equal(repaired.ok,true);assert.equal(f.engine.condition,100);assert.equal(s.minerals.gallicite,20);
 near(s.speed,speed);f.move({throttle:1});assert.ok(s.speed>speed);assert.ok(s.speed-speed<=f.stats().movement.acceleration/60+1e-8);
});

test('a surviving player at ten percent hull can steer and accelerate with repaired engines and no active drones',async()=>{
 const f=await setup(),s=f.state,w=f.window;
 Object.assign(s,{hull:f.stats().hull*.1,phase:'disabled',angle:0,speed:0,vx:0,vy:0});f.engine.condition=100;
 const hull=s.hull,ore=s.minerals.gallicite;
 assert.equal(w.nativeShipRepairs.playerDronesDeployed(s),false);
 for(let i=0;i<60;i++)f.move({manualFlight:true,throttle:1,turn:.2});
 assert.ok(s.speed>100);assert.ok(s.angle>0);assert.equal(s.hull,hull);assert.equal(s.phase,'disabled');
 assert.equal(s.minerals.gallicite,ore);assert.equal(w.nativeShipRepairs.playerDronesDeployed(s),false);
 const restored=await setup(copy(s));
 for(let i=0;i<60;i++)for(const next of [f,restored])next.move({manualFlight:true,throttle:1,turn:.2});
 for(const key of ['x','y','angle','speed','vx','vy'])near(f.state[key],restored.state[key]);
 assert.equal(restored.engine.condition,100);assert.equal(restored.state.hull,hull);
});

test('ten percent hull retains emergency manual thrust, reverse, braking and steering with failed engines',async()=>{
 const f=await setup(),s=f.state;Object.assign(s,{hull:f.stats().hull*.1,phase:'disabled',angle:0,speed:0,vx:0,vy:0});f.engine.condition=0;
 const cap=f.stats().thrusters.maxSpeed;
 for(let i=0;i<240;i++)f.move({manualFlight:true,throttle:1});near(s.speed,cap);
 f.move({manualFlight:true,turn:1,brake:true},undefined,.1);assert.ok(s.angle>0);assert.ok(s.speed<cap);
 for(let i=0;i<240;i++)f.move({manualFlight:true,brake:true});near(s.speed,0);
 for(let i=0;i<120;i++)f.move({manualFlight:true,reverse:true});assert.ok(s.speed>0&&s.speed<=cap*.45+1e-8);
 const before=s.speed;assert.ok(f.window.nativeShipRepairs.repairDevice(s,f.engine.id).ok);near(s.speed,before);
 for(let i=0;i<120;i++)f.move({manualFlight:true,throttle:1});assert.ok(s.speed>cap);
 assert.equal(s.hull,f.stats().hull*.1);assert.equal(s.phase,'disabled');
});

test('critical hull still suspends autopilot and NPC propulsion, and a destroyed player cannot thrust',async()=>{
 const f=await setup(),s=f.state,w=f.window;
 Object.assign(s,{hull:5,phase:'disabled',angle:0,speed:0,vx:0,vy:0});
 f.move({goal:{x:s.x+1000,y:s.y+1000}},undefined,.2);near(s.speed,0);near(s.angle,0);
 for(const change of [{hull:0,phase:'disabled'},{hull:5,phase:'destroyed'}]){
  Object.assign(s,change);f.move({manualFlight:true,throttle:1,turn:1},undefined,.2);near(s.speed,0);near(s.angle,0);
 }
 const e=f.ship;Object.assign(e,{system:2,x:1e6,y:1e6,hull:5,phase:'disabled',heading:0,speed:0,vx:0,vy:0});
 w.nativeShipSystems.move(s,e,'civilian',{manualFlight:true,throttle:1,turn:1},undefined,.2);near(e.speed,0);near(e.heading,0);
});

test('critical player damage and completed hull recovery preserve commanded momentum',async()=>{
 const f=await setup(),s=f.state,w=f.window;velocity(f);const speed=s.speed,vx=s.vx,vy=s.vy;
 require('node:vm').runInContext(require('node:fs').readFileSync('html-games/broken-mirror-port/player-combat.js','utf8'),f.context);
 const hit=w.nativePlayerCombat.hit(s,f.stats().hull*.9);assert.equal(hit.disabled,true);assert.equal(s.phase,'disabled');
 near(s.speed,speed);near(s.vx,vx);near(s.vy,vy);assert.equal(s.motionKick,undefined);
 s.hull=f.stats().hull;assert.ok(w.nativeShipRepairs.recoverPlayer(s).ok);
 assert.equal(s.phase,'flight');near(s.speed,speed);near(s.vx,vx);near(s.vy,vy);
});

test('explicit scalar profiles preserve forward and reverse momentum while a damaged speed limit settles',async()=>{
 for(const reverse of [false,true]){
  const f=await setup();f.state.angle=0;velocity(f,427.5*(reverse?.45:1));
  if(reverse){f.state.vx=-f.state.vx;f.state.motionReverse=true;}
  const initial=f.state.speed;f.engine.condition=25;const p={...f.stats().movement,vectorFlight:false};
  f.move({reverse:true},p);assert.ok(f.state.speed>p.maxSpeed*(reverse?.45:1));assert.ok(initial-f.state.speed<=p.braking/60+1e-8);
 }
});

test('Continue midway through engine slowdown retains the same velocity and subsequent trajectory',async()=>{
 const f=await setup();velocity(f);f.engine.condition=35;for(let i=0;i<12;i++)f.move({throttle:1});
 const restored=await setup(copy(f.state));
 for(let i=0;i<120;i++)for(const next of [f,restored])next.move({throttle:1});
 for(const key of ['x','y','angle','speed','vx','vy'])near(f.state[key],restored.state[key]);
 assert.equal(restored.engine.condition,35);assert.equal(restored.engine.id,f.engine.id);
});

test('an NPC uses the same gradual speed limit with its own fitted damaged engine',async()=>{
 const f=await setup(),s=f.state,e=f.ship,w=f.window,eq=w.nativeShipEquipment.ensure(s,e),engine=eq.instances[eq.slots.engineering[0]];
 const initial=w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'}).movement.maxSpeed;
 Object.assign(e,{system:2,x:1e6,y:1e6,heading:0,speed:initial,vx:initial,vy:0,phase:'flight'});engine.condition=50;
 const p=w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'}).movement;
 w.nativeShipSystems.move(s,e,'civilian',{throttle:1},undefined,1/60);
 assert.ok(e.speed>p.maxSpeed);assert.ok(initial-e.speed<=p.braking/60+1e-8);
});
