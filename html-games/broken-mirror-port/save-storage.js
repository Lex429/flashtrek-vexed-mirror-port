/* Durable mode-separated saves. Legacy data remains a recovery copy. */
(() => {
  'use strict';
  const legacyKey='broken-mirror-native-save',keys={normal:legacyKey+'-normal',dev:legacyKey+'-dev'};
  const parse=text=>{try{const value=JSON.parse(text);return value&&typeof value==='object'?value:null;}catch{return null;}};
  const modeOf=s=>s.devMode?'dev':'normal';
  function write(state,storage){
    try{
      storage||=window.localStorage;
      const mode=modeOf(state),serialized=JSON.stringify({...state,saveSlotVersion:1});
      storage.setItem(keys[mode],serialized);
      if(storage.getItem(keys[mode])!==serialized)throw Error('Storage did not retain the save.');
      try{storage.setItem(legacyKey+'-mode',mode);}catch{}
      return {ok:true,mode};
    }catch(error){return {ok:false,error:'Save failed: '+error.message};}
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
  window.nativeSaveStorage=Object.freeze({write,read,keys,legacyKey});
})();
