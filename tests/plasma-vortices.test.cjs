const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root='html-games/broken-mirror-port/',copy=v=>JSON.parse(JSON.stringify(v));
const patch={x:0,y:0,width:2100,height:1600,angle:0};
function setup(){
 const math=Object.create(Math);math.random=()=>{throw Error('Vortex consumed gameplay randomness');};
 const window={nativeDevFog:{physicalRegion:s=>s.devMode&&s.system===1?patch:null}},context=vm.createContext({window,Math:math});
 for(const file of ['ship-motion.js','plasma-vortices.js'])vm.runInContext(fs.readFileSync(root+file,'utf8'),context);
 window.nativePlasmaVortices.installVolume(fs.readFileSync(root+'assets/plasma-volume-v1.bin'));
 const state={devMode:true,system:1,shipSimulation:{seconds:0}},entity={x:0,y:0,angle:0,vx:0,vy:0,speed:0,hull:200,shields:100};
 const descriptor=()=>({entity,x:entity.x,y:entity.y,vx:entity.vx,vy:entity.vy,hull:entity.hull,dimensions:{width:30,height:60},hullRadii:{rx:12,ry:25},definition:{hull:200,mass:8}});
 return {window,context,state,entity,descriptor,api:window.nativePlasmaVortices,motion:window.nativeShipMotion};
}
const profile={maxSpeed:180,acceleration:135,braking:216,turnRate:1.5,vectorFlight:true,lateralAcceleration:110};
function tick(f,command={},dt=1/60){f.state.shipSimulation.seconds+=dt;const flow=f.api.sample(f.state,f.descriptor());f.motion.step(f.entity,{...command,...(flow?{externalFlow:flow}:{})},profile,dt);return flow;}

