const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='html-games/broken-mirror-port/',copy=v=>JSON.parse(JSON.stringify(v));
function setup(){
  const anchors={1:{x:0,y:0},73:{x:100000,y:60000},42:{x:-50000,y:20000}},window={nativeManualFlight:{anchor:id=>anchors[id]},nativeBadlands:{boundary:{rx:64000,ry:48000}}},math=Object.create(Math);math.random=()=>{throw Error('Weather consumed gameplay randomness');};
  const context=vm.createContext({window,Math:math});
  for(const name of ['ship-motion.js','badlands-weather.js','plasma-vortices.js','dev-nebula-storm.js','nebula-fire-fronts.js'])vm.runInContext(fs.readFileSync(root+name,'utf8'),context,{filename:name});
  window.nativePlasmaVortices.installVolume(fs.readFileSync(root+'assets/plasma-volume-v1.bin'));window.nativeNebulaFire.installVolume(fs.readFileSync(root+'assets/nebula-fire-v1.bin'));
  return {window,api:window.nativeBadlandsWeather,state:{devMode:false,system:73,x:0,y:0,hull:100,shields:80,latinum:321,shipSimulation:{seconds:0}},view:{w:900,h:650,zoom:1,cameraX:0,cameraY:0},anchors};
}
const box=(x,y,r=800)=>({minX:x-r,maxX:x+r,minY:y-r,maxY:y+r});
test('the complete real region has stable normal-sized funnels, independent of Dev mode and camera visits',()=>{
  const {api,state}=setup(),ids=new Set(),before=JSON.stringify(state);
  for(const [x,y] of [[0,0],[25000,18000],[-42000,-13000],[49000,10000],[-16000,33000]]){
    const a=api.vortices(state,box(x,y));assert.ok(a.length>=4);assert.equal(api.vortices(state,box(x,y)),a);
    for(const v of a){assert.ok(v.radius>=64&&v.radius<=98);assert.ok(Math.hypot(v.x/64000,v.y/48000)<1);assert.ok(v.id.startsWith('badlands-vortex:'));ids.add(v.id);}
  }
  assert.ok(ids.size>30);assert.equal(JSON.stringify(state),before);assert.equal(api.vortices({...state,system:1},box(0,0)).length,0);
});
test('physical vortex sampling uses each ship coordinate frame and retains production pull, torque and heat damage',()=>{
  const {api,state,window:w}=setup(),v=api.vortices(state,box(0,0))[0],entity={hull:100,phase:'flight'},ship={entity,system:73,x:v.x+v.radius*.55,y:v.y,vx:0,vy:0,hull:100,dimensions:{width:30,height:60},hullRadii:{rx:12,ry:25},definition:{hull:100,mass:8}};
  const a=w.nativePlasmaVortices.sample(state,ship);assert.ok(a&&a.rate>0&&a.spinRate>0&&a.damageRate>0);assert.equal(a.id,v.id);
  const shifted=w.nativePlasmaVortices.sample({...state,system:1},ship);assert.deepEqual(copy(shifted),copy(a));
  w.nativePlasmaVortices.setEnabled(false);assert.equal(w.nativePlasmaVortices.sample(state,ship),null);w.nativePlasmaVortices.setEnabled(true);assert.ok(w.nativePlasmaVortices.sample(state,ship));
  const solar={...ship,system:1,x:0,y:0};assert.equal(w.nativePlasmaVortices.sample({...state,system:1},solar),null);
});
test('neighboring reference frames and material tiles project the same world geography exactly once',()=>{
  const {api,state}=setup(),local=api.vortices(state,box(0,0)),solar=api.vortices({...state,system:1},box(100000,60000));
  assert.deepEqual(local.map(v=>v.id),solar.map(v=>v.id));for(let i=0;i<local.length;i++){assert.ok(Math.abs(local[i].x-(solar[i].x-100000))<1e-9);assert.ok(Math.abs(local[i].y-(solar[i].y-60000))<1e-9);}
  const projected=api.localize(local,{x:500,y:-300});for(let i=0;i<local.length;i++){assert.equal(projected[i].x,local[i].x-500);assert.equal(projected[i].y,local[i].y+300);assert.equal(projected[i].phase,local[i].phase);}
});
test('production lightning mixes white sheet flashes and branches in irregular clusters without a Dev flag',()=>{
  const {api,state,view,window:w}=setup(),model=w.nativeDevNebulaStorm.createModel({production:true}),seen=new Map(),kinds=new Set();let bright=0;
  for(let t=0;t<180;t+=.05){state.shipSimulation.seconds=t;const before=JSON.stringify(state);model.frame(state,.05,view,{badlandsWeather:true});const s=model.snapshot();assert.equal(s.available,true);assert.ok(s.flashes.length<=3);
    for(const f of s.flashes){seen.set(f.id,f.born);kinds.add(f.kind);if(f.glow>.7)bright++;assert.equal(f.age,t-f.born);}
    assert.equal(JSON.stringify(state),before);
  }
  assert.deepEqual([...kinds].sort(),['branch','sheet']);assert.ok(seen.size>20&&bright>20);
  const born=[...seen.values()].sort((a,b)=>a-b),gaps=born.slice(1).map((n,i)=>n-born[i]);assert.ok(gaps.some(g=>g>.05&&g<.9));assert.ok(gaps.some(g=>g>1.5));
  assert.equal(api.lightning({...state,system:1},view,100).length,0);
});
test('production heat and lightning resume their world phase after pause, chunk recreation and Continue',()=>{
  const {state,view,window:w}=setup();let chosen;
  for(let t=0;t<80;t+=.1)if(w.nativeBadlandsWeather.heat(state,view,t).length&&w.nativeBadlandsWeather.lightning(state,view,t).length){chosen=t;break;}
  assert.ok(Number.isFinite(chosen));state.shipSimulation.seconds=chosen;
  for(const api of [w.nativeDevNebulaStorm,w.nativeNebulaFire]){
    const a=api.createModel({production:true}),b=api.createModel({production:true});a.frame(state,.1,view,{badlandsWeather:true});const before=JSON.stringify(a.snapshot());
    a.frame(state,0,{...view,suspended:true},{badlandsWeather:true});assert.equal(JSON.stringify(a.snapshot()),before);
    b.frame(copy(state),.1,view,{badlandsWeather:true});assert.equal(JSON.stringify(b.snapshot()),before);
    a.frame(state,.1,{...view,hidden:true},{badlandsWeather:true});assert.equal(a.snapshot().visible,false);
    a.frame(state,.1,{...view,reducedMotion:true},{badlandsWeather:true});assert.equal(a.snapshot().visible,false);
    a.frame(state,.1,view,{badlandsWeather:false});assert.equal(a.snapshot().available,false);
  }
});
test('heat fronts keep the tested sizes, native envelope, slow drift and finite life throughout distant sections',()=>{
  const {api,state,window:w}=setup();let samples=0;
  for(const [x,y] of [[0,0],[30000,20000],[-30000,-20000]])for(let t=0;t<80;t+=.7){const view={w:900,h:650,zoom:1,cameraX:x,cameraY:y},fronts=api.heat(state,view,t);assert.ok(fronts.length<=3);
    for(const f of fronts){samples++;assert.equal(f.halfWidth,190);assert.equal(f.halfHeight,124);assert.ok(f.duration>=13&&f.duration<=18);assert.ok(Math.abs(Math.hypot(f.driftX,f.driftY)-3.5)<1e-10);assert.ok(t>=f.born&&t<f.born+f.duration);assert.ok(w.nativeNebulaFire.envelope(t-f.born,f.duration,f.phase)>=0);}
  }assert.ok(samples>80);
});
test('streaming many different sections keeps geometry and event caches bounded and never creates saved weather state',()=>{
  const {api,state,view}=setup(),before=JSON.stringify(state);
  for(let i=0;i<500;i++){const x=-40000+i%80*1000,y=-20000+Math.floor(i/80)*1000;api.vortices(state,box(x,y));api.lightning(state,{...view,cameraX:x,cameraY:y},i*.7);api.heat(state,{...view,cameraX:x,cameraY:y},i*.7);}
  const m=api.metrics();assert.ok(m.cachedCells<=m.limit&&m.cachedQueries<=m.limit&&m.cachedEvents<=m.limit);assert.equal(JSON.stringify(state),before);
});
