const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture(){
  const timers=[],reads=[],writes=[];let elapsed=0;
  class Canvas{
    constructor(){this.width=0;this.height=0;}
    getContext(){return this.context??=new Context(this);}
  }
  class Context{
    constructor(canvas){this.canvas=canvas;}
    createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};}
    drawImage(source){this.data=new Uint8ClampedArray(source.data||source.getContext('2d').data);}
    getImageData(x,y,width,height){reads.push(width*height);const source=this.data||new Uint8ClampedArray(this.canvas.width*this.canvas.height*4),image=this.createImageData(width,height);for(let row=0;row<height;row++)image.data.set(source.subarray(((y+row)*this.canvas.width+x)*4,((y+row)*this.canvas.width+x+width)*4),row*width*4);return image;}
    putImageData(image,x,y){writes.push(image.width*image.height);this.data??=new Uint8ClampedArray(this.canvas.width*this.canvas.height*4);for(let row=0;row<image.height;row++)this.data.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),((y+row)*this.canvas.width+x)*4);}
    fillRect(){}save(){}restore(){}beginPath(){}arc(){}rect(){}clip(){}clearRect(){}
  }
  const window={starterShips:new Map()},context=vm.createContext({window,document:{createElement:()=>new Canvas()},console,Int16Array,Uint8ClampedArray,
    performance:{now:()=>elapsed+=.05},setTimeout:callback=>{timers.push(callback);return timers.length;}});
  for(const file of ['showcase-stage-fragments.js','cthia-destruction.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror',file),'utf8'),context);
  const frames=Array.from({length:4},(_,stage)=>{
    const width=48,height=64,data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width-stage*7;x++)data.set([x+20,y+40,120,255],(y*width+x)*4);
    return {width,height,data};
  });
  const flush=()=>{let calls=0;while(timers.length){timers.shift()();assert.ok(++calls<10000,'bounded cooperative queue');}return calls;};
  const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror',file),'utf8'),context);
  return {window,frames,timers,flush,reads,writes,Canvas,load};
}

test('fragment and wreck pixel partition preparation yields to one bounded shared queue',async()=>{
  const {window,frames,timers,flush}=fixture(),destruction=window.createShipDestruction();
  const fragments=window.showcaseStageFragments.prepareAsync(frames,[[8,16],[35,42]]);
  const wreck=destruction.prepareAsync(frames,{sites:[['bow',8,16],['stern',35,42]],structural:true,core:[24,32]});
  assert.equal(destruction.audit().length,0,'pixel processing did not run synchronously');
  assert.equal(timers.length,1,'all classes share one scheduled callback');
  const callbacks=flush();await wreck;const prepared=await fragments;
  assert.ok(callbacks>1,'large enough preparation yields between chunks');
  for(const stage of destruction.audit())assert.equal(stage.sourcePixels,stage.cutPixels,'every source pixel has exactly one wreck owner');
  assert.ok(prepared[1].length>0);assert.ok(destruction.memoryBytes()>0);
  const metrics=window.nativeDamageArtPreparation.snapshot();
  assert.equal(metrics.pending,0);assert.equal(metrics.completed,2);assert.equal(metrics.failed,0);
  assert.ok(metrics.maxSliceMs<3,'mocked clock demonstrates global slice budget');
});

test('native pixel transfers are bounded stripes and reconstruct every channel exactly',()=>{
  const {window,Canvas,reads,writes}=fixture(),source=new Canvas();source.width=271;source.height=129;
  const context=source.getContext('2d');context.data=Uint8ClampedArray.from({length:source.width*source.height*4},(_,i)=>(i*13+7)%256);
  const queue=window.nativeDamageArtPreparation,image=queue.finish(queue.pixels.read(context,source.width,source.height));
  assert.deepEqual(image.data,context.data);assert.ok(reads.length>1);assert.ok(Math.max(...reads)<=queue.snapshot().limits.pixelChunk);
  const destination=new Canvas();destination.width=source.width;destination.height=source.height;
  queue.finish(queue.pixels.write(destination.getContext('2d'),image));
  assert.deepEqual(destination.getContext('2d').data,context.data,'row boundaries retain source pixels without gaps or overlap');
  assert.ok(writes.length>1);assert.ok(Math.max(...writes)<=queue.snapshot().limits.pixelChunk);
});

