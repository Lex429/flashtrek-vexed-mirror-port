const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture(){
  const effects=[],canvases=[],drawn=[];
  const context=()=>({getTransform:()=>({a:1,b:0,c:0,d:1}),save(){},restore(){},translate(){},scale(){},
    setTransform(){},clearRect(){},drawImage(...args){drawn.push(args);},fillRect(){},beginPath(){},rect(){},clip(){},createLinearGradient:()=>({addColorStop(){}})});
  const document={createElement:()=>{const canvas={width:0,height:0,getContext:context};canvases.push(canvas);return canvas;}};
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-sprite-cache.js'),'utf8'),
    {window,document,performance:{now:()=>0}});
  const asset={art:{width:315,height:512},width:315,height:512,damageStage:0,profile:{effects:{draw:(...args)=>effects.push(args)}}};
  return {cache:window.nativeShipSpriteCache,ctx:context(),asset,effects,canvases,window,drawn};
}

test('unlit healthy fleets share immutable display-sized artwork; art and size invalidate it within the existing budget',()=>{
  const {cache,ctx,asset,window,effects,drawn}=fixture();window.nativeFlightLightingEnabled=false;
  for(let frame=0;frame<3;frame++)for(let ship=0;ship<200;ship++)cache.draw(ctx,asset,24,40,frame*50);
  assert.equal(cache.snapshot().counters.spriteMisses,1);
  assert.equal(cache.snapshot().counters.spriteRebuilds,0);
  assert.equal(effects.length,0,'healthy unlit artwork must not acquire animated effects');
  const raster=drawn.at(-1)[0];assert.equal(raster.width,48);assert.equal(raster.height,80);
  asset.art={width:315,height:512};cache.draw(ctx,asset,24,40,200);cache.draw(ctx,asset,30,40,200);
  assert.equal(cache.snapshot().counters.spriteMisses,3);
  for(let size=50;size<150;size++)cache.draw(ctx,asset,size,size*2,300);
  const stats=cache.snapshot();assert.ok(stats.counters.evictions>0);assert.ok(stats.bytes<=stats.limits.bytes);assert.ok(stats.sprites.entries<=64);
  window.nativeFlightLightingEnabled=true;cache.draw(ctx,asset,24,40,350);
  assert.equal(effects.length,1,'reenabling lights restores the animated presentation');
});

test('lighting and warp use bounded screen-sized rasters and freeze at simulation time',()=>{
  const {cache,ctx,asset,effects,canvases}=fixture();
  const options={localLight:{direction:.7,color:0xffdb9e,bright:.22}};
  assert.equal(cache.draw(ctx,asset,68,110,1000,options),true);
  const initial=cache.snapshot();
  assert.equal(initial.counters.spriteRebuilds,1);
  assert.equal(cache.draw(ctx,asset,68,110,1000,options),true);
  assert.equal(cache.snapshot().counters.spriteRebuilds,1,'pause does not rerender shaders');
  assert.equal(effects.length,1);
  assert.ok(canvases.filter(c=>c.width!==2048).every(c=>c.height<asset.height),'individual sprites stay screen-sized; directional shades share one bounded atlas');
  cache.draw(ctx,asset,68,110,1100,{...options,kind:'departure'});
  assert.equal(effects.length,2);
  assert.equal(effects[1][1].h,asset.height,'warp keeps original effect-space geometry');
  assert.ok(cache.snapshot().bytes<=cache.snapshot().limits.bytes);
});

test('GPU-owned lamps keep one immutable hull raster without disabling the global lighting preference',()=>{
  const {cache,ctx,asset,window,effects}=fixture();let submissions=0;
  window.nativeFlightLightingEnabled=true;
  window.nativeShipLampGPU={queue(){submissions++;return true;}};
  for(let frame=0;frame<20;frame++)for(let ship=0;ship<100;ship++)cache.draw(ctx,asset,24,40,frame*100,{lights:true,damage:true});
  assert.equal(submissions,2000);assert.equal(window.nativeFlightLightingEnabled,true);
  assert.equal(effects.length,0);assert.equal(cache.snapshot().counters.spriteMisses,1);
  assert.equal(cache.snapshot().counters.spriteRebuilds,0);
});

test('a declined GPU lamp submission retains the existing Canvas effects and their simulation clock',()=>{
  const {cache,ctx,asset,window,effects}=fixture();
  window.nativeShipLampGPU={queue:()=>false};
  cache.draw(ctx,asset,24,40,1450,{lights:true,damage:true});
  assert.equal(effects.length,1);assert.equal(effects[0][4],1450);
  cache.draw(ctx,asset,24,40,1450,{lights:true,damage:true});assert.equal(effects.length,1);
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
  assert.equal(cache.snapshot().counters.spriteMisses,6);
  assert.ok(cache.snapshot().counters.lightingMisses>=3,'light changes refresh the shade, not a duplicate animated hull');
  assert.equal(cache.draw(ctx,asset,NaN,110,1000,options),false);
  assert.equal(cache.draw(ctx,asset,68,Infinity,1000,options),false);
});

test('two hundred distinct light directions share their animated hull without cache thrashing',()=>{
  const {cache,ctx,asset,effects}=fixture();
  for(let frame=0;frame<2;frame++)for(let ship=0;ship<200;ship++)cache.draw(ctx,asset,24,40,1000+frame*20,
    {localLight:{direction:ship*.02,color:0xffdb9e,bright:.22}});
  const snapshot=cache.snapshot();assert.equal(snapshot.sprites.entries,1);assert.equal(effects.length,2);
  assert.equal(snapshot.counters.spriteMisses,1);assert.ok(snapshot.counters.lightingHits>=200);
  assert.ok(snapshot.bytes<=snapshot.limits.bytes);
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
