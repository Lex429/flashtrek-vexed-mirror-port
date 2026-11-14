const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(extra={}){
  const window={},math=Object.create(Math);math.random=()=>{throw Error('Material used gameplay random');};
  const context=vm.createContext({window,atob,Math:math,...extra});
  vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/nebula-flow-kernel.js','utf8'),context);
  vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/nebula-material.js','utf8'),context);
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

test('a long unpublished history retains the most recent swept poses and rebases without an invented bridge',()=>{
  class WorkerStub{postMessage(){}terminate(){}}
  const {api,mask}=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}}),f=api.createRuntimeField({minX:-100,minY:-100,width:200,height:200,cell:2});
  for(let i=0;i<100;i++)f.updateMany([{id:'player',pose:pose(-30+i*.5,0,i*.03),mask}],1/120);
  const pending=f.pendingMasks;assert.equal(pending.length,32);assert.equal(pending[0].x,4);assert.equal(pending.at(-1).x,19.5);assert.equal(f.pendingMasks,pending,'Unchanged input rebuilt silhouettes');
  f.updateMany([{id:'player',pose:pose(200,0,1),mask}],1/120,{rebase:true});
  assert.equal(f.pendingMasks.length,32);assert.equal(f.pendingMasks.at(-1).x,200);assert.ok(f.pendingMasks.every(p=>p.x<=19.5||p.x===200),'Rebase cleared intervening space');f.dispose();
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

test('continuous 100x crossings clear the complete travelled silhouette and conserve gas',()=>{
  const {api,mask}=fixture();
  for(const heading of [0,.63,Math.PI/2]){
    const f=api.createField({minX:-400,minY:-200,width:800,height:400,cell:2}),a={...pose(-320,-50,heading),width:52,height:83,speed:42750},b={...a,x:320,y:50};
    f.update(a,mask,1/120);f.update(b,mask,1/120);
    assert.equal(f.metrics().continuousSweeps,1);assert.ok(f.metrics().sweeps<=2,'Distance still multiplied whole-hull stamps');
    const expected=new Uint8Array(f.density.length),radius=Math.hypot(a.width,a.height)/2;
    for(let k=0;k<=512;k++){const p={...a,x:a.x+(b.x-a.x)*k/512,y:a.y+(b.y-a.y)*k/512};
      for(let y=Math.max(1,Math.floor((p.y-radius-f.minY)/2));y<Math.min(f.h-1,Math.ceil((p.y+radius-f.minY)/2));y++)for(let x=Math.max(1,Math.floor((p.x-radius-f.minX)/2));x<Math.min(f.w-1,Math.ceil((p.x+radius-f.minX)/2));x++)if(api.occupied(mask,p,f.minX+(x+.5)*2,f.minY+(y+.5)*2))expected[y*f.w+x]=1;
    }
    const leaks=[];let tested=0;for(let i=0;i<expected.length;i++)if(expected[i]){const x=f.minX+(i%f.w+.5)*2,y=f.minY+(Math.floor(i/f.w)+.5)*2,mi=api.maskIndex(mask,b,x,y);if(mi>=0&&mask.openings[mi])continue;tested++;if(f.density[i]>.00001)leaks.push({x,y,d:f.density[i]});}
    assert.ok(tested>1000);assert.equal(leaks.length,0,'Holes inside an uninterrupted fast crossing '+JSON.stringify({heading,leaks:leaks.slice(0,25)}));
    assert.ok(Math.abs(f.metrics(true).mass-f.metrics().initialMass)<.08);assert.ok(f.metrics(true).min>=0);
  }
});

