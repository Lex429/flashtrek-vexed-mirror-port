const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror/shield-flash.js'),'utf8');
function fixture(){
  const canvases=[];
  const matrix={a:1,b:0,c:0,d:1,e:0,f:0};
  const context=()=>{
    const clears=[],radialGradients=[];
    return new Proxy({globalAlpha:1,clears,radialGradients,getTransform:()=>matrix,
      clearRect:(...args)=>clears.push(args),
      createRadialGradient:(...args)=>{const stops=[];const gradient={args,stops,addColorStop:(...stop)=>stops.push(stop)};radialGradients.push(gradient);return gradient;},
      createLinearGradient:()=>({addColorStop(){}})},
      {get:(o,k)=>k in o?o[k]:()=>{}});
  };
  const document={createElement:()=>{
    const canvas={width:0,height:0},ctx=context();ctx.canvas=canvas;
    canvas.getContext=()=>ctx;canvases.push(canvas);return canvas;
  }};
  const window={};vm.runInNewContext(source,{window,document});
  const ctx=context();ctx.canvas={width:1280,height:850};
  const hit={born:1000,charge:.7,energy:1,x:20,y:-30,dx:0,dy:1,kind:'beam'};
  const draw=(w,h,time=1150,target=ctx)=>window.drawShowcaseShieldSurface(target,0,0,w,h,'#50d5ff',.7,time,{impact:hit,refract:true});
  const other=context();other.canvas={width:1280,height:850};
  return {window,ctx,other,hit,draw,canvases,count:()=>canvases.length};
}
test('alternating shield sizes and drawing contexts reuse and clear exact-size refraction surfaces',()=>{
  const f=fixture();for(let i=0;i<3;i++)f.draw(40+i*10,70+i*10);
  const initial=f.count();assert.equal(initial,6);
  for(let frame=0;frame<100;frame++)for(let i=0;i<3;i++)f.draw(40+i*10,70+i*10,1150,frame%2?f.ctx:f.other);
  const stats=f.window.showcaseShieldCache.snapshot();
  assert.equal(f.count(),initial);assert.equal(stats.hits,300);assert.equal(stats.misses,3);
  assert.equal(stats.pixels,f.canvases.reduce((sum,c)=>sum+c.width*c.height,0));
  assert.equal(stats.bytes,stats.pixels*4);
  for(const canvas of f.canvases){
    const ctx=canvas.getContext('2d');assert.equal(ctx.clears.length,101);
    assert.ok(ctx.clears.every(args=>args[0]===0&&args[1]===0&&args[2]===canvas.width&&args[3]===canvas.height));
  }
  for(const canvas of f.canvases.filter((_,i)=>i%2===0)){
    const gradients=canvas.getContext('2d').radialGradients;
    assert.equal(gradients.length,1,'Reuse must not rebuild the unchanged refraction gradient');
    assert.equal(gradients[0].stops.length,4);
  }
});
test('different artwork at the same hull dimensions shares cleared scratch storage',()=>{
  const f=fixture();
  for(let i=0;i<100;i++)f.window.drawShowcaseShieldFlash(f.ctx,{width:256,height:512},40,80,f.hit,1100+i);
  assert.equal(f.count(),1);
  const stats=f.window.showcaseShieldCache.snapshot(),canvas=f.canvases[0];
  assert.equal(stats.entries,1);assert.equal(stats.pixels,40*80);assert.equal(stats.hits,99);
  assert.equal(canvas.getContext('2d').clears.length,100);
  assert.ok(canvas.getContext('2d').clears.every(args=>args.join(',')==='0,0,40,80'));
});
test('expired and future hits allocate no surfaces',()=>{
  const f=fixture();f.draw(40,80,900);f.draw(40,80,1620);assert.equal(f.count(),0);
  f.hit.charge=0;f.draw(40,80,1430);assert.equal(f.count(),0);
});
test('changing viewport/zoom sizes remain bounded and eviction/clear release both backing stores',()=>{
  const f=fixture();
  for(let i=0;i<180;i++){
    f.draw(80+i*3,100+i*3);const stats=f.window.showcaseShieldCache.snapshot();
    assert.ok(stats.pixels<=stats.limits.pixels);assert.ok(stats.entries<=stats.limits.entries);
    assert.equal(stats.pixels,f.canvases.reduce((sum,c)=>sum+c.width*c.height,0));
  }
  const stats=f.window.showcaseShieldCache.snapshot();assert.ok(stats.evictions>0);
  assert.equal(f.canvases.filter(c=>c.width===0&&c.height===0).length,stats.evictions*2);
  f.window.showcaseShieldCache.clear();const cleared=f.window.showcaseShieldCache.snapshot();
  assert.equal(cleared.pixels,0);assert.equal(cleared.entries,0);
  assert.ok(f.canvases.every(c=>c.width===0&&c.height===0));
  f.window.showcaseShieldCache.clear();assert.equal(f.window.showcaseShieldCache.snapshot().pixels,0);
  const allocations=f.count();f.draw(40,80);
  assert.equal(f.count(),allocations+2);assert.equal(f.window.showcaseShieldCache.snapshot().entries,1);
});
test('oversized one-off shields preserve full dimensions without evicting the working set',()=>{
  const f=fixture();f.draw(40,80);const before=f.window.showcaseShieldCache.snapshot();
  f.draw(3000,3000);const after=f.window.showcaseShieldCache.snapshot();
  assert.equal(after.pixels,before.pixels);assert.equal(after.entries,before.entries);
  assert.equal(after.oversize,1);assert.equal(after.evictions,before.evictions);
  assert.equal(after.allocations,before.allocations+2);
  const radii=f.window.showcaseShieldRadii(3000,3000);
  assert.ok(f.canvases.slice(-2).every(c=>c.width===Math.ceil(radii.rx*2)&&c.height===Math.ceil(radii.ry*2)));
  const allocations=f.count();f.draw(40,80);assert.equal(f.count(),allocations);
});
test('entry-limit eviction respects a recently reused size',()=>{
  const f=fixture(),image={width:256,height:512};
  const flash=width=>f.window.drawShowcaseShieldFlash(f.ctx,image,width,30,f.hit,1150);
  for(let i=0;i<64;i++)flash(20+i);
  assert.equal(f.window.showcaseShieldCache.snapshot().entries,64);
  const first=f.canvases[0],second=f.canvases[1];
  flash(20);flash(84);
  const stats=f.window.showcaseShieldCache.snapshot();
  assert.equal(stats.entries,64);assert.equal(stats.evictions,1);
  assert.ok(first.width>0&&first.height>0);
  assert.equal(second.width,0);assert.equal(second.height,0);
  const allocations=f.count();flash(20);assert.equal(f.count(),allocations);
});
