/* Durable mode-separated saves. Legacy data remains a recovery copy. */
(() => {
  'use strict';
  const legacyKey='broken-mirror-native-save',keys={normal:legacyKey+'-normal',dev:legacyKey+'-dev'};
  const queued=new Map();
  const seconds=()=>((window.performance?.now?.()??(typeof performance!=='undefined'?performance.now():Date.now()))/1000);
  const parse=text=>{try{const value=JSON.parse(text);return value&&typeof value==='object'?value:null;}catch{return null;}};
  const modeOf=s=>s.devMode?'dev':'normal';
  function write(state,storage){
    try{
      storage||=window.localStorage;
      const mode=modeOf(state),serialized=JSON.stringify({...state,saveSlotVersion:1});
      storage.setItem(keys[mode],serialized);
      if(storage.getItem(keys[mode])!==serialized)throw Error('Storage did not retain the save.');
      try{storage.setItem(legacyKey+'-mode',mode);}catch{}
      queued.delete(mode);
      return {ok:true,mode};
    }catch(error){return {ok:false,error:'Save failed: '+error.message};}
  }
  // Only redundant combat checkpoints are deferred. Purchases, travel commits,
  // explicit saves and mode changes keep the existing immediate verified write.
  function schedule(state,{delay=.25,maxWait=1,now=seconds()}={}){
    const mode=modeOf(state),previous=queued.get(mode),firstAt=previous?.state===state?previous.firstAt:now;
    delay=Math.max(0,Math.min(1,Number(delay)||.25));maxWait=Math.max(delay,Math.min(2,Number(maxWait)||1));
    queued.set(mode,{state,firstAt,dueAt:Math.min(now+delay,firstAt+maxWait),retryAt:previous?.state===state?previous.retryAt||0:0});
    return {ok:true,pending:true,mode};
  }
  function flush(state,{storage,now=seconds(),dueOnly=false}={}){
    const mode=modeOf(state),pending=queued.get(mode);
    if(!pending||pending.state!==state)return {ok:true,pending:false,mode};
    if(dueOnly&&now<Math.max(pending.dueAt,pending.retryAt||0))return {ok:true,pending:true,mode};
    const result=write(state,storage);
    // A denied write remains dirty, with a bounded retry rate and an honest
    // error returned to the same UI that reports immediate save failures.
    if(!result.ok)pending.retryAt=now+1;
    return {...result,pending:!result.ok};
  }
  const flushDue=(state,options={})=>flush(state,{...options,dueOnly:true});
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
  window.nativeSaveStorage=Object.freeze({write,read,keys,legacyKey,schedule,flush,flushDue,pending:state=>queued.has(modeOf(state))});
})();
