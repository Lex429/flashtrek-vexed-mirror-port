const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='html-games/broken-mirror-port/',copy=v=>JSON.parse(JSON.stringify(v));
function setup(){
  const patch={x:0,y:0,width:2100,height:1600,angle:0},window={nativeDevFog:{physicalRegion:s=>s.devMode&&s.system===1?patch:null}},math=Object.create(Math);math.random=()=>{throw Error('Current used gameplay randomness');};
  const context=vm.createContext({window,Math:math,atob});
  const load=f=>vm.runInContext(fs.readFileSync(root+f,'utf8'),context,{filename:f});
  for(const f of ['ship-motion.js','badlands-currents.js','nebula-flow-kernel.js','nebula-material.js'])load(f);
  const state={devMode:true,system:1,shipSimulation:{seconds:0}},entity={x:0,y:0,angle:0,vx:0,vy:0,speed:0,hull:200,shields:100};
  const descriptor=()=>({entity,system:1,x:entity.x,y:entity.y,vx:entity.vx,vy:entity.vy,hull:entity.hull,dimensions:{width:30,height:60},hullRadii:{rx:12,ry:25},definition:{hull:200,mass:8}});
  return {window,state,entity,descriptor,api:window.nativeBadlandsCurrents,motion:window.nativeShipMotion,material:window.nativeNebulaMaterial,load};
}
const profile={maxSpeed:180,acceleration:135,braking:216,turnRate:1.5,vectorFlight:true,lateralAcceleration:110};
function tick(f,command={},dt=1/60){f.state.shipSimulation.seconds+=dt;const flow=f.api.sample(f.state,f.descriptor());f.motion.step(f.entity,{manualFlight:true,...command,...(flow?{externalFlow:flow}:{})},profile,dt);return flow;}
test('currents are deterministic world fields, vary between gusts and lulls and taper smoothly at their boundary',()=>{
  const f=setup(),field=f.api.regions(f.state)[0],before=JSON.stringify(f.state);let low=1,high=0,peak=0;
  for(let t=0;t<70;t+=.1){const a=f.api.sampleAt(field,100,20,t),b=f.api.sampleAt(field,100,20,t);assert.deepEqual(a,b);assert.ok(Object.values(a).every(Number.isFinite));low=Math.min(low,a.gust);high=Math.max(high,a.gust);peak=Math.max(peak,Math.hypot(a.vx,a.vy));}
  assert.ok(low<.26&&high>.99&&peak>80&&peak<250);assert.equal(f.api.weight(field,field.rx*1.03,0),0);
  const edge=f.api.sampleAt(field,field.rx*1.02-1e-3,0,4);assert.ok(Math.hypot(edge.vx,edge.vy)<.001);assert.equal(JSON.stringify(f.state),before);
  const offset=f.api.offset(field,field.rx*1.03,0,20);assert.equal(offset.x,0);assert.equal(offset.y,0);
});
test('only exposed active ships inside the Badlands current feel it; normal regions, landing and warp stay calm',()=>{
  const f=setup();assert.ok(f.api.sample(f.state,f.descriptor()));
  for(const values of [{landed:true},{phase:'warp'},{phase:'arriving'},{phase:'destroyed'},{journey:{}},{hull:0}]){
    const before={...f.entity};Object.assign(f.entity,values);assert.equal(f.api.sample(f.state,f.descriptor()),null);Object.assign(f.entity,before);for(const k of Object.keys(values))if(!(k in before))delete f.entity[k];
  }
  assert.equal(f.api.sample({...f.state,devMode:false},f.descriptor()),null);assert.equal(f.api.sample(f.state,{...f.descriptor(),system:43}),null);
  f.entity.x=2000;assert.equal(f.api.sample(f.state,f.descriptor()),null);
});
test('visible plasma advection follows the physical current direction throughout gusts and lulls',()=>{
  const f=setup(),field=f.api.regions(f.state)[0];
  for(let seconds=0;seconds<40;seconds+=.7)for(const x of [-500,0,500]){
    const flow=f.api.sampleAt(field,x,100,seconds),a=f.api.offset(field,x,100,seconds),b=f.api.offset(field,x,100,seconds+.001);
    if(Math.hypot(flow.vx,flow.vy)<1)continue;
    const vx=-(b.x-a.x)/.001,vy=-(b.y-a.y)/.001;
    assert.ok((vx*flow.vx+vy*flow.vy)/(Math.hypot(vx,vy)*Math.hypot(flow.vx,flow.vy))>.999);
  }
});
test('production Badlands and adjacent weather cells share the same physical world current',()=>{
  const f=setup(),anchors={1:{x:0,y:0},73:{x:100000,y:60000}};
  f.window.nativeManualFlight={anchor:id=>anchors[id]};f.window.nativeBadlands={boundary:{rx:64000,ry:48000}};
  const s={system:73,shipSimulation:{seconds:12}},world=f.api.regions(s)[0],origin={x:1200,y:-500},local=f.api.fieldFor(s,{minX:-1000,minY:-1000,width:2000,height:2000},origin);
  const a=f.api.sampleAt(world,1350,-430,12),b=f.api.sampleAt(local,150,70,12);for(const key of ['vx','vy','edge','gust','spin'])assert.ok(Math.abs(a[key]-b[key])<1e-12);
  assert.ok(f.api.fieldFor({system:1},{minX:99000,minY:59000,width:2000,height:2000}));
  assert.equal(f.api.fieldFor({system:1},{minX:-1000,minY:-1000,width:2000,height:2000}),null);
});
test('mass and inertia control drift and buffeting while engine and hull definitions remain unchanged',()=>{
  const f=setup(),d=f.descriptor(),light=f.api.sample(f.state,d),heavy=f.api.sample(f.state,{...d,definition:{...d.definition,mass:80,inertia:80000}});
  assert.ok(light.rate>heavy.rate*1.5);assert.ok(light.spinRate>heavy.spinRate);assert.equal(light.damageRate,0);assert.deepEqual(d.definition,{hull:200,mass:8});
});
test('real current momentum pushes and turns a ship, survives save/reload and can be braked away after escape',()=>{
  const f=setup();for(let i=0;i<240;i++)tick(f,{drift:true});
  assert.ok(Math.hypot(f.entity.x,f.entity.y)>25);assert.ok(f.entity.speed>10);assert.ok(f.entity.motionFlow);assert.ok(Math.abs(f.entity.angle)>.001);
  const restored=copy(f.entity);f.api.setEnabled(false);const speed=f.entity.speed;
  for(let i=0;i<120;i++){tick(f);f.motion.step(restored,{manualFlight:true},profile,1/60);}
  assert.ok(Math.abs(f.entity.speed-speed)<1e-7);assert.ok(Math.hypot(f.entity.x-restored.x,f.entity.y-restored.y)<1e-7);
  for(let i=0;i<120;i++)tick(f,{brake:true});assert.ok(f.entity.speed<.01);assert.equal(f.entity.motionFlow,undefined);
});
test('pilot thrust and steering remain available against a live current, including critical hull',()=>{
  const f=setup();f.entity.hull=20;const start=f.api.sample(f.state,f.descriptor());f.entity.angle=Math.atan2(-start.vy,-start.vx);const direction={x:Math.cos(f.entity.angle),y:Math.sin(f.entity.angle)};
  for(let i=0;i<90;i++)tick(f,{throttle:1});assert.ok(f.entity.x*direction.x+f.entity.y*direction.y>50);
  const angle=f.entity.angle;for(let i=0;i<30;i++)tick(f,{turn:1,throttle:1});assert.ok(Math.abs(f.entity.angle-angle)>.3);
});
test('a current combines with vortex drag and preserves its existing exposure damage owner',()=>{
  const f=setup(),v={id:'vortex',rate:2,vx:120,vy:-30,ax:5,ay:7,spin:.8,spinRate:3,damageRate:12,from:{x:10,y:20}},c={id:'current',rate:.5,vx:-40,vy:90,ax:0,ay:0,spin:-.1,spinRate:.2,damageRate:0},combined=f.api.combine(v,c);
  assert.equal(combined.rate,2.5);assert.equal(combined.vx,88);assert.equal(combined.vy,-6);assert.equal(combined.id,v.id);assert.equal(combined.damageRate,12);assert.equal(combined.from,v.from);assert.equal(f.api.combine(null,c),c);assert.equal(f.api.combine(v,null),v);
});
test('the canonical ship owner integrates current and vortex together and retains shield-first environmental damage',async()=>{
  const {fixture}=require('./npc-economy-fixture.cjs'),f=await fixture({full:false,economic:false}),w=f.window,s=f.state;
  for(const name of ['player-combat.js','plasma-vortices.js','badlands-currents.js'])vm.runInContext(fs.readFileSync(root+name,'utf8'),f.context);
  w.nativeDevFog={physicalRegion:()=>({x:0,y:0,width:2100,height:1600,angle:0})};s.devMode=true;
  const v=w.nativePlasmaVortices.vortices(s)[0];Object.assign(s,{x:v.x+v.radius*.55,y:v.y,vx:0,vy:0,speed:0,shields:30});
  const sources=[];w.nativeCombatShots.onPlayerHit=(state,amount,impact)=>{sources.push(impact.sourceId);return w.nativePlayerCombat.hit(state,amount,impact);};
  assert.ok(w.nativeBadlandsCurrents.sample(s,w.nativeShipDefinitions.describe(s,s,{category:'player'})));
  for(let i=0;i<45;i++){w.nativeSimulation.advance(s,1/60);w.nativeShipSystems.move(s,s,'player',{manualFlight:true},undefined,1/60);}
  assert.ok(s.motionFlow&&s.speed>10);assert.ok(s.shields<30);assert.ok(sources.length>0&&sources.every(id=>id.startsWith('dev-plasma:')));
});
test('gas currents retain mass, hull openings, accepted time and exact checkpoint recovery',()=>{
  const f=setup(),api=f.material,config={minX:-150,minY:-120,width:300,height:240,cell:3,uniform:.6},field=api.createField(config),current=f.api.regions(f.state)[0],alpha=new Uint8Array(16*24);for(let y=1;y<23;y++)alpha.fill(255,y*16+1,y*16+15);
  const mask=api.createMask(alpha,16,24,1,false),body={id:'player',mask,pose:{x:0,y:0,heading:0,width:20,height:30}},initial=field.metrics(true).mass;
  for(let i=0;i<45;i++){body.pose.x=i;field.updateMany([body],1/60,{current,currentTime:i/60});}
  const metrics=field.metrics(true);assert.ok(metrics.currentCells>100&&metrics.currentSteps>10,JSON.stringify(metrics));assert.ok(Math.abs(metrics.mass-initial)<initial*1e-5);
  assert.ok(field.sample(body.pose.x,body.pose.y)<1e-4);
  const restored=api.createField(config);restored.restore(field.checkpoint({x:0,y:0,w:field.w,h:field.h}));
  for(let i=45;i<75;i++){body.pose.x=i;const options={current,currentTime:i/60};field.updateMany([body],1/60,options);restored.updateMany([body],1/60,options);}
  assert.deepEqual(Array.from(restored.density),Array.from(field.density));assert.equal(restored.metrics().currentCells,field.metrics().currentCells);
  const before=field.checkpoint();field.updateMany([body],1,{suspended:true,current});assert.equal(field.metrics().clock,before.state.clock);
  const steps=field.metrics().currentSteps;for(let i=0;i<20;i++)field.updateMany([],1/60,{current,currentTime:2+i/60});
  assert.equal(field.metrics().currentSteps,steps,'Empty retained weather cores must stop forcing gas');assert.ok(field.metrics().clock>before.state.clock);assert.ok(Math.abs(field.metrics(true).mass-initial)<initial*1e-5);
});
