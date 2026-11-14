/* Optional isolation for the local storm-development site. Fleet saves and
 * analytical jobs remain owned by their existing systems. */
(() => {
  'use strict';
  const address=window.location||globalThis.location;
  const local=!!address&&['127.0.0.1','localhost','[::1]'].includes(address.hostname)&&address.port==='7790';
  const isolate=new URLSearchParams(address?.search||'').get('devTraffic')==='off';
  const active=state=>local&&isolate&&!!state?.devMode;
  const allowsCategory=(state,category)=>!active(state)||!['civilian','tug'].includes(category);
  function excludes(state,target,category=target?.category){
    if(!active(state)||!target)return false;
    const entity=target.entity||target;
    if(entity===state||category==='player'||category==='asteroid'||target.rockId!=null||entity.slotId!=null&&entity.size!=null)return false;
    if(category==='repair-drone'||String(entity.id||'').startsWith('dot:'))return entity.carrier?.category!=='player'&&entity.carrier?.id!=='player'&&!String(entity.id||'').startsWith('dot:player:');
    if(category&&!['civilian','tug'].includes(category))return false;
    return category==='civilian'||category==='tug'||entity.shipType!=null;
  }
  window.nativeDevTraffic=Object.freeze({active,allowsCategory,excludes});
})();
