const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

async function fixture(){
  const calls={creates:0,hits:[],poses:[],renders:[],hidden:[],destroyed:0},listeners=new Map();
  const overlay={style:{},setAttribute(){},addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:name=>listeners.delete(name),remove(){this.removed=true;}};
  const space={width:1200,height:800,parentNode:{insertBefore(){}}};
  const renderer={setFleet(rows){calls.fleet=rows;},updatePose:(i,p)=>calls.poses.push({i,...p}),
    hit:(i,p)=>calls.hits.push({i,...p}),hide:i=>calls.hidden.push(i),
    render(time,options){calls.renders.push({time,...options});return {active:options.effects?1:0};},
    snapshot:()=>({textureUploads:0}),destroy(){calls.destroyed++;}};
  const effects=Object.freeze({}),cache=Object.freeze({}),window={nativeShipEffects:effects,nativeShipSpriteCache:cache,
    nativeShipDefinitions:{surfaceRadii:()=>({rx:20,ry:30})},
    createVexedShieldGPU:async()=>{calls.creates++;return renderer;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror/shield-gpu-live.js'),'utf8'),
    {window,document:{getElementById:()=>space,createElement:()=>overlay},console});
  const api=await window.vexedShieldGPUReady;
  const ctx={canvas:space,getTransform:()=>({a:2,b:0,c:0,d:2,e:7,f:11})};
  const entity={shields:100,hull:100},descriptor={entity,id:'player',x:14,y:18,heading:Math.PI/2,dimensions:{width:20,height:40},definition:{}};
  const view={cx:300,cy:200,ship:{x:10,y:20},zoom:1.5},flash={x:12,y:-9,born:1000,energy:1.4,charge:1,weaponEventId:7};
  return {api,window,calls,ctx,descriptor,view,flash,overlay,listeners,effects,cache};
}

test('default installation is idempotent and leaves shared gameplay owners intact',async()=>{
  const f=await fixture();assert.equal(await f.window.installVexedShieldGPU(),f.api);
  assert.equal(f.calls.creates,1);assert.equal(f.window.nativeShipEffects,f.effects);assert.equal(f.window.nativeShipSpriteCache,f.cache);
  assert.equal(f.calls.fleet.length,128);assert.equal(f.overlay.hidden,true);
});

test('GPU contacts retain rotation, zoom, display scale and the simulation clock without mutation',async()=>{
  const f=await fixture(),before=JSON.stringify([f.descriptor,f.flash]);
  assert.equal(f.api.submit(f.ctx,f.descriptor,f.view,f.flash,1020,{front:true}),false);
  f.api.beginFrame(f.ctx);
  assert.equal(f.api.submit(f.ctx,f.descriptor,f.view,f.flash,1020,{front:false}),true);
  assert.equal(f.calls.hits.length,0,'back pass does not submit a second effect');
  assert.equal(f.api.submit(f.ctx,f.descriptor,f.view,f.flash,1020,{front:true}),true);
  const hit=f.calls.hits[0],pose=f.calls.poses[0],contact=f.api.snapshot().contacts[0];
  assert.equal(hit.x,36);assert.equal(hit.y,-27);assert.equal(hit.born,1000);
  assert.equal(pose.x,619);assert.equal(pose.y,405);assert.equal(pose.rx,60);assert.equal(pose.ry,90);
  assert.ok(Math.abs(pose.angle-Math.PI)<1e-10);assert.ok(Math.abs(contact.x-583)<1e-10);assert.ok(Math.abs(contact.y-432)<1e-10);
  f.api.endFrame(f.ctx,1020);assert.equal(f.calls.renders[0].time,1020);assert.equal(f.overlay.hidden,false);
  assert.equal(JSON.stringify([f.descriptor,f.flash]),before);
  assert.equal(f.api.submit({...f.ctx,canvas:{}},f.descriptor,f.view,f.flash,1020,{front:true}),false,'other Canvas consumers keep their existing shader');
});

test('repeated hits refresh one bounded slot and unseen ships, menus and disabled effects leave no stale overlay',async()=>{
  const f=await fixture();f.api.beginFrame(f.ctx);
  for(let i=0;i<500;i++)f.api.submit(f.ctx,f.descriptor,f.view,{...f.flash,born:1000+i},1500,{front:true});
  assert.equal(f.api.snapshot().slots,1);assert.equal(f.api.snapshot().events,500);
  f.api.endFrame(f.ctx,1500);f.api.beginFrame(f.ctx);assert.equal(f.overlay.hidden,true);
  f.api.endFrame(f.ctx,1600);assert.deepEqual(f.calls.hidden,[0]);
  f.api.setEnabled(false);f.api.beginFrame(f.ctx);
  assert.equal(f.api.submit(f.ctx,f.descriptor,f.view,f.flash,1600,{front:true}),true);
  f.api.endFrame(f.ctx,1600);assert.equal(f.overlay.hidden,true);assert.equal(f.calls.renders.at(-1).effects,false);
  f.api.reset();assert.equal(f.api.snapshot().slots,0);assert.equal(f.overlay.hidden,true);
});

test('visual overflow remains bounded without touching any entity',async()=>{
  const f=await fixture(),entities=Array.from({length:300},(_,id)=>({id,hull:100,shields:100}));
  const before=JSON.stringify(entities);f.api.beginFrame(f.ctx);
  for(const entity of entities)f.api.submit(f.ctx,{...f.descriptor,entity,id:entity.id},f.view,f.flash,1100,{front:true});
  assert.equal(f.api.snapshot().slots,128);assert.equal(f.api.snapshot().overBudget,172);
  assert.equal(JSON.stringify(entities),before);
});

test('context loss permits the existing fallback and restoration replaces GPU resources cleanly',async()=>{
  const f=await fixture();let prevented=false;
  f.listeners.get('webglcontextlost')({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(f.api.available,false);assert.equal(f.overlay.hidden,true);
  f.api.beginFrame(f.ctx);assert.equal(f.api.submit(f.ctx,f.descriptor,f.view,f.flash,1100,{front:true}),false);
  f.listeners.get('webglcontextrestored')();const restored=await f.window.installVexedShieldGPU();
  assert.notEqual(restored,f.api);assert.equal(restored.available,true);assert.equal(f.calls.destroyed,1);assert.equal(f.calls.creates,2);
  restored.destroy();restored.destroy();assert.equal(f.calls.destroyed,2);assert.equal(f.window.vexedShieldGPU,undefined);
});
