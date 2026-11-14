/* Durable mode-separated saves. Legacy data remains a recovery copy. */
(() => {
  'use strict';
  const legacyKey='broken-mirror-native-save',keys={normal:legacyKey+'-normal',dev:legacyKey+'-dev'};
  const recoveryKeys={normal:keys.normal+'-reincarnation',dev:keys.dev+'-reincarnation'};
  // Whole-world rewind copies use IndexedDB's separate quota in browsers.
  // Keep ordinary Continue slots and their synchronous transaction contract.
  const recoveryCopies=new Map(),recoveryLoads=new Map(),recoveryWrites=new Map();
  let recoveryDatabase=null;
  const queued=new Map();
  const inFlight=new Map(),revisions=new Map(),completed=new Map();
  const durableWrites=new Map();
  const retired=new WeakSet();
  let worker=null,workerFailed=false,requestId=0;
  const checkpointMetrics={snapshots:0,maxSnapshotMs:0,maxSnapshotSliceMs:0,maxValidationMs:0,maxStorageMs:0};
  const script=typeof document!=='undefined'?document.currentScript?.src:null;
  const workerUrl=script?new URL('save-worker.js?v=stutter-3-warp-latency-1',script).href:'save-worker.js?v=stutter-3-warp-latency-1';
  let lastWrite=null;
  const milliseconds=()=>window.performance?.now?.()??globalThis.performance?.now?.()??Date.now();
  const seconds=()=>((window.performance?.now?.()??(typeof performance!=='undefined'?performance.now():Date.now()))/1000);
  const parse=text=>{try{const value=window.nativeSaveCodec?window.nativeSaveCodec.parse(text):JSON.parse(text);return value&&typeof value==='object'?value:null;}catch{return null;}};
  const modeOf=s=>s.devMode?'dev':'normal';
  const measure=(cost,key,operation)=>{const at=milliseconds();try{return operation();}finally{cost[key]+=milliseconds()-at;}};
  function capture(encoder,id,state,cost,valid=()=>true){
    if(window.nativeSaveSnapshot&&typeof setTimeout==='function'){
      cost.captureMode='incremental';cost.snapshotMs=0;
      const task=window.nativeSaveSnapshot.capture(state,{valid,
        part(rows){encoder.postMessage({id,action:'part',rowsText:JSON.stringify(rows)});cost.started=milliseconds();},
        complete(root,stats){
          cost.snapshotMs=stats.cpuMs;cost.maxSnapshotSliceMs=stats.maxSliceMs;cost.validationMs=stats.validationMs;cost.patchedRows=stats.patchedRows;
          checkpointMetrics.maxSnapshotMs=Math.max(checkpointMetrics.maxSnapshotMs,stats.cpuMs);checkpointMetrics.maxSnapshotSliceMs=Math.max(checkpointMetrics.maxSnapshotSliceMs,stats.maxSliceMs);checkpointMetrics.maxValidationMs=Math.max(checkpointMetrics.maxValidationMs,stats.validationMs);
          encoder.postMessage({id,action:'commit',root});cost.started=milliseconds();
        },
        failed(error){checkpointMetrics.lastCaptureError=error.message;if(!valid())return;try{encoder.postMessage({id,action:'discard'});const started=milliseconds();encoder.postMessage({id,text:JSON.stringify({...state,saveSlotVersion:3})});cost.snapshotMs=milliseconds()-started;cost.captureMode='json';}catch(error){encoder.onerror?.({preventDefault(){},message:error.message});}}
      });
      cost.cancelCapture=()=>{task.cancel();try{encoder.postMessage({id,action:'discard'});}catch{}};return;
    }
    const systems=window.nativeShipSystems,docking=window.nativePortDocking;
    if(systems?.saveCollection&&docking?.saveData){
      const input={...state,saveSlotVersion:3};
      if(state.civilianTraffic)input.civilianTraffic={...state.civilianTraffic,ships:systems.saveCollection(state.civilianTraffic,'ships')};
      if(state.solEconomy)input.solEconomy={...state.solEconomy,freighters:systems.saveCollection(state.solEconomy,'freighters')};
      if(state.portDocking)input.portDocking=docking.saveData(state);
      try{
        // postMessage clones the complete graph atomically before returning.
        // Only runtime observer wrappers are replaced; no live field is edited.
        encoder.postMessage({id,state:input});cost.captureMode='native';return;
      }catch(error){if(error.name!=='DataCloneError')throw error;}
    }
    // Unknown extension proxies retain ordinary JSON semantics and the same
    // failure/dirty-state handling. Never reuse an older encoded checkpoint.
    encoder.postMessage({id,text:JSON.stringify({...state,saveSlotVersion:3})});cost.captureMode='json';
  }
  function invalidate(mode){revisions.set(mode,(revisions.get(mode)||0)+1);inFlight.get(mode)?.cancelCapture?.();inFlight.delete(mode);completed.delete(mode);}
  // Death retires this live graph without replacing its last playable save.
  // Restoring creates a new graph; normal/Dev storage and schemas stay intact.
  function retire(state){
    if(!state||retired.has(state))return;
    retired.add(state);const mode=modeOf(state);invalidate(mode);queued.delete(mode);
  }
  function persist(mode,serialized,storage,cost){
    cost.characters=serialized.length;
    measure(cost,'storageMs',()=>storage.setItem(keys[mode],serialized));
    if(measure(cost,'verificationMs',()=>storage.getItem(keys[mode]))!==serialized)throw Error('Storage did not retain the save.');
    try{measure(cost,'storageMs',()=>storage.setItem(legacyKey+'-mode',mode));}catch{}
    cost.ok=true;
  }
  function openRecoveryDatabase(){
    if(!recoveryDatabase)recoveryDatabase=new Promise((resolve,reject)=>{
      const request=window.indexedDB.open('vexed-mirror-reincarnation',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('Cannot open checkpoint storage.'));
      request.onblocked=()=>reject(Error('Checkpoint storage is blocked.'));
    });
    return recoveryDatabase;
  }
  async function recoveryTransaction(mode,serialized){
    const database=await openRecoveryDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=database.transaction('snapshots',serialized===undefined?'readonly':'readwrite'),store=transaction.objectStore('snapshots');
      if(serialized!==undefined)store.put(serialized,mode);
      const read=store.get(mode);let result;
      read.onsuccess=()=>{result=read.result;if(serialized!==undefined&&result!==serialized)transaction.abort();};
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('Checkpoint verification failed.'));
    });
  }
  function recoveryError(error){
    const message='Safe checkpoint failed: '+error.message;
    checkpointMetrics.reincarnationError=message;
    if(typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('native-reincarnation-saveerror',{detail:{error:message}}));
  }
  function loadReincarnation(mode){
    if(!window.indexedDB||recoveryLoads.has(mode))return recoveryLoads.get(mode);
    const operation=(async()=>{
      try{
        const legacy=window.localStorage.getItem(recoveryKeys[mode]);
        if(legacy&&!recoveryCopies.has(mode))recoveryCopies.set(mode,legacy);
        const serialized=await recoveryTransaction(mode);
        if((!recoveryCopies.has(mode)||recoveryCopies.get(mode)===legacy)&&typeof serialized==='string')recoveryCopies.set(mode,serialized);
        // Migrate the first local-only version after a verified database write.
        if(legacy&&serialized===undefined&&recoveryCopies.get(mode)===legacy){
          await recoveryTransaction(mode,legacy);
        }
        if(legacy&&(typeof serialized==='string'||recoveryCopies.get(mode)===legacy)&&window.localStorage.getItem(recoveryKeys[mode])===legacy)window.localStorage.removeItem(recoveryKeys[mode]);
      }catch(error){recoveryError(error);}
    })();
    recoveryLoads.set(mode,operation);return operation;
  }
  function persistReincarnation(mode,serialized){
    const loaded=loadReincarnation(mode),previous=recoveryWrites.get(mode);
    recoveryCopies.set(mode,serialized);
    const operation=Promise.resolve(previous||loaded).then(()=>recoveryTransaction(mode,serialized)).then(()=>{
      try{window.localStorage.removeItem(recoveryKeys[mode]);}catch{}
    }).catch(recoveryError);
    recoveryWrites.set(mode,operation);
    operation.finally(()=>{if(recoveryWrites.get(mode)===operation)recoveryWrites.delete(mode);});
  }
  function reincarnationReady(state){
    const mode=modeOf(state);return Promise.all([loadReincarnation(mode),recoveryWrites.get(mode)]);
  }
  function reincarnationPending(state){
    const mode=modeOf(state);return !!recoveryWrites.get(mode)||!!recoveryLoads.get(mode)&&!recoveryCopies.has(mode)&&!recoveryLoaded.has(mode);
  }
  const recoveryLoaded=new Set();
  function rememberReincarnation(state,serialized,token,storage,cost){
    if(retired.has(state)||!window.nativeReincarnation?.valid(state,token))return;
    try{
      const mode=modeOf(state),key=recoveryKeys[mode];
      if(window.indexedDB&&storage===window.localStorage){persistReincarnation(mode,serialized);cost.reincarnationPending=true;}
      else{
        measure(cost,'storageMs',()=>storage.setItem(key,serialized));
        if(measure(cost,'verificationMs',()=>storage.getItem(key))!==serialized)throw Error('Storage did not retain the safe checkpoint.');
      }
      window.nativeReincarnation.remembered(state,token);
    }catch(error){cost.reincarnationError='Safe checkpoint failed: '+error.message;}
  }
  function checkpointReincarnation(state,options={}){
    if(retired.has(state))return {ok:false,error:'This ship was destroyed.'};
    const token=window.nativeReincarnation?.candidate(state,options);
    if(!token)return {ok:true,checkpoint:false};
    const cost={serializationMs:0,storageMs:0,verificationMs:0};
    try{
      const serialized=measure(cost,'serializationMs',()=>window.nativeSaveCodec?.stringify(state)??JSON.stringify({...state,saveSlotVersion:1}));
      rememberReincarnation(state,serialized,token,options.storage||window.localStorage,cost);
      return cost.reincarnationError?{ok:false,error:cost.reincarnationError}:{ok:true,checkpoint:true};
    }catch(error){return {ok:false,error:'Safe checkpoint failed: '+error.message};}
  }
  function readReincarnation(state,storage){
    try{
      const mode=modeOf(state),value=parse(!storage&&recoveryCopies.has(mode)?recoveryCopies.get(mode):(storage||window.localStorage).getItem(recoveryKeys[mode]));
      return value&&modeOf(value)===mode&&value.reincarnation?.version===1&&value.reincarnation.id===state.reincarnation?.id?value:null;
    }catch{return null;}
  }
  function write(state,storage){
    if(retired.has(state))return {ok:false,error:'This ship was destroyed. Restore your last saved point.'};
    const started=milliseconds(),cost={serializationMs:0,storageMs:0,verificationMs:0,characters:0,ok:false};
    try{
      storage||=window.localStorage;
      const mode=modeOf(state),recovery=window.nativeReincarnation?.candidate(state);invalidate(mode);
      const serialized=measure(cost,'serializationMs',()=>window.nativeSaveCodec?.stringify(state)??JSON.stringify({...state,saveSlotVersion:1}));
      persist(mode,serialized,storage,cost);
      rememberReincarnation(state,serialized,recovery,storage,cost);
      queued.delete(mode);
      return {ok:true,mode,...(cost.reincarnationError?{reincarnationError:cost.reincarnationError}:{})};
    }catch(error){cost.error=error.message;return {ok:false,error:'Save failed: '+error.message};}
    finally{cost.totalMs=milliseconds()-started;lastWrite=cost;}
  }
  // Explicit durable transactions await encoding AND verified storage. They
  // are never queued checkpoints and cannot overwrite a newer explicit save.
  async function writeAsync(state,{signal,storage}={}){
    if(retired.has(state))return {ok:false,error:'This ship was destroyed. Restore your last saved point.'};
    if(signal?.aborted)return {ok:false,error:'Save cancelled.'};
    if(!window.Worker||!window.nativeSaveCodec||storage)return write(state,storage);
    const mode=modeOf(state),recovery=window.nativeReincarnation?.candidate(state),started=milliseconds();invalidate(mode);
    const revision=revisions.get(mode),cost={serializationMs:0,snapshotMs:0,storageMs:0,verificationMs:0,characters:0,ok:false,worker:true};
    durableWrites.set(mode,revision);
    return new Promise(resolve=>{
      let encoder,timer,settled=false;
      const finish=result=>{if(settled)return;settled=true;cost.cancelCapture?.();delete cost.cancelCapture;clearTimeout(timer);signal?.removeEventListener('abort',abort);encoder?.terminate();if(durableWrites.get(mode)===revision)durableWrites.delete(mode);cost.totalMs=milliseconds()-started;lastWrite=cost;resolve(result);};
      const abort=()=>finish({ok:false,error:'Save cancelled.'});
      if(signal?.aborted){abort();return;}
      try{
        encoder=new window.Worker(workerUrl);signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>finish({ok:false,error:'Save encoding timed out.'}),30000);
        encoder.onerror=event=>{event.preventDefault?.();finish({ok:false,error:'Save failed: '+event.message});};
        encoder.onmessage=event=>{
          if(signal?.aborted||revisions.get(mode)!==revision){finish({ok:false,error:'Save superseded by a newer command.'});return;}
          const message=event.data;cost.serializationMs=message.serializationMs||0;
          if(message.error||typeof message.serialized!=='string'){finish({ok:false,error:'Save failed: '+(message.error||'Invalid encoded save.')});return;}
          try{persist(mode,message.serialized,window.localStorage,cost);rememberReincarnation(state,message.serialized,recovery,window.localStorage,cost);queued.delete(mode);finish({ok:true,mode,...(cost.reincarnationError?{reincarnationError:cost.reincarnationError}:{})});}
          catch(error){cost.error=error.message;finish({ok:false,error:'Save failed: '+error.message});}
        };
        const capturedAt=milliseconds();capture(encoder,1,state,cost,()=>!settled&&!signal?.aborted&&revisions.get(mode)===revision);if(cost.captureMode!=='incremental')cost.snapshotMs=milliseconds()-capturedAt;
      }catch(error){cost.error=error.message;finish({ok:false,error:'Save failed: '+error.message});}
    });
  }
  // Only redundant periodic/combat checkpoints are deferred. Purchases, travel commits,
  // explicit saves and mode changes keep the existing immediate verified write.
  function schedule(state,{delay=.25,maxWait=1,now=seconds()}={}){
    if(retired.has(state))return {ok:true,pending:false,retired:true,mode:modeOf(state)};
    const mode=modeOf(state),previous=queued.get(mode),firstAt=previous?.state===state?previous.firstAt:now;
    if(previous&&previous.state!==state)invalidate(mode);
    delay=Math.max(0,Math.min(1,Number(delay)||.25));maxWait=Math.max(delay,Math.min(2,Number(maxWait)||1));
    queued.set(mode,{state,firstAt,dueAt:Math.min(now+delay,firstAt+maxWait),retryAt:previous?.state===state?previous.retryAt||0:0});
    return {ok:true,pending:true,mode};
  }
  function stopWorker(){workerFailed=true;for(const item of inFlight.values())item.cancelCapture?.();worker?.terminate();worker=null;inFlight.clear();}
  function startCheckpoint(state,mode,pending,prepareOnly=false){
    if(workerFailed||!window.Worker||!window.nativeSaveCodec||(state.civilianTraffic?.ships?.length||0)+(state.solEconomy?.freighters?.length||0)<512)return false;
    try{
      if(!worker){
        worker=new window.Worker(workerUrl);
        worker.onerror=event=>{checkpointMetrics.workerError=event.message;event.preventDefault?.();stopWorker();};
        worker.onmessage=event=>{
          const message=event.data,flight=[...inFlight.values()].find(item=>item.id===message.id);
          if(!flight)return;
          const current=queued.get(flight.mode);
          inFlight.delete(flight.mode);
          if(revisions.get(flight.mode)!==flight.revision||current?.state!==flight.state)return;
          if(message.error||typeof message.serialized!=='string'){checkpointMetrics.workerError=message.error||'Invalid encoded checkpoint';stopWorker();return;}
          const cost={serializationMs:message.serializationMs||0,snapshotMs:flight.snapshotMs,captureMode:flight.captureMode,maxSnapshotSliceMs:flight.maxSnapshotSliceMs,validationMs:flight.validationMs,patchedRows:flight.patchedRows,storageMs:0,verificationMs:0,characters:0,ok:false,worker:true};
          let result;
          try{persist(flight.mode,message.serialized,window.localStorage,cost);rememberReincarnation(flight.state,message.serialized,flight.recovery,window.localStorage,cost);if(current===flight.pending)queued.delete(flight.mode);result={ok:true,mode:flight.mode,...(cost.reincarnationError?{reincarnationError:cost.reincarnationError}:{})};}
          catch(error){cost.error=error.message;current.retryAt=seconds()+1;result={ok:false,error:'Save failed: '+error.message,mode:flight.mode};}
          cost.totalMs=cost.serializationMs+cost.snapshotMs+cost.storageMs+cost.verificationMs;lastWrite=cost;
          checkpointMetrics.maxStorageMs=Math.max(checkpointMetrics.maxStorageMs,cost.storageMs+cost.verificationMs);
          completed.set(flight.mode,{state:flight.state,result:{...result,pending:queued.has(flight.mode)}});
        };
      }
      if(prepareOnly)return true;
      const started=milliseconds(),flight={id:++requestId,state,mode,pending,revision:revisions.get(mode),recovery:window.nativeReincarnation?.candidate(state),started,snapshotMs:0};
      inFlight.set(mode,flight);
      capture(worker,flight.id,state,flight,()=>inFlight.get(mode)===flight&&revisions.get(mode)===flight.revision&&queued.get(mode)?.state===state);
      if(flight.captureMode!=='incremental'){flight.snapshotMs=milliseconds()-started;checkpointMetrics.maxSnapshotMs=Math.max(checkpointMetrics.maxSnapshotMs,flight.snapshotMs);}checkpointMetrics.snapshots++;return true;
    }catch{stopWorker();return false;}
  }
  function flush(state,{storage,now=seconds(),dueOnly=false}={}){
    if(retired.has(state))return {ok:true,pending:false,retired:true,mode:modeOf(state)};
    const mode=modeOf(state),pending=queued.get(mode);
    if(dueOnly&&durableWrites.has(mode))return {ok:true,pending:true,mode};
    const result=completed.get(mode);
    if(dueOnly&&result?.state===state){completed.delete(mode);return result.result;}
    if(!pending||pending.state!==state)return {ok:true,pending:false,mode};
    if(dueOnly&&now<Math.max(pending.dueAt,pending.retryAt||0))return {ok:true,pending:true,mode};
    const flight=inFlight.get(mode);
    if(dueOnly&&!storage){
      if(flight&&milliseconds()-flight.started<(flight.captureMode==='incremental'?10000:2000))return {ok:true,pending:true,mode};
      if(!flight&&startCheckpoint(state,mode,pending))return {ok:true,pending:true,mode};
    }
    const written=write(state,storage);
    // A denied write remains dirty, with a bounded retry rate and an honest
    // error returned to the same UI that reports immediate save failures.
    if(!written.ok)pending.retryAt=now+1;
    return {...written,pending:!written.ok};
  }
  const flushDue=(state,options={})=>flush(state,{...options,dueOnly:true});
  function prepare(state){
    if(retired.has(state))return false;
    loadReincarnation(modeOf(state));
    const mode=modeOf(state),pending=queued.get(mode),flight=inFlight.get(mode);
    if(pending&&pending.state!==state||flight&&flight.state!==state){invalidate(mode);queued.delete(mode);}
    return startCheckpoint(state,mode,null,true);
  }
  function read(mode,storage){
    try{
      storage||=window.localStorage;
      const legacy=parse(storage.getItem(legacyKey));
      mode||=storage.getItem(legacyKey+'-mode')||(legacy?modeOf(legacy):'normal');
      if(!keys[mode])return null;
      const saved=parse(storage.getItem(keys[mode]));
      if(saved&&modeOf(saved)===mode)return saved;
      if(legacy&&modeOf(legacy)===mode){write(legacy,storage);return legacy;}
      return null;
    }catch{return null;}
  }
  for(const mode of ['normal','dev'])loadReincarnation(mode)?.finally(()=>recoveryLoaded.add(mode));
  window.nativeSaveStorage=Object.freeze({write,writeAsync,read,keys,legacyKey,recoveryKeys,checkpointReincarnation,readReincarnation,reincarnationReady,reincarnationPending,schedule,flush,flushDue,prepare,retire,pending:state=>queued.has(modeOf(state)),metrics:()=>lastWrite?{...lastWrite,checkpoints:{...checkpointMetrics}}:null});
})();