test('twenty fast overlapping hulls retain all accepted time, gas and checkpoint recovery',()=>{
  const {api,mask}=fixture(),config={minX:-500,minY:-300,width:1000,height:600,cell:2},f=api.createField(config);
  const bodies=t=>Array.from({length:20},(_,i)=>{const reverse=i%2?1:-1;return {id:'stress:'+i,mask,pose:{...pose(reverse*(t?350:-350),-230+Math.floor(i/2)*46,.03*i),width:52,height:83,speed:42750}};});
  f.updateMany(bodies(0),1/120);f.updateMany(bodies(1),1/120);
  const m=f.metrics(true);assert.equal(m.actorCount,20);assert.equal(m.continuousSweeps,20);assert.ok(m.sweeps<=40);assert.ok(Math.abs(m.mass-m.initialMass)<.15);assert.ok(m.min>=0);assert.equal(m.clock,1/60);
  const copy=api.createField(config);copy.restore(f.checkpoint());for(const model of [copy,f])model.updateMany(bodies(0),1/120);
  assert.deepEqual(Array.from(copy.density),Array.from(f.density));assert.equal(copy.metrics().clock,f.metrics().clock);
});

test('compiled continuous sweeps match JavaScript through fast drift, turns, boundaries and stale speed hints',()=>{
  const {api,mask}=fixture(),config={minX:-400,minY:-240,width:800,height:480,cell:2},a=api.createField(config),b=api.createField({...config,accelerated:false});
  const path=[[-600,-100,0],[350,80,.03],[-250,170,.15],[0,-150,1.7],[520,60,2.1],[-650,-40,2.1]];
  for(const [x,y,heading] of path){const bodies=[{id:'a',mask,pose:{...pose(x,y,heading),width:52,height:83,speed:0}},{id:'b',mask,pose:{...pose(-x,-y,-heading),width:47,height:75,speed:0}}];for(const f of [a,b])f.updateMany(bodies,1/120);}
  assert.ok(a.metrics().continuousSweeps>10,'A stale engine speed caused fast travel to be treated as a teleport');
  for(const key of ['density','u','v','rate','swept'])assert.deepEqual(Array.from(a.checkpoint()[key]),Array.from(b.checkpoint()[key]),key);
  for(const f of [a,b])f.updateMany([],1/30);assert.deepEqual(Array.from(a.density),Array.from(b.density));
});

test('short and long swept caps retain reference cell boundaries at axis and near-axis headings',()=>{
  const {api,mask}=fixture(),config={minX:-96,minY:-96,width:192,height:192,cell:2};
  for(let i=0;i<48;i++){
    const heading=(i%8)*Math.PI/4+(i<8?0:i<16?1e-13:-1e-13),direction=heading+(i%3)*Math.PI/2+(i>=24?.13+(i%5)*.11:0),distance=i%2?38:260;
    const a=api.createField(config),b=api.createField({...config,accelerated:false});
    for(const t of [-.5,.5])for(const f of [a,b])f.update({...pose(Math.cos(direction)*distance*t,Math.sin(direction)*distance*t,heading),width:52,height:83},mask,1/120);
    const actual=a.checkpoint(),reference=b.checkpoint();
    for(const key of ['density','u','v','rate','swept'])assert.deepEqual(Array.from(actual[key]),Array.from(reference[key]),key+' case '+i);
  }
});

test('a newly observed offscreen crossing uses its shared previous pose and rebases explicitly',()=>{
  const {api,mask}=fixture(),config={minX:-200,minY:-100,width:400,height:200,cell:2},body={id:'new',mask,from:{...pose(-300),width:52,height:83},pose:{...pose(300),width:52,height:83,speed:0}},f=api.createField(config),rebased=api.createField(config);
  f.updateMany([body],1/120);assert.ok(f.sample(0,0)<.001,'Both endpoints outside the field hid a complete crossing');assert.ok(Math.abs(f.metrics(true).mass-f.metrics().initialMass)<.03);
  rebased.updateMany([body],1/120,{rebase:true});assert.ok(rebased.sample(0,0)>.99,'A rebase invented an offscreen route');
  class WorkerStub{postMessage(){}terminate(){}}
  const runtime=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}}).api.createRuntimeField(config);
  runtime.updateMany([body],1/120);assert.equal(runtime.pendingSweeps.length,1);assert.equal(runtime.sample(0,0),0,'Unpublished crossing had an immediate visual hole');runtime.dispose();
});

