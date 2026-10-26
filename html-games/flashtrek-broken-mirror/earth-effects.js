/* Earth fleet profiles use exact painted lamp masks, rather than generic
   engine rectangles. Frames and effects share source coordinates. */
(() => {
  'use strict';
  const profiles={...window.earthAnimationProfiles,...(window.olympicAnimationProfile?{58:window.olympicAnimationProfile}:{})};
  const matches=(rgba,i,tint)=>{
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    if(rgba[i+3]<100)return false;
    if(tint==='lens')return true;
    if(tint==='blue')return b>90&&b>r*1.18&&b>g*.88&&b-r>70;
    if(tint==='red')return r>110&&r>g*1.45&&r>b*1.3&&g<r*.42;
    return r>100&&g>65&&r>g*.95&&g>b*1.45&&r-g<100;
  };
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  for(const [key,d] of Object.entries(profiles)){
    const base=window.createShowcaseEffects(d),lampFrames=[],alignments=new WeakMap(),unlit=new WeakMap();
    const complete=iterator=>{let result;do{result=iterator.next();}while(!result.done);return result.value;};
    const deferred=iterator=>window.nativeDamageArtPreparation?window.nativeDamageArtPreparation.run(iterator):Promise.resolve().then(()=>complete(iterator));
    function* alignment(image,stage){
      // Cached frames already have the translation applied, including severe.
      const c=image.earthAligned?image:canvas(d.width,d.height);
      if(!image.earthAligned){
        const g=c.getContext('2d',{willReadFrequently:true});
        if(d.nativeCrop)g.drawImage(image,...d.nativeCrop,0,0,d.width,d.height);
        else g.drawImage(image,...d.shifts[stage]);
        c.earthAligned=true;
      }
      yield;
      const rgba=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,d.width,d.height).data;yield;
      const textures=[];
      for(const p of d.lights){
        const lit=canvas(p.w,p.h),g=lit.getContext('2d'),pixels=g.createImageData(p.w,p.h);
        let processed=0;
        for(const [y,x,length] of p.runs)for(let dx=x;dx<x+length;dx++){
          if((++processed&1023)===0)yield;
          const i=((p.top+y)*d.width+p.left+dx)*4,j=(y*p.w+dx)*4;
          if(matches(rgba,i,p.tint)){
            pixels.data.set(rgba.subarray(i,i+4),j);
            if(p.added){
              const color=parseInt(p.color.slice(1),16),hot=p.kind==='core'?Math.max(0,1-Math.hypot(dx-(p.w-1)/2,y-(p.h-1)/2)/Math.max(p.w,p.h))*(p.hotScale??.5):0;
              for(let channel=0;channel<3;channel++){
                const value=(color>>(16-channel*8))&255;
                pixels.data[j+channel]=Math.round(value+(255-value)*hot);
              }
            }
          }
        }
        g.putImageData(pixels,0,0);yield;
        const dim=canvas(p.w,p.h),dg=dim.getContext('2d');dg.filter='brightness(.2)';dg.drawImage(lit,0,0);
        textures.push({lit,dim});yield;
      }
      lampFrames[stage]=textures;
      return c;
    }
    function align(image,stage){return complete(alignment(image,stage));}
    function alignAsync(image,stage){
      let stages=alignments.get(image);if(!stages){stages=new Map();alignments.set(image,stages);}
      if(!stages.has(stage)){const promise=deferred(alignment(image,stage));stages.set(stage,promise);promise.catch(()=>stages.delete(stage));}
      return stages.get(stage);
    }
    function* unlighting(image){
      if(image.coreUnlit)return image;
      const c=canvas(d.width,d.height),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);yield;
      const pixels=g.getImageData(0,0,d.width,d.height),rgba=pixels.data;yield;let processed=0;
      for(const p of d.lights)for(const [y,x,length] of p.runs)for(let dx=x;dx<x+length;dx++){
        if((++processed&1023)===0)yield;
        const i=((p.top+y)*d.width+p.left+dx)*4;
        if(!matches(rgba,i,p.tint))continue;
        const grey=Math.round((rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)*.45);
        rgba[i]=rgba[i+1]=rgba[i+2]=grey;
      }
      g.putImageData(pixels,0,0);c.coreUnlit=true;c.earthAligned=true;return c;
    }
    const unlitFrame=image=>complete(unlighting(image));
    function unlitFrameAsync(image){if(!unlit.has(image)){const promise=deferred(unlighting(image));unlit.set(image,promise);promise.catch(()=>unlit.delete(image));}return unlit.get(image);}
    function forEachLamp(stage,time,paint){
      const s=Math.max(0,Math.min(3,stage)),t=time/1000;
      if(s>=3)return;
      for(let i=0;i<d.lights.length;i++){
        const p=d.lights[i],textures=lampFrames[s]?.[i];if(!textures)continue;
        let pulse=p.kind==='running'?(Math.sin(t*4.2+i*.9)>.7?.9:.04):.18+.82*(.5+.5*Math.sin(t*2.1+(p.phase||0)));
        if(s>0&&d.damage[s].some(b=>Math.hypot(b.x-p.x,b.y-p.y)<b.r+17))pulse*=Math.sin(t*9+i*2)>.3?.55:.02;
        paint(textures,p,pulse);
      }
    }
    function draw(ctx,layout,angle,stage,time,options){
      base.draw(ctx,layout,angle,stage,time,{...options,lights:false,anchors:false});
      const s=Math.max(0,Math.min(3,stage)),t=time/1000;
      ctx.save();ctx.translate(layout.x,layout.y);ctx.rotate(angle);
      ctx.scale(layout.w/d.width,layout.h/d.height);ctx.translate(-d.width/2,-d.height/2);
      if(options.lights)forEachLamp(stage,time,(textures,p,pulse)=>{
        if(options.cacheLamps!==false&&window.nativeShipSpriteCache?.drawLamp(ctx,textures,p,pulse,options))return;
        ctx.drawImage(textures.dim,p.left,p.top);
        const gain=options.lightGain||1,bloom=options.lightBloom||1;
        ctx.save();ctx.globalCompositeOperation='screen';ctx.filter=`brightness(${gain})`;ctx.globalAlpha=pulse;ctx.drawImage(textures.lit,p.left,p.top);
        // Blur the same masked lamp, preserving curved strips and split cores.
        ctx.filter=`brightness(${gain}) blur(${(2+2*pulse)*bloom}px)`;ctx.globalAlpha=Math.min(1,pulse*.65*bloom);ctx.drawImage(textures.lit,p.left,p.top);ctx.restore();
      });
      if(options.anchors){
        ctx.lineWidth=2;
        for(const [points,color] of [[d.lights,'#70e7ff'],[d.damage[s],'#ffbe68']]){
          ctx.strokeStyle=color;
          for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.stroke();}
        }
      }
      ctx.restore();
    }
    function alignReference(image){
      if(!d.nativeCrop||image.referenceAligned)return image;
      const source=canvas(image.width,image.height),sg=source.getContext('2d');sg.drawImage(image,0,0);
      const rgba=sg.getImageData(0,0,image.width,image.height).data;
      let left=image.width,top=image.height,right=0,bottom=0;
      for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(rgba[(y*image.width+x)*4+3]>80){
        left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
      }
      const c=canvas(d.width,d.height),w=right-left,h=bottom-top;
      if(w&&h){const scale=Math.min(d.width/w,d.height/h);c.getContext('2d').drawImage(image,left,top,w,h,(d.width-w*scale)/2,(d.height-h*scale)/2,w*scale,h*scale);}
      c.referenceAligned=true;return c;
    }
    const preparationMetrics=()=>({frames:lampFrames.filter(Boolean).length,maxFrames:4,bytes:lampFrames.reduce((sum,stage)=>sum+stage.reduce((n,p)=>n+(p.lit.width*p.lit.height+p.dim.width*p.dim.height)*4,0),0)});
    window.starterShips.set(Number(key),{...d,align,alignAsync,alignReference,effects:Object.freeze({draw,forEachLamp,snapshot:base.snapshot,unlitFrame,unlitFrameAsync,preparationMetrics}),
      breakAnchors:d.damage[3].map(p=>[p.x,p.y]),
      destruction:{sites:d.sites,core:d.core,energyColor:d.energyColor,coreEnabled:d.coreEnabled,sail:d.sail,
        coreIndex:d.coreEnabled===false?-1:d.sites.findIndex(p=>p[0]==='reactor housing')}});
  }
})();
