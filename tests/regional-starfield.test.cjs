const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const window={},canvases=[],math=Object.create(Math);math.random=()=>{throw Error('Decorative stars consumed gameplay randomness');};
  function context(){return new Proxy({draws:[],gradients:[],fills:[],strokes:[],path:[],
    drawImage(...args){this.draws.push({args,alpha:this.globalAlpha});},
    createLinearGradient(...points){const stops=[],gradient={points,stops,addColorStop(...stop){stops.push(stop);}};this.gradients.push(gradient);return gradient;},
    beginPath(){this.path=[];},moveTo(x,y){this.path.push([x,y]);},lineTo(x,y){this.path.push([x,y]);},
    fill(){this.fills.push({path:[...this.path],alpha:this.globalAlpha});},
    stroke(){this.strokes.push({path:[...this.path],style:this.strokeStyle,width:this.lineWidth,composite:this.globalCompositeOperation});}
  }, {
    get:(target,key)=>target[key]??(String(key).startsWith('create')?()=>({addColorStop(){}}):()=>{}),
    set:(target,key,value)=>(target[key]=value,true)
  });}
  const scope=vm.createContext({window,Math:math,document:{createElement(){const canvas={getContext:context};canvases.push(canvas);return canvas;}},requestAnimationFrame:callback=>setImmediate(callback)});
  for(const file of ['world-data.js','manual-flight.js','flight-reference-data.js','vexed-space-model.js','regional-starfield.js','vexed-space.js'])
    vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),scope,{filename:file});
  return {window,api:window.nativeRegionalStarfield,canvases,context};
}
const view={w:900,h:600,playerX:0,playerY:0,reducedMotion:true};
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

test('painted regional streaks keep their retained northbound axis when a fast camera frame has no displacement',()=>{
  const {api,window:w,context}=fixture(),model=w.vexedSpaceModel.create(1),ctx=context();
  const command={speed:450,maxSpeed:450,locx:0,locy:450/13,flightVx:0,flightVy:-450,courseLocked:true};
  for(let frame=0;frame<240;frame++)model.update(1/60,command);
  model.update(1/120,{...command,locy:0});assert.equal(model.state.motionX,0);assert.equal(model.state.motionY,0);
  api.create().render(ctx,{...view,reducedMotion:false},model.state);
  assert.ok(ctx.gradients.length>0);
  for(const {points:[x1,y1,x2,y2]} of ctx.gradients){assert.ok(y2>y1);close(x2,x1);}
});

test('all destinations and arbitrary interstellar coordinates have repeatable bounded geography',()=>{
  const {window:w,api}=fixture();
  for(const system of w.VexedMirrorWorld.systems){
    const a=api.sample(system.id),b=api.sample(system.id);
    assert.deepEqual(a,b);assert.ok(a.density>=.15&&a.density<=4);
    assert.ok(a.weights.every(n=>Number.isFinite(n)&&n>=0));close(a.weights.reduce((x,y)=>x+y),1);
    assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
  }
  for(const [x,y] of [[-1000,900],[10000,-30000],[NaN,Infinity]]){
    const result=api.sampleAt(x,y);assert.ok(Number.isFinite(result.density));close(result.weights.reduce((a,b)=>a+b),1);
  }
});

test('rebasing a ship into any system frame samples the same physical sky, independent of government',()=>{
  const {window:w,api}=fixture(),earth=w.nativeManualFlight.chartPosition(1);
  for(const system of w.VexedMirrorWorld.systems){
    const point=w.nativeManualFlight.chartPosition(system.id);if(!point)continue;
    const local=api.sample(system.id,view),global=api.sample(1,{...view,playerX:(point.x-earth.x)*1000,playerY:(point.y-earth.y)*1000});
    close(local.density,global.density);local.weights.forEach((n,i)=>close(n,global.weights[i]));
    system.governmentId=999;system.government='Changed ownership';assert.deepEqual(api.sample(system.id,view),local);
  }
});