test('seven world-fixed funnels are deterministic, bounded and restricted to the enabled Dev Sol test',()=>{
 const f=setup(),before=JSON.stringify(f.state),first=copy(f.api.vortices(f.state));assert.equal(first.length,7);
 assert.ok(first.every(v=>v.radius<=100&&v.radius>=60),'Funnel footprint should stay local within the large cloud');
 assert.deepEqual(copy(f.api.vortices(f.state)),first);assert.equal(JSON.stringify(f.state),before);
 f.state.system=2;assert.equal(f.api.vortices(f.state).length,0);f.state.system=1;f.state.devMode=false;assert.equal(f.api.vortices(f.state).length,0);
 f.state.devMode=true;f.api.setEnabled(false);assert.equal(f.api.vortices(f.state).length,0);f.api.setEnabled(true);assert.deepEqual(copy(f.api.vortices(f.state)),first);
 const v=first[0];Object.assign(f.entity,{x:v.x+50,y:v.y});assert.equal(f.api.sample(f.state,{...f.descriptor(),system:2}),null);
});
test('the nebula curls locally through the existing material without creating separate artwork or changing distant gas',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0],saved=JSON.stringify(f.state),far=f.api.sculpt([v],v.x+v.radius*2,v.y,3);
 assert.deepEqual(copy(far),{x:v.x+v.radius*2,y:v.y,density:1,shade:1,blend:0,heat:0});
 const px=v.x+v.radius*.12,py=v.y+v.radius*.55,near=f.api.sculpt([v],px,py,3),later=f.api.sculpt([v],px,py,5);
 assert.ok(Math.hypot(near.x-px,near.y-py)>5);assert.notDeepEqual(copy(near),copy(later));
 assert.ok(near.shade<1.4&&near.shade>.5,'Compressed gas and its darker gaps retain bounded lighting');assert.equal(f.api.snapshot(f.state).renderer.canvases,0);assert.equal(f.api.paint,undefined);
 assert.equal(JSON.stringify(f.state),saved);
});
test('vortices transport existing nebula gas conservatively and preserve momentum through checkpoint recovery',()=>{
 const f=setup();vm.runInContext(fs.readFileSync(root+'nebula-material.js','utf8'),f.context);
 const api=f.window.nativeNebulaMaterial,v={...f.api.vortices(f.state)[0],x:0,y:0},config={minX:-105,minY:-105,width:210,height:210,cell:3,accelerated:false};
 const field=api.createField(config),before=copy(Array.from(field.density)),mass=field.metrics(true).mass;
 for(let i=0;i<60;i++)field.updateMany([],1/30,{vortices:[v],vortexTime:4+i/30});
 const after=field.metrics(true);assert.ok(after.forcedCells>1000&&after.vortexSteps>50);assert.ok(field.density.some((n,i)=>Math.abs(n-before[i])>.03));
 assert.ok(Math.abs(after.mass-mass)<mass*1e-5);assert.ok(after.min>=-1e-6);
 const restored=api.createField(config);restored.restore(field.checkpoint({x:0,y:0,w:field.w,h:field.h}));
 for(let i=0;i<30;i++){const options={vortices:[v],vortexTime:6+i/30};field.updateMany([],1/30,options);restored.updateMany([],1/30,options);}
 assert.deepEqual(Array.from(restored.density),Array.from(field.density));assert.equal(restored.metrics().forcedCells,field.metrics().forcedCells);
 const quiet=api.createField(config);quiet.updateMany([],1,{vortices:[v],reducedMotion:true,vortexTime:3});assert.equal(quiet.metrics().forcedCells,0);
});
test('the top-down funnel surrounds its receding centre with irregular plasma and softens during release',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0];let heat=0,release=0,peak=0,dense=0,dark=0;
 for(let y=-20;y<=20;y++)for(let x=-20;x<=20;x++){
  const px=v.x+x/20*v.radius,py=v.y+y/20*v.radius,a=f.api.sculpt([v],px,py,4),b=f.api.sculpt([v],px,py,10.5);
  heat+=a.heat;release+=b.heat;peak=Math.max(peak,a.heat);dense=Math.max(dense,a.density);dark=Math.max(dark,1-a.shade);
 }
 assert.ok(peak>.4&&dense>2&&dark>.2,'The opening needs internal light, compression and depth shading');
 assert.ok(heat>release*1.7,'The outward surge should soften the active funnel');
 const list=[v],rim=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2;rim.push(f.api.sculpt(list,v.x+Math.cos(a)*v.radius*.65,v.y+Math.sin(a)*v.radius*.65,4));}
 assert.ok(rim.every(n=>n.heat>.2&&n.density>2),'The opening must surround its centre in every direction, rather than showing a side-view waist');
 const rimHeat=rim.map(n=>n.heat),average=rimHeat.reduce((a,b)=>a+b,0)/rimHeat.length;
 assert.ok(Math.max(...rimHeat)-Math.min(...rimHeat)>.12,'The plasma folds should vary around the mouth');
 const center=f.api.sculpt(list,v.x,v.y,4);
 assert.ok(center.density>=.65&&center.heat<average*.85,'Receding gas is dimmer than the wall folds without cutting a solid hole in the nebula');
});
test('visible plasma folds circulate in the same direction as the ship-driving flow',()=>{
 const f=setup(),base=f.api.vortices(f.state)[0];
 for(const direction of [1,-1]){
  const v={...base,direction},list=[v];let forward=0,backward=0;
  function heat(angle,time){const n=f.api.sculpt(list,v.x+Math.cos(angle)*v.radius*.72,v.y+Math.sin(angle)*v.radius*.72,time);return n.heat/f.api.appearance(list,time)[0].formation;}
  for(let i=0;i<120;i++){const a=i/120*Math.PI*2,d=direction*Math.PI/16,before=heat(a,4);forward+=(before-heat(a+d,4.25))**2;backward+=(before-heat(a-d,4.25))**2;}
  assert.ok(forward<backward*.6,'The moving gas features should follow the physical rotation');
 }
});
test('volume animation wraps smoothly, reuses its attributes and rejects corrupt data',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0],list=[v],a=f.api.appearance(list,4),bytes=f.api.volume.bytes;
 assert.equal(f.api.appearance(list,4),a);assert.equal(f.api.appearance(list,4.1),a);assert.equal(f.api.volume.bytes,bytes);
 assert.throws(()=>f.api.installVolume(new Uint8Array(4)),/Invalid plasma/);
 const zero=f.api.sculpt(list,v.x+v.radius*.16,v.y,0),cycle=f.api.sculpt(list,v.x+v.radius*.16,v.y,8);
 // Frame position wraps independently of the physical surge/entrainment turn.
 assert.ok(Object.values(zero).every(Number.isFinite)&&Object.values(cycle).every(Number.isFinite));
 const phase=v.phase*32/(Math.PI*2),wrap=(32-phase)/4;
 const before=f.api.sculpt(list,v.x+v.radius*.16,v.y,wrap-1e-5),after=f.api.sculpt(list,v.x+v.radius*.16,v.y,wrap+1e-5);
 assert.ok(Math.abs(before.density-after.density)<.001&&Math.abs(before.heat-after.heat)<.001);
});
test('smooth finite plasma flow has an inward phase, rotating shear, outward surges and a quiet exterior',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0];let inward=false,outward=false;
 for(let t=0;t<30;t+=.1){const flow=f.api.flowAt(v,v.x+v.radius*.6,v.y,t);assert.ok(flow.vy>0);inward||=flow.vx<0;outward||=flow.vx>80;assert.ok(Object.values(flow).every(Number.isFinite));}
 assert.ok(inward&&outward);assert.equal(f.api.flowAt(v,v.x+v.radius*1.35,v.y,0),null);
 const edge=f.api.flowAt(v,v.x+v.radius*1.349,v.y,0);assert.ok(edge.edge<.0001);
 const center=f.api.flowAt(v,v.x,v.y,0);assert.ok(Object.values(center).every(Number.isFinite));
 const near=f.api.flowAt(v,v.x+v.radius*1e-8,v.y,0);assert.ok(Math.hypot(near.vx,near.vy,near.ax,near.ay)<.01,'The core must approach zero smoothly');
});
test('exposed hull area, mass and rotational inertia determine plasma coupling without changing hull definitions',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0];Object.assign(f.entity,{x:v.x+70,y:v.y});const d=f.descriptor(),before=JSON.stringify(d.definition);
 const light=f.api.sample(f.state,d),heavy=f.api.sample(f.state,{...d,definition:{...d.definition,mass:80,inertia:80000}});
 assert.ok(light.rate>heavy.rate*2);assert.ok(light.spinRate>heavy.spinRate*2);assert.equal(JSON.stringify(d.definition),before);
});
test('a vortex bends the real velocity and spins the hull; released momentum survives reload, coasting and braking',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0];Object.assign(f.entity,{x:v.x+v.radius*.6,y:v.y});
 for(let i=0;i<180;i++)tick(f,{manualFlight:true,drift:true});
 assert.ok(f.entity.speed>30);assert.ok(f.entity.motionFlow);assert.ok(Math.abs(f.entity.angle)>.01);assert.ok(Math.hypot(f.entity.x-v.x-v.radius*.6,f.entity.y-v.y)>30);
 f.api.setEnabled(false);const restored=copy(f.entity),speed=f.entity.speed;
 for(let i=0;i<120;i++){tick(f,{manualFlight:true});f.motion.step(restored,{manualFlight:true},profile,1/60);}
 assert.ok(Math.abs(f.entity.speed-speed)<1e-7);assert.ok(Math.abs(restored.x-f.entity.x)<1e-7);assert.ok(Math.abs(restored.y-f.entity.y)<1e-7);
 for(let i=0;i<240;i++)tick(f,{manualFlight:true,brake:true});assert.ok(f.entity.speed<.01);assert.equal(f.entity.motionFlow,undefined);
});
test('plasma can accelerate a ship beyond engine cruise speed without a speed clamp or a course snap',()=>{
 const f=setup();Object.assign(f.entity,{x:0,y:0});
 for(let i=0;i<120;i++)f.motion.step(f.entity,{manualFlight:true,externalFlow:{vx:600,vy:300,rate:2}},profile,1/60);
 assert.ok(f.entity.speed>profile.maxSpeed*2);const before=copy(f.entity);f.motion.step(f.entity,{manualFlight:true,turn:1},profile,1/60);
 assert.ok(Math.abs(Math.atan2(f.entity.vy,f.entity.vx)-Math.atan2(before.vy,before.vx))<.03);
 f.motion.stop(f.entity);assert.equal(f.entity.motionFlow,undefined);assert.equal(f.entity.speed,0);
});
test('braking acts on combined momentum even when engines and carried plasma velocity oppose each other',()=>{
 const f=setup();Object.assign(f.entity,{vx:100,vy:0,speed:100,motionFlow:{version:1,vx:400,vy:0}});
 for(let i=0;i<60;i++)f.motion.step(f.entity,{manualFlight:true,brake:true},profile,1/60);
 assert.ok(f.entity.speed<.001);assert.equal(f.entity.motionFlow,undefined);
});
test('a deep encounter can orbit for several turns before an outward surge ejects the ship with its acquired momentum',()=>{
 const f=setup(),v=f.api.vortices(f.state)[0];f.state.shipSimulation.seconds=4;Object.assign(f.entity,{x:v.x+v.radius*.6,y:v.y});
 let previous=0,turn=0,exit=null;
 for(let i=0;i<900;i++){
  tick(f,{manualFlight:true,drift:true});const angle=Math.atan2(f.entity.y-v.y,f.entity.x-v.x);turn+=f.motion.wrap(angle-previous);previous=angle;
  if(Math.hypot(f.entity.x-v.x,f.entity.y-v.y)>v.radius*1.35){exit={turn,speed:f.entity.speed,vx:f.entity.vx,vy:f.entity.vy};break;}
 }
 assert.ok(exit&&exit.turn>Math.PI*4,'Deep encounter should circle at least twice before ejection');assert.ok(exit.speed>150);
 const radial=(f.entity.x-v.x)*exit.vx+(f.entity.y-v.y)*exit.vy;assert.ok(radial>0,'Ejection must carry the ship outward');
 f.api.setEnabled(false);for(let i=0;i<60;i++)tick(f,{manualFlight:true});assert.ok(Math.abs(f.entity.vx-exit.vx)<1e-7);assert.ok(Math.abs(f.entity.vy-exit.vy)<1e-7);
});
test('the registered dispatcher applies shield-first heat damage and preserves the existing critical-flight and destruction owners',async()=>{
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state;
 vm.runInContext(fs.readFileSync(root+'player-combat.js','utf8'),f.context);vm.runInContext(fs.readFileSync(root+'plasma-vortices.js','utf8'),f.context);
 w.nativeCombatShots.onPlayerHit=(state,amount,impact)=>w.nativePlayerCombat.hit(state,amount,impact);
 w.nativeDevFog={physicalRegion:()=>patch};s.devMode=true;const v=w.nativePlasmaVortices.vortices(s)[0];Object.assign(s,{x:v.x+v.radius*.55,y:v.y,vx:0,vy:0,speed:0,shields:30});
 const hull=s.hull;for(let i=0;i<60;i++){w.nativeSimulation.advance(s,1/60);w.nativeShipSystems.move(s,s,'player',{manualFlight:true},undefined,1/60);}
 assert.ok(s.shields<30);assert.equal(s.hull,hull);assert.ok(s.motionFlow);
 const d=w.nativeShipDefinitions.describe(s),destroyed=w.nativeShipSystems.applyDamage(s,d,1e6,{kind:'plasma',source:'environment',sourceId:v.id,from:v});
 assert.equal(destroyed.destroyed,true);assert.equal(s.phase,'destroyed');assert.equal(s.motionFlow,undefined);
});
test('environmental damage cannot blame the player, create retaliation or charge faction reputation',async()=>{
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state,ship=f.ship;assert.ok(ship);
 const standing=JSON.stringify(s.localPrestige);const hit={kind:'plasma',source:'environment',sourceId:'dev-plasma:0',from:{x:0,y:0}};
 assert.equal(w.nativeFactionDefence.sourceId(hit),null);
 w.nativeShipSystems.applyDamage(s,w.nativeShipDefinitions.describe(s,ship,{category:'civilian'}),1e6,hit);
 assert.equal(ship.phase,'destroyed');assert.equal(ship.retaliationId,undefined);assert.equal(JSON.stringify(s.localPrestige),standing);
});
