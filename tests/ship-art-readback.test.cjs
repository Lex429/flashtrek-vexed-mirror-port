const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror/ship-art-readback.js'),'utf8');
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(missing){
  const workers=[],snapshots=[],timers=new Map(),timerDelays=new Map(),window={};let now=0,nextTimer=0;
  class Worker{
    constructor(url){this.url=url;this.posted=[];this.terminated=false;workers.push(this);}
    postMessage(data,transfer){if(this.failTransfer)throw Error('Transfer refused');this.posted.push({data,transfer});}
    terminate(){this.terminated=true;}
    reply(data){this.onmessage?.({data});}
  }
  const context={window,document:{currentScript:{src:'https://game.test/ship-art-readback.js?v=readback'}},
    Worker,OffscreenCanvas:function(){},createImageBitmap:canvas=>new Promise((resolve,reject)=>snapshots.push({canvas,resolve,reject})),
    ArrayBuffer,Uint8ClampedArray,performance:{now:()=>now},setTimeout:(callback,delay)=>{timers.set(++nextTimer,callback);timerDelays.set(nextTimer,delay);return nextTimer;},clearTimeout:id=>{timerDelays.delete(id);timers.delete(id);}};
  if(missing==='script')context.document.currentScript=null;else if(missing)delete context[missing];
  vm.runInNewContext(source,context);
  const bitmap=(width=2,height=2)=>({width,height,closed:0,close(){this.closed++;}});
  const complete=(index=0)=>{const request=workers[0].posted[index].data;
    workers[0].reply({id:request.id,ok:true,width:request.width,height:request.height,buffer:new Uint8ClampedArray(request.width*request.height*4).fill(17).buffer,workMs:2.5});};
  return {create:window.createShipArtReadback,workers,snapshots,timers,timerDelays,bitmap,complete,time:value=>{now=value;}};
}

async function snapshotPreparation(f,offset=0){
  for(let i=0;i<4;i++){
    f.snapshots[offset+i].resolve(f.bitmap());await tick();
    const timer=[...f.timers].find(([id])=>f.timerDelays.get(id)===0);assert.ok(timer,'each native snapshot yields before preparing another frame');
    f.timers.delete(timer[0]);f.timerDelays.delete(timer[0]);timer[1]();await tick();
  }
}

test('optional preparation shares the readback worker with bounded input, outputs and sequential snapshots',async()=>{
  const f=fixture(),owner=f.create(),frames=Array.from({length:4},()=>({width:2,height:2})),pending=owner.prepare('fragments',frames,[[1,1]]);
  assert.equal(f.workers.length,1);assert.equal(f.snapshots.length,1,'do not snapshot every optional frame synchronously');
  assert.equal(owner.snapshot().preparationBytesInFlight,16*96);
  await snapshotPreparation(f);const request=f.workers[0].posted[0].data;
  assert.equal(request.kind,'prepare');assert.equal(request.frames.length,4);assert.equal(request.operation,'fragments');
  const texture=f.bitmap(),material=f.bitmap(),hot=f.bitmap(),data=[[],[{texture,material:{texture:material,hot,anchors:[],sourcePixels:4,tornPixels:0}}],[],[]];
  f.workers[0].reply({id:request.id,kind:'prepare',ok:true,data,bytes:48,outputs:3,workMs:5,preparation:{workMs:2,maxStepMs:.3,maxSliceMs:1,steps:20}});
  assert.equal(await pending,data);assert.equal(owner.snapshot().pending,0);assert.equal(owner.snapshot().bytesInFlight,0);
  assert.equal(owner.snapshot().prepareCompleted,1);assert.equal(owner.snapshot().workMs,0,'optional elapsed wall time is not labeled as native read CPU work');
  assert.equal(owner.snapshot().prepareWallMs,5);assert.equal(texture.closed,0,'accepted artwork remains owned by its caller');
});

test('optional staging cannot consume foreground read reservations and rejects non-transferable configuration',async()=>{
  const f=fixture(),owner=f.create({maxPreparationBytes:16*96}),frames=Array.from({length:4},()=>({width:2,height:2}));
  const preparation=owner.prepare('wreck',frames,{}),caught=assert.rejects(preparation,{name:'AbortError'});
  await assert.rejects(owner.prepare('wreck',frames,{}),error=>error.capacity===true);
  const foreground=owner.read({width:2,height:2}),readRejection=assert.rejects(foreground,{name:'AbortError'});
  assert.equal(owner.snapshot().readBytesInFlight,48);assert.equal(f.workers.length,1);
  await assert.rejects(owner.prepare('wreck',frames,{partition:{owner(){}}}),{name:'NotSupportedError'});
  owner.dispose();await Promise.all([caught,readRejection]);
  const first=f.bitmap(),second=f.bitmap();f.snapshots[0].resolve(first);f.snapshots[1].resolve(second);await tick();
  assert.equal(first.closed,1);assert.equal(second.closed,1);assert.equal(owner.snapshot().bytesInFlight,0);
});