test('named regions have distinct dominant blue, green and red mixes and dramatic density differences',()=>{
  const {api}=fixture(),blue=api.sample(58),green=api.sample(31),red=api.sample(38),badlands=api.sample(73),harman=api.sample(32),vex=api.sample(34);
  assert.ok(blue.weights[1]>.6);assert.ok(green.weights[3]>.4);assert.ok(red.weights[5]>.4);
  assert.ok(badlands.weights[4]+badlands.weights[5]>.75);
  assert.ok(blue.density>badlands.density*15);assert.ok(vex.density>harman.density*9);
  assert.ok(api.sampleAt(-285,-145).density<.2);
});

test('regional colours and densities stay continuous at noise-cell and named-region edges',()=>{
  const {api}=fixture(),points=[[0,0],[-62,117],[71,-83],[-139.8+29,-30.7],[-94.15,236.85],[214.85,255.85]];
  for(const region of api.regions)points.push([region.x+region.rx,region.y],[region.x,region.y+region.ry]);
  for(const [x,y] of points){
    const a=api.sampleAt(x-.001,y-.001),b=api.sampleAt(x+.001,y+.001);
    assert.ok(Math.abs(a.density-b.density)<.002);a.weights.forEach((n,i)=>assert.ok(Math.abs(n-b.weights[i])<.001));
  }
});

test('the actual painted population varies with density and preserves mixed regional colours at different viewports',()=>{
  const {api,window:w,context}=fixture(),field=api.create(),ctx=context();
  for(const width of [360,900,1920]){
    const draw=id=>{field.render(ctx,{...view,w:width},w.vexedSpaceModel.create(id).state);return field.metrics();};
    const sparse=draw(73),dense=draw(58),green=draw(31),red=draw(38);
    assert.ok(dense.visible>sparse.visible*10,JSON.stringify({width,sparse:sparse.visible,dense:dense.visible}));
    assert.ok(dense.familyEnergy[1]>dense.familyEnergy[0]*2);
    assert.ok(green.familyEnergy[3]>green.familyEnergy[5]*3);
    assert.ok(red.familyEnergy[5]>red.familyEnergy[1]*3);
    assert.ok(dense.familyEnergy.filter(n=>n>0).length>=5);
  }
});

test('manual system rebases keep small-star positions, colours and twinkle phases continuous',()=>{
  const {api,window:w,context}=fixture(),field=api.create(),model=w.vexedSpaceModel.create(1),ctx=context();
  model.update(6,{speed:200,locx:-200/13,locy:0,maxSpeed:450,courseLocked:true});
  const earth=w.nativeManualFlight.chartPosition(1),target=w.nativeManualFlight.chartPosition(4);
  const oldView={...view,playerX:(target.x-earth.x)*1000,playerY:(target.y-earth.y)*1000};
  field.render(ctx,oldView,model.state);const before=ctx.draws.splice(0);
  field.rebase(model.state);field.render(ctx,view,w.vexedSpaceModel.create(4).state);
  assert.equal(ctx.draws.length,before.length);
  ctx.draws.forEach((draw,i)=>{draw.args.slice(1).forEach((n,j)=>close(n,before[i].args[j+1]));close(draw.alpha,before[i].alpha);});
});

test('paused painting is repeatable, allocates one bounded atlas and leaves simulation state untouched',()=>{
  const {api,window:w,canvases,context}=fixture(),field=api.create(),model=w.vexedSpaceModel.create(34),ctx=context();
  const saved=JSON.stringify(model.state);field.render(ctx,view,model.state);const before=ctx.draws.splice(0);
  field.render(ctx,{...view,heading:Math.PI},model.state);assert.deepEqual(ctx.draws,before);
  for(let id=1;id<=91;id++)field.render(ctx,view,w.vexedSpaceModel.create(id).state);
  assert.equal(canvases.length,1);assert.equal(field.metrics().pool,1376);assert.equal(field.metrics().atlasBuilds,1);
  assert.equal(JSON.stringify(model.state),saved);
});