test('foreground appearances pass optional work without starving the existing queue',async()=>{
  const {window,flush}=fixture(),order=[],queue=window.nativeDamageArtPreparation;
  function* work(label,steps){for(let i=0;i<steps;i++){order.push(label);yield label;}}
  const background=queue.run(work('optional',40)),foreground=queue.run(work('appearance',40),{priority:1});
  flush();await Promise.all([foreground,background]);
  assert.equal(order[0],'appearance');assert.ok(order.indexOf('optional')<8,'optional work receives a bounded service opportunity');
  assert.equal(queue.snapshot().operations.appearance.steps,40);assert.ok(queue.snapshot().maxStepMs>0);
});

test('suspended readbacks remain bounded queue work and resume results and failures exactly once',async()=>{
  const {window,flush}=fixture(),queue=window.nativeDamageArtPreparation,resolvers=[];
  const tasks=Array.from({length:queue.snapshot().limits.maxPending},(_,index)=>queue.run((function*(){
    try{return yield new Promise((resolve,reject)=>resolvers.push({resolve,reject,index}));}
    catch(error){assert.equal(error.message,'readback failure');return 'retained-art fallback';}
  })()));
  flush();assert.equal(queue.snapshot().waiting,64);assert.equal(queue.snapshot().pending,64);assert.equal(queue.snapshot().queued,0);
  await assert.rejects(queue.run((function*(){return 1;})()),/queue is full/);
  for(const entry of resolvers)entry.index===3?entry.reject(Error('readback failure')):entry.resolve(entry.index);
  for(let i=0;queue.snapshot().pending;i++){assert.ok(i<20,'suspended work drains after resolution');await Promise.resolve();flush();}
  const results=await Promise.all(tasks);
  assert.equal(results[3],'retained-art fallback');assert.equal(results[63],63);
  assert.equal(queue.snapshot().pending,0);assert.equal(queue.snapshot().completed,64);assert.equal(queue.snapshot().failed,0);
});

test('synchronous showcase API retains the exact source pixels and structural metadata',()=>{
  const {window,frames}=fixture(),destruction=window.createShipDestruction();
  destruction.prepare(frames,{sites:[['bow',8,16],['stern',35,42]],partition:{owner:(x)=>x<24?0:1},structural:true,farTravel:true});
  for(const stage of destruction.audit()){
    assert.equal(stage.sourcePixels,stage.cutPixels);assert.equal(stage.structural,true);assert.ok(stage.edgePixels>0);
  }
  const state={time:0,angle:0,debris:[],particles:[]};
  destruction.emit(state,{x:0,y:0,w:48,h:64},piece=>({x:piece.x*48,y:piece.y*64}),0,1);
  assert.equal(state.debris.reduce((n,piece)=>n+piece.pixels,0),frames[0].width*frames[0].height);
  const reconstructed=new Uint8ClampedArray(frames[0].data.length);
  for(const piece of state.debris){const width=piece.texture.width,height=piece.texture.height,left=Math.round(piece.x+24-width/2),top=Math.round(piece.y+32-height/2),pixels=piece.texture.getContext('2d').data;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const source=(y*width+x)*4;if(pixels[source+3])reconstructed.set(pixels.subarray(source,source+4),((top+y)*48+left+x)*4);}}
  assert.deepEqual(reconstructed,frames[0].data,'every channel is retained exactly across all structural pieces');
});

test('biological foreground preparation and full fragment readiness use the same cooperative owner',async()=>{
  const {window,frames,flush,load,timers}=fixture();load('wreckage-effects.js');load('bioship-effects.js');
  for(const frame of frames)for(let i=0;i<frame.data.length;i+=4)if(frame.data[i+3])frame.data.set([180,120,40,255],i);
  const biology=window.createBiologicalShipEffects({width:48,height:64,vascular:true,wounds:[[],[],[],[]],organs:[],sites:[[8,16],[35,42]]});
  const appearance=biology.effects.prepareFrameAsync(frames[0],0);
  assert.equal(biology.effects.snapshot(0,0,{lights:true}).vascularPixels,0,'vascular pixels are not processed synchronously');
  flush();await appearance;assert.ok(biology.effects.snapshot(0,0,{lights:true}).vascularPixels>0);
  assert.equal(biology.effects.prepareFrameAsync(frames[0],0),appearance,'foreground requests deduplicate');
  const complete=biology.prepareAsync(frames);let done=false;complete.then(()=>done=true);
  for(let i=0;!done;i++){assert.ok(i<20,'full preparation completes');flush();await Promise.resolve();}
  await biology.ready;assert.equal(timers.length,0);
  for(const stage of biology.audit())assert.equal(stage.sourcePixels,stage.cutPixels,'living fragments conserve material');
  assert.ok(window.wreckageEffects.snapshot().prepared>0,'full readiness includes burnt material');
});

