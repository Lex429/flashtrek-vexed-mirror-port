const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.join(__dirname,'..'),shared=path.join(root,'html-games/flashtrek-broken-mirror');
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function environment(extra={}){
  const math=Object.create(Math),next=seeded(4292026);let calls=0;
  math.random=()=>{calls++;return next();};const original=math.random;
  const context=vm.createContext({window:{},Math:math,...extra});
  return {context,window:context.window,load:file=>vm.runInContext(fs.readFileSync(file,'utf8'),context),
    gameplay:math.random,calls:()=>calls,unchanged:()=>math.random===original};
}
const plain=value=>JSON.parse(JSON.stringify(value));
function assertGameplayIntact(env){
  assert.equal(env.calls(),0,'cosmetic work must not consume the gameplay stream');
  assert.deepEqual(Array.from({length:12},env.gameplay),Array.from({length:12},seeded(4292026)));
  assert.ok(env.unchanged(),'global Math.random keeps its original identity');
}
function canvas(){
  const count={rects:0,arcs:0,strokes:0};
  const gradient=()=>({addColorStop(){}});
  return {count,save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},
    fillRect(){count.rects++;},fill(){},arc(x,y,r){assert.ok([x,y,r].every(Number.isFinite));count.arcs++;},
    stroke(){count.strokes++;},createRadialGradient:gradient,createLinearGradient:gradient};
}

test('shared hull bursts keep particle ranges while deferred emissions and painting leave gameplay randomness intact',()=>{
  const env=environment();env.load(path.join(shared,'showcase-hull-burst.js'));
  const particles=[],api=env.window.showcaseHullBurst,ctx=canvas();
  api.burst(particles,{x:25,y:75},100,1,1);
  assert.ok(particles.length>=14&&particles.length<=31);
  for(const p of particles){
    assert.equal(p.born,100);assert.ok(Math.abs(p.x-25)<3.21&&Math.abs(p.y-75)<3.21);
    const speed=Math.hypot(p.vx,p.vy)/.8;
    assert.ok(p.core?speed>=20&&speed<75:speed>=90&&speed<310);
    assert.ok(p.core?p.ttl>=140&&p.ttl<260:p.ttl>=120&&p.ttl<340);
    api.update(p,.01);api.draw(ctx,p,105);
  }
  for(let deferred=0;deferred<8;deferred++)api.burst(particles,{x:-deferred,y:deferred},150+deferred,1,1,.65,true);
  for(let frame=0;frame<4;frame++)for(const particle of particles)api.draw(ctx,particle,160+frame);
  assert.ok(ctx.count.rects>particles.length);
  assertGameplayIntact(env);
});

test('shared wreck emission and trails preserve physical trajectories and the repair iframe parent RNG',()=>{
  const env=environment();env.load(path.join(shared,'cthia-destruction.js'));
  const inline=fs.readFileSync(path.join(shared,'live-repair-assets.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const child=environment({parent:env.window});vm.runInContext(inline,child.context);
  assert.equal(child.window.cthiaDestruction,env.window.cthiaDestruction,'repair iframe uses the actual parent owner');
  const data={pieces:[
    {name:'plate',pixels:400,x:.1,y:0,w:.2,h:.3,structural:true,farTravel:true,edgePixels:4,edgeX:.02,edgeY:.01,coreX:0,coreY:0},
    {name:'chip',pixels:40,x:-.1,y:.1,w:.05,h:.05,structural:true,farTravel:true,edgePixels:2,coreX:0,coreY:0}],
    core:{x:0,y:0},coreEnabled:false,energyColor:'#24aaff'};
  const layout={x:10,y:20,w:120,h:180},world=p=>({x:10+p.x*120,y:20+p.y*180});
  const fresh=()=>({time:1000,angle:.7,particles:[],debris:[]});
  const alias=child.window.cthiaDestruction,varied=env.window.createShipDestruction();
  varied.emitFragments(fresh(),layout,world,3,1,data); // Different prior cosmetic history.
  const a=fresh(),b=fresh();alias.emitFragments(a,layout,world,3,1,data);varied.emitFragments(b,layout,world,3,1,data);
  assert.deepEqual(plain(a.debris),plain(b.debris));assert.equal(a.debris.length,2);
  assert.ok(Math.abs(a.debris[0].vx-Math.cos(-.19)*250)<1e-10);
  assert.ok(Math.abs(a.debris[0].vy-Math.sin(-.19)*250)<1e-10);
  assert.equal(a.debris[0].spin,.25);assert.equal(a.debris[0].w,24);assert.equal(a.debris[0].h,54);
  assert.equal(a.particles.length,60,'original blast, spark, fire and smoke counts remain');
  for(const p of a.particles.filter(p=>p.realistic==='spark')){
    assert.ok(Math.hypot(p.vx,p.vy)>=50&&Math.hypot(p.vx,p.vy)<185);
    assert.ok(p.ttl>=500&&p.ttl<1450);
  }
  const motionBefore=plain(a.debris.map(({trailAt,...piece})=>piece));a.time=1200;alias.updateTrails(a);
  assert.deepEqual(plain(a.debris.map(({trailAt,...piece})=>piece)),motionBefore,'trail emission does not change physical fragments');
  assert.ok(a.particles.length>60,'real structural trail branch emitted particles');
  const spark=a.particles.find(p=>p.born===1200&&p.realistic==='spark'),ctx=canvas();
  assert.ok(spark);alias.drawParticle(ctx,spark,1201);assert.equal(ctx.count.strokes,1);
  assertGameplayIntact(env);assertGameplayIntact(child);
});

test('menu star construction, motion, resizing, hiding and reduced motion do not advance later gameplay RNG',()=>{
  const ctx=canvas(),handlers=new Map(),rafs=new Map(),view={w:600,h:450};let nextRaf=0;
  const canvasElement={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:view.w,height:view.h})};
  const reduced={matches:false,addEventListener(){}},menuArt={hidden:false},game={classList:{contains:()=>false},getBoundingClientRect:canvasElement.getBoundingClientRect,addEventListener:(name,handler)=>handlers.set(name,handler)};
  const env=environment({document:{hidden:false,body:{classList:{contains:()=>false}},getElementById:id=>id==='menu-space'?canvasElement:{},addEventListener(){}},
    menuArt,game,devicePixelRatio:1,matchMedia:()=>reduced,
    ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},
    requestAnimationFrame:callback=>{rafs.set(++nextRaf,callback);return nextRaf;},cancelAnimationFrame:id=>rafs.delete(id)});
  env.window.nativeView={fit:()=>view};env.window.nativePause={active:false};
  env.load(path.join(root,'html-games/broken-mirror-port/menu-starfield.js'));env.load(path.join(root,'html-games/broken-mirror-port/menu-space.js'));
  const menu=vm.runInContext('menuSpace',env.context);menu.prepare();
  for(let frame=0;frame<80;frame++){
    if(frame%10===0){view.w=600+frame*3;handlers.get('pointermove')({clientX:frame*12,clientY:frame*4});menu.prepare();}
    const [id,callback]=rafs.entries().next().value;rafs.delete(id);callback(1000+frame*100);
  }
  menuArt.hidden=true;menu.prepare();assert.equal(rafs.size,0);
  menuArt.hidden=false;reduced.matches=true;menu.prepare();assert.equal(rafs.size,0);
  assert.ok(menu.state.frames>80);assert.ok(ctx.count.arcs>=185*80);
  assertGameplayIntact(env);
});