test('a long sweep preserves a real unswept channel between disconnected hull pieces',()=>{
  const {api}=fixture(),alpha=new Uint8Array(32*32);for(let y=2;y<30;y++)for(let x=0;x<32;x++)if(x>=3&&x<8||x>=24&&x<29)alpha[y*32+x]=255;
  const mask=api.createMask(alpha,32,32),f=api.createField({minX:-400,minY:-100,width:800,height:200,cell:2});
  for(const x of [-300,300])f.update({x,y:0,width:52,height:83,heading:0,speed:42750},mask,1/120);
  assert.ok(f.sample(0,0)>.99,'A bounding hull erased a channel that never met any ship surface');assert.ok(f.sample(0,18)<.001);assert.ok(f.sample(0,-18)<.001);assert.ok(Math.abs(f.metrics(true).mass-f.metrics().initialMass)<.03);
});

test('a complete crossing finishes its interpolated tail once and never bridges a rebase',()=>{
  class WorkerStub{postMessage(){}terminate(){}}
  const {api,mask}=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}}),config={minX:-200,minY:-100,width:400,height:200,cell:2},body={id:'fast',mask,pose:{...pose(-300),width:52,height:83},sweepEnd:{...pose(300),width:52,height:83}};
  const f=api.createRuntimeField(config);f.updateMany([body],1/120);f.updateMany([],1/120);assert.equal(f.pendingSweeps.length,1);assert.equal(f.sample(0,0),0);assert.equal(f.currentBodies.length,1);f.updateMany([],1/120);assert.equal(f.currentBodies.length,0);assert.equal(f.pendingSweeps.length,1,'The closing segment repeated');f.dispose();
  const rebased=api.createRuntimeField(config);rebased.updateMany([body],1/120,{rebase:true});rebased.updateMany([],1/120);assert.equal(rebased.pendingSweeps.length,0);assert.equal(rebased.sample(0,0),1);rebased.dispose();
});

test('fast straight interpolants combine without bridging a turn or losing time during recovery',()=>{
  const workers=[],timers=new Map();let timer=0;
  class WorkerStub{constructor(){this.posts=[];workers.push(this);}postMessage(m){this.posts.push(m);}terminate(){}}
  const {api,mask}=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},performance:{now:()=>0},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)}),config={minX:-200,minY:-100,width:400,height:200,cell:2},runtime=api.createRuntimeField(config),reference=api.createField(config),rgba=new Uint8ClampedArray([0,0,0,128]),worker=workers[0];runtime.seed(rgba,1,1);reference.seed(rgba,1,1);
  const deliver=(sequence,bodies=[])=>worker.onmessage({data:{kind:'updated',sequence,bodies,complete:true,checkpoint:reference.checkpoint(),metrics:reference.metrics()}});deliver(0);
  const raw=[],processed=[],seen=new Set();
  function drain(){for(const post of worker.posts)if(post.kind==='advance'&&!seen.has(post)){seen.add(post);for(const c of post.commands){reference.updateMany(c.bodies.map(b=>({...b,mask})),c.dt,c.options);processed.push(c);}deliver(post.commands.at(-1).sequence,post.commands.at(-1).bodies);}}
  for(let i=0;i<18;i++){const p={...pose(-400+(i<9?i:18-i)*350,i>=12?30:0,i>=12?.1:0),width:52,height:83,speed:42750};raw.push(p);runtime.updateMany([{id:'a',pose:p,mask}],1/120);if(i===0||i%4===0)drain();}
  runtime.flush();drain();assert.ok(runtime.metrics().mergedCommands>0,'No redundant interpolation was combined');assert.ok(processed.length<raw.length);
  let previous=0;for(const c of processed){const end=c.sequence-1,start=Math.max(0,previous-1),a=raw[start],b=raw[end];for(let i=previous;i<=end;i++){const p=raw[i],cross=(p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x);assert.ok(Math.abs(cross)<1e-7,'A corner was replaced with a straight shortcut');assert.equal(p.heading,b.heading);}previous=c.sequence;}
  assert.ok(Math.abs(reference.metrics().clock-raw.length/120)<1e-10);runtime.forceFallback('coalesced recovery');assert.deepEqual(Array.from(runtime.density),Array.from(reference.density));assert.equal(runtime.metrics().acceptedPoses,raw.length);assert.ok(Math.abs(runtime.metrics().clock-raw.length/120)<1e-10);runtime.dispose();
});

