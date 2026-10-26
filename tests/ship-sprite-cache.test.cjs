const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture({legacyPhaseCap=false}={}){
  const effects=[],canvases=[],drawCalls=[],drawn=[],clipRects=[];let time=0;
  const context=()=>({getTransform:()=>({a:1,b:0,c:0,d:1}),save(){},restore(){},translate(){},scale(){},
    setTransform(){},clearRect(){},drawImage(...args){drawCalls.push({context:this,args});drawn.push(args);},beginPath(){},rect(...args){clipRects.push({context:this,args});},clip(){},fillRect(){},createLinearGradient:()=>({addColorStop(){}})});
  const document={createElement:()=>{const canvas={width:0,height:0,getContext:context};canvases.push(canvas);return canvas;}};
  const window={};
  let source=fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-sprite-cache.js'),'utf8');
  if(legacyPhaseCap){const current='maxPhasePixels=maxLampPixels';assert.equal(source.split(current).length,2);source=source.replace(current,'maxPhasePixels=1_000_000');}
  vm.runInNewContext(source,
    {window,document,performance:{now:()=>time}});
  const asset={art:{width:315,height:512},width:315,height:512,damageStage:0,profile:{effects:{draw:(...args)=>effects.push(args)}}};
  return {window,drawn,cache:window.nativeShipSpriteCache,ctx:context(),asset,effects,canvases,drawCalls,clipRects,time:value=>{time=value;}};
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

test('art, damage, dimensions and warp invalidate animation while lighting only recomposes',()=>{
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
  assert.equal(cache.snapshot().counters.spriteRebuilds,6,'direction/color never rerun animated effects');
  assert.equal(cache.draw(ctx,asset,NaN,110,1000,options),false);
  assert.equal(cache.draw(ctx,asset,68,Infinity,1000,options),false);
});

test('turning and directional changes reuse surfaces without rerunning paused animation',()=>{
  const {cache,ctx,asset,effects,canvases}=fixture();
  const light={direction:0,color:0xffdb9e,bright:.22};
  cache.draw(ctx,asset,68,110,1000,{localLight:light,effectRate:60});
  const allocated=canvases.length;
  for(let i=1;i<=120;i++){
    const angle=i*.02;ctx.getTransform=()=>({a:Math.cos(angle),b:Math.sin(angle),c:-Math.sin(angle),d:Math.cos(angle)});
    cache.draw(ctx,asset,68,110,1000,{localLight:{...light,direction:angle},effectRate:60});
  }
  const snapshot=cache.snapshot();
  assert.equal(canvases.length,allocated,'ordinary rotation allocates no replacement canvas');
  assert.equal(snapshot.counters.canvasAllocations,allocated);
  assert.equal(snapshot.sprites.entries,1);assert.equal(snapshot.lighting.entries,1);
  assert.equal(effects.length,1,'directional light does not invalidate animation');
  assert.equal(snapshot.counters.spriteRebuilds,1);
  assert.equal(snapshot.counters.spriteCompositions,121,'the latest lighting still reaches the visible sprite');
  assert.equal(snapshot.counters.lightingMisses,121);
});

test('lit healthy NPCs retain 20Hz while players, damage and warp retain 60Hz',()=>{
  for(const [appearance,stage,expected]of [[{effectRate:20},0,20],[{effectRate:60},0,60],[{},1,60],[{kind:'departure'},0,60]]){
    const {cache,ctx,asset,effects}=fixture();asset.damageStage=stage;
    for(let i=0;i<60;i++)cache.draw(ctx,asset,68,110,i*1000/60+.01,
      {...appearance,localLight:{direction:i*.02,color:0xffdb9e,bright:.22}});
    assert.equal(effects.length,expected,JSON.stringify({appearance,stage}));
    assert.equal(cache.snapshot().counters.spriteMisses,1);
  }
});

test('direct lit previews retain 60Hz without requiring a player-only caller flag',()=>{
  const {cache,ctx,asset,effects}=fixture();
  for(let i=0;i<60;i++)cache.draw(ctx,asset,68,110,i*1000/60+.01,
    {localLight:{direction:i*.02,color:0xffdb9e,bright:.22}});
  assert.equal(effects.length,60,'existing direct lit callers keep their animation quality');
  assert.equal(cache.snapshot().counters.spriteMisses,1);
});

test('shared player and NPC artwork retains independent animation cadence',()=>{
  const {cache,ctx,asset,effects,canvases}=fixture();
  for(const time of [1000,1020,1040]){
    cache.draw(ctx,asset,68,110,time,{effectRate:60});
    cache.draw(ctx,asset,68,110,time,{effectRate:20});
  }
  assert.equal(effects.length,4,'three player frames and one healthy NPC frame');
  assert.equal(cache.snapshot().sprites.entries,2);
  assert.equal(canvases.length,4);
});

test('same-class fleet headings retain independent light and composition surfaces while sharing animation',()=>{
  const {cache,ctx,asset,effects,canvases}=fixture(),owners=Array.from({length:12},()=>({}));
  const draw=(owner,index,time)=>{const angle=index*.35;ctx.getTransform=()=>({a:Math.cos(angle),b:Math.sin(angle),c:-Math.sin(angle),d:Math.cos(angle)});
    cache.draw(ctx,asset,68,110,time,{owner,effectRate:20,localLight:{direction:angle,color:0xffdb9e,bright:.22}});};
  for(let frame=0;frame<120;frame++)for(let i=0;i<owners.length;i++)draw(owners[i],i,frame*1000/120+.01);
  const before=cache.snapshot(),allocated=canvases.length;
  assert.equal(effects.length,20,'all twelve crews share the same twenty animated frames');
  assert.equal(before.sprites.entries,1);assert.equal(before.compositions.entries,12);
  assert.equal(before.counters.lightingMisses,12,'stationary headings do not overwrite another ship lighting mask');
  assert.equal(before.counters.spriteCompositions,240,'per-ship surfaces compose only when their twenty-Hz effects change');
  for(let frame=1;frame<=120;frame++)draw(owners[3],3+frame*.01,119*1000/120+.01);
  assert.equal(canvases.length,allocated,'turning a crew reuses its own retained mask and composition');
  assert.equal(effects.length,20,'turning never invalidates shared frozen effects');
});

test('one hundred visible small craft fit independent headings without an artificial sixty-four-entry churn',()=>{
  const {cache,ctx,asset,effects}=fixture(),owners=Array.from({length:100},()=>({}));
  for(let frame=0;frame<3;frame++)for(let i=0;i<owners.length;i++)cache.draw(ctx,asset,10,17,1000,
    {owner:owners[i],effectRate:20,localLight:{direction:i*.06,color:0xffdb9e,bright:.22}});
  const result=cache.snapshot();assert.equal(result.lighting.entries,100);assert.equal(result.compositions.entries,100);
  assert.equal(result.counters.lightingMisses,100);assert.equal(result.counters.spriteCompositions,100);assert.equal(effects.length,1);
  assert.equal(result.counters.evictions,0);assert.ok(result.bytes<=result.limits.bytes);
});

test('profile-owned conservative support trims exterior presentation while retaining native compositions and fallback',()=>{
  const {cache,ctx,asset,drawCalls,clipRects}=fixture();let boundsCalls=0;
  asset.profile.effects.rasterBounds=(_stage,{width,height})=>{boundsCalls++;return {minX:-10,minY:0,maxX:width,maxY:height+5};};
  const appearance={effectRate:20,owner:{},trimPadding:true};
  cache.draw(ctx,asset,100,150,1000,appearance);const cropped=cache.snapshot(),first=drawCalls.filter(call=>call.context===ctx).at(-1).args;
  cache.draw(ctx,asset,100,150,1000,{...appearance,fullSurface:true});const full=drawCalls.filter(call=>call.context===ctx).at(-1).args;
  assert.equal(boundsCalls,1,'unchanged support is retained with shared animation data');
  assert.equal(first[0],full[0],'before and after use the identical retained native composition');
  assert.deepEqual(first,full,'the native source rectangle, image extent and transform stay identical');
  const clipped=clipRects.find(call=>call.context===ctx).args;
  assert.ok(clipped[2]<full[3]&&clipped[3]<full[4],'only exterior transparent presentation work is clipped');
  assert.ok(clipped[0]<-50&&clipped[1]<-75,'the full aligned hull and declared outward effects remain inside the presentation');
  assert.ok(cropped.counters.paddingPixelsSkipped>0);assert.ok(cropped.counters.presentationQuadPixels<full[0].width*full[0].height/4);
  assert.equal(cache.snapshot().counters.spriteRebuilds,1,'full-surface comparison shares unchanged animated effects');
  assert.ok(cache.snapshot().bytes<=cache.snapshot().limits.bytes);
  asset.art={};asset.profile.effects.rasterBounds=()=>({minX:NaN,minY:0,maxX:1,maxY:1});
  cache.draw(ctx,asset,100,150,1000,appearance);const failed=drawCalls.filter(call=>call.context===ctx).at(-1).args;
  assert.equal(failed[0].width,full[0].width);assert.equal(failed[0].height,full[0].height);
  assert.equal(cache.snapshot().counters.boundsFallbacks,1,'malformed effect support preserves the existing full render surface');
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

test('recurring original lamp pulse phases reuse exact filtered pixels within the same cache budget',()=>{
  const {cache,ctx,canvases}=fixture(),textures={lit:{width:19,height:23},dim:{}},point={left:2,top:3};
  cache.drawLamp(ctx,textures,point,0,{lightGain:2.8,lightBloom:2.5});
  for(let phase=0;phase<=16;phase++)assert.equal(cache.drawLamp(ctx,textures,point,phase/16,{lightGain:2.8,lightBloom:2.5}),true);
  for(let phase=0;phase<=16;phase++)cache.drawLamp(ctx,textures,point,phase/16,{lightGain:2.8,lightBloom:2.5});
  const snapshot=cache.snapshot();
  assert.equal(snapshot.lamps.entries,1,'the live lamp keeps its reusable working surface');
  assert.equal(snapshot.lamps.phaseEntries,17,'the original exact phases retain bounded optional copies');
  assert.equal(snapshot.lamps.brightnessEntries,1);assert.equal(snapshot.counters.lampBrightMisses,1);assert.equal(snapshot.counters.lampHits,34);
  assert.equal(snapshot.counters.lampGlowRebuilds,34,'each phase must return after another radius before optional admission');
  assert.equal(canvases.length,19,'all phase copies share one live lamp and retain its filtered source neighbourhood');
  assert.ok(canvases.slice(2).some(canvas=>canvas.width<canvases[1].width),'phase snapshots still crop unused transparent padding');
  for(let phase=0;phase<=16;phase++)cache.drawLamp(ctx,textures,point,phase/16,{lightGain:2.8,lightBloom:2.5});
  assert.equal(cache.snapshot().counters.lampGlowRebuilds,34,'a repeated cycle does not invoke native blur again');
  assert.equal(cache.snapshot().counters.lampPhaseHits,snapshot.counters.lampPhaseHits+17);
  assert.equal(canvases.length,19,'a repeated pulse cycle allocates no additional surfaces');
  cache.drawLamp(ctx,textures,point,1,{lightGain:2.8,lightBloom:2.5});
  assert.equal(cache.snapshot().counters.lampGlowRebuilds,34,'an unchanged paused phase does not rerasterize');
  cache.drawLamp(ctx,textures,point,.5,{lightGain:1,lightBloom:2.5});
  assert.equal(cache.snapshot().lamps.brightnessEntries,2,'a different gain has independent bright pixels');
  cache.drawLamp(ctx,textures,point,.5,{lightGain:2.8,lightBloom:1});
  assert.equal(cache.snapshot().lamps.brightnessEntries,2,'different glow blooms share unchanged bright pixels');
  assert.equal(cache.snapshot().lamps.entries,3);assert.equal(cache.snapshot().counters.lampBrightHits,1);
});

test('oversized active mixed lamp phases stop allocating instead of evicting one another on every miss',()=>{
  const {cache,ctx,canvases,time}=fixture(),lamps=Array.from({length:24},()=>({lit:{width:70,height:50},dim:{}}));
  const point={left:0,top:0},options={lightGain:2.8,lightBloom:2.5,rasterScale:2};let clock=0;
  const cycle=()=>{for(let phase=0;phase<=16;phase++){time(clock+=50);for(const textures of lamps)cache.drawLamp(ctx,textures,point,phase/16,options);}};
  cycle();cycle();const warm=cache.snapshot(),allocated=canvases.length;
  for(let i=0;i<12;i++)cycle();
  const busy=cache.snapshot();assert.equal(canvases.length,allocated,'an oversized recurring working set stops allocating after admission');
  assert.equal(busy.counters.lampPhaseEvictions,0,'active phases cannot evict one another');
  assert.equal(busy.counters.lampEvictions,0,'optional phases never displace these live working lamp surfaces');
  assert.ok(busy.counters.lampPhaseAdmissionsSkipped>0,'capacity pressure uses the live fallback');
  assert.ok(busy.counters.lampPhaseHits>warm.counters.lampPhaseHits,'retained hot phases remain useful');
  assert.ok(busy.counters.lampGlowRebuilds>warm.counters.lampGlowRebuilds,'uncached changing phases still paint their actual native blur');
  assert.ok(busy.bytes<=busy.limits.bytes);assert.ok(busy.lamps.phasePixels<=busy.limits.lampPhasePixels);
  const newcomer={lit:{width:70,height:50},dim:{}};time(clock+7000);
  cache.drawLamp(ctx,newcomer,point,0,options);cache.drawLamp(ctx,newcomer,point,.5,options);cache.drawLamp(ctx,newcomer,point,0,options);
  const replaced=cache.snapshot();assert.ok(replaced.counters.lampPhaseEvictions>0,'an unused phase can yield capacity after the idle interval');
  assert.ok(replaced.counters.canvasReuses>busy.counters.canvasReuses,'matching reclaimed surfaces are reused');
});

test('actual three-second Earth pulse periods retain useful phases without steady-view allocation cycles',()=>{
  const {cache,ctx,canvases,time}=fixture(),lamps=Array.from({length:24},()=>({lit:{width:70,height:50},dim:{}}));
  let clock=0;const cycle=()=>{for(let frame=0;frame<60;frame++){time(clock+=50);for(let i=0;i<lamps.length;i++){
    const pulse=.18+.82*(.5+.5*Math.sin(clock/1000*2.1+i*.11));cache.drawLamp(ctx,lamps[i],{left:0,top:0},pulse,{lightGain:2.8,lightBloom:2.5,rasterScale:2});
  }}};
  cycle();cycle();cycle();const warm=cache.snapshot(),allocated=canvases.length;
  for(let i=0;i<6;i++)cycle();const steady=cache.snapshot();
  assert.equal(canvases.length,allocated,'a full visible working set does not restart native canvas allocation every pulse period');
  assert.equal(steady.counters.lampPhaseEvictions,warm.counters.lampPhaseEvictions);
  assert.equal(steady.counters.lampEvictions,0);assert.ok(steady.counters.lampPhaseRestores>warm.counters.lampPhaseRestores);
  assert.ok(steady.counters.lampPhaseAdmissionsSkipped>0);assert.ok(steady.bytes<=steady.limits.bytes);
});

test('recurring fleet phases use spare lamp pixels before repeating native blur without increasing total retention',t=>{
  const run=legacyPhaseCap=>{
    const {cache,ctx,time,canvases}=fixture({legacyPhaseCap}),lamps=Array.from({length:96},()=>({lit:{width:16,height:8},dim:{}}));
    let clock=0;
    const cycle=()=>{for(let phase=0;phase<=16;phase++){
      time(clock+=175);for(const texture of lamps)cache.drawLamp(ctx,texture,{left:0,top:0},phase/16,{lightGain:2.8,lightBloom:2.5,rasterScale:2});
    }};
    cycle();cycle();const warm=cache.snapshot(),allocated=canvases.length;
    for(let i=0;i<6;i++)cycle();const steady=cache.snapshot();
    assert.equal(canvases.length,allocated,'a steady three-second pulse cycle allocates no more native canvases');
    assert.equal(steady.counters.lampPhaseEvictions,warm.counters.lampPhaseEvictions,'active phases do not evict one another');
    assert.equal(steady.counters.lampEvictions,0,'optional copies cannot displace live working surfaces');
    assert.ok(steady.lamps.pixels<=steady.limits.lampPixels);assert.ok(steady.bytes<=steady.limits.bytes);
    return {steady,glows:steady.counters.lampGlowRebuilds-warm.counters.lampGlowRebuilds};
  };
  const limited=run(true),shared=run(false);
  assert.ok(shared.steady.lamps.phasePixels>1_000_000,'the pressure fixture actually uses previously unavailable spare pixels');
  assert.ok(shared.glows<limited.glows,'retaining additional recurring phases avoids measured native blur rebuilds');
  assert.equal(shared.steady.limits.bytes,limited.steady.limits.bytes,'the aggregate memory cap is unchanged');
  assert.equal(shared.steady.limits.lampPixels,4_000_000);
  t.diagnostic(JSON.stringify({formerSubcapNativeBlurs:limited.glows,sharedBudgetNativeBlurs:shared.glows,
    formerPhasePixels:limited.steady.lamps.phasePixels,sharedPhasePixels:shared.steady.lamps.phasePixels,totalLampPixels:shared.steady.lamps.pixels}));
});

test('evicted lamp surfaces are reused only at matching dimensions and stay within the same byte limit',()=>{
  const {cache,ctx}=fixture(),point={left:0,top:0};
  for(let i=0;i<1500;i++)cache.drawLamp(ctx,{lit:{width:40,height:40},dim:{}},point,.5,{lightGain:2.8,lightBloom:2.5});
  const snapshot=cache.snapshot();assert.ok(snapshot.counters.lampEvictions>0);assert.ok(snapshot.counters.canvasReuses>1000);
  assert.ok(snapshot.counters.canvasAllocations<1500,'surface churn is lower than the number of new lamps');
  assert.ok(snapshot.bytes<=snapshot.limits.bytes);assert.equal(snapshot.lamps.brightnessEntries,snapshot.lamps.entries);
  cache.reset();assert.equal(cache.snapshot().lamps.brightnessEntries,0);
});

test('lamp phase admission and reuse preserve the native presentation source without repeating blur',()=>{
  const {cache,ctx,drawCalls}=fixture(),textures={lit:{width:19,height:23},dim:{}},point={left:0,top:0};
  const draw=phase=>cache.drawLamp(ctx,textures,point,phase/16,{lightGain:2.8,lightBloom:2.5,rasterScale:2});
  draw(0);const original=drawCalls.filter(call=>call.context===ctx).at(-1).args;
  draw(8);draw(0);draw(8);const before=cache.snapshot();draw(0);
  const after=cache.snapshot(),paints=drawCalls.filter(call=>call.context===ctx);
  for(let i=2;i<paints.length;i+=3)assert.equal(paints[i].args[0],original[0],
    'first use and cached phases paint from the same full source surface');
  assert.deepEqual(paints.at(-1).args,original,'restored phase retains the identical source subset and destination');
  assert.equal(after.counters.lampPhaseRestores,before.counters.lampPhaseRestores+1);
  assert.equal(after.counters.lampGlowRebuilds,before.counters.lampGlowRebuilds,'restoring a cached phase never repeats native blur');
});

test('continuous raster changes update exact blur content while equal dimensions retain their surfaces',()=>{
  const {cache,ctx,canvases}=fixture(),textures={lit:{width:19,height:23},dim:{}},point={left:0,top:0};
  cache.drawLamp(ctx,textures,point,.5,{lightGain:2.8,lightBloom:2.5,rasterScale:1.01});
  const before=cache.snapshot(),allocations=canvases.length;
  cache.drawLamp(ctx,textures,point,.5,{lightGain:2.8,lightBloom:2.5,rasterScale:1.015});
  const after=cache.snapshot();assert.equal(canvases.length,allocations);assert.equal(after.lamps.entries,1);
  assert.equal(after.counters.lampGlowRebuilds,before.counters.lampGlowRebuilds+1,'the new radius repaints rather than reusing stale blur');
});
