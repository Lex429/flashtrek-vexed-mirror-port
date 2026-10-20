/* One bounded worker owner for snapshots of already painted ship artwork. */
(() => {
  'use strict';
  const message=error=>String(error?.message||error||'Ship artwork readback failed').slice(0,512);
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&Number.isSafeInteger(width*height*12);
  if(typeof window==='undefined'){
    self.onmessage=event=>{
      const request=event.data||{},bitmap=request.bitmap,started=performance.now();let canvas=null;
      try{
        const {id,width,height,maxPixels,maxBytes}=request;
        if(!Number.isSafeInteger(id)||id<1||!validSize(width,height)||!Number.isSafeInteger(maxPixels)||!Number.isSafeInteger(maxBytes)||
          width*height>maxPixels||width*height*12>maxBytes||bitmap?.width!==width||bitmap?.height!==height)throw Error('Invalid ship artwork readback request');
        if(typeof OffscreenCanvas!=='function'){
          self.postMessage({id,ok:false,fatal:true,error:'Worker OffscreenCanvas is unavailable',workMs:performance.now()-started});return;
        }
        canvas=new OffscreenCanvas(width,height);
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)throw Object.assign(Error('Worker artwork canvas context is unavailable'),{fatal:true});
        context.drawImage(bitmap,0,0);
        const image=context.getImageData(0,0,width,height),buffer=image.data.buffer;
        if(image.data.byteOffset!==0||image.data.byteLength!==width*height*4||buffer.byteLength!==width*height*4)throw Error('Invalid worker artwork pixel buffer');
        self.postMessage({id,ok:true,width,height,buffer,workMs:performance.now()-started},[buffer]);
      }catch(error){
        self.postMessage({id:request.id,ok:false,fatal:error?.fatal===true,error:message(error),workMs:performance.now()-started});
      }finally{
        try{bitmap?.close?.();}catch{}
        if(canvas){canvas.width=0;canvas.height=0;}
      }
    };
    return;
  }
  // Capture this before a later queue task runs outside script evaluation.
  const scriptUrl=document.currentScript?.src||'';
  window.createShipArtReadback=(options={})=>{
    const integer=(name,fallback)=>{
      const value=options[name]??fallback;
      if(!Number.isSafeInteger(value)||value<1)throw RangeError('Invalid artwork readback '+name);
      return value;
    };
    const limits={maxPending:integer('maxPending',8),maxPixels:integer('maxPixels',1_048_576),maxBytes:integer('maxBytes',16*1024*1024),timeoutMs:integer('timeoutMs',15000)};
    if(limits.timeoutMs>2_147_483_647)throw RangeError('Artwork readback timeout exceeds the browser timer limit');
    const clock=()=>performance.now(),jobs=new Map(),errors=[];
    let worker=null,nextId=0,pending=0,bytesInFlight=0,peakBytes=0,disposed=false,disabledReason='';
    let counters={requests:0,completed:0,failed:0,workMs:0,maxWorkMs:0,waitMs:0,maxWaitMs:0};
    const capability=typeof Worker==='function'&&typeof OffscreenCanvas==='function'&&typeof createImageBitmap==='function'&&Boolean(scriptUrl);
    const note=error=>{const text=message(error);errors.push(text);if(errors.length>6)errors.shift();return text;};
    if(!capability)disabledReason=note('Ship artwork worker, OffscreenCanvas, bitmap snapshots or script URL unavailable');
    const errorFor=(name,text)=>Object.assign(new Error(text),{name});
    function release(job){
      if(!job.reserved)return;
      job.reserved=false;bytesInFlight-=job.bytes;jobs.delete(job.id);
    }
    function settle(job,error,value){
      if(job.settled)return;
      job.settled=true;pending--;clearTimeout(job.timer);
      const waited=Math.max(0,clock()-job.started);counters.waitMs+=waited;counters.maxWaitMs=Math.max(counters.maxWaitMs,waited);
      if(error){counters.failed++;job.reject(error);}else{counters.completed++;job.resolve(value);}
      // Native bitmap creation cannot be cancelled. Keep that reservation until
      // it settles, and close a late bitmap before releasing its staging bytes.
      if(job.phase!=='snapshot')release(job);
    }
    function stop(reason,name='Error'){
      if(!disabledReason)disabledReason=note(reason);
      if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;try{worker.terminate();}catch(error){note(error);}worker=null;}
      for(const job of jobs.values())settle(job,errorFor(name,disabledReason));
    }
    function receive(event){
      const data=event.data;
      const job=data&&jobs.get(data.id);
      if(!job||job.settled||job.phase!=='worker'){stop('Unexpected ship artwork worker response');return;}
      if(!Number.isFinite(data.workMs)||data.workMs<0){stop('Invalid ship artwork worker timing');return;}
      counters.workMs+=data.workMs;counters.maxWorkMs=Math.max(counters.maxWorkMs,data.workMs);
      if(data.ok!==true){
        const text=note(data.error||'Worker artwork readback failed');
        if(data.fatal)stop(text);else settle(job,errorFor('Error',text));
        return;
      }
      if(data.width!==job.width||data.height!==job.height||!(data.buffer instanceof ArrayBuffer)||data.buffer.byteLength!==job.width*job.height*4){
        stop('Invalid ship artwork worker response dimensions or pixel length');return;
      }
      settle(job,null,{width:data.width,height:data.height,data:new Uint8ClampedArray(data.buffer)});
    }
    function ensureWorker(){
      if(worker)return;
      worker=new Worker(scriptUrl);
      worker.onmessage=receive;
      worker.onerror=event=>{event.preventDefault?.();stop(event.message||'Ship artwork worker failed');};
      worker.onmessageerror=()=>stop('Ship artwork worker response could not be decoded');
    }
    function rejected(error){counters.failed++;note(error);return Promise.reject(error);}
    function read(canvas){
      counters.requests++;
      if(disposed||disabledReason)return rejected(errorFor(disposed?'AbortError':'NotSupportedError',disabledReason||'Artwork readback owner was disposed'));
      const width=canvas?.width,height=canvas?.height;
      if(!validSize(width,height)||width*height>limits.maxPixels)return rejected(errorFor('RangeError','Artwork readback dimensions exceed the configured pixel limit'));
      // Reserve bitmap, worker backing surface and returned RGBA staging space.
      const bytes=width*height*12;
      if(pending>=limits.maxPending||bytesInFlight+bytes>limits.maxBytes)return rejected(errorFor('RangeError','Artwork readback staging capacity is full'));
      const job={id:++nextId,width,height,bytes,reserved:true,settled:false,phase:'reserved',started:clock(),timer:null};
      const promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
      jobs.set(job.id,job);pending++;bytesInFlight+=bytes;peakBytes=Math.max(peakBytes,bytesInFlight);
      job.timer=setTimeout(()=>stop('Ship artwork readback timed out','TimeoutError'),limits.timeoutMs);
      try{
        ensureWorker();job.phase='snapshot';
        Promise.resolve(createImageBitmap(canvas)).then(bitmap=>{
          if(job.settled){try{bitmap?.close?.();}catch{}finally{release(job);}return;}
          job.phase='worker';
          try{
            if(bitmap?.width!==width||bitmap?.height!==height)throw Error('Artwork bitmap dimensions changed while preparing its snapshot');
            worker.postMessage({id:job.id,width,height,bitmap,maxPixels:limits.maxPixels,maxBytes:limits.maxBytes},[bitmap]);
          }catch(error){try{bitmap?.close?.();}catch{}stop('Artwork bitmap transfer failed: '+message(error));}
        },error=>{
          if(!job.settled){job.phase='reserved';settle(job,errorFor('Error',note(error)));}
          release(job);
        });
      }catch(error){
        job.phase='reserved';stop('Artwork worker or bitmap snapshot could not start: '+message(error));
      }
      return promise;
    }
    function snapshot(){return {...counters,pending,bytesInFlight,peakBytes,available:!disposed&&!disabledReason,errors:errors.slice(),limits:{...limits}};}
    function resetMetrics(){
      counters={requests:pending,completed:0,failed:0,workMs:0,maxWorkMs:0,waitMs:0,maxWaitMs:0};peakBytes=bytesInFlight;
      errors.length=0;if(disabledReason)errors.push(disabledReason);
    }
    function dispose(){if(disposed)return;disposed=true;stop('Artwork readback owner was disposed','AbortError');}
    return Object.freeze({read,snapshot,resetMetrics,dispose});
  };
})();
