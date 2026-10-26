/* Damage-state fragments used by the showcase and live ships. */
(() => {
  'use strict';
  // One cooperative queue covers every live ship, rather than allowing each
  // class to spend a separate frame budget. Pixel loops yield between bounded
  // chunks; image readback and texture upload are the only indivisible calls.
  const queue=[],statistics={completed:0,failed:0,workMs:0,maxSliceMs:0,slices:0,peakPending:0,workerWorkMs:0,workerJobs:0},limits={sliceMs:2,maxPending:64,maxSteps:64};
  const workerURL=document.currentScript?.src?new URL('damage-art-worker.js?v=fast-start-2',document.currentScript.src):null,remoteJobs=new Map();
  let worker=null,workerFailed=false,remoteSequence=0;
  function offscreen(kind,frames,config){
    if(!workerURL||workerFailed||typeof Worker!=='function'||typeof OffscreenCanvas!=='function'||typeof createImageBitmap!=='function'||remoteJobs.size>=8)return null;
    // Known structural partitions travel as data; arbitrary custom functions
    // retain the ordinary cooperative path without serializing executable code.
    if(kind==='destruction'&&config.partition?.serialized?.kind==='torn-anchors-v1')config={...config,partition:{serialized:config.partition.serialized}};
    try{if(typeof structuredClone==='function')structuredClone(config);else return null;}catch{return null;}
    if(!worker){
      try{worker=new Worker(workerURL);}catch{workerFailed=true;return null;}
      worker.onmessage=event=>{const m=event.data,job=remoteJobs.get(m.id);if(!job)return;remoteJobs.delete(m.id);
        if(m.error){statistics.failed++;job.reject(Error(m.error));}else{statistics.workerJobs++;statistics.workerWorkMs+=m.workMs;job.resolve(m.data);}};
      worker.onerror=()=>{workerFailed=true;worker.terminate();worker=null;for(const job of remoteJobs.values())job.reject(Error('Damage artwork worker failed'));remoteJobs.clear();};
    }
    const id=++remoteSequence;
    const promise=new Promise((resolve,reject)=>remoteJobs.set(id,{resolve,reject}));
    (async()=>{
      const bitmaps=[];
      try{for(const frame of frames)bitmaps.push(await createImageBitmap(frame));worker.postMessage({id,kind,frames:bitmaps,config},bitmaps);}
      catch(error){for(const bitmap of bitmaps)bitmap.close();remoteJobs.get(id)?.reject(error);remoteJobs.delete(id);}
    })();
    return promise;
  }
  let scheduled=false,suspended=false;
  const clock=()=>performance.now();
  // Repeated zero-delay timers acquire a 4 ms clamp. Keep the same bounded
  // slices at background priority without making cold drone preparation crawl.
  const deferPump=()=>window.scheduler?.postTask?window.scheduler.postTask(pump,{priority:'background'}):setTimeout(pump,0);
  function pump(){
    scheduled=false;if(suspended)return;const started=clock();let steps=0;
    do{
      const task=queue.shift();if(!task)break;
      try{const result=task.iterator.next();if(result.done){statistics.completed++;task.resolve(result.value);}else queue.push(task);}
      catch(error){statistics.failed++;task.reject(error);}
      steps++;
    }while(queue.length&&steps<limits.maxSteps&&clock()-started<limits.sliceMs);
    const elapsed=clock()-started;statistics.workMs+=elapsed;statistics.maxSliceMs=Math.max(statistics.maxSliceMs,elapsed);statistics.slices++;
    if(queue.length&&!scheduled){scheduled=true;deferPump();}
  }
  function run(iterator){
    if(queue.length>=limits.maxPending)return Promise.reject(Error('Optional damage-art preparation queue is full'));
    return new Promise((resolve,reject)=>{queue.push({iterator,resolve,reject});statistics.peakPending=Math.max(statistics.peakPending,queue.length);
      if(!scheduled&&!suspended){scheduled=true;deferPump();}});
  }
  const finish=iterator=>{let result;do{result=iterator.next();}while(!result.done);return result.value;};
  window.nativeDamageArtPreparation=Object.freeze({run,finish,offscreen,
    setPaused(value){suspended=!!value;if(!suspended&&queue.length&&!scheduled){scheduled=true;deferPump();}},
    snapshot:()=>({...statistics,pending:queue.length+remoteJobs.size,workerPending:remoteJobs.size,suspended,limits:{...limits}}),
    resetMetrics(){for(const field of Object.keys(statistics))statistics[field]=0;statistics.peakPending=queue.length;}});
  function* preparation(frames,anchors) {
    const w=frames[0].width,h=frames[0].height;
    const read=image=>{
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
      return ctx.getImageData(0,0,w,h).data;
    };
    const pixels=[],fragments=[[],[],[],[]];
    for(const frame of frames){pixels.push(read(frame));yield;}
    for(let stage=1;stage<4;stage++){
      const groups=anchors.map(()=>[]),before=pixels[stage-1],after=pixels[stage];
      for(let pixel=0;pixel<w*h;pixel++){
        if((pixel&1023)===1023)yield;
        const i=pixel*4;if(before[i+3]<100||after[i+3]>40)continue;
        const x=pixel%w,y=Math.floor(pixel/w);
        let closest=0,distance=Infinity;
        for(let n=0;n<anchors.length;n++){const [ax,ay]=anchors[n],d=(x-ax)**2+(y-ay)**2;if(d<distance){distance=d;closest=n;}}
        groups[closest]?.push(pixel);
      }
      for(const group of groups){
        if(group.length<12)continue;
        let x=w,y=h,right=0,bottom=0;
        for(let n=0;n<group.length;n++){const pixel=group[n],px=pixel%w,py=Math.floor(pixel/w);x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px);bottom=Math.max(bottom,py);if((n&1023)===1023)yield;}
        const fw=right-x+1,fh=bottom-y+1;
        const texture=document.createElement('canvas');texture.width=fw;texture.height=fh;
        const ctx=texture.getContext('2d'),cut=ctx.createImageData(fw,fh);
        for(let n=0;n<group.length;n++){const pixel=group[n],i=pixel*4;cut.data.set(before.subarray(i,i+4),((Math.floor(pixel/w)-y)*fw+pixel%w-x)*4);if((n&1023)===1023)yield;}
        ctx.putImageData(cut,0,0);yield;
        if(window.wreckageEffects)yield* window.wreckageEffects.prepare(texture,{seed:stage});
        fragments[stage].push({texture,x:(x+fw/2)/w-.5,y:(y+fh/2)/h-.5,w:fw/w,h:fh/h,pixels:group.length});
      }
    }
    return fragments;
  }
  const prepare=(frames,anchors)=>finish(preparation(frames,anchors));
  async function prepareAsync(frames,anchors){
    const remote=offscreen('fragments',frames,anchors);
    if(remote)try{const result=await remote;for(const stage of result)for(const piece of stage)if(piece.material)window.wreckageEffects?.adopt(piece.texture,piece.material);return result;}catch{}
    return run(preparation(frames,anchors));
  }
  function emit({debris,fragments,before,after,layout,world,angle,time,zoom,burst}) {
    for(let stage=before+1;stage<=after;stage++)for(const piece of fragments[stage]){
      const point=world(piece),direction=Math.atan2(point.y-layout.y,point.x-layout.x),speed=(55+stage*18)*zoom;
      debris.push({...point,texture:piece.texture,w:piece.w*layout.w,h:piece.h*layout.h,
        vx:Math.cos(direction)*speed,vy:Math.sin(direction)*speed,
        angle,spin:(piece.x<0?-1:1)*1.4,born:time,ttl:4200,cthia:true});
      burst(point,.65,true);
    }
  }
  function update(piece,dt){
    piece.x+=piece.vx*dt;piece.y+=piece.vy*dt;piece.angle+=piece.spin*dt;
    piece.vx*=Math.max(0,1-.2*dt);piece.vy*=Math.max(0,1-.2*dt);
  }
  function draw(ctx,piece,time){
    const age=time-piece.born;if(age<0||age>=piece.ttl)return;
    const fade=age/piece.ttl;
    ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);
    ctx.globalAlpha=fade<.65?1:Math.max(0,(1-fade)/.35);
    if(!window.wreckageEffects?.draw(ctx,piece.texture,piece.w,piece.h,age))ctx.drawImage(piece.texture,-piece.w/2,-piece.h/2,piece.w,piece.h);
    ctx.restore();
  }
  window.showcaseStageFragments=Object.freeze({prepare,prepareAsync,emit,update,draw});
})();
