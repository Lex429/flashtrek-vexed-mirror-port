const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
  class Image {set src(value){this.onload?.();}}
  const context=vm.createContext({window:{},Image,document:{createElement:()=>{throw Error('Drawing must not prepare artwork');}},console});
  for(const file of ['debris-impacts.js','cthia-destruction.js','dot-basic-damage.js','drone-showcase.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror',file),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/effect-visibility.js'),'utf8'),context);
  const w=context.window,texture={width:4,height:4};w.cthiaDestruction=w.createShipDestruction();
  w.droneSprites={definitions:{repair:{basic:{scale:512/1254,pivot:[627,627]}}},
    fragments:()=>[{texture,x:0,y:0,width:4,height:4,pixels:16}],
    damageChange:()=>({sites:[{x:0,y:0,stage:1,site:0}],pieces:[{texture,x:0,y:0,width:4,height:4,source:{x:0,y:0,width:4,height:4}}]})};
  return w;
}
function context(){
  const work={images:0,gradients:0,paints:0,arcs:[]},ctx={save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},
    drawImage(){work.images++;},createRadialGradient(){work.gradients++;return {addColorStop(){}};},
    arc(...args){work.arcs.push(args);},ellipse(){},fill(){work.paints++;},fillRect(){work.paints++;},stroke(){work.paints++;}};
  return {ctx,work};
}
const pose=(x=0,y=0)=>({tier:'basic',role:'repair',position:{x,y},heading:0,scale:1,time:0,before:0,after:1});
const visible=w=>(x,y,r)=>w.nativeEffectVisibility.circle(x,y,r,{w:100,h:100});

test('repair artwork stays unavailable to drawing and fog until its complete bundle is ready',async()=>{
  let frame,finish;const ready=new Promise(resolve=>finish=resolve),window={};
  const document={createElement(){return frame={contentWindow:{droneSprites:{ready},dotBasicDamage:{},droneShowcase:{}}};},body:{append(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/repair-visuals.js'),'utf8'),{window,document,console});
  const api=window.nativeRepairVisuals,pending=api.ensure(),loaded=frame.onload();
  assert.equal(api.ready(),false);assert.equal(api.fogArtwork({entity:{hull:40}}),null);
  finish([true]);await loaded;await pending;assert.equal(api.ready(),true);
});

test('a failed repair artwork load cannot publish a partial bundle that crashes fog drawing',async()=>{
  let frame;const window={},document={createElement(){return frame={contentWindow:{}};},body:{append(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/repair-visuals.js'),'utf8'),{window,document,console:{warn(){}}});
  const api=window.nativeRepairVisuals,pending=api.ensure();await frame.onload();await assert.rejects(pending);
  assert.equal(api.ready(),false);assert.equal(api.fogArtwork({entity:{hull:40}}),null);
});

test('the live DOT body is drawable after base load while optional lamp and damage preparation is pending',async()=>{
  let frame,finishBase,finishOptional,draws=0,optionalComplete=false;
  const baseReady=new Promise(resolve=>finishBase=resolve),ready=new Promise(resolve=>finishOptional=resolve);
  ready.then(()=>{optionalComplete=true;});
  const window={nativeSimulation:{now:()=>1000},nativeRepairWork:{drawThrusters(){}}};
  const document={createElement(){return frame={contentWindow:{droneSprites:{baseReady,ready,draw(){draws++;return true;}},dotBasicDamage:{},droneShowcase:{}}};},body:{append(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/repair-visuals.js'),'utf8'),{window,document,console});
  const api=window.nativeRepairVisuals,pending=api.ensure(),loaded=frame.onload();let ensureComplete=false;pending.then(()=>{ensureComplete=true;});assert.equal(api.ready(),false);
  finishBase([true]);await new Promise(resolve=>setImmediate(resolve));assert.equal(api.ready(),true);assert.equal(optionalComplete,false);assert.equal(ensureComplete,false);
  const ctx={save(){},restore(){},translate(){},scale(){},rotate(){}};
  assert.equal(api.drawDrone(ctx,{state:{},x:0,y:0,heading:0,entity:{hull:40,phase:'repairing'},definition:{artwork:{scale:1}}},{cx:0,cy:0,ship:{x:0,y:0}}),true);
  assert.equal(draws,1);finishOptional([true]);await ready;await loaded;await pending;assert.equal(ensureComplete,true);
});
test('damage fragments, flash gradients, smoke and spark strokes do no offscreen painting and drawing stays read-only',()=>{
  const w=fixture(),effects=w.dotBasicDamage.createEffects();effects.emit(pose(10000,10000));const before=JSON.stringify(effects.snapshot());
  const legacy=context();effects.draw(legacy.ctx,100);assert.ok(legacy.work.images>0);assert.ok(legacy.work.gradients>0);assert.ok(legacy.work.paints>0);
  const culled=context();for(let i=0;i<5;i++)effects.draw(culled.ctx,100,{visible:visible(w)});
  assert.equal(culled.work.images,0);assert.equal(culled.work.gradients,0);assert.equal(culled.work.paints,0);assert.equal(culled.work.arcs.length,0);
  assert.equal(JSON.stringify(effects.snapshot()),before,'painting cannot expire or advance effects');
  const explicit=context();effects.draw(explicit.ctx,100,{visible:()=>true});assert.deepEqual(explicit.work,legacy.work,'default showcase drawing retains every original operation');
});
test('destroyed Dot wreck surfaces, reactor glows, particles and waves are culled before expensive painting',()=>{
  const w=fixture(),effects=w.droneShowcase.createDestruction();assert.equal(effects.emit(pose(10000,10000)),true);const before=JSON.stringify(effects.snapshot());
  const legacy=context();effects.draw(legacy.ctx,100);assert.ok(legacy.work.images>0);assert.ok(legacy.work.gradients>0);assert.ok(legacy.work.paints>0);
  const culled=context();effects.draw(culled.ctx,100,{visible:visible(w)});
  assert.equal(culled.work.images,0);assert.equal(culled.work.gradients,0);assert.equal(culled.work.paints,0);assert.equal(culled.work.arcs.length,0);
  assert.equal(JSON.stringify(effects.snapshot()),before);
  const explicit=context();effects.draw(explicit.ctx,100,{visible:()=>true});assert.deepEqual(explicit.work,legacy.work);
});
test('a shockwave centered outside the viewport still paints its crossing edge without changing effect state',()=>{
  const w=fixture(),effects=w.droneShowcase.createDestruction();effects.emit(pose(-20,50));const before=JSON.stringify(effects.snapshot()),paint=context();
  effects.draw(paint.ctx,350,{visible:visible(w)});
  assert.ok(paint.work.arcs.some(([x,y,r])=>x===-20&&y===50&&Math.abs(r-45)<1e-9),'visible expanding shockwave was lost because its center is offscreen');
  assert.ok(paint.work.paints>0);assert.equal(JSON.stringify(effects.snapshot()),before);
});
