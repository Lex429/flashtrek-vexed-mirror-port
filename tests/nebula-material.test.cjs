const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(extra={}){
  const window={},math=Object.create(Math);math.random=()=>{throw Error('Material used gameplay random');};
  vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/nebula-material.js','utf8'),{window,Math:math,...extra});
  const api=window.nativeNebulaMaterial,w=24,h=48,alpha=new Uint8Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const saucer=Math.pow((x-11.5)/8,2)+Math.pow((y-13)/12,2)<1,neck=x>=9&&x<=14&&y>=20&&y<46;
    const nacelle=(x>=2&&x<=5||x>=18&&x<=21)&&y>=32&&y<46;
    if(saucer||neck||nacelle)alpha[y*w+x]=255;
  }
  return {api,mask:api.createMask(alpha,w,h,w/h)};
}
const field=api=>api.createField({minX:-90,minY:-90,width:180,height:180,cell:1});
const pose=(x=0,y=0,heading=0)=>({x,y,heading,width:12,height:24,speed:100});

test('CPU rendering can sample published density without repeating ship membership for every pixel',()=>{
  class WorkerStub{postMessage(){}terminate(){}}
  const {api,mask}=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}});
  const runtime=api.createRuntimeField({minX:-90,minY:-90,width:180,height:180,cell:2});
  const rgba=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++)rgba[i*4+3]=128;runtime.seed(rgba,16,16);
  runtime.updateMany([{id:'player',pose:pose(),mask}],1/120);
  let membershipReads=0;const alpha=mask.alpha;Object.defineProperty(mask,'alpha',{get(){membershipReads++;return alpha;}});
  const expected=runtime.sampleInitial(0,0);assert.ok(expected>.5);
  for(let i=0;i<1000;i++)assert.equal(runtime.sampleDensity(0,0),expected);
  assert.equal(membershipReads,0,'Raw density sampling scanned current/pending hulls');
  assert.equal(runtime.sample(0,0),0,'Interactive sampling stopped protecting the current ship');assert.ok(membershipReads>0);
  runtime.dispose();
});
function speedFlight(api,mask,speed,{heading=0,speedHint=speed,reducedMotion=false}={}){
  const f=api.createField({minX:-320,minY:-160,width:640,height:320,cell:2}),p={...pose(-180,0,heading),width:52,height:83,speed:speedHint};
  f.update(p,mask,1/60,{reducedMotion});
  for(let step=1;step<=Math.ceil(300*60/speed);step++){p.x=step*speed/60-180;f.update(p,mask,1/60,{reducedMotion});}
  const snapshot=f.checkpoint();let energy=0,mass=0,gapEnergy=0,gapMass=0,cutLength=0;
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
    const i=y*f.w+x,wx=f.minX+(x+.5)*f.cell,wy=f.minY+(y+.5)*f.cell,d=f.density[i],square=snapshot.u[i]**2+snapshot.v[i]**2;
    if(Math.abs(wx-p.x)<p.height*.65&&Math.abs(wy-p.y)<p.width){energy+=d*square;mass+=d;}
    const mi=api.maskIndex(mask,p,wx,wy);if(mi>=0&&mask.openings[mi]){gapEnergy+=d*square;gapMass+=d;}
  }
  for(let distance=p.height*.6;distance<300;distance+=2)if(f.sample(p.x-distance,0)<.35)cutLength+=2;
  return {f,p,energy:energy/mass,gapEnergy:gapEnergy/gapMass,cutLength};
}

test('all catalog hull IDs are eligible and actual alpha gaps stay open under rotation',()=>{
  const {api,mask}=fixture();for(const id of [1,36,59,438,439,500])assert.equal(api.supported(id),true);assert.equal(api.supported(-1),false);assert.equal(api.supported(NaN),false);
  // Local sprite point in the gap between the engineering hull and nacelle.
  const p=pose();assert.equal(api.occupied(mask,p,-8,-2),false);assert.equal(api.occupied(mask,p,5,0),true);
  assert.equal(api.occupied(mask,pose(0,0,Math.PI/2),0,5),true);
});