test('malformed optional results close transferred images before disabling the owner',async()=>{
  const f=fixture(),owner=f.create(),frames=Array.from({length:4},()=>({width:2,height:2})),pending=owner.prepare('fragments',frames,[]),rejected=assert.rejects(pending);
  await snapshotPreparation(f);const texture=f.bitmap();f.workers[0].reply({id:1,kind:'prepare',ok:true,data:[texture],bytes:0,outputs:0,workMs:1});
  await rejected;assert.equal(texture.closed,1);assert.equal(owner.snapshot().available,false);assert.equal(owner.snapshot().bytesInFlight,0);
});

test('readback lazily owns one worker, reserves staging first and returns authoritative RGBA',async()=>{
  const f=fixture(),owner=f.create();assert.equal(f.workers.length,0);
  const pending=owner.read({width:2,height:2});assert.equal(f.workers.length,1);
  assert.equal(f.workers[0].url,'https://game.test/ship-art-readback.js?v=readback');
  assert.equal(owner.snapshot().pending,1);assert.equal(owner.snapshot().bytesInFlight,48);
  const bitmap=f.bitmap();f.snapshots[0].resolve(bitmap);await tick();
  assert.equal(f.workers[0].posted[0].transfer[0],bitmap,'the snapshot is transferred to the worker');
  f.time(10);f.complete();const image=await pending;
  assert.equal(image.width,2);assert.equal(image.height,2);assert.ok(image.data instanceof Uint8ClampedArray);
  assert.deepEqual([...image.data],Array(16).fill(17));
  const metrics=owner.snapshot();assert.equal(metrics.completed,1);assert.equal(metrics.failed,0);
  assert.equal(metrics.workMs,2.5);assert.equal(metrics.waitMs,10);assert.equal(metrics.bytesInFlight,0);assert.equal(metrics.pending,0);
  owner.dispose();assert.equal(f.workers[0].terminated,true);
});

test('pixel, request and byte limits reject before another bitmap snapshot starts',async()=>{
  const f=fixture(),owner=f.create({maxPending:1,maxPixels:4,maxBytes:48});
  const first=owner.read({width:2,height:2});
  await assert.rejects(owner.read({width:2,height:2}),{name:'RangeError'});
  await assert.rejects(owner.read({width:3,height:2}),{name:'RangeError'});
  assert.equal(f.snapshots.length,1);assert.equal(owner.snapshot().peakBytes,48);
  f.snapshots[0].resolve(f.bitmap());await tick();f.complete();await first;
  const g=fixture(),bytes=g.create({maxPending:2,maxPixels:4,maxBytes:47});
  await assert.rejects(bytes.read({width:2,height:2}),{name:'RangeError'});assert.equal(g.snapshots.length,0);
});

test('unsupported capabilities reject honestly without constructing a worker',async()=>{
  for(const missing of ['Worker','OffscreenCanvas','createImageBitmap','script']){
    const f=fixture(missing),owner=f.create();assert.equal(owner.snapshot().available,false);
    await assert.rejects(owner.read({width:2,height:2}),{name:'NotSupportedError'});
    assert.equal(owner.snapshot().failed,1);assert.equal(f.workers.length,0);assert.equal(owner.snapshot().bytesInFlight,0);
  }
});

test('dispose rejects read promises immediately and closes late native snapshots exactly once',async()=>{
  const f=fixture(),owner=f.create(),pending=owner.read({width:2,height:2});
  const rejection=assert.rejects(pending,{name:'AbortError'});owner.dispose();await rejection;
  assert.equal(owner.snapshot().pending,0);assert.equal(owner.snapshot().available,false);
  assert.equal(owner.snapshot().bytesInFlight,48,'uncancellable snapshot bytes remain reserved until native completion');
  const bitmap=f.bitmap();f.snapshots[0].resolve(bitmap);await tick();
  assert.equal(bitmap.closed,1);assert.equal(owner.snapshot().bytesInFlight,0);assert.equal(owner.snapshot().failed,1);
  owner.dispose();assert.equal(bitmap.closed,1);await assert.rejects(owner.read({width:2,height:2}),{name:'AbortError'});
});

