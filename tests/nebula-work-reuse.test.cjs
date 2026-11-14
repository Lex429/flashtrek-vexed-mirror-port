const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='html-games/broken-mirror-port/';
function fixture(prepared=true,extra={}){
  const window={},context=vm.createContext({window,atob,...extra});
  for(const name of ['nebula-flow-kernel.js','nebula-material.js','plasma-vortices.js'])vm.runInContext(fs.readFileSync(root+name,'utf8'),context);
  let preparations=0;const plasma=window.nativePlasmaVortices;
  window.nativePlasmaVortices={...plasma,prepareFlow:prepared?(...args)=>{preparations++;return plasma.prepareFlow(...args);}:undefined};
  return {api:window.nativeNebulaMaterial,plasma,preparations:()=>preparations};
}
test('a fluid worker failure before asynchronous seeding retains and replays every accepted pose',()=>{
  const workers=[];class WorkerStub{constructor(){workers.push(this);}postMessage(){}terminate(){this.stopped=true;}}
  const {api}=fixture(true,{Worker:WorkerStub,URL,performance,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}});
  const config={minX:-60,minY:-60,width:120,height:120,cell:3,uniform:0,awaitSeed:true},runtime=api.createRuntimeField(config),reference=api.createField(config);
  const alpha=new Uint8Array(12*20);alpha.fill(255,12*4,12*16);const mask=api.createMask(alpha,12,20),rgba=new Uint8ClampedArray([90,70,40,170]);
  reference.seed(rgba,1,1);
  for(let i=0;i<6;i++){
    if(i===2)workers[0].onerror({preventDefault(){},message:'controlled failure before seed'});
    const bodies=[{id:'player',mask,pose:{x:-20+i*4,y:0,width:24,height:40,heading:.63}}];
    runtime.updateMany(bodies,1/120);reference.updateMany(bodies,1/120);
  }
  assert.equal(runtime.ready,false);runtime.seed(rgba,1,1);assert.equal(runtime.ready,true);
  assert.equal(runtime.metrics().transport,'synchronous-fallback');assert.equal(runtime.clock,reference.clock);
  assert.deepEqual(Array.from(runtime.density),Array.from(reference.density));assert.equal(runtime.metrics().acceptedPoses,6);runtime.dispose();
});
function equalMaterial(a,b){
  const first=a.checkpoint(),second=b.checkpoint();
  for(const key of ['density','u','v','rate','swept'])assert.deepEqual(Array.from(first[key]),Array.from(second[key]),key);
  assert.equal(a.metrics().clock,b.metrics().clock);assert.equal(a.metrics().forcedCells,b.metrics().forcedCells);
}

test('sparse publication transports every changed density/rate cell without copying the gap between distant wakes',()=>{
  for(const accelerated of [true,false]){
    const {api}=fixture(),field=api.createField({minX:-480,minY:-321,width:963,height:645,cell:3,accelerated}),alpha=new Uint8Array(12*20);for(let y=1;y<19;y++)alpha.fill(255,y*12+1,y*12+11);const mask=api.createMask(alpha,12,20);
    const visible=field.density.slice(),rate=field.rate.slice();field.uploaded();let sparse=0,sent=0,rectangular=0;
    for(let step=0;step<36;step++){
      const vortices=step>=12&&step<21?[{x:0,y:0,radius:60,phase:2,strength:1,direction:1}]:[];
      field.updateMany([-1,1].map((side,i)=>({id:String(i),mask,pose:{x:side*(360-step),y:side*180,width:24,height:40,heading:step*.03}})),1/30,{vortices,vortexTime:step/30});
      const patch=field.densityPatch(undefined,true);if(patch.rects)sparse++;
      sent+=patch.density.length;rectangular+=(patch.rect?.w||0)*(patch.rect?.h||0);
      for(const r of patch.rects||[patch.rect].filter(Boolean))for(let y=0;y<r.h;y++){
        const from=(r.offset||0)+y*r.w,to=(r.y+y)*field.w+r.x;
        visible.set(patch.density.subarray(from,from+r.w),to);rate.set(patch.rate.subarray(from,from+r.w),to);
      }
      assert.deepEqual(Array.from(visible),Array.from(field.density),'density at '+step);assert.deepEqual(Array.from(rate),Array.from(field.rate),'rate at '+step);field.uploaded();
    }
    assert.ok(sparse>30,`accelerated=${accelerated}: ${sparse} sparse frames, ${sent}/${rectangular} cells`);assert.ok(sent<rectangular*.35,`Sparse transfer retained ${sent}/${rectangular} cells`);
    field.restore(field.checkpoint());assert.equal(field.densityPatch(undefined,true).rects,undefined,'A restored field lost its initial full publication');
  }
});