test('unlighting fallback yields between regions and pixels while sharing repeated requests',async()=>{
  const {window,frames,flush,load}=fixture();load('cthia-effects.js');
  const effects=window.createShowcaseEffects({width:48,height:64,offTint:'green',offRegions:[]});
  for(const frame of frames)for(let i=0;i<frame.data.length;i+=4)if(frame.data[i+3])frame.data.set([40,180,60,255],i);
  const pending=effects.unlitFrameAsync(frames[0]);assert.equal(effects.unlitFrameAsync(frames[0]),pending);
  assert.equal(window.nativeDamageArtPreparation.snapshot().completed,0);flush();
  const image=await pending,synchronous=effects.unlitFrame(frames[0]);
  assert.deepEqual(image.getContext('2d').data,synchronous.getContext('2d').data);
  assert.ok(image.coreUnlit);assert.ok(window.nativeDamageArtPreparation.snapshot().operations['appearance:unlight'].steps>0);
});

test('failed asynchronous readback keeps the source and completes one bounded striped fallback',async()=>{
  const {window,frames,flush,load}=fixture();load('cthia-effects.js');
  window.createShipArtReadback=()=>({read:()=>Promise.reject(Error('GPU readback unavailable')),snapshot:()=>({failed:1,pending:0})});
  const effects=window.createShowcaseEffects({width:48,height:64,offTint:'green',offRegions:[]});
  let done=false;const pending=effects.unlitFrameAsync(frames[0]);pending.then(()=>done=true);
  for(let i=0;!done;i++){assert.ok(i<20,'failed worker must not leave a pending appearance');flush();await Promise.resolve();}
  const actual=await pending,expected=effects.unlitFrame(frames[0]);assert.deepEqual(actual.getContext('2d').data,expected.getContext('2d').data);
  const metrics=window.nativeDamageArtPreparation.snapshot();assert.equal(metrics.pending,0);assert.equal(metrics.failed,0);assert.equal(metrics.completed,1);
  assert.equal(metrics.readbackFallbacks,1);assert.equal(metrics.readback.failed,1,'worker failure remains observable despite successful art fallback');
});

test('serialized CThia partitions preserve the approved torn seam ownership',()=>{
  const {window}=fixture();
  window.starterShips={get:()=>({destruction:{sites:[['stub',0,0]]}})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror/earth-fractures.js'),'utf8'),{window});
  const original=window.earthFractureConfigs.get(59).partition;
  const restored=window.createTornHullPartition(structuredClone(original.serialized));
  const buffer=Buffer.alloc(365*512*2);let i=0;
  for(let y=0;y<512;y++)for(let x=0;x<365;x++){
    const owner=restored.owner(x+.137,y-.281);
    assert.equal(owner,original.owner(x+.137,y-.281));buffer.writeUInt16LE(owner,i++*2);
  }
  // Captured from the pre-migration approved partition, including float seams.
  assert.equal(require('node:crypto').createHash('sha256').update(buffer).digest('hex'),'796b961a397e23e71ede661fa0bc4c61ac59e9504add092c85ba7794b377cf8b');
});

test('showcase preparation suspends during a stress test and resumes without losing work',async()=>{
  const {window,frames,flush}=fixture(),queue=window.nativeDamageArtPreparation;
  queue.setPaused(true);
  const pending=window.showcaseStageFragments.prepareAsync(frames,[[8,16],[35,42]]);
  assert.equal(flush(),0);assert.equal(queue.snapshot().completed,0);assert.equal(queue.snapshot().pending,1);
  queue.setPaused(false);flush();await pending;assert.equal(queue.snapshot().pending,0);
  assert.equal(queue.snapshot().completed,1);
});