test('a timeout disables the owner, terminates its worker and settles all pending reads',async()=>{
  const f=fixture(),owner=f.create({maxPending:2}),a=owner.read({width:2,height:2}),b=owner.read({width:2,height:2});
  const result=Promise.allSettled([a,b]);f.snapshots.forEach(job=>job.resolve(f.bitmap()));await tick();
  f.time(15000);f.timers.values().next().value();
  for(const row of await result){assert.equal(row.status,'rejected');assert.equal(row.reason.name,'TimeoutError');}
  assert.equal(f.workers[0].terminated,true);assert.equal(owner.snapshot().pending,0);assert.equal(owner.snapshot().bytesInFlight,0);
  assert.equal(owner.snapshot().failed,2);assert.equal(f.timers.size,0);
  await assert.rejects(owner.read({width:2,height:2}),{name:'NotSupportedError'});
});

test('snapshot failures recover, while transfer failures disable the worker without leaking a bitmap',async()=>{
  const f=fixture(),owner=f.create(),a=owner.read({width:2,height:2});
  const rejected=assert.rejects(a,/Snapshot refused/);f.snapshots[0].reject(Error('Snapshot refused'));await rejected;
  assert.equal(owner.snapshot().available,true);assert.equal(owner.snapshot().bytesInFlight,0);
  const b=owner.read({width:2,height:2}),failure=assert.rejects(b,/transfer failed/),bitmap=f.bitmap();
  f.workers[0].failTransfer=true;f.snapshots[1].resolve(bitmap);await failure;
  assert.equal(bitmap.closed,1);assert.equal(owner.snapshot().available,false);assert.equal(owner.snapshot().failed,2);
  assert.equal(owner.snapshot().bytesInFlight,0);
});

test('malformed responses and worker errors reject once and preserve reset accounting',async()=>{
  for(const mode of ['dimensions','error']){
    const f=fixture(),owner=f.create(),pending=owner.read({width:2,height:2}),rejected=assert.rejects(pending);
    f.snapshots[0].resolve(f.bitmap());await tick();owner.resetMetrics();
    assert.equal(owner.snapshot().pending,1);assert.equal(owner.snapshot().bytesInFlight,48);assert.equal(owner.snapshot().requests,1);
    if(mode==='dimensions')f.workers[0].reply({id:1,ok:true,width:3,height:2,buffer:new ArrayBuffer(16),workMs:1});
    else f.workers[0].onerror({message:'Worker lost',preventDefault(){}});
    await rejected;assert.equal(owner.snapshot().failed,1);assert.equal(owner.snapshot().pending,0);assert.equal(owner.snapshot().bytesInFlight,0);
    assert.equal(owner.snapshot().available,false);owner.resetMetrics();assert.equal(owner.snapshot().available,false);assert.ok(owner.snapshot().errors.length>0);
  }
});

test('worker draws and transfers every RGBA byte, closes bitmaps and reports read failures',()=>{
  for(const fail of [false,true]){
    const sent=[],surfaces=[],bitmap={width:2,height:2,closed:0,close(){this.closed++;}};
    class OffscreenCanvas{
      constructor(width,height){this.width=width;this.height=height;surfaces.push(this);}
      getContext(_kind,options){assert.equal(options.willReadFrequently,true);return {drawImage(image){assert.equal(image,bitmap);},getImageData(){if(fail)throw Error('Read denied');return {data:new Uint8ClampedArray(16).fill(31)};}};}
    }
    const self={postMessage:(data,transfer)=>sent.push({data,transfer})};
    vm.runInNewContext(source,{self,OffscreenCanvas,performance:{now:()=>5},Uint8ClampedArray});
    self.onmessage({data:{id:1,width:2,height:2,maxPixels:4,maxBytes:48,bitmap}});
    assert.equal(bitmap.closed,1);assert.equal(sent.length,1);assert.equal(sent[0].data.ok,!fail);
    if(!fail){assert.deepEqual([...new Uint8ClampedArray(sent[0].data.buffer)],Array(16).fill(31));assert.equal(sent[0].transfer[0],sent[0].data.buffer);}
    else assert.match(sent[0].data.error,/Read denied/);
    assert.equal(surfaces[0].width,0);assert.equal(surfaces[0].height,0);
  }
});

test('missing worker canvas support reports a fatal capability failure and still closes the bitmap',()=>{
  for(const hasCanvas of [false,true]){
    const sent=[],bitmap={width:2,height:2,closed:0,close(){this.closed++;}},self={postMessage:data=>sent.push(data)};
    const context={self,performance:{now:()=>0}};
    if(hasCanvas)context.OffscreenCanvas=class{getContext(){return null;}};
    vm.runInNewContext(source,context);self.onmessage({data:{id:1,width:2,height:2,maxPixels:4,maxBytes:48,bitmap}});
    assert.equal(sent[0].ok,false);assert.equal(sent[0].fatal,true);assert.equal(bitmap.closed,1);
  }
});
