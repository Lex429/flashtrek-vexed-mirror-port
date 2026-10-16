/* Share animated, screen-sized ship sprites instead of filtering the flight canvas. */
(() => {
  'use strict';
  const sprites=new Map(),assetIds=new WeakMap();
  const maxPixels=4_000_000,maxEntries=64;
  let nextAssetId=0,pixels=0;
  const lamps=new Map(),lampIds=new WeakMap(),maxLampPixels=4_000_000,maxLamps=4096;
  let nextLampId=0,lampPixels=0;
  function discardLamp(key){const lamp=lamps.get(key);lampPixels-=lamp.pixels;lamps.delete(key);}
  function drawLamp(ctx,textures,point,pulse,options){
    const transform=ctx.getTransform(),sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    const width=Math.max(1,Math.round(textures.lit.width*sx)),height=Math.max(1,Math.round(textures.lit.height*sy));
    const gain=options.lightGain||1,bloom=options.lightBloom||1,phase=Math.round(Math.max(0,Math.min(1,pulse))*16);
    const radius=(2+2*phase/16)*bloom,pad=Math.ceil(radius*3),cw=width+pad*2,ch=height+pad*2;
    const area=width*height+cw*ch;
    if(area>maxLampPixels)return false;
    if(!lampIds.has(textures))lampIds.set(textures,++nextLampId);
    const key=[lampIds.get(textures),width,height,gain,bloom,phase].join(':');
    let lamp=lamps.get(key);
    if(!lamp){
      while(lamps.size>=maxLamps||lampPixels+area>maxLampPixels)discardLamp(lamps.keys().next().value);
      const bright=document.createElement('canvas');bright.width=width;bright.height=height;
      const b=bright.getContext('2d');b.filter=`brightness(${gain})`;b.drawImage(textures.lit,0,0,width,height);
      const glow=document.createElement('canvas');glow.width=cw;glow.height=ch;
      const g=glow.getContext('2d');g.filter=`brightness(${gain}) blur(${radius}px)`;g.drawImage(textures.lit,pad,pad,width,height);
      lamp={bright,glow,pixels:area};lamps.set(key,lamp);lampPixels+=area;
    }else{lamps.delete(key);lamps.set(key,lamp);}
    ctx.drawImage(textures.dim,point.left,point.top);
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=pulse;
    ctx.drawImage(lamp.bright,point.left,point.top,textures.lit.width,textures.lit.height);
    ctx.globalAlpha=Math.min(1,pulse*.65*bloom);
    const px=pad*textures.lit.width/width,py=pad*textures.lit.height/height;
    ctx.drawImage(lamp.glow,point.left-px,point.top-py,textures.lit.width+px*2,textures.lit.height+py*2);
    ctx.restore();return true;
  }
  function discard(key){const entry=sprites.get(key);pixels-=entry.canvas.width*entry.canvas.height;sprites.delete(key);}
  function draw(ctx,asset,width,height,time,appearance={}){
    if(!asset.profile?.effects||!(width>0&&height>0))return false;
    const transform=ctx.getTransform();
    const sx=Math.hypot(transform.a,transform.b),sy=Math.hypot(transform.c,transform.d);
    if(!(sx>0&&sy>0))return false;
    // Round raster dimensions, not world dimensions: rotation must reuse a sprite.
    const rw=Math.max(1,Math.round(width*sx)),rh=Math.max(1,Math.round(height*sy));
    const pad=Math.ceil(Math.max(32,Math.max(rw,rh)*.35)),cw=rw+pad*2,ch=rh+pad*2;
    if(cw*ch>maxPixels)return false;
    if(!assetIds.has(asset))assetIds.set(asset,++nextAssetId);
    const lights=appearance.lights!==false,damage=appearance.damage!==false;
    const gain=appearance.lightGain??2.8,bloom=appearance.lightBloom??2.5;
    const key=[assetIds.get(asset),asset.damageStage,rw,rh,lights,damage,gain,bloom].join(':');
    let entry=sprites.get(key);
    if(!entry){
      while(sprites.size>=maxEntries||pixels+cw*ch>maxPixels)discard(sprites.keys().next().value);
      const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
      entry={canvas,ctx:canvas.getContext('2d'),frame:-1};sprites.set(key,entry);pixels+=cw*ch;
    }else{sprites.delete(key);sprites.set(key,entry);}
    // Lamp pulses are slow; damaged hull sparks retain a 60 Hz animation sample.
    const rate=asset.damageStage>0?60:20,frame=Math.floor(time*rate/1000);
    if(entry.frame!==frame){
      const g=entry.ctx;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cw,ch);
      g.save();g.translate(pad+rw/2,pad+rh/2);g.scale(rw/width,rh/height);
      g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      g.drawImage(asset.art,-width/2,-height/2,width,height);
      asset.profile.effects.draw(g,{x:0,y:0,w:width,h:height},0,asset.damageStage,frame*1000/rate,
        {lights,damage,lightGain:gain,lightBloom:bloom});
      g.restore();entry.frame=frame;
    }
    const px=pad*width/rw,py=pad*height/rh;
    ctx.drawImage(entry.canvas,-width/2-px,-height/2-py,width+px*2,height+py*2);
    return true;
  }
  window.nativeShipSpriteCache={draw,drawLamp};
})();
