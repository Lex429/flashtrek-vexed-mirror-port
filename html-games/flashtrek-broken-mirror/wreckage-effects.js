/* Cached torn, scorched material. Preparation never changes source artwork;
   rendering samples simulation time and cannot create fragments or damage. */
(() => {
  'use strict';
  const cache=new WeakMap(),pending=new WeakMap(),metrics={prepared:0,sourcePixels:0,tornPixels:0};
  const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const noise=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};
  function* prepare(source,{organic=false,seed=0}={}){
    const existing=cache.get(source);if(existing)return existing;
    const ratio=Math.min(1,384/Math.max(source.width,source.height)),w=Math.max(1,Math.round(source.width*ratio)),h=Math.max(1,Math.round(source.height*ratio));
    const texture=make(w,h),g=texture.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0,w,h);
    const image=g.getImageData(0,0,w,h),raw=new Uint8ClampedArray(image.data),distance=new Uint8Array(w*h),hot=make(w,h),hg=hot.getContext('2d'),heat=hg.createImageData(w,h),anchors=[];
    for(let y=0;y<h;y++){for(let x=0;x<w;x++){const q=y*w+x;distance[q]=raw[q*4+3]>80?8:0;}if(y%32===31)yield;}
    // A bounded distance field follows the actual material boundary, including holes.
    for(let y=0;y<h;y++){for(let x=0;x<w;x++){const q=y*w+x;if(!distance[q])continue;distance[q]=Math.min(distance[q],x?distance[q-1]+1:1,y?distance[q-w]+1:1);}if(y%32===31)yield;}
    for(let y=h-1;y>=0;y--){for(let x=w-1;x>=0;x--){const q=y*w+x;if(!distance[q])continue;distance[q]=Math.min(distance[q],x<w-1?distance[q+1]+1:1,y<h-1?distance[q+w]+1:1);}if(y%32===0)yield;}
    let sourcePixels=0,tornPixels=0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const q=y*w+x,i=q*4;if(!raw[i+3])continue;sourcePixels++;
        const grain=noise(x*.37+y*1.71+seed),coarse=noise(Math.floor(x/11)+Math.floor(y/9)*73+seed),depth=distance[q],bite=Math.min(3,Math.max(0,Math.floor(Math.min(w,h)/35)))+(grain>.68?1:0);
        if(depth&&depth<=bite){image.data[i+3]=0;tornPixels++;continue;}
        const retained=organic?.13+coarse*.19:.17+coarse*.23,blister=grain>.94?.55:1;
        image.data[i]=raw[i]*retained*blister+(organic?13:8);image.data[i+1]=raw[i+1]*retained*blister+6;image.data[i+2]=raw[i+2]*retained*blister+(organic?7:5);
        if(depth&&depth<=bite+2){const edge=organic?34:63;image.data[i]=Math.max(image.data[i],edge+grain*26);image.data[i+1]=Math.max(image.data[i+1],edge*.7);image.data[i+2]=Math.max(image.data[i+2],edge*.48);
          if(coarse>.3){heat.data.set([255,Math.round(80+grain*100),20,Math.round(130+coarse*100)],i);if(anchors.length<5&&noise(q+seed)>.987&&anchors.every(p=>Math.hypot(p.x-x/w,p.y-y/h)>.22))anchors.push({x:x/w,y:y/h});}
        }
      }if(y%24===23)yield;
    }
    g.putImageData(image,0,0);hg.putImageData(heat,0,0);yield;
    const result=Object.freeze({texture,hot,organic,anchors:Object.freeze(anchors.map(Object.freeze)),sourcePixels,tornPixels});cache.set(source,result);metrics.prepared++;metrics.sourcePixels+=sourcePixels;metrics.tornPixels+=tornPixels;return result;
  }
  function schedule(iterator){
    const queue=window.nativeDamageArtPreparation;
    if(!queue)return Promise.resolve().then(()=>{let result;do{result=iterator.next();}while(!result.done);return result.value;});
    const admit=()=>{const state=queue.snapshot();return state.pending>=state.limits.maxPending?new Promise(resolve=>setTimeout(resolve,24)).then(admit):queue.run(iterator);};return admit();
  }
  function primeAll(sources,options){return schedule((function*(){for(const source of sources)yield* prepare(source,options);})());}
  function prime(source,options){
    if(cache.has(source))return Promise.resolve(cache.get(source));if(pending.has(source))return pending.get(source);
    const iterator=prepare(source,options),promise=schedule(iterator);
    pending.set(source,promise);return promise;
  }
  function draw(ctx,source,w,h,age,{organic=false}={}){
    const material=cache.get(source);if(!material)return false;
    ctx.save();ctx.drawImage(material.texture,-w/2,-h/2,w,h);
    const heat=Math.max(0,1-age/3600);if(heat>0){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=heat**1.5*(.78+.22*Math.sin(age*.037));ctx.drawImage(material.hot,-w/2,-h/2,w,h);ctx.restore();}
    if(age>=0&&age<3200){
      const fire=Math.max(0,1-age/3200),size=Math.max(1.2,Math.min(8,Math.min(w,h)*.12));
      for(const [index,point] of material.anchors.entries()){
        const x=(point.x-.5)*w,y=(point.y-.5)*h,phase=age*.014+index*2.7,lick=size*fire*(.8+.3*Math.sin(phase));
        ctx.save();ctx.translate(x,y);
        const smoke=(age*.0007+index*.31)%1;ctx.globalAlpha*=fire*(1-smoke)*.24;ctx.fillStyle=organic?'#38272c':'#363432';ctx.beginPath();ctx.ellipse(smoke*4,-smoke*size*4,size*(.3+smoke),size*(.5+smoke*1.3),.2,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=fire*.8;ctx.translate(x,y);
        // Uneven, translucent gas lobes break up the flame without a hard outline.
        for(let lobe=0;lobe<3;lobe++){
          const sway=Math.sin(phase+lobe*2.7),r=lick*(.65+.2*Math.sin(phase*1.7+lobe)),dx=sway*lick*.4,dy=-lick*(.1+lobe*.48);
          const flame=ctx.createRadialGradient(dx,dy,0,dx,dy,r);flame.addColorStop(0,lobe?'#ffc16c99':'#ffe6a0cc');flame.addColorStop(.3,'#ff9c3890');flame.addColorStop(.65,'#d9432240');flame.addColorStop(1,'#ac281200');
          ctx.save();ctx.translate(dx,dy);ctx.rotate(sway*.3);ctx.scale(.65,1.3);ctx.translate(-dx,-dy);ctx.fillStyle=flame;ctx.fillRect(dx-r,dy-r,r*2,r*2);ctx.restore();
        }
        for(let j=0;j<2;j++){const a=(age*.0015+index*.19+j*.5)%1;ctx.globalAlpha=fire*(1-a);ctx.fillStyle=a<.4?'#ffd27b':'#d26128';ctx.fillRect(Math.sin(index*7+j)*a*size*2,-a*size*5,Math.max(.6,size*.11),Math.max(.6,size*.11));}ctx.restore();
      }
    }ctx.restore();return true;
  }
  // Irregular Voronoi ownership preserves each source pixel exactly once.
  function owner(x,y,sites,width,height){
    const amp=Math.max(1,Math.min(6,Math.min(width,height)*.014)),xx=x+amp*(Math.sin(y*.19)+.45*Math.sin(y*.73+x*.09)),yy=y+amp*(Math.sin(x*.17)+.4*Math.sin(x*.67-y*.11));
    let best=0,distance=Infinity;for(let i=0;i<sites.length;i++){const p=sites[i],px=p[0],py=p[1],d=(xx-px)**2+(yy-py)**2;if(d<distance){distance=d;best=i;}}return best;
  }
  window.wreckageEffects=Object.freeze({prepare,prime,primeAll,draw,owner,get:source=>cache.get(source)||null,memoryBytes:source=>{const p=cache.get(source);return p?(p.texture.width*p.texture.height+p.hot.width*p.hot.height)*4:0;},snapshot:()=>({...metrics})});
})();