test('fresh fast movement is sent immediately while only naturally queued inputs can combine',()=>{
  const workers=[],timers=[];class WorkerStub{constructor(){this.posts=[];workers.push(this);}postMessage(m){this.posts.push(m);}terminate(){}}
  const {api,mask}=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},setTimeout:(fn,delay)=>{timers.push(delay);return timers.length;},clearTimeout:()=>{}}),f=api.createRuntimeField({minX:-200,minY:-100,width:400,height:200,cell:3}),worker=workers[0];
  worker.onmessage({data:{kind:'updated',sequence:0,complete:true,metrics:{clock:0},bodies:[]}});
  const first={id:'a',mask,pose:{...pose(-150),width:52,height:83}};f.updateMany([first],1/120);assert.equal(worker.posts.filter(m=>m.kind==='advance').length,1);
  worker.onmessage({data:{kind:'updated',sequence:1,complete:true,metrics:{clock:1/120},bodies:[{id:'a',maskId:1,pose:first.pose}]}});
  f.updateMany([{...first,pose:{...first.pose,x:150}}],1/120);assert.equal(worker.posts.filter(m=>m.kind==='advance').length,2,'A fresh high-speed push was held for another frame');assert.ok(!timers.some(t=>t>10&&t<20));f.dispose();
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

test('wide transport patches use contiguous rows while narrow patches retain their crop',()=>{
  const {api}=fixture(),f=api.createField({minX:0,minY:0,width:100,height:80,cell:2}),wide=f.checkpoint({x:2,y:3,w:46,h:5}),narrow=f.checkpoint({x:4,y:6,w:8,h:3});
  assert.deepEqual(JSON.parse(JSON.stringify(wide.rect)),{x:0,y:3,w:50,h:5});
  assert.deepEqual(Array.from(wide.density),Array.from(f.density.subarray(150,400)));
  assert.deepEqual(JSON.parse(JSON.stringify(narrow.rect)),{x:4,y:6,w:8,h:3});assert.equal(narrow.density.length,24);
});

test('compiled flow matches the JavaScript fallback through drift, overlapping hulls and recovery',()=>{
  const {api,mask}=fixture();for(const config of [{minX:-160,minY:-100,width:320,height:200,cell:2},{minX:-47,minY:-41,width:94,height:82,cell:2}]){
  const compiled=api.createField(config),js=api.createField({...config,accelerated:false});
  assert.equal(compiled.metrics().flowKernel,'webassembly');assert.equal(js.metrics().flowKernel,'javascript');
  assert.equal(compiled.metrics().flowVectorized,true);
  const bodies=i=>[{id:'player',pose:pose(-90+i*4,Math.sin(i*.12)*12,i*.03),mask},{id:'other',pose:pose(70-i*3,10,Math.PI-i*.02),mask}];
  for(let i=0;i<45;i++)for(const f of [compiled,js])f.updateMany(bodies(i),.025,{reducedMotion:i>30});
  for(let i=0;i<45;i++)for(const f of [compiled,js])f.updateMany([],1/30);
  for(const key of ['density','u','v','rate'])assert.deepEqual(Array.from(compiled.checkpoint()[key]),Array.from(js.checkpoint()[key]),key);
  js.restore(compiled.checkpoint());for(let i=45;i<50;i++)for(const f of [compiled,js])f.updateMany(bodies(i),1/30);
  assert.deepEqual(Array.from(compiled.density),Array.from(js.density));
  }
});

