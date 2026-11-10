const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(loader){
  const canvases=[],requests=[],window={},math=Object.create(Math);math.random=()=>{throw Error('Nebulae consumed gameplay randomness');};
  function context(){return new Proxy({draws:[],writes:0,drawImage(...args){this.draws.push({args,alpha:this.globalAlpha});},createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(image){this.writes++;this.pixels=Uint8ClampedArray.from(image.data);}}, {
    get:(target,key)=>target[key]??(String(key).startsWith('create')?()=>({addColorStop(){}}):key==='getImageData'?()=>{throw Error('Live nebulae read pixels');}:()=>{}),
    set:(target,key,value)=>(target[key]=value,true)
  });}
  window.vexedFlightAssets={loadImage(path){requests.push(path);return loader?loader(path):Promise.resolve({width:path.includes('orion')?1280:2000,height:path.includes('orion')?1280:693,path});}};
  const scope=vm.createContext({window,Math:math,document:{createElement(){const ctx=context(),canvas={width:0,height:0,getContext:kind=>kind==='2d'?ctx:null};canvases.push(canvas);return canvas;}},requestAnimationFrame:callback=>setImmediate(callback)});
  for(const file of ['world-data.js','manual-flight.js','flight-reference-data.js','vexed-space-model.js','nebula-gas.js','procedural-nebulae.js','vexed-space.js'])
    vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),scope,{filename:file});
  return {window,api:window.nativeParallaxNebulae,canvases,requests,context};
}
const view={w:1200,h:800,playerX:0,playerY:0,cameraX:0,cameraY:0,reducedMotion:false};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);

test('density deforms at fixed positions over time, is repeatable and has finite cloud edges',()=>{
  const {window:w}=fixture(),gas=w.nativeNebulaGas;let changed=0;
  for(let y=-.8;y<=.8;y+=.2)for(let x=-.8;x<=.8;x+=.2){
    const a=gas.densityAt(x,y,0,2,4),b=gas.densityAt(x,y,3,2,4);
    assert.deepEqual(b,gas.densityAt(x,y,3,2,4));
    if(Math.abs(a.density-b.density)>.02)changed++;
    assert.ok(Number.isFinite(b.density)&&b.density>=0&&b.density<=1);
  }
  assert.ok(changed>20);assert.equal(gas.densityAt(2,2,30,0,1).density,0);
});

test('nebulae have finite geography, smooth borders and empty interstellar stretches',()=>{
  const {api}=fixture();
  for(const place of api.places){
    assert.equal(api.coverage(place,{x:place.x,y:place.y}),1);
    assert.equal(api.coverage(place,{x:place.x+place.rx*1.01,y:place.y}),0);
    for(const distance of [.62,.8,.999,1]){
      const a=api.coverage(place,{x:place.x+place.rx*(distance-.0001),y:place.y});
      const b=api.coverage(place,{x:place.x+place.rx*(distance+.0001),y:place.y});
      assert.ok(Math.abs(a-b)<.002);
    }
  }
  assert.equal(api.nearby(1,{playerX:2e6,playerY:2e6}).length,0);
});

test('fixed parallax rates slide clouds with camera travel without growth or a viewport leash',()=>{
  const {api}=fixture(),place=api.places.find(p=>p.id==='harman-wisps');
  const before=api.layers.map(layer=>api.projection(place,layer,32,view,20));
  const after=api.layers.map(layer=>api.projection(place,layer,32,{...view,cameraX:4000},20));
  for(let i=0;i<before.length;i++){
    close(before[i].x-after[i].x,4000*api.layers[i].rate);assert.equal(before[i].width,after[i].width);assert.equal(before[i].height,after[i].height);
  }
  assert.ok(after[0].x-before[0].x>after[2].x-before[2].x);
  const away=api.projection(place,api.layers[0],32,{...view,cameraX:1e6},20);assert.ok(away.x+away.width<0);
});

test('physical coordinate rebases preserve all nebula layers and changing government cannot move them',()=>{
  const {api,window:w}=fixture(),earth=w.nativeManualFlight.chartPosition(1),destination=w.nativeManualFlight.chartPosition(32);
  const old={...view,playerX:(destination.x-earth.x)*1000,playerY:(destination.y-earth.y)*1000,cameraX:(destination.x-earth.x)*1000,cameraY:(destination.y-earth.y)*1000};
  for(const place of api.places)for(const layer of api.layers){
    const a=api.projection(place,layer,1,old,10),b=api.projection(place,layer,32,view,10);
    for(const key of ['x','y','width','height','alpha','angle'])close(a[key],b[key]);
  }
  const before=JSON.stringify(api.nearby(32));w.VexedMirrorWorld.systems.find(s=>s.id===32).government='New government';
  assert.equal(JSON.stringify(api.nearby(32)),before);
});

