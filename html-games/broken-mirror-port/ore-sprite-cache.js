/* Bounded display-sized ore colour/glow surfaces. Rendering has no gameplay effects. */
(() => {
  'use strict';
  const entries=new Map(),identities=new WeakMap(),maxEntries=128,maxPixels=1_000_000;
  let nextId=0,pixels=0;
  const counters={hits:0,builds:0,evictions:0,rejected:0};
  const surface=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
  function draw(ctx,art,{x,y,size,glow=12,treated=true}){
    if(!art?.complete||!art.naturalWidth||!(size>0&&Number.isFinite(size)))return false;
    const t=ctx.getTransform(),sx=Math.hypot(t.a,t.b),sy=Math.hypot(t.c,t.d);
    if(!(sx>0&&sy>0))return false;
    // Two physical-pixel buckets avoid rebuilding for tiny growth/zoom changes.
    // Raster limits also bound accidental giant artwork requests.
    const bucket=n=>Math.max(2,Math.ceil(n/2)*2),width=bucket(Math.min(256,size*sx)),height=bucket(Math.min(256,size*sy));
    const blur=glow>0?bucket(Math.min(48,glow*Math.max(sx,sy))):0,pad=Math.ceil(blur*3+2),cw=width+pad*2,ch=height+pad*2,area=cw*ch;
    if(area>maxPixels){counters.rejected++;return false;}
    if(!identities.has(art))identities.set(art,++nextId);
    const key=[identities.get(art),art.src,width,height,blur,treated].join(':');
    let entry=entries.get(key);
    if(entry){counters.hits++;entries.delete(key);entries.set(key,entry);}
    else{
      while(entries.size>=maxEntries||pixels+area>maxPixels){const oldest=entries.keys().next().value;pixels-=entries.get(oldest).pixels;entries.delete(oldest);counters.evictions++;}
      // Downsample first: filtering the original high-resolution art defeats
      // the purpose even when the destination rectangle is only a few pixels.
      const base=surface(width,height),b=base.getContext('2d');b.imageSmoothingQuality='high';b.drawImage(art,0,0,width,height);
      const canvas=surface(cw,ch),g=canvas.getContext('2d');
      g.filter=treated?'brightness(1.16) saturate(1.18)':'none';
      g.shadowColor=treated?'#65dfff':'#bdeaff';g.shadowBlur=glow>0?blur:0;g.drawImage(base,pad,pad);
      entry={canvas,pixels:area};entries.set(key,entry);pixels+=area;counters.builds++;
    }
    const px=pad*size/width,py=pad*size/height;
    ctx.drawImage(entry.canvas,x-size/2-px,y-size/2-py,size+px*2,size+py*2);
    return true;
  }
  function reset(){entries.clear();pixels=0;for(const key of Object.keys(counters))counters[key]=0;}
  const snapshot=()=>({entries:entries.size,pixels,bytes:pixels*4,counters:{...counters},limits:{entries:maxEntries,bytes:maxPixels*4}});
  window.nativeOreSpriteCache=Object.freeze({draw,reset,snapshot});
})();
