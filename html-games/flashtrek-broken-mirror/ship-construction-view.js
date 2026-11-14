/* Material deliveries and real DOT work under the heavy yard. Painting is read-only. */
(() => {
  'use strict';
  const base=new URL('showcase-assets/',document.currentScript.src),core=window.shipConstruction;
  const cache=new Map(),pending=new Map(),limit=32*1024*1024,aspect=1421/1107;
  const racks=Object.freeze([[.19,.275],[.81,.275],[.29,.14],[.71,.14],[.20,.635],[.80,.635]].map(Object.freeze));
  let bytes=0,yard=null,yardPromise=null,catalogPromise=null,workers=null,workerPromise=null,lastScene=null,dockPorts=racks;
  const surface=(w,h)=>Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.ceil(w)),height:Math.max(1,Math.ceil(h))});
  const mix=(a,b,t)=>a+(b-a)*t,lerp=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
  async function load(file){const image=new Image();image.src=new URL(file,base).href;await image.decode();return image;}
  const loadYard=()=>yardPromise||=load('structures/278.png').then(image=>{
    yard=image;
    const w=256,h=Math.round(w*aspect),canvas=surface(w,h),g=canvas.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0,w,h);
    const data=g.getImageData(0,0,w,h).data,points=[];
    for(let y=5;y<h-5;y++)for(let x=5;x<w-5;x++){
      let solid=true;for(const dy of [-5,0,5])for(const dx of [-5,0,5])if(data[((y+dy)*w+x+dx)*4+3]<250)solid=false;
      if(solid)points.push({u:x/w,v:y/h});
    }
    if(points.length)dockPorts=racks.map(([u,v])=>{const p=points.reduce((best,p)=>!best||Math.hypot(p.u-u,p.v-v)<Math.hypot(best.u-u,best.v-v)?p:best,null);return [p.u,p.v];});
    return image;
  });
  function loadWorkers(){return workerPromise||=(async()=>{
    const sprites=window.droneSprites||(await (window.nativeRepairVisuals?.ensureBase?.()||window.nativeRepairVisuals?.ensure()))?.sprites;
    if(!sprites||!window.nativeRepairWork)throw Error('The shared DOT artwork and welding renderer are unavailable.');
    if(!(await (sprites.baseReady||sprites.ready)).every(Boolean))throw Error('DOT drone artwork failed to prepare.');
    workers=sprites;return sprites;
  })();}
  function dimLamps(data,w,h){
    const seen=new Uint8Array(w*h),drives=[],d=data.data;
    const colour=k=>{const i=k*4;return d[i+3]>100&&((d[i+2]>105&&d[i+2]>d[i]*1.2&&d[i+2]>d[i+1]*1.05)||(d[i]>145&&d[i]>d[i+1]*1.65&&d[i]>d[i+2]*1.3)||(d[i+1]>110&&d[i+1]>d[i]*1.25&&d[i+1]>d[i+2]*1.15));};
    for(let index=0;index<seen.length;index++){
      if(seen[index]||!colour(index))continue;const group=[index];seen[index]=1;let cx=0,cy=0;
      for(let head=0;head<group.length;head++){const k=group[head],x=k%w,y=Math.floor(k/w);cx+=x;cy+=y;
        for(const n of [x?k-1:-1,x+1<w?k+1:-1,y?k-w:-1,y+1<h?k+w:-1])if(n>=0&&!seen[n]&&colour(n)){seen[n]=1;group.push(n);}}
      if(group.length<2||group.length>Math.min(1200,w*h*.025))continue;
      if(cy/group.length>h*.6)drives.push({x:cx/group.length,y:cy/group.length});
      for(const k of group){const i=k*4,gray=d[i]*.23+d[i+1]*.65+d[i+2]*.12;d[i]=gray*.23;d[i+1]=gray*.25;d[i+2]=gray*.29;}
    }return drives;
  }
  function payload(job,image,w,h){
    if(job.kind==='panel')return {image,x:job.left,y:job.top,w:job.width,h:job.height,ox:job.left+job.width/2-job.x,oy:job.top+job.height/2-job.y,bytes:0};
    const pad=4;
    const left=Math.max(0,Math.floor(job.kind==='beam'?Math.min(job.a.x,job.b.x)-pad:job.x-job.width/2-pad));
    const top=Math.max(0,Math.floor(job.kind==='beam'?Math.min(job.a.y,job.b.y)-pad:job.y-job.height/2-pad));
    const right=Math.min(w,Math.ceil(job.kind==='beam'?Math.max(job.a.x,job.b.x)+pad:job.x+job.width/2+pad));
    const bottom=Math.min(h,Math.ceil(job.kind==='beam'?Math.max(job.a.y,job.b.y)+pad:job.y+job.height/2+pad));
    const texture=surface(right-left,bottom-top),g=texture.getContext('2d');g.translate(-left,-top);
    if(job.kind==='beam'){
      const a=job.a,b=job.b,length=Math.hypot(b.x-a.x,b.y-a.y),thickness=job.width;
      g.save();g.translate(a.x,a.y);g.rotate(Math.atan2(b.y-a.y,b.x-a.x));
      g.fillStyle='#14242c';g.fillRect(-1,-thickness/2-1,length+2,thickness+2);
      const metal=g.createLinearGradient(0,-thickness/2,0,thickness/2);metal.addColorStop(0,'#b3c0c4');metal.addColorStop(.4,'#657a88');metal.addColorStop(1,'#273d49');
      g.fillStyle=metal;g.fillRect(0,-thickness/2,length,thickness);g.fillStyle='#d0d9d8';g.fillRect(0,-thickness/2,length,.65);
      for(let x=3;x<length-2;x+=8){g.fillStyle='#172d38';g.fillRect(x,-thickness*.3,2,thickness*.6);}g.restore();
    }else{
      const x=job.x-job.width/2,y=job.y-job.height/2;g.fillStyle='#101d27';g.fillRect(x,y,job.width,job.height);
      g.strokeStyle='#8a9ca3';g.lineWidth=1;g.strokeRect(x+1,y+1,job.width-2,job.height-2);
      g.strokeStyle=job.part===0||job.part===4?'#9c8058':'#597d82';
      for(let i=3;i<job.width-2;i+=4){g.beginPath();g.moveTo(x+i,y+3);g.lineTo(x+i,y+job.height-3);g.stroke();}
      g.fillStyle='#293c4b';g.fillRect(x+job.width*.28,y+job.height*.3,job.width*.45,job.height*.4);
      g.fillStyle='#76959b';g.fillRect(x+job.width*.32,y+job.height*.35,job.width*.35,1);
    }
    g.globalCompositeOperation='destination-in';g.drawImage(image,0,0);g.globalCompositeOperation='source-over';
    return {image:texture,x:0,y:0,w:texture.width,h:texture.height,ox:left+texture.width/2-job.x,oy:top+texture.height/2-job.y,bytes:texture.width*texture.height*4};
  }
  async function prepare(ship){
    const key=Number(ship.id);if(cache.has(key)){const e=cache.get(key);cache.delete(key);cache.set(key,e);return e;}if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      let file=ship.frames?.[0]||ship.artwork?.frames?.[0];
      if(!file){const data=await (catalogPromise||=fetch(new URL('catalog.json',base)).then(r=>{if(!r.ok)throw Error('Ship artwork catalog unavailable');return r.json();}));file=data.ships.find(h=>h.id===key)?.frames?.[0];}
      if(!file)throw Error('No construction artwork for '+ship.name);
      const [source]=await Promise.all([load(file),loadWorkers(),loadYard()]);
      const scan=surface(128,128),sg=scan.getContext('2d',{willReadFrequently:true});sg.drawImage(source,0,0,128,128);
      const alpha=sg.getImageData(0,0,128,128).data;let l=127,r=0,t=127,b=0;
      for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(alpha[(y*128+x)*4+3]>12){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
      if(r<l||b<t)throw Error('Empty construction artwork for '+ship.name);
      const sw=(r-l+1)/128*source.width,sh=(b-t+1)/128*source.height,ratio=Math.min(1,480/Math.max(sw,sh));
      const w=Math.max(1,Math.round(sw*ratio)),h=Math.max(1,Math.round(sh*ratio)),image=surface(w,h),g=image.getContext('2d',{willReadFrequently:true});
      g.drawImage(source,l/128*source.width,t/128*source.height,sw,sh,0,0,w,h);
      const data=g.getImageData(0,0,w,h),raw=new Uint8ClampedArray(data.data),plan=core.profile(ship),assembly=core.blueprint(plan,{width:w,height:h,rgba:data.data});
      const drives=dimLamps(data,w,h),dark=surface(w,h);dark.getContext('2d').putImageData(data,0,0);
      const lamps=surface(w,h),lg=lamps.getContext('2d'),light=lg.createImageData(w,h);
      for(let i=0;i<raw.length;i+=4){for(let c=0;c<3;c++)light.data[i+c]=Math.max(0,raw[i+c]-data.data[i+c]);light.data[i+3]=raw[i+3];}lg.putImageData(light,0,0);
      const materials=assembly.jobs.map(j=>payload(j,dark,w,h));
      const dimensions=window.nativeShipDefinitions?.dimensions({shipType:key},'civilian')||ship.dimensions;
      const entry={id:key,plan,image,dark,lamps,assembly,materials,drives,w,h,gameHeight:Number(dimensions?.height)||45+(Number(ship.massClass)||1)*13,
        bytes:w*h*4*3+materials.reduce((sum,p)=>sum+p.bytes,0)};
      while(bytes+entry.bytes>limit&&cache.size){const [id,old]=cache.entries().next().value;bytes-=old.bytes;cache.delete(id);}
      cache.set(key,entry);bytes+=entry.bytes;return entry;
    })();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
  }
  function layout(entry,{x,y,span,height=entry.gameHeight*span/340}){
    const b=core.berth(entry.plan),yardHeight=span*aspect;
    return {x:x+(b.u-.5)*span,y:y+(b.v-.5)*yardHeight,span,height,scale:height/entry.h,
      racks:dockPorts.map(([u,v])=>({x:x+(u-.5)*span,y:y+(v-.5)*yardHeight})),yard:{x,y,w:span,h:yardHeight},workerScale:span/340*.28};
  }
  const point=(entry,l,p)=>({x:l.x+(p.x-entry.w/2)*l.scale,y:l.y+(p.y-entry.h/2)*l.scale});
  function source(l,job){const p=l.racks[job.worker];return {x:p.x+(job.id%3-1)*l.span*.004,y:p.y-(job.id%3)*l.span*.004};}
  function path(a,b,t,worker,span){const side=worker%2?1:-1,c={x:(a.x+b.x)/2+span*.09*side,y:(a.y+b.y)/2-span*.06};
    return {x:(1-t)*(1-t)*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)*(1-t)*a.y+2*(1-t)*t*c.y+t*t*b.y};}
  function seamPoint(entry,l,job,q){const points=job.weldPath||job.seam||[{x:job.x,y:job.y}],index=core.clamp(q)*(points.length-1),a=points[Math.floor(index)],b=points[Math.min(points.length-1,Math.floor(index)+1)];return point(entry,l,lerp(a,b,index-Math.floor(index)));}
  function hover(hit,l,worker){const angle=worker%2?Math.PI:0,reach=30*l.workerScale;return {x:hit.x-Math.cos(angle)*reach,y:hit.y-Math.sin(angle)*reach};}
  function workerPose(entry,l,worker,progress){
    const lane=entry.assembly.lanes[worker],home=l.racks[worker],current=lane.find(j=>progress<j.finish),previous=current?lane[lane.indexOf(current)-1]:lane.at(-1);
    const rest=previous?hover(seamPoint(entry,l,previous,1),l,worker):home;
    if(!current){
      const plates=entry.assembly.jobs.filter(j=>j.kind==='panel'),check=plates[Math.floor(worker*plates.length/entry.assembly.workers)]||previous;
      const target=check?point(entry,l,check):home,inspection=hover(target,l,worker),end=previous?.finish||.86;
      if(progress<.895){const q=core.smooth((progress-end)/Math.max(.01,.895-end));return {id:worker,position:path(rest,inspection,q,worker,l.span),aim:target,inspect:true,thrust:q>0&&q<1?.4:0,braking:q>.7,phase:'inspecting'};}
      const q=core.smooth((progress-.895)/.04);return {id:worker,position:path(inspection,home,q,worker,l.span),aim:home,thrust:q>0&&q<1?.6:0,braking:q>.7,phase:q===1?'docked':'returning'};
    }
    const state=core.taskState(current,progress),origin=source(l,current),target=point(entry,l,current);
    if(progress<current.pickup){const start=previous?.finish??.005,q=core.smooth((progress-start)/Math.max(.001,current.pickup-start));return {id:worker,job:current,state,position:path(rest,hover(origin,l,worker),q,worker,l.span),aim:origin,thrust:q>0&&q<1?.7:0,braking:q>.75,phase:'pickup'};}
    if(state.carried){const material=path(origin,target,state.delivery,worker,l.span);return {id:worker,job:current,state,position:hover(material,l,worker),aim:material,material,thrust:.65,braking:state.delivery>.72,phase:'delivery'};}
    const hit=seamPoint(entry,l,current,state.weld);return {id:worker,job:current,state,position:hover(hit,l,worker),aim:hit,hit,thrust:0,phase:'welding'};
  }
  function paintMaterial(g,entry,job,l,position,angle=0){const m=entry.materials[job.id],s=l.scale;g.save();g.translate(position.x,position.y);g.rotate(angle);g.drawImage(m.image,m.x,m.y,m.w,m.h,(m.ox-m.w/2)*s,(m.oy-m.h/2)*s,m.w*s,m.h*s);g.restore();}
  function drawWorker(g,pose,l,time,metrics){
    if(!workers)return;
    const nozzle=workers.nozzle('basic'),scale=l.workerScale,beta=Math.atan2(nozzle.y,nozzle.x),angle=Math.atan2(pose.aim.y-pose.position.y,pose.aim.x-pose.position.x)-beta;
    const c=Math.cos(angle),s=Math.sin(angle),tip={x:pose.position.x+(nozzle.x*c-nozzle.y*s)*scale,y:pose.position.y+(nozzle.x*s+nozzle.y*c)*scale};
    g.save();g.translate(pose.position.x,pose.position.y);g.rotate(angle);g.scale(scale,scale);
    const drawn=workers.draw(g,'basic',{role:'repair',health:100,maxHealth:100,time:time*1000,lights:true,effects:false,thrust:pose.thrust,activity:pose.hit?1:pose.inspect?.15:0});
    if(drawn){metrics.dotDraws++;window.nativeRepairWork.drawThrusters(g,{role:'repair',health:100,lights:true,thrust:pose.thrust,braking:pose.braking});}g.restore();
    if(pose.hit){window.nativeRepairWork.drawWeld(g,{heading:angle,tier:'basic',nozzle:tip,hit:pose.hit},time*1000,pose.id,scale);
      const at=time*1000,born=Math.floor(at/100)*100,sparks=window.nativeRepairWork.burst(pose.hit,{x:-Math.sin(angle),y:Math.cos(angle)},born,pose.id*71+Math.floor(born/100),0,0,scale,pose.id,.65);window.nativeRepairWork.drawSparks(g,sparks,at);
    }else if(pose.material){g.save();g.strokeStyle='#a0b7bb';g.lineWidth=Math.max(.6,scale*1.5);g.beginPath();g.moveTo(tip.x,tip.y);g.lineTo(pose.material.x,pose.material.y);g.stroke();g.restore();}
    metrics.workers.push({id:pose.id,phase:pose.phase,x:pose.position.x,y:pose.position.y,model:'repair:basic',nozzle:tip,hit:pose.hit||null});
  }
  function renderAssembly(g,entry,l,seconds,time){
    const sample=core.sample(entry.plan,seconds),progress=sample.progress;
    const metrics={ship:entry.id,progress,underFramework:true,materialOpacity:1,dotDraws:0,workers:[],deliveries:[],counts:{stored:0,pickup:0,delivery:0,welding:0,installed:0},blueprint:{...entry.assembly.counts},berth:{x:l.x,y:l.y},yard:{...l.yard}};
    const poses=Array.from({length:entry.assembly.workers},(_,i)=>workerPose(entry,l,i,progress)),release=core.release(entry.plan,l.height,l.span,sample.launch);
    g.save();g.translate(l.x+release.x,l.y+release.y);g.rotate(release.rotation);g.translate(-l.x,-l.y);
    for(const job of entry.assembly.jobs){const state=core.taskState(job,progress);if(state.installed||state.phase==='welding')paintMaterial(g,entry,job,l,point(entry,l,job));}
    if(progress>=.86){g.drawImage(entry.dark,l.x-entry.w*l.scale/2,l.y-l.height/2,entry.w*l.scale,l.height);
      // Only lamp emission changes during the power test; installed metal stays opaque.
      g.globalCompositeOperation='lighter';g.globalAlpha=sample.power;g.drawImage(entry.lamps,l.x-entry.w*l.scale/2,l.y-l.height/2,entry.w*l.scale,l.height);g.globalAlpha=1;g.globalCompositeOperation='source-over';}
    g.restore();
    for(const job of entry.assembly.jobs){const state=core.taskState(job,progress);metrics.counts[state.phase]++;
      if(state.installed||state.phase==='welding')continue;
      const origin=source(l,job),target=point(entry,l,job),p=state.carried?path(origin,target,state.delivery,job.worker,l.span):origin;
      paintMaterial(g,entry,job,l,p,state.carried?(job.worker%2?1:-1)*.15*Math.sin(Math.PI*state.delivery):0);
      if(state.carried){metrics.deliveries.push({id:job.id,kind:job.kind,origin,target,position:p,alpha:1});
        if(job.kind==='module'){g.save();g.strokeStyle='#566c79';g.lineWidth=1;g.beginPath();g.moveTo(origin.x,origin.y);g.lineTo(p.x,p.y);g.stroke();g.restore();}}
    }
    if(progress<.94)for(const pose of poses)drawWorker(g,pose,l,time,metrics);
    lastScene=metrics;return sample;
  }
  function paintYard(g,entry,{x,y,span,height,seconds,time=seconds}){
    const l=layout(entry,{x,y,span,height}),sample=core.sample(entry.plan,seconds);g.save();
    const half=entry.w*l.scale*.56,clamp=1-core.smooth(sample.launch/.15);g.strokeStyle='#344a58';g.lineWidth=Math.max(.7,span/340*2);
    for(const side of [-1,1]){g.beginPath();g.moveTo(l.x+side*(half+span*.06),l.y-l.height*.40);g.lineTo(l.x+side*(half+span*.06),l.y+l.height*.44);g.stroke();
      if(clamp){g.strokeStyle='#a5afb0';g.beginPath();g.moveTo(l.x+side*(half+span*.06),l.y+l.height*.25);g.lineTo(l.x+side*(half+span*.06*(1-clamp)),l.y+l.height*.25);g.stroke();g.strokeStyle='#344a58';}}
    renderAssembly(g,entry,l,seconds,time);
    // The original station alpha covers hulls, materials and DOTs below its frame.
    if(yard)g.drawImage(yard,x-span/2,y-span*aspect/2,span,span*aspect);g.restore();return sample;
  }
  function fitScene(entry,{width,height,seconds}){
    const l=layout(entry,{x:0,y:0,span:340}),sample=core.sample(entry.plan,seconds),r=core.release(entry.plan,l.height,340,sample.launch);
    let minX=-l.yard.w/2,minY=-l.yard.h/2,maxX=l.yard.w/2,maxY=l.yard.h/2;
    const include=(x0,y0,x1,y1)=>{minX=Math.min(minX,x0);minY=Math.min(minY,y0);maxX=Math.max(maxX,x1);maxY=Math.max(maxY,y1);};
    const hullW=entry.w*l.scale,halfX=(Math.abs(Math.cos(r.rotation))*hullW+Math.abs(Math.sin(r.rotation))*l.height)/2;
    const halfY=(Math.abs(Math.sin(r.rotation))*hullW+Math.abs(Math.cos(r.rotation))*l.height)/2;
    const ship={minX:l.x+r.x-halfX,minY:l.y+r.y-halfY,maxX:l.x+r.x+halfX,maxY:l.y+r.y+halfY};
    include(ship.minX,ship.minY,ship.maxX,ship.maxY);
    const clampHalf=hullW*.56+340*.06+3;include(l.x-clampHalf,l.y-l.height*.42,l.x+clampHalf,l.y+l.height*.46);
    for(const job of entry.assembly.jobs){
      const state=core.taskState(job,sample.progress);if(state.installed||state.phase==='welding')continue;
      const a=source(l,job),b=point(entry,l,job),p=state.carried?path(a,b,state.delivery,job.worker,340):a,m=entry.materials[job.id];
      const radius=Math.hypot(m.w,m.h)*l.scale/2+Math.hypot(m.ox,m.oy)*l.scale+3;include(p.x-radius,p.y-radius,p.x+radius,p.y+radius);
    }
    if(sample.progress<.94)for(let i=0;i<entry.assembly.workers;i++){
      const worker=workerPose(entry,l,i,sample.progress),p=worker.position;include(p.x-20,p.y-20,p.x+20,p.y+20);
      if(worker.hit)include(worker.hit.x-20,worker.hit.y-20,worker.hit.x+20,worker.hit.y+20);
    }
    const padding=Math.min(24,width*.07,height*.07),scale=Math.min(Math.max(1,width-padding*2)/(maxX-minX),Math.max(1,height-padding*2)/(maxY-minY));
    const x=(width-(maxX-minX)*scale)/2-minX*scale,y=(height-(maxY-minY)*scale)/2-minY*scale;
    return {mode:'fit',x,y,scale,span:340*scale,padding,width,height,
      bounds:{minX:x+minX*scale,minY:y+minY*scale,maxX:x+maxX*scale,maxY:y+maxY*scale},
      shipBounds:{minX:x+ship.minX*scale,minY:y+ship.minY*scale,maxX:x+ship.maxX*scale,maxY:y+ship.maxY*scale}};
  }
  function paintScene(g,entry,{width,height,seconds,time=seconds}){
    g.clearRect(0,0,width,height);g.fillStyle='#050c14';g.fillRect(0,0,width,height);
    for(let i=0;i<90;i++){g.fillStyle=i%3?'#31495e':'#8eafc2';g.fillRect((i*179.31+31)%width,(i*97.73+17)%height,1,1);}
    const camera=fitScene(entry,{width,height,seconds}),sample=paintYard(g,entry,{x:camera.x,y:camera.y,span:camera.span,seconds,time});
    if(lastScene)lastScene.camera=camera;return sample;
  }
  function paintShip(g,entry,options){const span=340*options.height/entry.gameHeight,b=core.berth(entry.plan),l=layout(entry,{x:options.x-(b.u-.5)*span,y:options.y-(b.v-.5)*span*aspect,span,height:options.height});return renderAssembly(g,entry,l,options.seconds,options.time??options.seconds);}
  window.shipConstructionView=Object.freeze({prepare,loadYard,loadWorkers,paintShip,paintYard,paintScene,fitScene,layout,get yard(){return yard;},
    snapshot:()=>({version:2,bytes,limit,cached:cache.size,pending:pending.size,yard:!!yard,dotReady:!!workers,
      dotSource:workers?.definitions?.repair?.basic?.src||null,last:lastScene?JSON.parse(JSON.stringify(lastScene)):null})});
})();
