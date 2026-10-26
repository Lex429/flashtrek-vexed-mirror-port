/* Damage-state fragments used by the showcase and live ships. */
(() => {
  'use strict';
  // One cooperative queue covers every live ship, rather than allowing each
  // class to spend a separate frame budget. Pixel loops yield between bounded
  // chunks. Readback and uploads are also striped: putting a full-frame native
  // pixel operation inside a generator does not make that operation resumable.
  const queue=[],statistics={completed:0,failed:0,workMs:0,maxSliceMs:0,maxStepMs:0,slices:0,steps:0,peakPending:0,readbackFallbacks:0,optionalWorkerFallbacks:0},operations=new Map(),limits={sliceMs:2,maxPending:64,maxSteps:64,pixelChunk:4096};
  let scheduled=false,waiting=0,readback=null,suspended=false;
  const clock=()=>performance.now();
  const count=()=>queue.length+waiting;
  function schedule(){if(!suspended&&!scheduled&&queue.length){scheduled=true;setTimeout(pump,0);}}
  function resume(task,value,error=false){waiting--;task.value=value;task.error=error;queue.push(task);schedule();}
  function pump(){
    scheduled=false;if(suspended)return;const started=clock();let steps=0;
    do{
      // Current appearances can pass optional wreck/fragment work, while every
      // eighth step still serves the oldest task so background work progresses.
      const foreground=statistics.steps%8!==7?queue.findIndex(task=>task.priority>0):-1;
      const task=queue.splice(foreground<0?0:foreground,1)[0];if(!task)break;
      const stepStarted=clock();let operation=task.label;
      try{const result=task.error?task.iterator.throw(task.value):task.iterator.next(task.value);task.value=undefined;task.error=false;
        if(typeof result.value==='string')operation=result.value;
        if(result.done){statistics.completed++;task.resolve(result.value);}
        else if(result.value&&typeof result.value.then==='function'){waiting++;Promise.resolve(result.value).then(value=>resume(task,value),error=>resume(task,error,true));}
        else queue.push(task);
      }
      catch(error){statistics.failed++;task.reject(error);}
      const elapsed=clock()-stepStarted,row=operations.get(operation)||{steps:0,workMs:0,maxStepMs:0};row.steps++;row.workMs+=elapsed;row.maxStepMs=Math.max(row.maxStepMs,elapsed);operations.set(operation,row);
      statistics.steps++;statistics.maxStepMs=Math.max(statistics.maxStepMs,elapsed);
      steps++;
    }while(queue.length&&steps<limits.maxSteps&&clock()-started<limits.sliceMs);
    const elapsed=clock()-started;statistics.workMs+=elapsed;statistics.maxSliceMs=Math.max(statistics.maxSliceMs,elapsed);statistics.slices++;
    schedule();
  }
  function run(iterator,{priority=0,label='optional'}={}){
    if(count()>=limits.maxPending)return Promise.reject(Error('Optional damage-art preparation queue is full'));
    return new Promise((resolve,reject)=>{queue.push({iterator,resolve,reject,priority,label});statistics.peakPending=Math.max(statistics.peakPending,count());schedule();});
  }
  const finish=iterator=>{let result;do{result=iterator.next();}while(!result.done);return result.value;};
  function* readPixels(context,width,height){
    const image=context.createImageData(width,height),rows=Math.max(1,Math.floor(limits.pixelChunk/width));yield 'pixels:allocate';
    for(let y=0;y<height;y+=rows){const count=Math.min(rows,height-y),part=context.getImageData(0,y,width,count);image.data.set(part.data,y*width*4);yield 'pixels:read';}
    return image;
  }
  function* writePixels(context,image){
    const {width,height}=image,rows=Math.max(1,Math.floor(limits.pixelChunk/width));
    let part=context.createImageData(width,Math.min(rows,height));
    for(let y=0;y<height;y+=rows){const count=Math.min(rows,height-y);if(part.height!==count)part=context.createImageData(width,count);part.data.set(image.data.subarray(y*width*4,(y+count)*width*4));context.putImageData(part,0,y);yield 'pixels:upload';}
  }
  function readAsync(source){
    let promise;
    try{if(!readback&&window.createShipArtReadback)readback=window.createShipArtReadback({maxPending:8,maxPixels:1_048_576,maxBytes:16*1024*1024,timeoutMs:15000});
      promise=readback?readback.read(source):Promise.reject(Error('Asynchronous ship-art readback is unavailable'));
    }catch(error){promise=Promise.reject(error);}
    return Promise.resolve(promise).catch(error=>{statistics.readbackFallbacks++;throw error;});
  }
  function optional(operation,frames,config){
    if(window.__shipArtWorker||!window.createShipArtReadback)return null;
    try{if(!readback)readback=window.createShipArtReadback({maxPending:8,maxPixels:1_048_576,maxBytes:16*1024*1024,timeoutMs:15000});
      if(!readback.prepare||!readback.snapshot().available||readback.snapshot().preparationAvailable===false)return null;
      return run((function*(){for(;;){try{return yield readback.prepare(operation,frames,config);}catch(error){if(!error.capacity)throw error;yield new Promise(resolve=>setTimeout(resolve,24));}}})(),{label:'worker:'+operation})
        .catch(error=>{statistics.optionalWorkerFallbacks++;throw error;});
    }catch(error){statistics.optionalWorkerFallbacks++;return Promise.reject(error);}
  }
  const pixels=Object.freeze({read:readPixels,write:writePixels,readAsync});
  window.nativeDamageArtPreparation=Object.freeze({run,finish,pixels,optional,setPaused(value){suspended=!!value;if(!suspended)schedule();},snapshot:()=>({...statistics,suspended,pending:count(),queued:queue.length,waiting,limits:{...limits},readback:readback?.snapshot()||{initialized:false,pending:0},operations:Object.fromEntries([...operations].map(([name,row])=>[name,{...row}]))}),
    resetMetrics(){for(const field of Object.keys(statistics))statistics[field]=0;statistics.peakPending=count();operations.clear();readback?.resetMetrics?.();}});
  function* preparation(frames,anchors) {
    const w=frames[0].width,h=frames[0].height;
    function* read(image){
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);yield 'fragments:draw';
      return (yield* readPixels(ctx,w,h)).data;
    };
    const framePixels=[],fragments=[[],[],[],[]];
    for(const frame of frames)framePixels.push(yield* read(frame));
    for(let stage=1;stage<4;stage++){
      const groups=anchors.map(()=>[]),before=framePixels[stage-1],after=framePixels[stage],beforeWords=new Uint32Array(before.buffer,before.byteOffset,before.length/4);
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
        const ctx=texture.getContext('2d',{willReadFrequently:true}),cut=ctx.createImageData(fw,fh),cutWords=new Uint32Array(cut.data.buffer,cut.data.byteOffset,cut.data.length/4);
        for(let n=0;n<group.length;n++){const pixel=group[n];cutWords[(Math.floor(pixel/w)-y)*fw+pixel%w-x]=beforeWords[pixel];if((n&1023)===1023)yield;}
        yield* writePixels(ctx,cut);
        if(window.wreckageEffects)yield* window.wreckageEffects.prepare(texture,{seed:stage});
        fragments[stage].push({texture,x:(x+fw/2)/w-.5,y:(y+fh/2)/h-.5,w:fw/w,h:fh/h,pixels:group.length});
      }
    }
    return fragments;
  }
  const prepare=(frames,anchors)=>finish(preparation(frames,anchors));
  function adopt(fragments){for(const stage of fragments)for(const piece of stage)if(piece.material){window.wreckageEffects?.adopt?.(piece.texture,piece.material);delete piece.material;}return fragments;}
  const prepareAsync=(frames,anchors)=>{const worker=optional('fragments',frames,anchors);return worker?worker.then(adopt).catch(()=>run(preparation(frames,anchors),{label:'fragments'})):run(preparation(frames,anchors),{label:'fragments'});};
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
