/* Share animated, screen-sized ship sprites instead of filtering the flight canvas. */
(() => {
  'use strict';
  const sprites=new Map(),assetIds=new WeakMap(),artIds=new WeakMap(),lighting=new Map();
  const maxPixels=4_000_000,maxEntries=64;
  let nextAssetId=0,nextArtId=0,pixels=0,lightingPixels=0;
  const maxLightingPixels=1_000_000,maxLightingEntries=64;
  const counters={spriteHits:0,spriteMisses:0,spriteRebuilds:0,spriteBuildMs:0,effectBuildMs:0,spriteCompositions:0,compositionBuildMs:0,
    lightingHits:0,lightingMisses:0,lightingBuildMs:0,canvasAllocations:0,lampHits:0,lampMisses:0,evictions:0,rejected:0};
  const lamps=new Map(),lampIds=new WeakMap(),maxLampPixels=4_000_000,maxLamps=4096;
  let nextLampId=0,lampPixels=0;
  function discardLamp(key){const lamp=lamps.get(key);lampPixels-=lamp.pixels;lamps.delete(key);counters.evictions++;}
  function drawLamp(ctx,textures,point,pulse,options){
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
      const bright=surface(width,height);
      const b=bright.getContext('2d');b.filter=`brightness(${gain})`;b.drawImage(textures.lit,0,0,width,height);
      const glow=surface(cw,ch);
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
  function surface(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;counters.canvasAllocations++;return canvas;}
  function illuminated(asset,rw,rh,light){
    if(!light)return null;
    // Half a degree changes this .22-alpha gradient by less than one 8-bit step.
    const direction=((Math.round(light.direction*360/Math.PI)%720)+720)%720,color=Number(light.color)>>>0,bright=light.bright;
    // A heading changes the contents of this mask, not the identity or lifetime
    // of either the mask surface or the animated sprite that uses it.
    const key=[identity(asset),rw,rh].join(':'),signature=[direction,color,bright].join(':');
    let entry=lighting.get(key);
    if(entry?.signature===signature){counters.lightingHits++;lighting.delete(key);lighting.set(key,entry);return {key:key+':'+signature,canvas:entry.canvas};}
    const area=rw*rh;if(area>maxLightingPixels){counters.rejected++;return null;}
    const started=performance.now();
    if(!entry){
      while(lighting.size>=maxLightingEntries||lightingPixels+area>maxLightingPixels){
        const oldest=lighting.keys().next().value;lightingPixels-=lighting.get(oldest).pixels;lighting.delete(oldest);counters.evictions++;
      }
      const canvas=surface(rw,rh);entry={canvas,ctx:canvas.getContext('2d'),pixels:area};lightingPixels+=area;
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
  function draw(ctx,asset,width,height,time,appearance={}){
    if(!asset?.art||!(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0))return false;
    const transform=ctx.getTransform();
    const sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    const warp=Boolean(appearance.kind&&asset.profile),light=appearance.localLight;
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
    const shade=illuminated(asset,rw,rh,light),lights=appearance.lights!==false,damage=appearance.damage!==false;
    const gain=appearance.lightGain??2.8,bloom=appearance.lightBloom??2.5;
    // Shared NPC rendering explicitly requests 20Hz. Direct lit previews keep
    // their established 60Hz default, as do player, damaged and warp effects.
    // Keep rates in the key when a player and an NPC share the same artwork.
    const rate=asset.damageStage>0||warp||appearance.effectRate===60||(light&&appearance.effectRate!==20)?60:20;
    const key=[identity(asset),rw,rh,lights,damage,gain,bloom,warp?'warp':'local',rate].join(':');
    let entry=sprites.get(key);
    if(!entry){
      const started=performance.now();
      while(sprites.size>=maxEntries||pixels+area>maxPixels)discard(sprites.keys().next().value);
      const canvas=surface(cw,ch),effects=surface(cw,ch);
      entry={canvas,effects,ctx:canvas.getContext('2d'),effectsCtx:effects.getContext('2d'),frame:-1,shadeKey:null,pixels:area};sprites.set(key,entry);pixels+=area;
      counters.spriteMisses++;counters.spriteBuildMs+=performance.now()-started;
    }else{counters.spriteHits++;sprites.delete(key);sprites.set(key,entry);}
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
    const compositeShade=warp?'':shade?.key||'';
    if(animated||entry.shadeKey!==compositeShade){
      const started=performance.now(),g=entry.ctx;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cw,ch);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      g.drawImage(asset.art,pad,pad,rw,rh);
      if(shade&&!warp)g.drawImage(shade.canvas,pad,pad,rw,rh);
      g.drawImage(entry.effects,0,0);
      entry.shadeKey=compositeShade;counters.spriteCompositions++;const elapsed=performance.now()-started;counters.compositionBuildMs+=elapsed;counters.spriteBuildMs+=elapsed;
    }
    const px=pad*width/rw,py=pad*height/rh;
    ctx.drawImage(entry.canvas,-width/2-px,-height/2-py,width+px*2,height+py*2);
    if(warp&&shade)ctx.drawImage(shade.canvas,-width/2,-height/2,width,height);
    return true;
  }
  function snapshot(){
    return {entries:sprites.size+lighting.size+lamps.size,pixels:pixels+lightingPixels+lampPixels,bytes:(pixels+lightingPixels+lampPixels)*4,
      sprites:{entries:sprites.size,pixels,bytes:pixels*4},lighting:{entries:lighting.size,pixels:lightingPixels,bytes:lightingPixels*4},
      lamps:{entries:lamps.size,pixels:lampPixels,bytes:lampPixels*4},counters:{...counters},
      limits:{entries:maxEntries+maxLightingEntries+maxLamps,bytes:(maxPixels+maxLightingPixels+maxLampPixels)*4}};
  }
  function reset(){sprites.clear();lighting.clear();lamps.clear();pixels=lightingPixels=lampPixels=0;for(const key of Object.keys(counters))counters[key]=0;}
  window.nativeShipSpriteCache=Object.freeze({draw,drawLamp,snapshot,reset});
})();