test('continuing fluid after a slow input preserves its accepted clock, hull and exact fixed-step solution',()=>{
  for(const reducedMotion of [false,true]){
    const {api}=fixture(),config={minX:-60,minY:-60,width:120,height:120,cell:3},a=api.createField(config),b=api.createField(config),restored=api.createField(config);
    const alpha=new Uint8Array(12*20);alpha.fill(255,12*4,12*16);const mask=api.createMask(alpha,12,20),pose={x:-24,y:0,width:24,height:40,heading:0};
    for(const field of [a,b]){field.update(pose,mask,1/30);field.update({...pose,x:0},mask,1/30);}
    const options={reducedMotion};a.update({...pose,x:0},mask,.5,options);
    assert.ok(a.hasPendingFlow);const clock=a.clock,sweeps=a.metrics().sweeps,snapshot=a.checkpoint();restored.restore(snapshot);
    for(let i=0;i<15;i++)b.update({...pose,x:0},mask,1/30,options);
    while(a.hasPendingFlow)a.continueFlow();while(restored.hasPendingFlow)restored.continueFlow();
    assert.equal(a.clock,clock);assert.equal(a.metrics().sweeps,sweeps);assert.ok(a.metrics().pending<1/30);
    assert.equal(a.sample(0,0),0);
    for(const key of ['density','u','v','rate','swept']){
      assert.deepEqual(Array.from(a.checkpoint()[key]),Array.from(b.checkpoint()[key]),key);
      assert.deepEqual(Array.from(a.checkpoint()[key]),Array.from(restored.checkpoint()[key]),'restored '+key);
    }
    assert.ok(Math.abs(a.metrics(true).mass-a.metrics().initialMass)<.002);
  }
});

test('a worker drains fluid debt without newer movement and publishes same-pose progress before completing',()=>{
  for(const channel of [false,true]){
    const messages=[],timers=[],context={};let time=0;
    Object.assign(context,{self:context,atob,location:{search:''},performance:{now:()=>time++},setTimeout:fn=>timers.push(fn),postMessage:m=>messages.push(m)});
    if(channel)context.MessageChannel=class{constructor(){this.port1={};this.port2={postMessage:()=>timers.push(()=>this.port1.onmessage({data:0}))};}};
    vm.createContext(context);context.importScripts=url=>vm.runInContext(fs.readFileSync(root+url.split('?')[0],'utf8'),context);
    vm.runInContext(fs.readFileSync(root+'nebula-material-worker.js','utf8'),context);
    context.onmessage({data:{kind:'init',config:{minX:-60,minY:-60,width:120,height:120,cell:3},rgba:new Uint8Array([0,0,0,128]),sw:1,sh:1}});
    const {api}=fixture(),alpha=new Uint8Array(12*20);alpha.fill(255,12*4,12*16);const mask=api.createMask(alpha,12,20);
    context.onmessage({data:{kind:'mask',id:1,mask}});messages.length=0;
    for(let sequence=1;sequence<=5;sequence++){
      context.onmessage({data:{kind:'advance',commands:[{sequence,bodies:[{id:'player',maskId:1,pose:{x:0,y:0,width:24,height:40,heading:0}}],dt:.5,options:{}}]}});
      assert.equal(messages.at(-1).complete,false,'Slow input was acknowledged with fluid time still pending');
      assert.ok(timers.length,'No continuation was scheduled for the remaining fluid time');
      let turns=0;while(timers.length){assert.ok(++turns<100);timers.shift()();}
      const final=messages.at(-1);assert.equal(final.complete,true);assert.equal(final.sequence,sequence);assert.equal(final.metrics.clock,sequence*.5);
      assert.ok(final.metrics.pending<1/30);assert.equal(final.metrics.sweeps,sequence,'A continuation repeated the hull displacement');
    }
    assert.ok(messages.some((m,i)=>i&&m.frame&&m.sequence===messages[i-1].sequence),'Fluid progress at an unchanged pose was never published');
    assert.equal(timers.length,0);const audit=vm.runInContext('field.metrics(true)',context);assert.ok(Math.abs(audit.mass-audit.initialMass)<.002);
  }
});

