/* Frozen pixel preparation/rendering from verified 665e553ee37cad55a4d0e80461b5fdcb55a02e9e. Test-only exports wrap the original function bodies. */
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
  function surface(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;counters.canvasAllocations++;return canvas;}
  window.__referenceLampCache=Object.freeze({drawLamp});
})();

window.__referenceUnlit=(image,config={})=>{
  function unlitFrame(image){
    if(image.coreUnlit)return image;
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const g=c.getContext('2d');g.drawImage(image,0,0);g.save();
    for(const region of config.offRegions||[{x:181,y:362,r:26}]){
      g.save();g.beginPath();
      if(region.r)g.arc(region.x,region.y,region.r,0,Math.PI*2);
      else g.rect(region.x-region.w/2,region.y-region.h/2,region.w,region.h);
      g.clip();g.clearRect(0,0,c.width,c.height);g.filter='grayscale(1) brightness(.55)';g.drawImage(image,0,0);g.restore();
    }g.restore();
    if(config.offTint==='green'){
      const pixels=g.getImageData(0,0,c.width,c.height),rgba=pixels.data;
      for(let i=0;i<rgba.length;i+=4)if(rgba[i+1]>rgba[i]*1.3&&rgba[i+1]>rgba[i+2]*1.2){
        const grey=Math.round((rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)*.55);
        rgba[i]=rgba[i+1]=rgba[i+2]=grey;
      }g.putImageData(pixels,0,0);
    }
    c.coreUnlit=true;c.olympicAligned=image.olympicAligned===true;c.tugAligned=image.tugAligned===true;c.starterAligned=image.starterAligned===true;return c;
  }
  return unlitFrame(image);
};

window.__referenceBiologyFrame=(image,config)=>{
  const {width:W,height:H}=config,visualFrames=new WeakMap(),masks=[],veinBands=[],veinPixels=[];
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  function prepareFrame(im,stage){
    let visual=visualFrames.get(im);
    if(!visual){
      const mask=make(W,H),mg=mask.getContext('2d');mg.drawImage(im,0,0,W,H);
      mg.globalCompositeOperation='source-in';mg.fillStyle='#6b203d';mg.fillRect(0,0,W,H);
      visual={mask,bands:[],pixels:0};
      if(config.vascular){
        const c=make(W,H),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,W,H);
        const data=g.getImageData(0,0,W,H).data,veins=make(W,H),vg=veins.getContext('2d'),pixels=vg.createImageData(W,H);
        for(let i=0;i<data.length;i+=4){
          const r=data[i],green=data[i+1],b=data[i+2],a=data[i+3];
          if(a>80&&r>100&&green>70&&b<r*.59&&r>green*1.04&&green>r*.48){
            pixels.data.set([255,205,85,Math.round(a*.85)],i);visual.pixels++;
          }
        }
        vg.putImageData(pixels,0,0);
        visual.bands=Array.from({length:24},(_,n)=>{
          const top=Math.floor(n*H/24),bottom=Math.floor((n+1)*H/24),texture=make(W,bottom-top);
          texture.getContext('2d').drawImage(veins,0,top,W,bottom-top,0,0,W,bottom-top);
          const dim=make(W,bottom-top),dg=dim.getContext('2d');dg.drawImage(texture,0,0);
          dg.globalCompositeOperation='source-in';dg.fillStyle='#26131d';dg.fillRect(0,0,W,bottom-top);
          return {texture,dim,top,h:bottom-top};
        });
      }
      visualFrames.set(im,visual);
    }
    masks[stage]=visual.mask;veinBands[stage]=visual.bands;veinPixels[stage]=visual.pixels;
  }
  prepareFrame(image,0);return {vascularPixels:veinPixels[0]};
};
