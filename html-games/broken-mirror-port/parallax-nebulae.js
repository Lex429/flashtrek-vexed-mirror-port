/* Trek plasma regions and Broken Mirror anomaly clouds on the existing chart. */
(() => {
  'use strict';
  const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  const paths=Object.freeze({orion:'assets/nebulae/hubble-orion.webp',carina:'assets/nebulae/webb-carina.png'});
  const records=new Map((window.VexedMirrorWorld?.systems||[]).map(row=>[row.id,row]));
  const chart=id=>window.nativeManualFlight?.chartPosition(id)||records.get(Number(id))?.mapPosition;
  function place(id,name,system,rx,ry,opacity,width,source,angle=0,offset={x:0,y:0},activity=1){
    const origin=chart(system);return origin&&records.get(system)?.nebula&&Object.freeze({id,name,system,
      basis:system===73?'television-plasma-region':'broken-mirror-anomaly',
      x:origin.x+offset.x,y:origin.y+offset.y,rx,ry,opacity,width,source,angle,activity});
  }
  const places=Object.freeze([
    place('harman-wisps','Harman anomaly outskirts',32,34,31,.23,1000,'carina',.45),
    place('kardon-clouds','Kardon anomaly clouds',33,33,29,.36,1080,'orion',.8),
    place('vex-clouds','Vex anomalous cloud complex',34,51,43,.47,1260,'carina',-.55),
    place('badlands-plasma','Badlands plasma storms',73,24,23,.64,1240,'plasma',-.1,{x:0,y:0},3.2)
  ].filter(Boolean));
  const layers=Object.freeze([
    Object.freeze({rate:.004,scale:1.12,alpha:.69,phase:.6,turn:0}),
    Object.freeze({rate:.007,scale:.84,alpha:.23,phase:2.8,turn:.13}),
    Object.freeze({rate:.011,scale:.64,alpha:.12,phase:4.5,turn:-.18})
  ]);
  const images=new Map();let builds=0;
  async function plasma(){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pixels=ctx.createImageData(w,h);
    const hash=(x,y)=>{let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^0x504c4153)>>>0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
    const mix=(a,b,t)=>a+(b-a)*t;
    function noise(x,y){
      const ix=Math.floor(x),iy=Math.floor(y),tx=smooth(x-ix),ty=smooth(y-iy);
      return mix(mix(hash(ix,iy),hash(ix+1,iy),tx),mix(hash(ix,iy+1),hash(ix+1,iy+1),tx),ty);
    }
    function clouds(x,y){return noise(x,y)*.54+noise(x*2.07+7,y*2.07-3)*.27+noise(x*4.17-5,y*4.17+13)*.13+noise(x*8.31+17,y*8.31+9)*.06;}
    const clamp=n=>Math.max(0,Math.min(1,n));
    const vortices=[[.20,.49],[.52,.54],[.83,.47]],frontA=new Float64Array(w),frontB=new Float64Array(w);
    for(let x=0;x<w;x++){const u=x/(w-1);frontA[x]=.28+Math.sin(u*8+.7)*.045+Math.sin(u*19)*.015;frontB[x]=.72+Math.sin(u*10+2.4)*.045;}
    for(let y=0;y<h;y++){
      const v=y/(h-1),middle=Math.exp(-(((v-.5)/.2)**2));
      for(let x=0;x<w;x++){
        const u=x/(w-1);let sx=u,sy=v;
        for(const [cx,cy] of vortices){
          const dx=sx-cx,dy=(sy-cy)*.65,amount=3.7*Math.exp(-((dx/.16)**2+(dy/.15)**2)),c=Math.cos(amount),s=Math.sin(amount);
          sx=cx+dx*c-dy*s;sy=cy+(dx*s+dy*c)/.65;
        }
        const n=clouds(sx*8.5+Math.sin(sy*5)*.7,sy*8+Math.sin(sx*7)*.6);
        const a=frontA[x],b=frontB[x];
        const front=Math.exp(-(((v-a)/.16)**2))+Math.exp(-(((v-b)/.16)**2));
        const density=clamp((n-.25)*1.75*(front+.22*middle));
        const hot=smooth((n-.47)/.3)*density,detail=noise(sx*29+5,sy*27-3)*.10;
        const i=(y*w+x)*4;
        pixels.data[i]=45+density*163+hot*40+detail*40;
        pixels.data[i+1]=13+density*67+hot*83+detail*18;
        pixels.data[i+2]=12+density*43+hot*66+detail*15;
        pixels.data[i+3]=clamp(density*1.7)*255;
      }
      // Preparation yields in small slices; steady painting only blits this art.
      if(y%16===15)await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    ctx.putImageData(pixels,0,0);return canvas;
  }
  function feather(image){
    const ratio=Math.min(1,1024/(image.naturalWidth||image.width));
    const canvas=document.createElement('canvas');canvas.width=Math.round((image.naturalWidth||image.width)*ratio);canvas.height=Math.round((image.naturalHeight||image.height)*ratio);
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    // Feather during composition; the bundled source photograph stays untouched.
    ctx.globalCompositeOperation='destination-in';ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(canvas.width/2,canvas.height/2);
    const edge=ctx.createRadialGradient(0,0,.25,0,0,1);
    for(const [at,alpha] of [[0,1],[.38,.98],[.67,.72],[.86,.24],[1,0]])edge.addColorStop(at,`rgba(255,255,255,${alpha})`);
    ctx.fillStyle=edge;ctx.fillRect(-1,-1,2,2);builds++;return canvas;
  }
  function request(source){
    let entry=images.get(source);if(entry?.image||entry?.pending||entry?.retryAt>Date.now())return entry;
    if(source==='plasma'){
      entry={image:null,pending:null,retryAt:0,failures:0};images.set(source,entry);
      entry.pending=plasma().then(image=>{entry.image=feather(image);entry.pending=null;}).catch(error=>{entry.pending=null;entry.retryAt=Date.now()+15000;entry.failures++;throw error;});
      entry.pending.catch(()=>{});return entry;
    }
    const loader=window.vexedFlightAssets?.loadImage;if(!loader)return null;
    if(!entry){entry={image:null,pending:null,retryAt:0,failures:0};images.set(source,entry);}
    entry.pending=loader(paths[source]).then(image=>{
      entry.image=feather(image);entry.pending=null;entry.retryAt=0;
    }).catch(error=>{entry.pending=null;entry.retryAt=Date.now()+15000;entry.failures++;throw error;});
    entry.pending.catch(()=>{});return entry;
  }
  function point(system,view={},camera=false){
    const origin=chart(system)||{x:0,y:0},scale=window.nativeManualFlight?.unitsPerChartPoint||1000;
    const x=Number(camera?view.cameraX??view.playerX:view.playerX??view.cameraX)||0;
    const y=Number(camera?view.cameraY??view.playerY:view.playerY??view.cameraY)||0;
    return {x:origin.x+x/scale,y:origin.y+y/scale};
  }
  function coverage(place,location){
    const distance=Math.hypot((location.x-place.x)/place.rx,(location.y-place.y)/place.ry);
    return smooth((1-distance)/.38);
  }
  function nearby(system,view={}){
    const location=point(system,view);return places.filter(place=>coverage(place,location)>0);
  }
  function projection(place,layer,system,view,time=0){
    const location=point(system,view),camera=point(system,view,true),influence=coverage(place,location);
    const t=view.reducedMotion?0:time*place.activity,phase=layer.phase+place.x*.017+place.y*.013;
    const scale=Math.max(.75,Math.min(1.35,Math.max(view.w/1200,view.h/900)));
    const width=place.width*layer.scale*scale,aspect=place.source==='orion'?1:place.source==='plasma'?.5:693/2000;
    const driftX=Math.sin(t*.024+phase)*(10+layer.phase*3),driftY=Math.sin(t*.018+phase*1.3)*(8+layer.phase*2);
    const x=view.w/2+(place.x-camera.x)*1000*layer.rate+driftX;
    const y=view.h/2+(place.y-camera.y)*1000*layer.rate+driftY;
    const alpha=place.opacity*layer.alpha*influence*(view.reducedMotion?1:.96+.04*Math.sin(t*.055+phase));
    return {id:place.id,source:place.source,basis:place.basis,x,y,width,height:width*aspect,angle:place.angle+layer.turn+.006*Math.sin(t*.011+phase),alpha,rate:layer.rate};
  }
  async function prepare(system,{signal}={}){
    const check=()=>{if(signal?.aborted)throw Error('Nebula preparation cancelled.');};check();
    const sources=new Set(nearby(system).map(place=>place.source));
    let unavailable=0;
    await Promise.all([...sources].map(async source=>{try{await request(source)?.pending;}catch{unavailable++;}}));check();
    return {sources:sources.size,unavailable};
  }
  function create(){
    let elapsed=0,last={draws:0,visible:[],layers:[],loadedImages:0,bytes:0,builds:0,pending:0,failures:0};
    function rebase(state){elapsed+=Number(state.elapsed)||0;}
    function render(ctx,view,state){
      const projections=[],visible=[];let draws=0;
      for(const place of nearby(state.system,view)){
        const planes=layers.map(layer=>projection(place,layer,state.system,view,elapsed+state.elapsed));
        const onScreen=planes.filter(plane=>{
          const bound=Math.hypot(plane.width,plane.height)/2;
          return plane.alpha>.0001&&plane.x+bound>0&&plane.x-bound<view.w&&plane.y+bound>0&&plane.y-bound<view.h;
        });
        if(!onScreen.length)continue;
        const art=request(place.source)?.image;if(!art)continue;
        visible.push(place.id);
        for(const plane of onScreen){
          ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=plane.alpha;
          ctx.translate(plane.x,plane.y);ctx.rotate(plane.angle);
          ctx.drawImage(art,-plane.width/2,-plane.height/2,plane.width,plane.height);ctx.restore();
          projections.push(plane);draws++;
        }
      }
      let loadedImages=0,proceduralTextures=0,bytes=0,pending=0,failures=0;
      for(const [source,entry] of images){
        if(entry.image){source==='plasma'?proceduralTextures++:loadedImages++;bytes+=entry.image.width*entry.image.height*4;}
        if(entry.pending)pending++;failures+=entry.failures;
      }
      last={draws,visible,layers:projections,loadedImages,proceduralTextures,bytes,builds,pending,failures,elapsed:elapsed+state.elapsed};
    }
    return Object.freeze({prepare,render,rebase,metrics:()=>({...last,visible:[...last.visible],layers:last.layers.map(layer=>({...layer}))})});
  }
  window.nativeParallaxNebulae=Object.freeze({create,prepare,places,layers,paths,point,coverage,nearby,projection});
})();