test('destination preparation warms the regional atlas without activating or reallocating the sky',async()=>{
  const {window:w,canvases,context}=fixture(),sky=w.vexedSpace,before=JSON.stringify(sky.state);
  const ready=await sky.prepareSystem(58);assert.equal(JSON.stringify(sky.state),before);assert.equal(ready.textures,210);
  const allocations=canvases.length;sky.enterSystem(58,true);sky.render(context(),view);
  assert.equal(canvases.length,allocations);assert.equal(sky.starfield.name,'Vega blue-rich concentration');
  assert.ok(sky.starfield.visible>500);
});

test('fast regional stars recover the original tapered diamonds and 20/34-unit fading screen streaks',()=>{
  const {api,window:w,context}=fixture(),field=api.create(),model=w.vexedSpaceModel.create(31),ctx=context();
  for(let frame=0;frame<240;frame++)model.update(1/60,{speed:450,locx:-450/13,locy:0,maxSpeed:450,courseLocked:true});
  field.render(ctx,{...view,reducedMotion:false},model.state);
  assert.ok(ctx.fills.length>50);assert.ok(ctx.gradients.length>10);
  for(const fill of ctx.fills){
    assert.equal(fill.path.length,4);
    const [sideA,tipA,sideB,tipB]=fill.path,long=[tipA[0]-tipB[0],tipA[1]-tipB[1]],short=[sideA[0]-sideB[0],sideA[1]-sideB[1]];
    close(long[0]*short[0]+long[1]*short[1],0);assert.ok(Math.hypot(...long)>Math.hypot(...short)*10);
    close(sideA[0]+sideB[0],tipA[0]+tipB[0]);close(sideA[1]+sideB[1],tipA[1]+tipB[1]);
  }
  for(const stroke of ctx.strokes){
    const [start,end]=stroke.path,length=Math.hypot(end[0]-start[0],end[1]-start[1]);
    assert.ok([20,34].some(n=>Math.abs(length-n*model.state.speedEffect)<1e-8));
    assert.equal(stroke.composite,'screen');assert.ok(stroke.width>=.65);
    assert.equal(stroke.style.stops[0][0],0);assert.match(stroke.style.stops[0][1],/,0\)$/);
    assert.equal(stroke.style.stops[1][0],1);assert.ok(Number(stroke.style.stops[1][1].split(',')[3].slice(0,-1))>0);
    assert.ok(start[0]>end[0],'The fading tail trails actual travel rather than ship heading');
  }
});

test('ordinary and reduced-motion flight have no streaks; braking eases away the original trail lengths',()=>{
  const {api,window:w,context}=fixture(),field=api.create(),model=w.vexedSpaceModel.create(58);
  const command=speed=>({speed,locx:-speed/13,locy:0,maxSpeed:450,courseLocked:true});
  model.update(5,command(200));const calm=context();field.render(calm,{...view,reducedMotion:false},model.state);
  assert.equal(calm.fills.length,0);assert.equal(calm.strokes.length,0);
  for(let frame=0;frame<240;frame++)model.update(1/60,command(450));
  const fast=context();field.render(fast,{...view,reducedMotion:false},model.state);assert.ok(fast.strokes.length>0);
  const reduced=context();field.render(reduced,view,model.state);assert.equal(reduced.fills.length,0);assert.equal(reduced.strokes.length,0);
  const previous=model.state.speedEffect;model.update(1/60,command(0));assert.ok(model.state.speedEffect<previous&&model.state.speedEffect>previous*.9);
  const braking=context();field.render(braking,{...view,reducedMotion:false},model.state);
  assert.ok(braking.strokes.length>0);
  for(let frame=0;frame<120;frame++)model.update(1/60,command(0));
  const stopped=context();field.render(stopped,{...view,reducedMotion:false},model.state);
  assert.equal(stopped.fills.length,0);assert.equal(stopped.strokes.length,0);
});

