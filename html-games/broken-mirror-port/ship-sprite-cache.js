/* Share animated, screen-sized ship sprites instead of filtering the flight canvas. */
(() => {
  'use strict';
  const sprites=new Map(),compositions=new Map(),assetIds=new WeakMap(),artIds=new WeakMap(),ownerIds=new WeakMap(),lighting=new Map();
  const defaultPixels=4_000_000,hardPixels=16_000_000,maxEntries=256,maxCompositions=256;
  let maxPixels=defaultPixels,nextAssetId=0,nextArtId=0,nextOwnerId=0,stamp=0,pixels=0,lightingPixels=0;
  let uploadSurface=null,backend='canvas';
  try{const selected=new URLSearchParams(window.location?.search||'').get('shipRenderer');if(['canvas','webgl2'].includes(selected))backend=selected;}catch(_error){}
  const maxLightingPixels=1_000_000,maxLightingEntries=256;
  const counters={spriteHits:0,spriteMisses:0,spriteRebuilds:0,spriteBuildMs:0,effectBuildMs:0,spriteCompositions:0,compositionBuildMs:0,
    lightingHits:0,lightingMisses:0,lightingBuildMs:0,compositionHits:0,compositionMisses:0,compositionTargetPixels:0,presentationSourcePixels:0,presentationQuadPixels:0,paddingPixelsSkipped:0,boundsFallbacks:0,gpuDraws:0,gpuLightingUpdates:0,canvasAllocations:0,canvasReuses:0,canvasResizes:0,lampHits:0,lampMisses:0,lampBrightHits:0,lampBrightMisses:0,lampGlowRebuilds:0,lampPhaseHits:0,lampPhaseMisses:0,lampPhaseRestores:0,lampPhaseAdmissionsSkipped:0,lampPhaseEvictions:0,lampEvictions:0,evictions:0,rejected:0};
  const lamps=new Map(),lampBrightness=new Map(),lampPhases=new Map(),lampIds=new WeakMap(),maxLampPixels=4_000_000,maxPhasePixels=maxLampPixels,maxLamps=4096,maxPhaseEntries=2048,phaseMinIdleMs=6000;
  let nextLampId=0,lampPixels=0,phasePixels=0;
  const phaseRoom=area=>lampPhases.size<maxPhaseEntries&&phasePixels+area<=maxPhasePixels&&lampPixels+area<=maxLampPixels;
  function discardPhase(key,released){const phase=lampPhases.get(key);lampPhases.delete(key);phase.lamp.phaseKeys.delete(key);lampPixels-=phase.pixels;phasePixels-=phase.pixels;released.push(phase.canvas);counters.lampPhaseEvictions++;}
  function discardLamp(key,released){
    const lamp=lamps.get(key);lampPixels-=lamp.pixels;lamps.delete(key);released.push(lamp.glow);
    for(const phaseKey of [...lamp.phaseKeys])discardPhase(phaseKey,released);
    if(!--lamp.brightness.references){lampBrightness.delete(lamp.brightnessKey);lampPixels-=lamp.brightness.pixels;released.push(lamp.brightness.canvas);}
    counters.evictions++;counters.lampEvictions++;
  }
  function lampSurface(width,height,released){
    const index=released.findIndex(canvas=>canvas.width===width&&canvas.height===height);
    if(index<0)return surface(width,height);
    counters.canvasReuses++;const canvas=released.splice(index,1)[0],context=canvas.getContext('2d');
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.filter='none';context.clearRect(0,0,width,height);return canvas;
  }
  function drawLamp(ctx,textures,point,pulse,options){
    const transform=ctx.getTransform(),sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    const width=Math.max(1,Math.round(textures.lit.width*sx)),height=Math.max(1,Math.round(textures.lit.height*sy));
    const gain=options.lightGain||1,bloom=options.lightBloom||1,phase=Math.round(Math.max(0,Math.min(1,pulse))*16);
    const rasterScale=options.rasterScale||1,radius=(2+2*phase/16)*bloom*rasterScale;
    // A working lamp always keeps one reusable maximum-extent surface. Optional
    // copies of recurring phases may use spare space, but can never evict live
    // working surfaces and turn a large mixed fleet into an allocation cycle.
    const pad=Math.ceil(4*bloom*rasterScale*3),cw=width+pad*2,ch=height+pad*2;
    const brightArea=width*height,area=brightArea+cw*ch;
    if(area>maxLampPixels)return false;
    if(!lampIds.has(textures))lampIds.set(textures,++nextLampId);
    const brightnessKey=[lampIds.get(textures),width,height,gain].join(':'),key=[brightnessKey,pad].join(':');
    let lamp=lamps.get(key);
    if(!lamp){
      counters.lampMisses++;
      // Bright pixels also stay shared when different callers request a bloom.
      const released=[];
      while(lampPhases.size&&lampPixels+cw*ch+(lampBrightness.has(brightnessKey)?0:brightArea)>maxLampPixels)discardPhase(lampPhases.keys().next().value,released);
      while(lamps.size>=maxLamps||lampPixels+cw*ch+(lampBrightness.has(brightnessKey)?0:brightArea)>maxLampPixels)discardLamp(lamps.keys().next().value,released);
      let brightness=lampBrightness.get(brightnessKey);
      if(!brightness){const canvas=lampSurface(width,height,released),b=canvas.getContext('2d');b.filter=`brightness(${gain})`;b.drawImage(textures.lit,0,0,width,height);
        brightness={canvas,pixels:brightArea,references:0};lampBrightness.set(brightnessKey,brightness);lampPixels+=brightArea;counters.lampBrightMisses++;
      }else counters.lampBrightHits++;
      const glow=lampSurface(cw,ch,released);
      lamp={brightness,brightnessKey,glow,context:glow.getContext('2d'),radius:-1,pixels:cw*ch,phaseKeys:new Set(),seenPhases:0};brightness.references++;lamps.set(key,lamp);lampPixels+=lamp.pixels;
    }else{counters.lampHits++;lamps.delete(key);lamps.set(key,lamp);}
    const cacheable=Number.isInteger(rasterScale),seen=cacheable&&Boolean(lamp.seenPhases&(1<<phase)),returning=seen&&lamp.radius!==radius,phaseTime=cacheable?performance.now():0;
    if(cacheable)lamp.seenPhases|=1<<phase;
    const phasePad=Math.ceil(radius*3),phaseKey=key+':'+radius;
    let cached=cacheable?lampPhases.get(phaseKey):null;
    if(cached){
      lampPhases.delete(phaseKey);lampPhases.set(phaseKey,cached);cached.lastUsed=phaseTime;counters.lampPhaseHits++;
      if(lamp.radius!==radius){const g=lamp.context;g.clearRect(0,0,cw,ch);g.filter='none';g.drawImage(cached.canvas,pad-cached.pad,pad-cached.pad);lamp.radius=radius;counters.lampPhaseRestores++;}
    }
    else{
      counters.lampPhaseMisses++;
      if(lamp.radius!==radius){const g=lamp.context;g.clearRect(0,0,cw,ch);g.filter=`brightness(${gain}) blur(${radius}px)`;g.drawImage(textures.lit,pad,pad,width,height);lamp.radius=radius;counters.lampGlowRebuilds++;}
      // Keep neighbouring filtered pixels around the presented source subset.
      // Clipping exactly at that subset changes native source-edge sampling by
      // a channel level, making a later NPC differ from the first player paint.
      const guard=Math.min(3,pad-phasePad),snapshotPad=phasePad+guard;
      const phaseWidth=width+snapshotPad*2,phaseHeight=height+snapshotPad*2,phaseArea=phaseWidth*phaseHeight;
      if(returning&&phaseArea<=maxPhasePixels){
        let released;
        // Optional copies must not cycle through an oversized active working
        // set. Keep hot phases; a miss can use the existing live blur surface.
        while(lampPhases.size&&!phaseRoom(phaseArea)){
          const oldest=lampPhases.keys().next().value;if(phaseTime-lampPhases.get(oldest).lastUsed<phaseMinIdleMs)break;
          discardPhase(oldest,released??=[]);
        }
        if(phaseRoom(phaseArea)){const canvas=lampSurface(phaseWidth,phaseHeight,released||[]);canvas.getContext('2d').drawImage(lamp.glow,pad-snapshotPad,pad-snapshotPad,phaseWidth,phaseHeight,0,0,phaseWidth,phaseHeight);
          cached={canvas,pad:snapshotPad,pixels:phaseArea,lamp,lastUsed:phaseTime};lampPhases.set(phaseKey,cached);lamp.phaseKeys.add(phaseKey);lampPixels+=phaseArea;phasePixels+=phaseArea;}
        else counters.lampPhaseAdmissionsSkipped++;
      }
    }
    ctx.drawImage(textures.dim,point.left,point.top);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=pulse;
    ctx.drawImage(lamp.brightness.canvas,point.left,point.top,textures.lit.width,textures.lit.height);
    ctx.globalAlpha=Math.min(1,pulse*.65*bloom);
    // Present only the original phase-sized bounds.
    // Always present the same live source extent. Cache admission/eviction must
    // not select another native interpolation path for otherwise equal roles.
    const px=phasePad*textures.lit.width/width,py=phasePad*textures.lit.height/height;
    ctx.drawImage(lamp.glow,pad-phasePad,pad-phasePad,width+phasePad*2,height+phasePad*2,
      point.left-px,point.top-py,textures.lit.width+px*2,textures.lit.height+py*2);
    ctx.restore();return true;
  }
  function discard(key,released=[]){const entry=sprites.get(key);window.nativeShipGpuBatch?.release?.(entry);pixels-=entry.pixels;sprites.delete(key);released.push(entry.effects);counters.evictions++;}
  function discardComposition(key,released=[]){const entry=compositions.get(key);pixels-=entry.pixels;compositions.delete(key);released.push(entry.canvas);counters.evictions++;}
  function makeRoom(area,released){
    while(pixels+area>maxPixels){
      const animated=sprites.entries().next().value,composed=compositions.entries().next().value;
      if(animated&&(!composed||animated[1].stamp<composed[1].stamp))discard(animated[0],released);
      else if(composed)discardComposition(composed[0],released);else break;
    }
  }
  function ownerId(owner){if(!owner||typeof owner!=='object')return 0;if(!ownerIds.has(owner))ownerIds.set(owner,++nextOwnerId);return ownerIds.get(owner);}
  function identity(asset){
    if(!assetIds.has(asset))assetIds.set(asset,++nextAssetId);
    if(!artIds.has(asset.art))artIds.set(asset.art,++nextArtId);
    return `${assetIds.get(asset)}:${artIds.get(asset.art)}:${asset.damageStage}`;
  }
  function surface(width,height,released=[]){
    const match=released.findIndex(canvas=>canvas.width===width&&canvas.height===height);
    if(match>=0){const canvas=released.splice(match,1)[0],g=canvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.filter='none';g.clearRect(0,0,width,height);counters.canvasReuses++;return canvas;}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;counters.canvasAllocations++;return canvas;
  }
  function uploadBase(asset,width,height){
    if(!uploadSurface)uploadSurface=surface(width,height);
    else if(uploadSurface.width!==width||uploadSurface.height!==height){uploadSurface.width=width;uploadSurface.height=height;counters.canvasResizes++;}
    const g=uploadSurface.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,width,height);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(asset.art,0,0,width,height);
    // texSubImage captures these pixels before this single scratch surface is
    // reused. The atlas retains no Canvas/descriptor snapshot owned by a caller.
    return uploadSurface;
  }
  function illuminated(asset,rw,rh,light,owner){
    if(!light)return null;
    // Half a degree changes this .22-alpha gradient by less than one 8-bit step.
    const direction=((Math.round(light.direction*360/Math.PI)%720)+720)%720,color=Number(light.color)>>>0,bright=light.bright;
    // A heading changes the contents of this mask, not the identity or lifetime
    // of either the mask surface or the animated sprite that uses it.
    const key=[identity(asset),rw,rh,ownerId(owner)].join(':'),signature=[direction,color,bright].join(':');
    let entry=lighting.get(key);
    if(entry?.signature===signature){counters.lightingHits++;lighting.delete(key);lighting.set(key,entry);return {key:key+':'+signature,canvas:entry.canvas};}
    const area=rw*rh;if(area>maxLightingPixels){counters.rejected++;return null;}
    const started=performance.now();
    if(!entry){
      const released=[];
      while(lighting.size>=maxLightingEntries||lightingPixels+area>maxLightingPixels){
        const oldest=lighting.keys().next().value;lightingPixels-=lighting.get(oldest).pixels;released.push(lighting.get(oldest).canvas);lighting.delete(oldest);counters.evictions++;
      }
      const canvas=surface(rw,rh,released);entry={canvas,ctx:canvas.getContext('2d'),pixels:area};lightingPixels+=area;
    }
    const {canvas,ctx:g}=entry,angle=direction*Math.PI/360,ux=Math.cos(angle),uy=Math.sin(angle);
    g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.clearRect(0,0,rw,rh);
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(asset.art,0,0,rw,rh);g.globalCompositeOperation='source-in';
    // Preserve artwork-space gradient geometry with independently scaled axes.
    const extent=Math.max(asset.width,asset.height),nx=ux*asset.width/rw,ny=uy*asset.height/rh,normal=nx*nx+ny*ny;
    const dx=nx*extent*.55/normal,dy=ny*extent*.55/normal;
    const gradient=g.createLinearGradient(rw/2+dx,rh/2+dy,rw/2-dx,rh/2-dy),rgb=`${color>>16&255},${color>>8&255},${color&255}`;
    gradient.addColorStop(0,`rgba(${rgb},${bright})`);gradient.addColorStop(.54,`rgba(${rgb},.035)`);gradient.addColorStop(1,`rgba(${rgb},0)`);
    g.fillStyle=gradient;g.fillRect(0,0,rw,rh);
    entry.signature=signature;lighting.delete(key);lighting.set(key,entry);counters.lightingMisses++;counters.lightingBuildMs+=performance.now()-started;
    return {key:key+':'+signature,canvas};
  }
  function rasterSupport(asset,rw,rh,pad,cw,ch,options){
    const full={x:0,y:0,width:cw,height:ch};
    if(options.warp||typeof asset.profile?.effects?.rasterBounds!=='function')return full;
    try{
      const value=asset.profile.effects.rasterBounds(asset.damageStage,{width:rw,height:rh,...options});
      if(!value||!Number.isFinite(value.minX)||!Number.isFinite(value.minY)||!Number.isFinite(value.maxX)||!Number.isFinite(value.maxY))throw Error('Invalid effect support');
      // Four retained-raster pixels keep native interpolation away from source
      // edges. Retain the whole aligned hull even for a mistaken narrow profile.
      // Trim each edge in four-pixel blocks relative to the original surface,
      // retaining the native 2x raster's downsampling phase and size parity.
      const x=Math.max(0,Math.floor((pad+Math.min(0,value.minX)-4)/4)*4),y=Math.max(0,Math.floor((pad+Math.min(0,value.minY)-4)/4)*4);
      const right=cw-Math.max(0,Math.floor((cw-pad-Math.max(rw,value.maxX)-4)/4)*4),bottom=ch-Math.max(0,Math.floor((ch-pad-Math.max(rh,value.maxY)-4)/4)*4);
      return {x,y,width:right-x,height:bottom-y};
    }catch(_error){counters.boundsFallbacks++;return full;}
  }
  function draw(ctx,asset,width,height,time,appearance={}){
    if(!asset?.art||!(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0))return false;
    const transform=ctx.getTransform();
    const sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    const warp=Boolean(appearance.kind&&asset.profile),light=appearance.localLight;
    const gpu=!appearance.canvasOnly&&!warp&&window.nativeShipGpuBatch?.active?.(ctx);
    if(!gpu)window.nativeShipGpuBatch?.flush?.(ctx);
    // Every profiled ship is supersampled at 2x its actual screen size.
    // Rotation reuses the same raster; squeeze affects raster size.
    const quality=asset.profile||warp||light?2:1;
    const requestedWidth=width*sx*quality,requestedHeight=height*sy*quality;
    const rasterScale=Math.min(1,768/Math.max(requestedWidth,requestedHeight));
    const rw=Math.max(1,Math.round(requestedWidth*rasterScale)),rh=Math.max(1,Math.round(requestedHeight*rasterScale));
    const pad=warp?Math.ceil(32*Math.max(rw/asset.width,rh/asset.height)):
      Math.ceil(Math.max(32*quality,Math.max(rw,rh)*.35));
    const cw=rw+pad*2,ch=rh+pad*2,area=cw*ch;
    if(area*(gpu?1:2)>maxPixels){counters.rejected++;return false;}
    const shade=gpu?null:illuminated(asset,rw,rh,light,appearance.owner),lights=appearance.lights!==false,damage=appearance.damage!==false;
    const gain=appearance.lightGain??2.8,bloom=appearance.lightBloom??2.5;
    // Shared NPC rendering explicitly requests 20Hz. Direct lit previews keep
    // their established 60Hz default, as do player, damaged and warp effects.
    // Keep rates in the key when a player and an NPC share the same artwork.
    const rate=asset.damageStage>0||warp||appearance.effectRate===60||(light&&appearance.effectRate!==20)?60:20;
    const key=[identity(asset),rw,rh,lights,damage,gain,bloom,warp?'warp':'local',rate,gpu?'gpu':'canvas'].join(':');
    let entry=sprites.get(key);
    if(!entry){
      const started=performance.now();
      const released=[];while(sprites.size>=maxEntries)discard(sprites.keys().next().value,released);makeRoom(area,released);
      const effects=surface(cw,ch,released);
      entry={effects,effectsCtx:effects.getContext('2d'),frame:-1,pixels:area,stamp:++stamp,
        fullBounds:{x:0,y:0,width:cw,height:ch},bounds:null};sprites.set(key,entry);pixels+=area;
      counters.spriteMisses++;counters.spriteBuildMs+=performance.now()-started;
    }else{counters.spriteHits++;entry.stamp=++stamp;sprites.delete(key);sprites.set(key,entry);}
    const frame=Math.floor((Number.isFinite(time)?time:0)*rate/1000),animated=entry.frame!==frame;
    if(animated){
      const started=performance.now(),g=entry.effectsCtx;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cw,ch);
      g.save();g.translate(pad+rw/2,pad+rh/2);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      const ew=warp?asset.width:width,eh=warp?asset.height:height;
      g.scale(rw/ew,rh/eh);
      asset.profile?.effects.draw(g,{x:0,y:0,w:ew,h:eh},0,asset.damageStage,frame*1000/rate,
        {lights,damage,lightGain:gain,lightBloom:bloom,rasterScale:warp?Math.min(rw/asset.width,rh/asset.height):quality*rasterScale});
      g.restore();entry.frame=frame;counters.spriteRebuilds++;const elapsed=performance.now()-started;counters.effectBuildMs+=elapsed;counters.spriteBuildMs+=elapsed;
    }
    const px=pad*width/rw,py=pad*height/rh;
    if(gpu){
      if(window.nativeShipGpuBatch.draw(ctx,entry,()=>uploadBase(asset,rw,rh),entry.effects,frame,
        {x:-width/2-px,y:-height/2-py,width:width+px*2,height:height+py*2,rw,rh},asset,light)){
        counters.gpuDraws++;if(light)counters.gpuLightingUpdates++;return true;
      }
      window.nativeShipGpuBatch.flush(ctx);
      return draw(ctx,asset,width,height,time,{...appearance,canvasOnly:true});
    }
    const trim=(appearance.trimPadding===true||appearance.sourceCrop===true)&&!appearance.fullSurface;
    if(trim&&!entry.bounds)entry.bounds=rasterSupport(asset,rw,rh,pad,cw,ch,{warp,lights,damage,lightBloom:bloom,rasterScale:quality*rasterScale});
    const bounds=trim?entry.bounds:entry.fullBounds,compositionArea=bounds.width*bounds.height;
    const compositionKey=key+':owner:'+ownerId(appearance.owner),compositeShade=warp?'':shade?.key||'';
    let composed=compositions.get(compositionKey);
    if(!composed){
      const released=[];while(compositions.size>=maxCompositions)discardComposition(compositions.keys().next().value,released);makeRoom(area,released);
      const canvas=surface(cw,ch,released);composed={canvas,ctx:canvas.getContext('2d'),frame:-1,shadeKey:null,pixels:area,stamp:++stamp};compositions.set(compositionKey,composed);pixels+=area;counters.compositionMisses++;
    }else{composed.stamp=++stamp;compositions.delete(compositionKey);compositions.set(compositionKey,composed);counters.compositionHits++;}
    if(composed.frame!==frame||composed.shadeKey!==compositeShade){
      const started=performance.now(),g=composed.ctx;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cw,ch);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      g.drawImage(asset.art,pad,pad,rw,rh);
      if(shade&&!warp)g.drawImage(shade.canvas,pad,pad,rw,rh);
      g.drawImage(entry.effects,0,0);
      composed.frame=frame;composed.shadeKey=compositeShade;counters.spriteCompositions++;counters.compositionTargetPixels+=area;const elapsed=performance.now()-started;counters.compositionBuildMs+=elapsed;counters.spriteBuildMs+=elapsed;
    }
    if(bounds.x===0&&bounds.y===0&&bounds.width===cw&&bounds.height===ch)ctx.drawImage(composed.canvas,-width/2-px,-height/2-py,width+px*2,height+py*2);
    else if(appearance.sourceCrop)ctx.drawImage(composed.canvas,bounds.x,bounds.y,bounds.width,bounds.height,-width/2+(bounds.x-pad)*width/rw,-height/2+(bounds.y-pad)*height/rh,bounds.width*width/rw,bounds.height*height/rh);
    else{
      // Retain native image size and sampling. A source subset changes Skia's
      // downsampling at a few alpha edges, even when all nonzero pixels fit.
      ctx.save();ctx.beginPath();ctx.rect(-width/2+(bounds.x-pad)*width/rw,-height/2+(bounds.y-pad)*height/rh,bounds.width*width/rw,bounds.height*height/rh);ctx.clip();
      ctx.drawImage(composed.canvas,-width/2-px,-height/2-py,width+px*2,height+py*2);ctx.restore();
    }
    counters.presentationSourcePixels+=appearance.sourceCrop&&trim?compositionArea:area;counters.presentationQuadPixels+=compositionArea*width*height/(rw*rh)*Math.abs(transform.a*transform.d-transform.b*transform.c);counters.paddingPixelsSkipped+=area-compositionArea;
    if(warp&&shade)ctx.drawImage(shade.canvas,-width/2,-height/2,width,height);
    return true;
  }
  function snapshot(){
    const uploadPixels=uploadSurface?uploadSurface.width*uploadSurface.height:0,gpu=window.nativeShipGpuBatch?.snapshot?.()||null;
    return {backend,entries:sprites.size+compositions.size+lighting.size+lamps.size+lampPhases.size+(uploadSurface?1:0),pixels:pixels+lightingPixels+lampPixels+uploadPixels,bytes:(pixels+lightingPixels+lampPixels+uploadPixels)*4,
      sprites:{entries:sprites.size,pixels,bytes:pixels*4},lighting:{entries:lighting.size,pixels:lightingPixels,bytes:lightingPixels*4},
      compositions:{entries:compositions.size,pixels:[...compositions.values()].reduce((sum,entry)=>sum+entry.pixels,0)},
      lamps:{entries:lamps.size,brightnessEntries:lampBrightness.size,phaseEntries:lampPhases.size,phasePixels,pixels:lampPixels,bytes:lampPixels*4},uploads:{entries:uploadSurface?1:0,pixels:uploadPixels,bytes:uploadPixels*4},gpu,counters:{...counters},
      limits:{entries:maxEntries+maxCompositions+maxLightingEntries+maxLamps+maxPhaseEntries+1,bytes:(maxPixels+maxLightingPixels+maxLampPixels+768*768)*4,spritePixels:maxPixels,spriteHardPixels:hardPixels,lampPixels:maxLampPixels,lampPhasePixels:maxPhasePixels,lampPhaseEntries:maxPhaseEntries,lampPhaseMinIdleMs:phaseMinIdleMs}};
  }
  function reset(){window.nativeShipGpuBatch?.reset?.();sprites.clear();compositions.clear();lighting.clear();lamps.clear();lampBrightness.clear();lampPhases.clear();uploadSurface=null;pixels=lightingPixels=lampPixels=phasePixels=0;for(const key of Object.keys(counters))counters[key]=0;}
  function beginFrame(ctx,options={}){window.vexedFlightAssets?.beginRenderFrame?.();maxPixels=Math.max(defaultPixels,Math.min(hardPixels,Math.round((ctx.canvas?.width||0)*(ctx.canvas?.height||0)*8)));makeRoom(0,[]);return window.nativeShipGpuBatch?.begin?.(ctx,{...options,backend:options.backend||backend})||false;}
  function flush(ctx){window.nativeShipGpuBatch?.flush?.(ctx);}
  function endFrame(ctx){window.nativeShipGpuBatch?.end?.(ctx);}
  function setBackend(value){if(!['auto','canvas','webgl2'].includes(value))return false;flush();backend=value;return true;}
  window.nativeShipSpriteCache=Object.freeze({draw,drawLamp,snapshot,reset,beginFrame,flush,endFrame,setBackend});
})();
