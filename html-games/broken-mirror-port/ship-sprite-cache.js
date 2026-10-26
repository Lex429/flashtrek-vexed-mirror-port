/* Share animated, screen-sized ship sprites instead of filtering the flight canvas. */
(() => {
  'use strict';
  const sprites=new Map(),assetIds=new WeakMap(),artIds=new WeakMap(),lighting=new Map();
  const maxPixels=4_000_000,maxEntries=64;
  let nextAssetId=0,nextArtId=0,pixels=0,lightingPixels=0;
  const shadeWidth=2048,shadeHeight=1024,maxLightingPixels=shadeWidth*shadeHeight,maxLightingEntries=256;
  let shadeAtlas=null,shadeContext=null,shadeX=0,shadeY=0,shadeRow=0,shadeUsedPixels=0;
  const freeShades=[];
  const counters={spriteHits:0,spriteMisses:0,spriteRebuilds:0,spriteBuildMs:0,lightingHits:0,lightingMisses:0,lightingBuildMs:0,lampHits:0,lampMisses:0,evictions:0,rejected:0};
  // Retain the existing 17 pulse phases across a mixed fleet. The smaller
  // budget continually evicted these same blurred masks during ordinary flight.
  const lamps=new Map(),lampIds=new WeakMap(),maxLampPixels=16_000_000,maxLamps=4096;
  let nextLampId=0,lampPixels=0;
  function discardLamp(key){const lamp=lamps.get(key);lampPixels-=lamp.pixels;lamps.delete(key);counters.evictions++;}
  function drawLamp(ctx,textures,point,pulse,options){
    if(window.nativeFlightLightingEnabled===false)return true;
    const transform=ctx.getTransform(),sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    const width=Math.max(1,Math.round(textures.lit.width*sx)),height=Math.max(1,Math.round(textures.lit.height*sy));
    const gain=options.lightGain||1,bloom=options.lightBloom||1,phase=Math.round(Math.max(0,Math.min(1,pulse))*16);
    const radius=(2+2*phase/16)*bloom*(options.rasterScale||1),pad=Math.ceil(radius*3),cw=width+pad*2,ch=height+pad*2;
    const area=width*height+cw*ch;
    if(area>maxLampPixels)return false;
    if(!lampIds.has(textures))lampIds.set(textures,++nextLampId);
    const key=[lampIds.get(textures),width,height,gain,bloom,phase,options.rasterScale||1].join(':');
    let lamp=lamps.get(key);
    if(!lamp){
      counters.lampMisses++;
      while(lamps.size>=maxLamps||lampPixels+area>maxLampPixels)discardLamp(lamps.keys().next().value);
      const bright=document.createElement('canvas');bright.width=width;bright.height=height;
      const b=bright.getContext('2d');b.filter=`brightness(${gain})`;b.drawImage(textures.lit,0,0,width,height);
      const glow=document.createElement('canvas');glow.width=cw;glow.height=ch;
      const g=glow.getContext('2d');g.filter=`brightness(${gain}) blur(${radius}px)`;g.drawImage(textures.lit,pad,pad,width,height);
      lamp={bright,glow,pixels:area};lamps.set(key,lamp);lampPixels+=area;
    }else{counters.lampHits++;lamps.delete(key);lamps.set(key,lamp);}
    ctx.drawImage(textures.dim,point.left,point.top);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=pulse;
    ctx.drawImage(lamp.bright,point.left,point.top,textures.lit.width,textures.lit.height);
    ctx.globalAlpha=Math.min(1,pulse*.65*bloom);
    const px=pad*textures.lit.width/width,py=pad*textures.lit.height/height;
    ctx.drawImage(lamp.glow,point.left-px,point.top-py,textures.lit.width+px*2,textures.lit.height+py*2);
    ctx.restore();return true;
  }
  function discard(key){const entry=sprites.get(key);pixels-=entry.pixels;sprites.delete(key);counters.evictions++;}
  function identity(asset){
    if(!assetIds.has(asset))assetIds.set(asset,++nextAssetId);
    if(!artIds.has(asset.art))artIds.set(asset.art,++nextArtId);
    return `${assetIds.get(asset)}:${artIds.get(asset.art)}:${asset.damageStage}`;
  }
  function surface(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
  function releaseShade(){
    const key=lighting.keys().next().value,entry=lighting.get(key);lighting.delete(key);
    shadeUsedPixels-=entry.w*entry.h;freeShades.push({x:entry.x,y:entry.y,w:entry.w,h:entry.h});counters.evictions++;
  }
  function shadeSlot(w,h){
    for(;;){
      if(freeShades.length>1024){counters.evictions+=lighting.size;lighting.clear();shadeUsedPixels=0;freeShades.length=0;shadeX=shadeY=shadeRow=0;}
      const free=freeShades.findIndex(slot=>slot.w>=w&&slot.h>=h);
      if(free>=0){const slot=freeShades.splice(free,1)[0];
        if(slot.w>w)freeShades.push({x:slot.x+w,y:slot.y,w:slot.w-w,h:slot.h});
        if(slot.h>h)freeShades.push({x:slot.x,y:slot.y+h,w,h:slot.h-h});
        return {x:slot.x,y:slot.y};
      }
      if(shadeX+w>shadeWidth){shadeX=0;shadeY+=shadeRow;shadeRow=0;}
      if(shadeY+h<=shadeHeight){const slot={x:shadeX,y:shadeY};shadeX+=w;shadeRow=Math.max(shadeRow,h);return slot;}
      if(lighting.size){releaseShade();continue;}
      // A fragmented atlas with no live entries can be packed from the start.
      freeShades.length=0;shadeX=shadeY=shadeRow=0;
    }
  }
  function illuminated(asset,rw,rh,light){
    if(!light)return null;
    // Half a degree changes this .22-alpha gradient by less than one 8-bit step.
    const direction=((Math.round(light.direction*360/Math.PI)%720)+720)%720,color=Number(light.color)>>>0,bright=light.bright;
    const key=[identity(asset),rw,rh,direction,color,bright].join(':');
    let entry=lighting.get(key);
    if(entry){counters.lightingHits++;lighting.delete(key);lighting.set(key,entry);return entry;}
    if(rw>shadeWidth||rh>shadeHeight){counters.rejected++;return null;}
    const started=performance.now();
    if(!shadeAtlas){shadeAtlas=surface(shadeWidth,shadeHeight);shadeContext=shadeAtlas.getContext('2d');lightingPixels=maxLightingPixels;}
    while(lighting.size>=maxLightingEntries)releaseShade();
    const slot=shadeSlot(rw,rh),g=shadeContext,angle=direction*Math.PI/360,ux=Math.cos(angle),uy=Math.sin(angle);
    g.save();g.beginPath();g.rect(slot.x,slot.y,rw,rh);g.clip();g.clearRect(slot.x,slot.y,rw,rh);
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(asset.art,slot.x,slot.y,rw,rh);g.globalCompositeOperation='source-in';
    // Preserve artwork-space gradient geometry with independently scaled axes.
    const extent=Math.max(asset.width,asset.height),nx=ux*asset.width/rw,ny=uy*asset.height/rh,normal=nx*nx+ny*ny;
    const dx=nx*extent*.55/normal,dy=ny*extent*.55/normal;
    const gradient=g.createLinearGradient(slot.x+rw/2+dx,slot.y+rh/2+dy,slot.x+rw/2-dx,slot.y+rh/2-dy),rgb=`${color>>16&255},${color>>8&255},${color&255}`;
    gradient.addColorStop(0,`rgba(${rgb},${bright})`);gradient.addColorStop(.54,`rgba(${rgb},.035)`);gradient.addColorStop(1,`rgba(${rgb},0)`);
    g.fillStyle=gradient;g.fillRect(slot.x,slot.y,rw,rh);g.restore();
    entry={...slot,w:rw,h:rh,key,canvas:shadeAtlas};lighting.set(key,entry);shadeUsedPixels+=rw*rh;counters.lightingMisses++;counters.lightingBuildMs+=performance.now()-started;
    return entry;
  }
  function draw(ctx,asset,width,height,time,appearance={}){
    if(!asset?.art||!(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0))return false;
    if(window.nativeShipLampGPU?.queue(ctx,asset,width,height,time,appearance))appearance={...appearance,lights:false,damage:false,localLight:null,staticHull:true};
    window.nativeEffectProfiles?.queueShipSurface?.(ctx,asset,width,height);
    if(!appearance.batchChecked&&window.nativeHullBatch?.queue(ctx,asset,width,height,time,appearance))return true;
    const transform=ctx.getTransform();
    const sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    const lightingEnabled=window.nativeFlightLightingEnabled!==false;
    const warp=Boolean(appearance.kind&&asset.profile),light=lightingEnabled?appearance.localLight:null;
    // Immutable CPU-backed rasters keep small unlit hulls out of repeated source
    // image rasterization. Supersample at 2x the displayed size, capped at 768px,
    // and retain art/size changes within the existing LRU budget.
    if((!lightingEnabled||appearance.staticHull)&&!warp&&asset.damageStage===0){
      const scale=Math.min(2,768/Math.max(width*sx,height*sy));
      const rw=Math.max(1,Math.round(width*sx*scale)),rh=Math.max(1,Math.round(height*sy*scale));
      const key=[identity(asset),rw,rh,'static'].join(':');let entry=sprites.get(key);
      if(!entry){
        const started=performance.now();while(sprites.size>=maxEntries||pixels+rw*rh>maxPixels)discard(sprites.keys().next().value);
        const canvas=surface(rw,rh),g=canvas.getContext('2d',{willReadFrequently:true});
        g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(asset.art,0,0,rw,rh);
        entry={canvas,pixels:rw*rh};sprites.set(key,entry);pixels+=entry.pixels;counters.spriteMisses++;counters.spriteBuildMs+=performance.now()-started;
      }else{counters.spriteHits++;sprites.delete(key);sprites.set(key,entry);}
      ctx.drawImage(entry.canvas,-width/2,-height/2,width,height);return true;
    }
    // Every profiled ship is supersampled at 2x its actual screen size.
    // Rotation reuses the same raster; squeeze affects raster size.
    const quality=asset.profile||warp||light?2:1;
    const requestedWidth=width*sx*quality,requestedHeight=height*sy*quality;
    const rasterScale=Math.min(1,768/Math.max(requestedWidth,requestedHeight));
    const rw=Math.max(1,Math.round(requestedWidth*rasterScale)),rh=Math.max(1,Math.round(requestedHeight*rasterScale));
    const pad=warp?Math.ceil(32*Math.max(rw/asset.width,rh/asset.height)):
      Math.ceil(Math.max(32*quality,Math.max(rw,rh)*.35));
    const cw=rw+pad*2,ch=rh+pad*2,area=cw*ch*2;
    if(area>maxPixels){counters.rejected++;return false;}
    const gpuLight=Boolean(light&&!warp&&window.nativeEffectProfiles?.queueShipLight?.(ctx,asset,width,height,light));
    const shade=gpuLight?null:illuminated(asset,rw,rh,light),lights=lightingEnabled&&appearance.lights!==false,damage=appearance.damage!==false;
    const gain=appearance.lightGain??2.8,bloom=appearance.lightBloom??2.5;
    // Directional illumination changes with pose; the animated lamps and
    // breach effects depend on shared artwork/time. Never bake a separate
    // padded animation surface for every ship's light angle.
    const separateShade=Boolean(shade&&!warp);
    const key=[identity(asset),rw,rh,lights,damage,gain,bloom,warp?'warp':'local',gpuLight?'gpu-light':separateShade?'directional':''].join(':');
    let entry=sprites.get(key);
    if(!entry){
      const started=performance.now();
      while(sprites.size>=maxEntries||pixels+area>maxPixels)discard(sprites.keys().next().value);
      const canvas=surface(cw,ch),base=surface(cw,ch),g=base.getContext('2d');
      g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(asset.art,pad,pad,rw,rh);
      entry={canvas,base,ctx:canvas.getContext('2d'),frame:-1,pixels:area};sprites.set(key,entry);pixels+=area;
      counters.spriteMisses++;counters.spriteBuildMs+=performance.now()-started;
    }else{counters.spriteHits++;sprites.delete(key);sprites.set(key,entry);}
    // Player paths retain 60Hz effects; fixed simulation time makes paused draws
    // cache hits. NPC healthy pulses retain their established 20Hz sampling.
    const rate=asset.damageStage>0||light||warp?60:20,frame=Math.floor((Number.isFinite(time)?time:0)*rate/1000);
    if(entry.frame!==frame){
      const started=performance.now(),g=entry.ctx;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cw,ch);if(!separateShade)g.drawImage(entry.base,0,0);
      g.save();g.translate(pad+rw/2,pad+rh/2);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      const ew=warp?asset.width:width,eh=warp?asset.height:height;
      g.scale(rw/ew,rh/eh);
      asset.profile?.effects.draw(g,{x:0,y:0,w:ew,h:eh},0,asset.damageStage,frame*1000/rate,
        {lights,damage,lightGain:gain,lightBloom:bloom,rasterScale:warp?Math.min(rw/asset.width,rh/asset.height):quality*rasterScale});
      g.restore();entry.frame=frame;counters.spriteRebuilds++;counters.spriteBuildMs+=performance.now()-started;
    }
    const px=pad*width/rw,py=pad*height/rh;
    if(separateShade){
      ctx.drawImage(entry.base,-width/2-px,-height/2-py,width+px*2,height+py*2);
      ctx.drawImage(shade.canvas,shade.x,shade.y,shade.w,shade.h,-width/2,-height/2,width,height);
    }
    ctx.drawImage(entry.canvas,-width/2-px,-height/2-py,width+px*2,height+py*2);
    if(warp&&shade)ctx.drawImage(shade.canvas,shade.x,shade.y,shade.w,shade.h,-width/2,-height/2,width,height);
    return true;
  }
  function snapshot(){
    return {entries:sprites.size+lighting.size+lamps.size,pixels:pixels+lightingPixels+lampPixels,bytes:(pixels+lightingPixels+lampPixels)*4,
      sprites:{entries:sprites.size,pixels,bytes:pixels*4},lighting:{entries:lighting.size,pixels:lightingPixels,bytes:lightingPixels*4,usedPixels:shadeUsedPixels,freeRects:freeShades.length,atlasWidth:shadeAtlas?shadeWidth:0,atlasHeight:shadeAtlas?shadeHeight:0},
      lamps:{entries:lamps.size,pixels:lampPixels,bytes:lampPixels*4},counters:{...counters},
      limits:{entries:maxEntries+maxLightingEntries+maxLamps,bytes:(maxPixels+maxLightingPixels+maxLampPixels)*4}};
  }
  function reset(){sprites.clear();lighting.clear();lamps.clear();pixels=lightingPixels=lampPixels=shadeUsedPixels=0;shadeAtlas=shadeContext=null;shadeX=shadeY=shadeRow=0;freeShades.length=0;for(const key of Object.keys(counters))counters[key]=0;}
  window.nativeShipSpriteCache=Object.freeze({draw,drawLamp,snapshot,reset});
})();