test('flush waits for the published pose fluid time, including completion with no density change',async()=>{
  class WorkerStub{constructor(){WorkerStub.worker=this;}postMessage(){}terminate(){}}
  const {api}=fixture(true,{Worker:WorkerStub,URL,performance,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}});
  const field=api.createRuntimeField({minX:-30,minY:-30,width:60,height:60,cell:3}),worker=WorkerStub.worker;
  field.seed(new Uint8Array([0,0,0,128]),1,1);
  const frame={rect:null,density:new Float32Array(0),rate:new Float32Array(0)};
  worker.onmessage({data:{kind:'updated',sequence:0,frame,complete:true,metrics:{clock:0,pending:0},bodies:[]}});
  field.updateMany([],.5);let done=false;const flushed=field.flush().then(()=>{done=true;});
  worker.onmessage({data:{kind:'updated',sequence:1,frame,complete:false,metrics:{clock:.5,pending:.3},bodies:[]}});
  await Promise.resolve();assert.equal(done,false,'flush resolved before accepted fluid time finished');
  worker.onmessage({data:{kind:'updated',sequence:1,complete:true,metrics:{clock:.5,pending:0},bodies:[]}});
  await flushed;assert.equal(done,true);assert.equal(field.clock,.5);assert.equal(field.metrics().pending,0);field.dispose();
});