test('ordered batching preserves each sprite and flushes before original speed trails',()=>{
  for(const speed of [0,450]){
    const {api,window:w,context}=fixture(),model=w.vexedSpaceModel.create(58),viewFast={...view,reducedMotion:false};
    for(let i=0;i<120;i++)model.update(1/60,{speed,locx:-speed/13,locy:0,maxSpeed:450,courseLocked:true});
    const baseline=context();api.create().render(baseline,viewFast,model.state);
    const queued=[],events=[],ctx=context();let ended=false;
    w.nativeStarfieldBatch={begin:()=>true,add(x,y,sx,sy,alpha){assert.equal(ended,false);queued.push({x,y,sx,sy,alpha});},end(){ended=true;events.push('flush');return {instances:queued.length,draws:1};}};
    const fill=ctx.fill.bind(ctx);ctx.fill=()=>{events.push('trail');fill();};
    const field=api.create();field.render(ctx,viewFast,model.state);
    assert.equal(queued.length+ctx.draws.length,baseline.draws.length);
    queued.forEach((draw,i)=>{const ref=baseline.draws[i];assert.deepEqual([draw.sx,draw.sy,draw.x,draw.y],[ref.args[1],ref.args[2],ref.args[5],ref.args[6]]);close(draw.alpha,ref.alpha);});
    assert.deepEqual(ctx.draws,baseline.draws.slice(queued.length));
    const gradientData=list=>list.map(({points,stops})=>({points,stops}));
    assert.deepEqual(gradientData(ctx.gradients),gradientData(baseline.gradients));assert.deepEqual(ctx.fills,baseline.fills);
    assert.equal(events[0],'flush');assert.equal(field.metrics().batchedStars,queued.length);
    assert.equal(field.metrics().canvasDraws,ctx.draws.length+1);
    if(speed===0)assert.equal(ctx.draws.length,0);else assert.ok(ctx.draws.length>0&&queued.length>ctx.draws.length);
  }
});

test('an unavailable star batch keeps the original Canvas path',()=>{
  const {api,window:w,context}=fixture(),model=w.vexedSpaceModel.create(25),a=context(),b=context();
  api.create().render(a,view,model.state);w.nativeStarfieldBatch={begin:()=>false,add(){throw Error('Unavailable GPU used');}};
  const field=api.create();field.render(b,view,model.state);assert.deepEqual(a.draws,b.draws);
  assert.equal(field.metrics().renderer,'canvas');assert.equal(field.metrics().canvasDraws,field.metrics().draws);
});

test('stationary regional data is reused while twinkle still advances and crossings refresh it',()=>{
  const {api,window:w,context}=fixture(),field=api.create(),model=w.vexedSpaceModel.create(25),ctx=context();
  const movingView={...view,reducedMotion:false};field.render(ctx,movingView,model.state);const first=ctx.draws.splice(0);
  model.update(1,{speed:0,locx:0,locy:0,maxSpeed:450,courseLocked:true});
  field.render(ctx,movingView,model.state);assert.equal(field.metrics().regionBuilds,1);
  assert.equal(ctx.draws.length,first.length);assert.ok(ctx.draws.some((draw,i)=>draw.alpha!==first[i].alpha));
  field.render(ctx,{...movingView,playerX:800},model.state);assert.equal(field.metrics().regionBuilds,2);
  assert.equal(field.metrics().x,api.sample(25,{playerX:800}).x);
  field.render(ctx,{...movingView,playerX:801},model.state);assert.equal(field.metrics().regionBuilds,3);
  assert.deepEqual(field.metrics().weights,api.sample(25,{playerX:801}).weights);
});

test('a fully batched starfield does not write per-star Canvas transparency',()=>{
  const {api,window:w,context}=fixture(),ctx=context(),queued=[];let writes=0;
  Object.defineProperty(ctx,'globalAlpha',{get:()=>1,set:()=>writes++,configurable:true});
  w.nativeStarfieldBatch={begin:()=>true,add(...args){queued.push(args);},end:()=>({draws:1,instances:queued.length})};
  const field=api.create();field.render(ctx,view,w.vexedSpaceModel.create(25).state);
  assert.ok(queued.length>1000);assert.equal(writes,0);assert.equal(field.metrics().draws,queued.length);
});