test('sweeping the artwork displaces material instead of deleting it or spawning a heading-shaped wake',()=>{
  const {api,mask}=fixture(),f=field(api),before=f.metrics(true).mass;
  f.update(pose(-40,0),mask,1/30);
  for(let x=-38;x<=40;x+=2)f.update(pose(x,0),mask,1/30);
  const after=f.metrics(true);assert.ok(Math.abs(after.mass-before)<.01,JSON.stringify(after));assert.ok(after.min>=-1e-6);
  assert.ok(f.sample(40,0)<.05,'Fog entered the current hull');assert.ok(after.max>1.5,'Removed gas did not accumulate outside the swept hull');
});

test('drift clears the actual side of the hull and leaves the old cut in world space after turning',()=>{
  const {api,mask}=fixture(),f=field(api);f.update(pose(0,-40),mask,1/30);
  for(let y=-38;y<=40;y+=2)f.update(pose(0,y),mask,1/30);
  assert.ok(f.sample(0,-20)<.05);assert.ok(Math.abs(f.metrics().lastVelocity.x)<.001&&f.metrics().lastVelocity.y>50);
  const old=f.sample(0,-20);f.update(pose(0,40,Math.PI/2),mask,1/30);assert.ok(f.sample(0,-20)<.08);assert.ok(Math.abs(f.sample(0,-20)-old)<.05);
});

test('surrounding material gradually refills a cut without resetting it to the original cloud',()=>{
  const {api,mask}=fixture(),f=field(api);f.update(pose(-50),mask,1/30);for(let x=-48;x<=50;x+=2)f.update(pose(x),mask,1/30);
  const cut=f.sample(50,0);assert.ok(cut<.1,'The passing hull did not clear its path');
  f.update(pose(60),mask,1/30);f.update(pose(70),mask,1/30);
  assert.ok(f.sample(50,0)<.5,'Fog instantly reset behind the hull');
  for(let i=0;i<450;i++)f.update({...pose(70),speed:0},mask,1/30);
  assert.ok(f.sample(50,0)>cut+.1,'The cleared path stayed empty instead of receiving neighboring fog');
  const m=f.metrics(true);assert.ok(m.min>=-1e-6);assert.ok(Math.abs(m.mass-m.initialMass)<.02,'Refill created or destroyed gas');
  assert.ok(m.max>1.05,'The disturbance was reset instead of continuing to evolve');
  assert.ok(f.density.every(d=>d===0||Math.abs(d)>=1e-20),'Quiet gas accumulated subnormal density');
});

test('fog enters the open spaces between the engineering hull and nacelles after the saucer passes',()=>{
  const {api,mask}=fixture(),f=api.createField({minX:-250,minY:-250,width:500,height:500,cell:2});
  const p={...pose(-160),width:52,height:83,speed:120};f.update(p,mask,1/30);
  for(let i=1;i<=60;i++)f.update({...p,x:p.x+i*4},mask,1/30);
  const end={...p,x:80,speed:0},gaps=[-1,1].map(sign=>({x:end.x-83/3,y:sign*52/6}));
  for(const gap of gaps){assert.equal(api.occupied(mask,end,gap.x,gap.y),false);assert.ok(f.sample(gap.x,gap.y)>.06,'Open nacelle gap was kept empty: '+JSON.stringify(gap));}
  for(let i=0;i<120;i++)f.update(end,mask,1/30);
  for(const gap of gaps)assert.ok(f.sample(gap.x,gap.y)>.15,'Fog could not flow into the hull opening');
  assert.ok(f.sample(0,0)>.02,'The wake remained a sealed trench');
  assert.ok(Math.abs(f.metrics(true).mass-f.metrics().initialMass)<.05);
});

test('pause freezes all material and pose history, and the field never changes ship state',()=>{
  const {api,mask}=fixture(),f=field(api),p=pose(),saved=JSON.stringify(p);f.update(p,mask,1/30);
  const before=f.metrics(true),pixels=Array.from(f.density);f.update(p,mask,10,{suspended:true});
  assert.deepEqual(f.metrics(true),before);assert.deepEqual(Array.from(f.density),pixels);assert.equal(JSON.stringify(p),saved);
});