test('worker recovery finishes a partial pose fluid debt before replaying later movement',()=>{
  class WorkerStub{constructor(){WorkerStub.worker=this;}postMessage(){}terminate(){}}
  const {api}=fixture(true,{Worker:WorkerStub,URL,performance,location:{href:'http://localhost/nebula-material.js'},setTimeout:()=>1,clearTimeout:()=>{}});
  const config={minX:-60,minY:-60,width:120,height:120,cell:3},runtime=api.createRuntimeField(config),reference=api.createField(config),rgba=new Uint8Array([0,0,0,128]);
  const alpha=new Uint8Array(12*20);alpha.fill(255,12*4,12*16);const mask=api.createMask(alpha,12,20);
  runtime.seed(rgba,1,1);reference.seed(rgba,1,1);
  const deliver=(sequence,checkpoint,complete)=>WorkerStub.worker.onmessage({data:{kind:'updated',sequence,checkpoint,complete,metrics:reference.metrics(),bodies:[]}});
  deliver(0,reference.checkpoint(),true);
  const bodies=x=>[{id:'player',mask,pose:{x,y:0,width:24,height:40,heading:0}}];
  runtime.updateMany(bodies(-20),.5);runtime.updateMany(bodies(20),.5);
  reference.updateMany(bodies(-20),.5);deliver(1,reference.checkpoint(),false);
  while(reference.hasPendingFlow)reference.continueFlow();reference.updateMany(bodies(20),.5);while(reference.hasPendingFlow)reference.continueFlow();
  runtime.forceFallback('controlled failure during fluid continuation');
  assert.equal(runtime.metrics().transport,'synchronous-fallback');assert.equal(runtime.clock,reference.clock);assert.ok(runtime.metrics().pending<1/30);
  assert.deepEqual(Array.from(runtime.density),Array.from(reference.density));runtime.dispose();
});
test('cloud seed work is bounded, skips cancelled queued regions and recovers from worker failure',async()=>{
  const workers=[],timers=new Map();let timerId=0;
  class WorkerStub{constructor(){this.posts=[];workers.push(this);}postMessage(message){this.posts.push(message);}terminate(){this.stopped=true;}}
  const window={},context=vm.createContext({window,Worker:WorkerStub,OffscreenCanvas:function(){},URL,location:{href:'http://localhost/nebula-gas.js'},
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(root+'nebula-gas.js','utf8'),context);
  const api=window.nativeNebulaGas,d={view:{w:1,h:1},planes:[],style:3,time:0,seed:1},a=api.requestSeed(d,1,1),b=api.requestSeed(d,1,1),c=api.requestSeed(d,1,1);
  assert.equal(workers[0].posts.length,1);b.cancel();assert.equal(await b.promise,null);
  workers[0].onmessage({data:{id:workers[0].posts[0].id,w:1,h:1,rgba:new Uint8Array(4)}});await a.promise;
  assert.equal(workers[0].posts.length,2,'A cancelled queued section still used the GPU');
  const rejected=c.promise.catch(error=>error.message);workers[0].onmessage({data:{id:workers[0].posts[1].id,error:'controlled seed failure'}});assert.equal(await rejected,'controlled seed failure');
  const pending=Array.from({length:24},()=>api.requestSeed(d,1,1));assert.throws(()=>api.requestSeed(d,1,1),/queue full/);
  const failures=pending.map(r=>r.promise.catch(error=>error.message));workers[0].onerror({preventDefault(){},message:'controlled worker crash'});
  assert.ok((await Promise.all(failures)).every(reason=>reason==='controlled worker crash'));assert.equal(timers.size,0);assert.equal(workers[0].stopped,true);
  const replacement=api.requestSeed(d,1,1);assert.equal(workers.length,2);replacement.cancel();assert.equal(await replacement.promise,null);
});
test('hulls outside the field or in empty gas defer surface preparation until their first real displacement',()=>{
  const {api}=fixture(),alpha=new Uint8Array(12*20);alpha.fill(255,12*4,12*16);
  const mask=api.createMask(alpha,12,20,.6,false),field=api.createField({minX:-60,minY:-60,width:120,height:120,cell:2,uniform:0});
  const pose={x:1000,y:1000,width:24,height:40,heading:0};
  field.update(pose,mask,1/120);assert.equal(mask.nearestX,null);
  field.update({...pose,x:0,y:0},mask,1/120,{rebase:true});assert.equal(mask.nearestX,null);
  field.seed(new Uint8ClampedArray([90,70,40,170]),1,1);field.update({...pose,x:0,y:0},mask,1/120);
  assert.ok(mask.nearestX&&mask.nearestY);assert.ok(field.sample(0,0)<1e-6);
  const mass=field.metrics(true);assert.ok(Math.abs(mass.mass-mass.initialMass)<.002);
});
test('prepared funnel transport retains every material value, refreshes changed geometry and survives recovery',()=>{
  const fast=fixture(),reference=fixture(false),config={minX:-90,minY:-90,width:180,height:180,cell:3};
  const a=fast.api.createField(config),b=reference.api.createField(config);
  let vortex={x:0,y:0,radius:48,phase:2,strength:1,direction:1};
  function step(i){const options={vortices:[{...vortex}],vortexTime:4+i/30};a.updateMany([],1/30,options);b.updateMany([],1/30,options);}
  step(0);const warmed=fast.preparations();assert.ok(warmed>1000);
  for(let i=1;i<35;i++)step(i);
  assert.equal(fast.preparations(),warmed,'Unchanged funnel geometry was rebuilt');equalMaterial(a,b);
  vortex={...vortex,x:9,y:-6,radius:44,phase:1.3,strength:.8,direction:-1};
  for(let i=35;i<50;i++)step(i);
  assert.ok(fast.preparations()>warmed);equalMaterial(a,b);
  a.restore(a.checkpoint());b.restore(b.checkpoint());
  for(let i=50;i<65;i++)step(i);equalMaterial(a,b);
  const before=a.metrics().clock;a.updateMany([],10,{vortices:[vortex],suspended:true});assert.equal(a.metrics().clock,before);
});
test('stationary hull reuse matches repeated sweeps during overlap, shape changes, rebases and reseeding',()=>{
  const {api}=fixture(),config={minX:-100,minY:-80,width:200,height:160,cell:2},a=api.createField(config),b=api.createField({...config,reuseStationary:false});
  const alpha=new Uint8Array(12*20);for(let y=2;y<18;y++)for(let x=2;x<10;x++)if(y<8||x<5||x>7)alpha[y*12+x]=255;
  let mask=api.createMask(alpha,12,20),width=28;
  function step(i,options={}){
    const bodies=[{id:'stationary',mask,pose:{x:0,y:0,width,height:45,heading:.63}},
      {id:'passing',mask,pose:{x:-65+i*1.5,y:8,width:24,height:40,heading:0}}];
    a.updateMany(bodies,1/120,options);b.updateMany(bodies,1/120,options);
  }
  for(let i=0;i<80;i++){if(i===30){const changed=alpha.slice();changed[4*12+4]=0;mask=api.createMask(changed,12,20);width=32;}step(i,i===45?{rebase:true}:{});}
  equalMaterial(a,b);
  a.restore(a.checkpoint());b.restore(b.checkpoint());step(80);equalMaterial(a,b);
  const rgba=new Uint8ClampedArray([100,80,60,170]);a.seed(rgba,1,1);b.seed(rgba,1,1);step(81);equalMaterial(a,b);
});