test('gas motion changes density while camera, cloud geometry and brightness stay fixed',()=>{
  const {api}=fixture(),place=api.places.find(p=>p.id==='vex-clouds'),layer=api.layers[1];
  const a=api.projection(place,layer,34,view,0),b=api.projection(place,layer,34,view,30),repeat=api.projection(place,layer,34,view,30);
  assert.deepEqual(a,b);assert.deepEqual(b,repeat);
  assert.deepEqual(api.projection(place,layer,34,{...view,reducedMotion:true},0),api.projection(place,layer,34,{...view,reducedMotion:true},1000));
});

test('fallback gas reuses its output surface, caches paused paints and never requests images or changes game state',async()=>{
  const {api,window:w,canvases,requests,context}=fixture(),field=api.create(),ctx=context(),state=w.vexedSpaceModel.create(34).state;
  await field.prepare(34);const allocated=canvases.length,saved=JSON.stringify(state),small={...view,w:48,h:32};
  field.render(ctx,small,state);const warm=field.metrics();
  for(let i=0;i<10;i++)field.render(ctx,small,state);
  assert.equal(canvases.length,allocated);assert.equal(requests.length,0);
  assert.equal(warm.backend,'canvas-procedural');assert.equal(warm.loadedImages,0);assert.equal(warm.procedural,true);
  assert.ok(warm.draws>0&&warm.surfaceBytes<=96*64*4);assert.equal(field.metrics().fieldRenders,warm.fieldRenders);
  assert.ok(field.metrics().cacheHits>=10);
  assert.equal(JSON.stringify(state),saved);
  const before=JSON.stringify(field.metrics().layers);field.rebase({...state,elapsed:20});
  field.render(ctx,small,{...state,elapsed:-20});assert.equal(JSON.stringify(field.metrics().layers),before);
});

test('empty space does not initialize a renderer, and gas is independent of the image loader',async()=>{
  const {api,window:w,requests,context}=fixture(()=>Promise.reject(Error('Image unavailable'))),field=api.create();
  field.render(context(),{...view,playerX:2e6,playerY:2e6},w.vexedSpaceModel.create(1).state);assert.equal(requests.length,0);
  assert.equal(w.nativeNebulaGas.metrics().renders,0);
  const result=await field.prepare(34);assert.equal(result.imageRequests,0);
  field.render(context(),{...view,w:32,h:24},w.vexedSpaceModel.create(34).state);
  assert.equal(requests.length,0);assert.ok(field.metrics().draws>0);
});

test('cancelled preparation never activates another system or starts image work',async()=>{
  const {api,window:w,requests}=fixture(),field=api.create(),controller=new AbortController();controller.abort();
  await assert.rejects(field.prepare(34,{signal:controller.signal}),/cancelled/);
  assert.equal(w.vexedSpace.state.system,1);assert.equal(requests.length,0);
});

test('strong nebulae follow the existing region catalog and leave familiar home systems clear',()=>{
  const {api,window:w}=fixture();
  assert.deepEqual(Array.from(api.places,p=>p.system).sort((a,b)=>a-b),Array.from(w.VexedMirrorWorld.systems).filter(s=>s.nebula).map(s=>s.id).sort((a,b)=>a-b));
  for(const system of [1,2,25,58,31,38])assert.equal(api.nearby(system).length,0,`System ${system} was assigned an unsupported nebula`);
  for(const place of api.places)assert.equal(place.basis,place.system===73?'television-plasma-region':'broken-mirror-anomaly');
});

test('Badlands and all anomaly regions use evolving gas rather than photographic or baked cloud textures',async()=>{
  const {api,window:w,requests,context}=fixture(()=>{throw Error('The plasma region fetched a photograph');}),field=api.create();
  await field.prepare(73);field.render(context(),{...view,w:32,h:24},w.vexedSpaceModel.create(73).state);
  const before=field.metrics();assert.equal(requests.length,0);assert.equal(before.loadedImages,0);
  assert.ok(before.layers.length>0&&before.layers.every(layer=>layer.source==='procedural-gas'&&layer.basis==='television-plasma-region'));
  for(const place of api.places)assert.equal(place.source,'procedural-gas');
});

test('CPU fallback changes actual density pixels at fixed geometry and retains them when paused',async()=>{
  const {api,window:w,canvases,context}=fixture(),field=api.create(),small={...view,w:32,h:24};await field.prepare(34);
  field.render(context(),small,{system:34,elapsed:0});const output=canvases.find(canvas=>ArrayBuffer.isView(canvas.getContext('2d')?.pixels)),ctx=output.getContext('2d'),first=Uint8ClampedArray.from(ctx.pixels);
  field.render(context(),small,{system:34,elapsed:30});const moving=Uint8ClampedArray.from(ctx.pixels);assert.notDeepEqual(first,moving);
  const writes=ctx.writes;field.render(context(),small,{system:34,elapsed:30});assert.equal(ctx.writes,writes);assert.deepEqual(ctx.pixels,moving);
  field.render(context(),{...small,reducedMotion:true},{system:34,elapsed:100});const reduced=Uint8ClampedArray.from(ctx.pixels);
  field.render(context(),{...small,reducedMotion:true},{system:34,elapsed:200});assert.deepEqual(ctx.pixels,reduced);
});