test('curved paths update local tiles instead of making the intervening rectangle active',()=>{
  const {api,mask}=fixture(),f=api.createField({minX:-250,minY:-250,width:500,height:500,cell:2});
  f.update(pose(-180,-180),mask,1/30);
  for(let x=-160;x<=180;x+=20)f.update(pose(x,-180),mask,1/30);
  for(let y=-160;y<=180;y+=20)f.update(pose(180,y,Math.PI/2),mask,1/30);
  const m=f.metrics(),b=m.activeBounds,rectangle=(b.x1-b.x0+1)*(b.y1-b.y0+1);
  assert.ok(m.activeTiles*256<rectangle*.65,JSON.stringify(m));assert.ok(f.metrics(true).min>=-1e-6);
});

test('checkpoints retain material, momentum, pose history and queued flow time exactly',()=>{
  const {api,mask}=fixture(),create=()=>api.createField({minX:-200,minY:-90,width:400,height:180,cell:2}),a=create(),b=create();
  for(let i=0;i<18;i++)a.update(pose(-110+i*8,Math.sin(i*.2)*8,i*.03),mask,.025);
  b.restore(a.checkpoint());
  for(let i=18;i<28;i++){const p=pose(-110+i*8,Math.sin(i*.2)*8,i*.03);a.update(p,mask,.025);b.update(p,mask,.025);}
  assert.deepEqual(Array.from(b.density),Array.from(a.density));assert.equal(b.metrics().pending,a.metrics().pending);
  assert.equal(b.metrics().flowSpeed,a.metrics().flowSpeed);assert.equal(b.metrics().travelDistance,a.metrics().travelDistance);assert.ok(b.metrics().fastFlow>.3);
});

test('fast passage gains force through the hull openings and leaves a longer recovering wake',()=>{
  const {api,mask}=fixture(),slow=speedFlight(api,mask,120),cruise=speedFlight(api,mask,270),fast=speedFlight(api,mask,427.5);
  assert.ok(cruise.energy>slow.energy*1.4);assert.ok(fast.energy>cruise.energy*1.4,'High speed hit the old early impulse limit');
  assert.ok(fast.gapEnergy>slow.gapEnergy*3,'The nacelle streams did not speed up');
  assert.ok(fast.cutLength>slow.cutLength*1.5,'High speed did not leave a longer wake');
  for(const run of [slow,cruise,fast]){const m=run.f.metrics(true);assert.ok(m.min>=-1e-6);assert.ok(Math.abs(m.mass-m.initialMass)<.05);assert.ok(run.f.sample(run.p.x,run.p.y)<.02);}
});

test('speed response follows real sideways travel and eases out under braking despite a stale speed hint',()=>{
  const {api,mask}=fixture(),slow=speedFlight(api,mask,120,{speedHint:9999}),run=speedFlight(api,mask,427.5,{heading:Math.PI/2});
  assert.equal(slow.f.metrics().fastFlow,0,'A speed hint created high-speed flow');
  const before=run.f.metrics();assert.ok(before.fastFlow>.7);assert.ok(before.lastVelocity.x>400);assert.equal(before.lastVelocity.y,0);
  const stopped={...run.p,speed:9999},saved=JSON.stringify(stopped);run.f.update(stopped,mask,1/60);
  const first=run.f.metrics();assert.ok(first.fastFlow<before.fastFlow&&first.fastFlow>before.fastFlow*.8,'Braking snapped the disturbance');
  for(let i=0;i<120;i++)run.f.update(stopped,mask,1/60);
  assert.ok(run.f.metrics().flowSpeed<10);assert.equal(run.f.metrics().fastFlow,0);assert.equal(run.f.metrics().travelDistance,before.travelDistance);assert.equal(JSON.stringify(stopped),saved);
});

test('a runtime without Worker keeps the same functional conservative model',()=>{
  const {api,mask}=fixture(),f=api.createRuntimeField({minX:-90,minY:-90,width:180,height:180,cell:1});
  f.update(pose(-20),mask,.1);f.update(pose(20),mask,.1);
  assert.ok(f.sample(20,0)<.05);assert.ok(Math.abs(f.metrics(true).mass-f.metrics().initialMass)<.01);
});