test('quiet tiles retain conserved material, wake again, and stay close to the fully active solution',()=>{
  const {api,mask}=fixture();
  for(const large of [false,true]){
  const config=large?{minX:-320,minY:-160,width:640,height:320,cell:2}:{minX:-160,minY:-100,width:320,height:200,cell:2},f=api.createField(config),reference=api.createField({...config,sleepVelocity:0,sleepChange:0,motionEpsilon:1e-12});let p;
  for(let i=0;i<(large?44:30);i++){p=large?{...pose(-180+i*427.5/60,0,.63),width:52.032202,height:83,speed:427.5}:pose(-90+i*5);for(const model of [f,reference])model.update(p,mask,1/60);}
  for(let i=0;i<360;i++)for(const model of [f,reference]){if(large)model.update({...p,speed:0},mask,1/30);else model.updateMany([],1/30);}
  let maximum=0,total=0;for(let i=0;i<f.density.length;i++){const error=Math.abs(Math.exp(-f.density[i])-Math.exp(-reference.density[i]));maximum=Math.max(maximum,error);total+=error;}
  assert.ok(f.metrics().activeTiles<reference.metrics().activeTiles*.75,JSON.stringify({actual:f.metrics().activeTiles,reference:reference.metrics().activeTiles}));
  assert.ok(maximum<.025&&total/f.density.length<.001,JSON.stringify({maximum,average:total/f.density.length}));
  const before=f.metrics(true);assert.ok(Math.abs(before.mass-before.initialMass)<.05);
  f.update({...p,x:20,y:0,heading:Math.PI/2},mask,1/30);assert.ok(f.sample(20,0)<.02);assert.ok(f.metrics().activeTiles>0);
  assert.ok(Math.abs(f.metrics(true).mass-before.mass)<.02);
  }
});

test('visible alternating density keeps mixing after its per-step change falls below the sleep threshold',()=>{
  const {api}=fixture();
  for(const accelerated of [true,false]){
    const f=api.createField({minX:0,minY:0,width:192,height:192,cell:3,accelerated}),cp=f.checkpoint();
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)cp.density[y*f.w+x]=1+((x+y)%2?.1:-.1);
    cp.state.tiles=Array.from({length:Math.ceil(f.w/16)*Math.ceil(f.h/16)},(_,i)=>i);f.restore(cp);
    f.updateMany([],1/30);assert.ok(f.metrics().activeTiles>0,'Visible cell alternation went to sleep after one step');
    for(let i=1;i<1800;i++)f.updateMany([],1/30);
    let even=0,odd=0;for(let y=16;y<48;y++)for(let x=16;x<48;x++)if((x+y)%2)odd+=f.density[y*f.w+x];else even+=f.density[y*f.w+x];
    assert.ok(Math.abs(even-odd)/512<.003,'The visible cell grid remained after a minute of settling');
    assert.ok(Math.abs(f.metrics(true).mass-f.metrics().initialMass)<.02);
  }
});

test('uniform gas beside a stationary solid does not accelerate into the hull',()=>{
  const {api,mask}=fixture();
  for(const accelerated of [true,false]){
    const f=api.createField({minX:-90,minY:-90,width:180,height:180,cell:2,accelerated});f.update(pose(),mask,1/30);const cp=f.checkpoint();cp.density.fill(1);for(const i of cp.solid)cp.density[i]=0;
    cp.u.fill(0);cp.v.fill(0);cp.rate.fill(0);cp.state.initialMass=cp.density.reduce((a,b)=>a+b,0);cp.state.tiles=Array.from({length:Math.ceil(f.w/16)*Math.ceil(f.h/16)},(_,i)=>i);f.restore(cp);
    for(let i=0;i<12;i++)f.update(pose(),mask,1/30);
    const after=f.checkpoint();assert.deepEqual(Array.from(after.density),Array.from(cp.density));assert.ok(after.u.every(v=>v===0)&&after.v.every(v=>v===0),'A solid pressure stencil manufactured motion in resting gas');
  }
});

