/* One bounded worker owner for snapshots of already painted ship artwork. */
(() => {
  'use strict';
  const message=error=>String(error?.message||error||'Ship artwork readback failed').slice(0,512);
  const validSize=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&Number.isSafeInteger(width*height*12);
  function closeBitmaps(value,seen=new Set()){
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
    if(typeof value.close==='function'&&validSize(value.width,value.height)){try{value.close();}catch{}return;}
    for(const item of Object.values(value))closeBitmaps(item,seen);
  }
  function plainData(value,depth=0,budget={nodes:0}){
    if(++budget.nodes>10000||depth>12)throw Error('Artwork configuration exceeds its metadata limit');
    if(value==null||typeof value==='boolean'||typeof value==='string')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value))return value.map(item=>plainData(item,depth+1,budget));
    if(typeof value==='object'&&(Object.getPrototypeOf(value)?.constructor?.name==='Object'||Object.getPrototypeOf(value)===null)){
      const copy={};for(const [key,item] of Object.entries(value))copy[key]=plainData(item,depth+1,budget);return copy;
    }
    throw Object.assign(Error('Artwork configuration contains a non-transferable value'),{name:'NotSupportedError'});
  }
  if(typeof window==='undefined'){
    let imported=false;
    async function prepareRequest(request){
      const frames=request.frames||[],started=performance.now(),transfers=[];let packed=null;
      try{
        if(typeof OffscreenCanvas!=='function'||typeof OffscreenCanvas.prototype.transferToImageBitmap!=='function'||typeof importScripts!=='function')throw Object.assign(Error('Optional artwork worker capabilities are unavailable'),{optionalFatal:true});
        if(!Number.isSafeInteger(request.id)||request.id<1||!['fragments','wreck'].includes(request.operation)||frames.length!==4||
          !Number.isSafeInteger(request.maxPixels)||request.maxPixels>1_048_576||!Number.isSafeInteger(request.maxOutputBytes)||request.maxOutputBytes>64*1024*1024||!Number.isSafeInteger(request.maxOutputs)||request.maxOutputs>1024)throw Error('Invalid optional artwork request');
        let inputPixels=0;for(const frame of frames){if(!validSize(frame?.width,frame?.height)||frame.width!==frames[0].width||frame.height!==frames[0].height)throw Error('Invalid optional aligned artwork frame');inputPixels+=frame.width*frame.height;}
        if(inputPixels>request.maxPixels||request.maxOutputBytes<1||request.maxOutputs<1)throw Error('Optional artwork request exceeds its bound');
        const config=plainData(request.config);
        if(!imported){
          self.window=self;self.__shipArtWorker=true;
          self.document={createElement:()=>new OffscreenCanvas(1,1)};
          importScripts('wreckage-effects.js?v=fleet-foundation-1','cthia-destruction.js?v=visual-random-1','showcase-stage-fragments.js?v=fleet-foundation-1');imported=true;
        }
        let data;
        if(request.operation==='wreck'){const owner=self.createShipDestruction();await owner.prepareAsync(frames,config);data=owner.serialized();for(const stage of data)for(const piece of stage.pieces)piece.material=self.wreckageEffects.get(piece.texture);}
        else{data=await self.showcaseStageFragments.prepareAsync(frames,config);for(const stage of data)for(const piece of stage)piece.material=self.wreckageEffects.get(piece.texture);}
        const seen=new Map(),metrics={bytes:0,nodes:0};
        function* transfer(value){
          if(!value||typeof value!=='object')return value;
          if(seen.has(value))return seen.get(value);
          if(++metrics.nodes>100000)throw Error('Optional artwork output metadata exceeds its bound');
          if(value instanceof OffscreenCanvas){
            metrics.bytes+=value.width*value.height*4;
            if(metrics.bytes>request.maxOutputBytes||transfers.length>=request.maxOutputs)throw Error('Optional artwork output exceeds its memory bound');
            const bitmap=value.transferToImageBitmap();seen.set(value,bitmap);transfers.push(bitmap);value.width=value.height=0;yield 'worker:bitmap';return bitmap;
          }
          const result=Array.isArray(value)?[]:{};seen.set(value,result);
          for(const [key,item] of Object.entries(value)){result[key]=yield* transfer(item);if((metrics.nodes&63)===0)yield 'worker:metadata';}return result;
        }
        packed=await self.nativeDamageArtPreparation.run(transfer(data),{label:'worker:pack'});
        self.postMessage({id:request.id,kind:'prepare',ok:true,data:packed,bytes:metrics.bytes,outputs:transfers.length,
          workMs:performance.now()-started,preparation:self.nativeDamageArtPreparation.snapshot()},transfers);
      }catch(error){closeBitmaps(transfers);
        self.postMessage({id:request.id,kind:'prepare',ok:false,optionalFatal:error?.optionalFatal===true,error:message(error),workMs:performance.now()-started});
      }finally{for(const frame of frames)try{frame?.close?.();}catch{}}
    }
    self.onmessage=event=>{
      const request=event.data||{},bitmap=request.bitmap,started=performance.now();let canvas=null;
      if(request.kind==='prepare'){void prepareRequest(request);return;}
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
    const limits={maxPending:integer('maxPending',8),maxPixels:integer('maxPixels',1_048_576),maxBytes:integer('maxBytes',16*1024*1024),timeoutMs:integer('timeoutMs',15000),
      maxPreparationPixels:integer('maxPreparationPixels',1_048_576),maxPreparationBytes:integer('maxPreparationBytes',96*1024*1024),maxPreparationOutputs:integer('maxPreparationOutputs',1024),prepareTimeoutMs:integer('prepareTimeoutMs',60000)};
    if(limits.maxPreparationPixels>1_048_576||limits.maxPreparationBytes>96*1024*1024||limits.maxPreparationOutputs>1024)throw RangeError('Optional artwork limits exceed the shared hard bound');
    if(limits.timeoutMs>2_147_483_647||limits.prepareTimeoutMs>2_147_483_647)throw RangeError('Artwork readback timeout exceeds the browser timer limit');
    const clock=()=>performance.now(),jobs=new Map(),errors=[];
    let worker=null,nextId=0,pending=0,bytesInFlight=0,readBytesInFlight=0,preparationBytesInFlight=0,peakBytes=0,disposed=false,disabledReason='',optionalDisabledReason='',lastPreparation=null;
    let counters={requests:0,completed:0,failed:0,workMs:0,maxWorkMs:0,waitMs:0,maxWaitMs:0,prepareRequests:0,prepareCompleted:0,prepareWallMs:0,maxPrepareWallMs:0};
    const capability=typeof Worker==='function'&&typeof OffscreenCanvas==='function'&&typeof createImageBitmap==='function'&&Boolean(scriptUrl);
    const note=error=>{const text=message(error);errors.push(text);if(errors.length>6)errors.shift();return text;};
    if(!capability)disabledReason=note('Ship artwork worker, OffscreenCanvas, bitmap snapshots or script URL unavailable');
    const errorFor=(name,text)=>Object.assign(new Error(text),{name});
    function release(job){
      if(!job.reserved)return;
      job.reserved=false;bytesInFlight-=job.bytes;if(job.kind==='prepare')preparationBytesInFlight-=job.bytes;else readBytesInFlight-=job.bytes;jobs.delete(job.id);
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
      if(!job||job.settled||job.phase!=='worker'){closeBitmaps(data);stop('Unexpected ship artwork worker response');return;}
      if(!Number.isFinite(data.workMs)||data.workMs<0){closeBitmaps(data);stop('Invalid ship artwork worker timing');return;}
      if(job.kind!=='prepare'){counters.workMs+=data.workMs;counters.maxWorkMs=Math.max(counters.maxWorkMs,data.workMs);}
      if(data.ok!==true){
        closeBitmaps(data);
        const text=note(data.error||'Worker artwork readback failed');
        if(job.kind==='prepare'&&data.optionalFatal)optionalDisabledReason=text;
        if(data.fatal)stop(text);else settle(job,errorFor('Error',text));
        return;
      }
      if(job.kind==='prepare'){
        const seen=new Set(),totals={nodes:0,bytes:0,outputs:0};
        function validate(value,depth=0){
          if(++totals.nodes>25000||depth>24)throw Error('Optional artwork response metadata exceeds its bound');
          if(value==null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
          if(typeof value!=='object')throw Error('Invalid optional artwork response metadata');if(seen.has(value))return;seen.add(value);
          if(typeof value.close==='function'&&validSize(value.width,value.height)){totals.bytes+=value.width*value.height*4;totals.outputs++;}
          else if(Array.isArray(value)||Object.getPrototypeOf(value)?.constructor?.name==='Object'||Object.getPrototypeOf(value)===null){for(const item of Object.values(value))validate(item,depth+1);}
          else throw Error('Invalid optional artwork response value');
          if(totals.bytes>job.maxOutputBytes||totals.outputs>limits.maxPreparationOutputs)throw Error('Optional artwork response exceeds its memory bound');
        }
        try{
          validate(data.data);if(data.kind!=='prepare'||totals.bytes!==data.bytes||totals.outputs!==data.outputs)throw Error('Optional artwork response accounting does not match');
          if(!Array.isArray(data.data)||data.data.length!==4||data.data.some(stage=>!Array.isArray(job.operation==='fragments'?stage:stage?.pieces)))throw Error('Optional artwork response has invalid stages');
        }
        catch(error){closeBitmaps(data);stop(message(error));return;}
        counters.prepareCompleted++;counters.prepareWallMs+=data.workMs;counters.maxPrepareWallMs=Math.max(counters.maxPrepareWallMs,data.workMs);
        lastPreparation=data.preparation?{workMs:data.preparation.workMs,maxStepMs:data.preparation.maxStepMs,maxSliceMs:data.preparation.maxSliceMs,steps:data.preparation.steps}:null;
        settle(job,null,data.data);return;
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
      if(pending>=limits.maxPending||readBytesInFlight+bytes>limits.maxBytes)return rejected(errorFor('RangeError','Artwork readback staging capacity is full'));
      const job={id:++nextId,width,height,bytes,reserved:true,settled:false,phase:'reserved',started:clock(),timer:null};
      const promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
      jobs.set(job.id,job);pending++;bytesInFlight+=bytes;readBytesInFlight+=bytes;peakBytes=Math.max(peakBytes,bytesInFlight);
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
    function prepare(operation,frames,config){
      counters.requests++;counters.prepareRequests++;
      if(disposed||disabledReason)return rejected(errorFor(disposed?'AbortError':'NotSupportedError',disabledReason||'Artwork readback owner was disposed'));
      if(optionalDisabledReason)return rejected(errorFor('NotSupportedError',optionalDisabledReason));
      let plain;try{plain=plainData(config);}catch(error){return rejected(error);}
      if(!['fragments','wreck'].includes(operation)||!Array.isArray(frames)||frames.length!==4)return rejected(errorFor('RangeError','Optional artwork needs exactly four aligned frames'));
      let inputPixels=0;for(const frame of frames){if(!validSize(frame?.width,frame?.height)||frame.width!==frames[0].width||frame.height!==frames[0].height)return rejected(errorFor('RangeError','Invalid optional aligned artwork frame'));inputPixels+=frame.width*frame.height;}
      const bytes=inputPixels*96;
      if(inputPixels>limits.maxPreparationPixels||!Number.isSafeInteger(bytes)||bytes>limits.maxPreparationBytes)return rejected(errorFor('RangeError','Optional artwork exceeds its configured staging limit'));
      if(pending>=limits.maxPending||preparationBytesInFlight+bytes>limits.maxPreparationBytes)return Promise.reject(Object.assign(errorFor('RangeError','Optional artwork staging capacity is full'),{capacity:true}));
      const job={id:++nextId,kind:'prepare',operation,bytes,maxOutputBytes:Math.floor(bytes*2/3),reserved:true,settled:false,phase:'reserved',started:clock(),timer:null};
      const promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});jobs.set(job.id,job);pending++;bytesInFlight+=bytes;preparationBytesInFlight+=bytes;peakBytes=Math.max(peakBytes,bytesInFlight);
      job.timer=setTimeout(()=>stop('Optional ship artwork preparation timed out','TimeoutError'),limits.prepareTimeoutMs);
      try{
        ensureWorker();job.phase='snapshot';
        void (async()=>{
          const bitmaps=[];
          try{
            for(const frame of frames){
              const bitmap=await createImageBitmap(frame);bitmaps.push(bitmap);
              if(job.settled){closeBitmaps(bitmaps);release(job);return;}
              if(bitmap.width!==frame.width||bitmap.height!==frame.height)throw Error('Optional artwork bitmap changed dimensions');
              await new Promise(resolve=>setTimeout(resolve,0));
            }
            if(job.settled){closeBitmaps(bitmaps);release(job);return;}
            job.phase='worker';worker.postMessage({id:job.id,kind:'prepare',operation,frames:bitmaps,config:plain,maxPixels:limits.maxPreparationPixels,maxOutputBytes:job.maxOutputBytes,maxOutputs:limits.maxPreparationOutputs},bitmaps);
          }catch(error){closeBitmaps(bitmaps);if(!job.settled){job.phase='reserved';settle(job,errorFor('Error',note(error)));}release(job);}
        })();
      }catch(error){job.phase='reserved';stop('Optional artwork worker could not start: '+message(error));}
      return promise;
    }
    function snapshot(){return {...counters,pending,bytesInFlight,readBytesInFlight,preparationBytesInFlight,peakBytes,preparation:lastPreparation,available:!disposed&&!disabledReason,preparationAvailable:!disposed&&!disabledReason&&!optionalDisabledReason,errors:errors.slice(),limits:{...limits}};}
    function resetMetrics(){
      counters={requests:pending,completed:0,failed:0,workMs:0,maxWorkMs:0,waitMs:0,maxWaitMs:0,prepareRequests:0,prepareCompleted:0,prepareWallMs:0,maxPrepareWallMs:0};peakBytes=bytesInFlight;lastPreparation=null;
      errors.length=0;if(disabledReason)errors.push(disabledReason);
    }
    function dispose(){if(disposed)return;disposed=true;stop('Artwork readback owner was disposed','AbortError');}
    return Object.freeze({read,prepare,snapshot,resetMetrics,dispose});
  };
})();