test('every hull shares one clock and all current solids stay clear where their paths overlap',()=>{
  const {api,mask}=fixture(),f=api.createField({minX:-100,minY:-100,width:200,height:200,cell:1});
  const bodies=i=>[{id:'player',pose:pose(-40+i,0),mask},{id:'civilian:7',pose:pose(40-i,5,Math.PI),mask},{id:'tug:2',pose:pose(0,-40+i,Math.PI/2),mask}];
  for(let i=0;i<60;i++)f.updateMany(bodies(i),1/60);
  const m=f.metrics(true);assert.equal(m.actorCount,3);assert.ok(Math.abs(m.clock-1)<1e-10);assert.equal(m.actorIds.length,3);
  const final=bodies(59);for(let y=1;y<f.h-1;y++)for(let x=1;x<f.w-1;x++){const wx=f.minX+(x+.5),wy=f.minY+(y+.5);if(final.some(b=>api.occupied(mask,b.pose,wx,wy)))assert.ok(f.density[y*f.w+x]<1e-7,'One hull deposited fog inside another');}
  assert.ok(Math.abs(m.mass-m.initialMass)<.05);assert.ok(m.min>=-1e-6);
});

test('batch ordering, per-ship checkpoints and removal preserve the common material state',()=>{
  const {api,mask}=fixture(),a=field(api),b=field(api),c=field(api);
  const bodies=i=>[{id:'player',pose:pose(-50+i*3,-8),mask},{id:'civilian:4',pose:pose(35-i*2,10,Math.PI),mask}];
  for(let i=0;i<16;i++){a.updateMany(bodies(i),.025);b.updateMany(bodies(i).reverse(),.025);}
  assert.deepEqual(Array.from(a.density),Array.from(b.density));c.restore(a.checkpoint());
  for(let i=16;i<24;i++){a.updateMany(bodies(i),.025);c.updateMany(bodies(i),.025);}
  assert.deepEqual(Array.from(a.density),Array.from(c.density));assert.deepEqual(a.metrics(),c.metrics());
  a.updateMany([],1/30);assert.equal(a.metrics().actorCount,0);assert.ok(a.metrics().clock>c.metrics().clock);assert.ok(Math.abs(a.metrics(true).mass-a.metrics().initialMass)<.05);
});

test('resuming rebases every hull history while retaining the displaced fog',()=>{
  const {api,mask}=fixture(),f=field(api);f.updateMany([{id:'tug:3',pose:pose(-60),mask}],1/30);
  f.updateMany([{id:'tug:3',pose:pose(60),mask}],1/30,{rebase:true});
  assert.ok(f.sample(0,0)>.95,'Resuming swept a route through inactive time');assert.equal(f.metrics().travelDistance,0);assert.equal(f.metrics().fastFlow,0);
});


test('offscreen metadata covers every damage stage and preserves the custom Dot pivot without loading artwork',()=>{
  const window={},context={window,atob};
  vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/nebula-hull-masks.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/nebula-material.js','utf8'),context);
  const records=window.nativeNebulaHullMasks.masks,ids=new Set(Object.keys(records).map(key=>key.split(':')[0])),api=window.nativeNebulaMaterial;
  assert.ok(ids.size>=83);
  for(const id of ids)for(let stage=0;stage<4;stage++){
    const mask=api.maskForType(id,stage);assert.ok(mask,`${id}:${stage}`);
    assert.equal(mask.alpha.length,mask.w*mask.h);assert.ok(mask.alpha.some(a=>a===255));
    assert.ok(mask.alpha.some(a=>a===0));assert.equal(mask.nearestX,null,'Main-thread decoding prepared an expensive surface transform');
    assert.equal(api.maskForType(id,stage),mask,'Repeated offscreen queries did not retain numeric geometry');
  }
  assert.ok(api.maskForType(9001).fogPivot.forward>.09);
  assert.equal(api.maskForType(999999),null);
  assert.equal(api.metrics().sampledMasks,0,'Offscreen metadata required resident artwork');
});