test('an empty wake carries no artificial pressure-driven velocity or active fluid work',()=>{
  const {api}=fixture();
  for(const accelerated of [true,false]){
    const f=api.createField({minX:0,minY:0,width:192,height:192,cell:3,accelerated}),rgba=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++)rgba[i*4+3]=50+(i%16)*10;f.seed(rgba,16,16);
    const cp=f.checkpoint();cp.density.fill(0);cp.state.initialMass=0;cp.state.tiles=Array.from({length:Math.ceil(f.w/16)*Math.ceil(f.h/16)},(_,i)=>i);f.restore(cp);f.updateMany([],1/30);
    const after=f.checkpoint();assert.ok(after.u.every(v=>v===0)&&after.v.every(v=>v===0));assert.ok(after.density.every(v=>v===0));assert.equal(f.metrics().activeTiles,0);
  }
});

test('a sub-fluid-step hull push is published without waiting for a 30-Hz boundary',()=>{
  const messages=[],context={};Object.assign(context,{self:context,atob,location:{search:''},performance:{now:()=>0},setTimeout:()=>{},postMessage:m=>messages.push(m)});vm.createContext(context);
  context.importScripts=url=>vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+url.split('?')[0],'utf8'),context);vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/nebula-material-worker.js','utf8'),context);
  context.onmessage({data:{kind:'init',config:{minX:-90,minY:-90,width:180,height:180,cell:3},rgba:new Uint8ClampedArray([0,0,0,128]),sw:1,sh:1}});const {mask}=fixture();context.onmessage({data:{kind:'mask',id:1,mask}});messages.length=0;
  for(let sequence=1;sequence<=2;sequence++){context.onmessage({data:{kind:'advance',commands:[{sequence,bodies:[{id:'a',pose:pose(-20+sequence*20),maskId:1}],dt:1/120,options:{}}]}});const message=messages.at(-1);assert.ok(message.frame,'Fresh displacement was acknowledged without publishing gas');assert.equal(message.sequence,sequence);assert.equal(message.complete,true);assert.ok(message.metrics.clock<1/30);}
});

test('worker catch-up publishes intermediate states and acknowledges a batch only after every pose',()=>{
  for(const useChannel of [false,true]){
  const timers=[],messages=[],context={};let time=0;
  Object.assign(context,{self:context,atob,location:{search:''},performance:{now:()=>time++},setTimeout:fn=>timers.push(fn),postMessage:m=>messages.push(m)});
  if(useChannel)context.MessageChannel=class{constructor(){this.port1={};this.port2={postMessage:()=>timers.push(()=>this.port1.onmessage({data:0}))};}};
  vm.createContext(context);context.importScripts=url=>vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+url.split('?')[0],'utf8'),context);
  vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/nebula-material-worker.js','utf8'),context);
  const config={minX:-50,minY:-40,width:100,height:80,cell:2},rgba=new Uint8ClampedArray([0,0,0,128]);
  context.onmessage({data:{kind:'init',config,rgba,sw:1,sh:1}});
  const {mask}=fixture();context.onmessage({data:{kind:'mask',id:1,mask}});messages.length=0;
  const commands=Array.from({length:24},(_,i)=>({sequence:i+1,bodies:[{id:'player',pose:pose(-20+i),maskId:1}],dt:1/120,options:{}}));
  context.onmessage({data:{kind:'advance',commands}});assert.ok(timers.length,'Catch-up never yielded');
  while(timers.length)timers.shift()();
  assert.ok(messages.some(m=>m.frame&&m.sequence<24&&!m.complete),'Intermediate material was held until the batch ended');
  assert.equal(messages.filter(m=>m.complete).length,1);assert.equal(messages.at(-1).sequence,24);
  const actual=vm.runInContext('field',context),expected=context.nativeNebulaMaterial.createField(config);expected.seed(rgba,1,1);
  for(const c of commands)expected.updateMany(c.bodies.map(b=>({...b,mask})),c.dt);
  assert.deepEqual(Array.from(actual.density),Array.from(expected.density));assert.equal(actual.metrics().clock,expected.metrics().clock);
  }
});

