const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs'),plain=v=>JSON.parse(JSON.stringify(v));
async function setup(){
 const f=await fixture({full:false,economic:false,traffic:true,repairs:true}),w=f.window,s=f.state;
 for(const name of ['ship-scale-settings','prometheus-artwork','prometheus-definitions','prometheus-loadouts','prometheus-tactics','prometheus-effects','prometheus-mvam','player-combat'])vm.runInContext(fs.readFileSync(`${__dirname}/../html-games/broken-mirror-port/${name}.js`,'utf8'),f.context,{filename:name+'.js'});
 w.nativeShipEquipment.changeHull(s,37);w.nativeWeaponLoadout.refit(s,[1,10,10]);Object.assign(s,{system:2,x:3000,y:-3000,angle:-Math.PI/2,hull:400,shields:500,phase:'flight',landed:false});
 const enemies=[0,1].map(i=>({id:'squad-enemy-'+i,shipType:35,system:2,x:3000+i*300,y:-3450,heading:Math.PI/2,hull:10000,shields:0,phase:'flight',vx:0,vy:0}));
 w.nativeShipSystems.register('squad-test',{collect:(state,system)=>system===2?enemies.filter(e=>e.hull>0).map(e=>w.nativeShipDefinitions.describe(state,e,{category:'squad-test'})):[],hit:(state,target,amount,impact)=>w.nativeShipDamage.apply(target,amount,impact)});
 let target=null;f.context.document.querySelector=()=>null;w.nativePrometheus.attach({getTarget:()=>target});
 f.select=i=>{target=i==null?null:w.nativeShipDefinitions.describe(s,enemies[i],{category:'squad-test'});};
 f.lock=value=>{target=value;};
 f.tick=(command={speed:0,brake:true})=>{if(w.nativeSimulation.blocked())return;w.nativeSimulation.advance(s,1/60);w.nativeShipSystems.move(s,s,'player',command,undefined,1/60);w.nativePrometheus.advance(s,1/60);w.nativeCombatShots.advance(s,1/60);};
 f.steps=n=>{for(let i=0;i<n;i++)f.tick();};f.enemies=enemies;w.nativePrometheus.activate(s);return f;
}
test('both escorts acquire the pilot lock immediately, flank on different sides, retarget together and stop on cleared lock',async()=>{
 const f=await setup(),{window:w,state:s,enemies}=f;f.steps(540);f.select(0);f.steps(1800);
 assert.equal(s.prometheus.attackTargetId,enemies[0].id);
 const wings=s.prometheus.sections;assert.ok(wings.every(e=>e.shots>0));assert.ok(enemies[0].hull<10000);
 assert.ok(wings[0].prometheusCombat.side!==wings[1].prometheusCombat.side);
 const bearings=wings.map(e=>Math.atan2(e.y-enemies[0].y,e.x-enemies[0].x));assert.ok(Math.abs(w.nativeShipMotion.wrap(bearings[0]-bearings[1]))>1.3,'Flanks should spread incoming fire across distinct directions');
 f.select(1);f.tick();assert.ok(wings.every(e=>e.prometheusCombat.targetId===enemies[1].id));
 const shots=wings.map(e=>e.shots);f.select(null);f.steps(10);assert.equal(s.prometheus.attackTargetId,null);assert.deepEqual(wings.map(e=>e.shots),shots);assert.ok(wings.every(e=>e.prometheusPilot.mode==='escort'));
 f.lock({...w.nativeShipDefinitions.describe(s,enemies[0],{category:'repair-drone'})});f.tick();assert.equal(s.prometheus.attackTargetId,null,'Inspecting a repair drone cannot order a ship attack');
 f.select(1);f.tick();assert.ok(wings.every(e=>e.prometheusCombat.targetId===enemies[1].id));
});
test('each section uses its own weapon range, intercepts a moving target, and a damaged section gives way',async()=>{
 const f=await setup(),{window:w,state:s,enemies}=f;f.steps(540);f.select(0);const [a,b]=s.prometheus.sections;
 const long=w.nativeShipEquipment.grant(s,15).instance;w.nativePrometheusLoadouts.assign(s,a.prometheusSection,0,long.id);
 enemies[0].vx=140;
 for(let i=0;i<900;i++){enemies[0].x+=140/60;f.select(0);f.tick();}
 assert.ok(a.prometheusCombat.weaponRange!==b.prometheusCombat.weaponRange);
 assert.ok(a.prometheusCombat.goal.x>enemies[0].x-Math.abs(Math.cos(a.prometheusCombat.course)*a.prometheusCombat.radius)+1,'Pursuit leads the moving target');
 a.hull=w.nativeShipDefinitions.get(a.shipType).hull*.32;a.shields=0;f.steps(60);
 assert.equal(a.prometheusCombat.mode,'recover');assert.equal(b.prometheusCombat.mode,'flank');assert.ok(a.prometheusCombat.radius>a.prometheusCombat.preferred);
 const before=JSON.stringify(s);w.nativePause.active=true;f.tick();assert.equal(JSON.stringify(s),before);w.nativePause.active=false;
 const copy=plain(s);w.nativePrometheus.initialize(copy);assert.deepEqual(plain(copy.prometheus.sections.map(e=>e.prometheusCombat)),plain(s.prometheus.sections.map(e=>e.prometheusCombat)));
});
test('pilot changes and automatic takeover during release keep separation active and preserve real poses',async()=>{
 for(const automatic of [false,true]){
  const f=await setup(),{window:w,state:s}=f;f.steps(20);const next=s.prometheus.sections[0],pose=plain({x:next.x,y:next.y,vx:next.vx,vy:next.vy,heading:next.heading,hull:next.hull});
  if(automatic){s.hull=0;assert.ok(w.nativePrometheus.takeCommand(s));}else assert.equal(w.nativePrometheus.pilotSection(s,next.shipType).ok,true);
  assert.equal(s.prometheus.mode,'separating');assert.deepEqual(plain({x:s.x,y:s.y,vx:s.vx,vy:s.vy,heading:s.angle,hull:s.hull}),pose);
  f.steps(1200);assert.equal(s.prometheus.mode,'deployed');
  w.nativePrometheus.recall(s);f.steps(2400);assert.equal(s.prometheus.mode,'joined',JSON.stringify({automatic,dockingAt:s.prometheus.dockingAt,sections:s.prometheus.sections.map(e=>({type:e.shipType,x:e.x,y:e.y,goal:e.approachTarget,speed:e.speed,avoid:e.actuatedAvoidance}))}));assert.equal(s.prometheus.lost,automatic?1:0);
 }
});
test('an early recall and repeated recall requests join without changing equipment or healing at different release times',async()=>{
 for(const ticks of [0,1,15,45,100,220]){
  const f=await setup(),{window:w,state:s}=f;f.steps(ticks);const hp=s.hull+s.prometheus.sections.reduce((n,e)=>n+e.hull,0),ids=Object.keys(s.shipEquipment.instances).sort();
  w.nativePrometheus.recall(s);w.nativePrometheus.recall(s);f.steps(1800);
  assert.equal(s.prometheus.mode,'joined','Release time '+ticks);assert.ok(Math.abs(s.hull-hp)<1e-7);assert.deepEqual(Object.keys(s.shipEquipment.instances).sort(),ids);
 }
});
test('blue exhaust draws only during separation and recall while physical actuation remains available in every mode',async()=>{
 const f=await setup(),{window:w,state:s}=f;f.steps(60);const actors=s.prometheus.sections.map(e=>w.nativeShipDefinitions.describe(s,e,{category:'prometheus'}));
 const ctx=new Proxy({gradients:0,createRadialGradient(){this.gradients++;return {addColorStop(){}};},createLinearGradient(){this.gradients++;return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:()=>{}}),view={cx:0,cy:0,ship:{x:s.x,y:s.y},zoom:1};
 for(const mode of ['separating','deployed','recalling','joined']){
  s.prometheus.mode=mode;ctx.gradients=0;for(const layer of ['under','over'])w.nativePrometheusEffects.paint(ctx,s,w.nativeShipDefinitions.describe(s),actors,view,layer);
  if(mode==='separating'||mode==='recalling')assert.ok(ctx.gradients>0,mode);else assert.equal(ctx.gradients,0,mode);
 }
});
test('all three sections can dock while either outer section pilots a moving turn',async()=>{
 for(const type of [3701,3703])for(const speed of [0,427.5,1600]){
  const f=await setup(),{window:w,state:s}=f;f.steps(540);w.nativePrometheus.pilotSection(s,type);
  s.vx=Math.cos(s.angle)*speed;s.vy=Math.sin(s.angle)*speed;s.speed=speed;
  for(const e of s.prometheus.sections){e.vx=s.vx;e.vy=s.vy;e.speed=speed;}
  w.nativePrometheus.recall(s);
  for(let i=0;i<2400&&s.prometheus.mode!=='joined';i++){
   w.nativeSimulation.advance(s,1/60);const movement={...w.nativeShipDefinitions.forEntity(s,s).movement,maxSpeed:Math.max(427.5,speed),...(speed>1000?{turnRate:.35}:{})};
   w.nativeShipSystems.move(s,s,'player',{throttle:1,turn:type===3701?1:-1,manualFlight:true},movement,1/60);w.nativePrometheus.advance(s,1/60);
  }
  assert.equal(s.prometheus.mode,'joined',JSON.stringify({type,speed,lead:{x:s.x,y:s.y,vx:s.vx,vy:s.vy,omega:s.motionAngularVelocity},dockingAt:s.prometheus.dockingAt,sections:s.prometheus.sections.map(e=>({type:e.shipType,x:e.x,y:e.y,vx:e.vx,vy:e.vy,heading:e.heading,omega:e.motionAngularVelocity,goal:e.approachTarget,avoid:e.actuatedAvoidance,hull:e.hull,max:w.nativeShipDefinitions.forEntity(s,e).hull,movement:{acceleration:w.nativeShipDefinitions.forEntity(s,e).movement.acceleration,braking:w.nativeShipDefinitions.forEntity(s,e).movement.braking},actual:e.motionActuation&&{ax:e.motionActuation.ax,ay:e.motionActuation.ay,requested:e.motionActuation.requested,residual:e.motionActuation.residual}}))}));assert.equal(s.prometheus.lost,0);
 }
});
test('a recall saved after the first latch restores the other section route and finishes with the same inventory',async()=>{
 const f=await setup(),{window:w,state:s}=f;f.steps(540);f.select(0);f.steps(1200);s.prometheus.sections[0].hull=32;s.prometheus.sections[0].shields=0;
 f.select(null);w.nativePrometheus.recall(s);for(let i=0;i<3600&&s.prometheus.dockingAt==null;i++)f.tick();
 assert.ok(s.prometheus.dockingAt!=null);assert.ok(s.prometheus.sections.some(e=>e.prometheusReturn==='staging'));
 const ids=Object.keys(s.shipEquipment.instances).sort(),hp=s.hull+s.prometheus.sections.reduce((n,e)=>n+e.hull,0),restored=plain(s);w.nativePrometheus.initialize(restored);
 for(let i=0;i<3600&&restored.prometheus.mode!=='joined';i++){w.nativeSimulation.advance(restored,1/60);w.nativeShipSystems.move(restored,restored,'player',{speed:0,brake:true},undefined,1/60);w.nativePrometheus.advance(restored,1/60);}
 assert.equal(restored.prometheus.mode,'joined');assert.ok(Math.abs(restored.hull-hp)<1e-7);assert.deepEqual(Object.keys(restored.shipEquipment.instances).sort(),ids);
});
