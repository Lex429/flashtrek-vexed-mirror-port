const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture(){
  const effects=[],canvases=[];
  const context=()=>({getTransform:()=>({a:1,b:0,c:0,d:1}),save(){},restore(){},translate(){},scale(){},
    setTransform(){},clearRect(){},drawImage(){},fillRect(){},createLinearGradient:()=>({addColorStop(){}})});
  const document={createElement:()=>{const canvas={width:0,height:0,getContext:context};canvases.push(canvas);return canvas;}};
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-sprite-cache.js'),'utf8'),
    {window,document,performance:{now:()=>0}});
  const asset={art:{width:315,height:512},width:315,height:512,damageStage:0,profile:{effects:{draw:(...args)=>effects.push(args)}}};
  return {cache:window.nativeShipSpriteCache,ctx:context(),asset,effects,canvases};
}

test('lighting and warp use bounded screen-sized rasters and freeze at simulation time',()=>{
  const {cache,ctx,asset,effects,canvases}=fixture();
  const options={localLight:{direction:.7,color:0xffdb9e,bright:.22}};
  assert.equal(cache.draw(ctx,asset,68,110,1000,options),true);
  const initial=cache.snapshot();
  assert.equal(initial.counters.spriteRebuilds,1);
  assert.equal(cache.draw(ctx,asset,68,110,1000,options),true);
  assert.equal(cache.snapshot().counters.spriteRebuilds,1,'pause does not rerender shaders');
  assert.equal(effects.length,1);
  assert.ok(canvases.every(c=>c.height<asset.height),'lighting never allocates original artwork height');
  cache.draw(ctx,asset,68,110,1100,{...options,kind:'departure'});
  assert.equal(effects.length,2);
  assert.equal(effects[1][1].h,asset.height,'warp keeps original effect-space geometry');
  assert.ok(cache.snapshot().bytes<=cache.snapshot().limits.bytes);
});

test('art, damage, light, dimensions and warp state invalidate the appropriate cached layer',()=>{
  const {cache,ctx,asset}=fixture();
  const options={localLight:{direction:.7,color:0xffdb9e,bright:.22}};
  const draw=(appearance=options,width=68)=>cache.draw(ctx,asset,width,110,1000,appearance);
  draw();draw();assert.equal(cache.snapshot().counters.spriteMisses,1);
  draw({...options,localLight:{...options.localLight,direction:1.1}});
  draw({...options,localLight:{...options.localLight,color:0xff0000}});
  draw(options,80);
  asset.damageStage=2;draw();asset.art={};draw();
  draw({...options,kind:'departure'});draw({...options,lights:false});
  assert.equal(cache.snapshot().counters.spriteMisses,8);
  assert.equal(cache.draw(ctx,asset,NaN,110,1000,options),false);
  assert.equal(cache.draw(ctx,asset,68,Infinity,1000,options),false);
});

test('sprite, shade and lamp cache memory is bounded and observable under churn',()=>{
  const {cache,ctx,asset}=fixture();
  for(let i=0;i<500;i++){
    cache.draw(ctx,asset,45+i%19,100+i%7,i*100,{kind:i%2?'arrival':undefined,
      localLight:{direction:i*.3,color:0xffdb9e,bright:.22}});
  }
  const snapshot=cache.snapshot();
  assert.ok(snapshot.counters.evictions>0);
  assert.ok(snapshot.bytes<=snapshot.limits.bytes);
  assert.ok(snapshot.entries<=snapshot.limits.entries);
  assert.equal(snapshot.bytes,snapshot.pixels*4);
  cache.reset();assert.equal(cache.snapshot().bytes,0);assert.equal(cache.snapshot().entries,0);
});