test('worker publication buffers return to a bounded pool and are reused after consumption',()=>{
  const messages=[],context={};Object.assign(context,{self:context,atob,location:{search:''},performance:{now:()=>0},setTimeout:()=>{},postMessage:m=>messages.push(m)});vm.createContext(context);
  context.importScripts=url=>vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+url.split('?')[0],'utf8'),context);vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/nebula-material-worker.js','utf8'),context);
  context.onmessage({data:{kind:'init',config:{minX:-20,minY:-20,width:40,height:40,cell:2},rgba:new Uint8ClampedArray([0,0,0,128]),sw:1,sh:1}});
  const {mask}=fixture();context.onmessage({data:{kind:'mask',id:1,mask}});
  const advance=sequence=>context.onmessage({data:{kind:'advance',commands:[{sequence,bodies:[{id:'a',pose:pose(),maskId:1}],dt:1/30,options:{}}]}});
  const returned=new Set();let reused=false;
  for(let sequence=1;sequence<=12;sequence++){advance(sequence);const message=messages.find(m=>m.frame&&m.sequence===sequence),buffers=[message.frame.density.buffer,message.frame.rate.buffer];
    if(message.metrics.reusedBuffers>=2){assert.ok(buffers.every(buffer=>returned.has(buffer)));reused=true;}for(const buffer of buffers)returned.add(buffer);context.onmessage({data:{kind:'recycle',buffers}});
  }
  assert.ok(reused,'Stable publication sizes never reused returned buffers');
  context.onmessage({data:{kind:'recycle',buffers:Array.from({length:100},()=>new ArrayBuffer(1024*1024))}});advance(13);
  assert.ok(messages.at(-1).metrics.pooledBytes<=32*1024*1024);assert.equal(messages.at(-1).sequence,13,'A recycle message prevented the next movement command');
});

test('failure during a partial recovery copy commits a coherent checkpoint and replays every later pose',()=>{
  const workers=[],timers=new Map();let nextTimer=1,time=0;
  class WorkerStub{constructor(){workers.push(this);}postMessage(){}terminate(){}}
  const {api,mask}=fixture({Worker:WorkerStub,URL,location:{href:'http://localhost/nebula-material.js'},performance:{now:()=>time++},setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  const config={minX:-100,minY:-100,width:200,height:200,cell:2},runtime=api.createRuntimeField(config),reference=api.createField(config),rgba=new Uint8ClampedArray([0,0,0,160]);
  runtime.seed(rgba,1,1);reference.seed(rgba,1,1);
  const deliver=(sequence,checkpoint)=>workers[0].onmessage({data:{kind:'updated',complete:true,sequence,checkpoint,metrics:reference.metrics(),bodies:[]}});
  deliver(0,reference.checkpoint());
  // Run just the first bounded slice, leaving the initial copy incomplete.
  const [id,copy]=Array.from(timers).at(-1);timers.delete(id);copy();
  for(let i=0;i<8;i++){const p=pose(-30+i*8,Math.sin(i)*6,i*.04);runtime.update(p,mask,.025);reference.update(p,mask,.025);if(i===3)deliver(4,reference.checkpoint());}
  runtime.forceFallback('failure inside checkpoint copy');
  assert.equal(runtime.metrics().transport,'synchronous-fallback');
  assert.deepEqual(Array.from(runtime.density),Array.from(reference.density));assert.equal(runtime.metrics().clock,reference.metrics().clock);runtime.dispose();
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
