/* Coherent checkpoint transfer. Storage/commit ownership remains in save-storage. */
(() => {
  'use strict';
  const validators=new Map(),property=/^[A-Za-z_$][\w$]*$/;let validatorCount=0;
  function validator(keys){
    if(keys.length>128)return null;
    const signature=keys.length+':'+keys[0]+':'+keys[keys.length-1],bucket=validators.get(signature);
    if(bucket)for(const entry of bucket){let match=true;for(let i=0;i<keys.length;i++)if(keys[i]!==entry.keys[i]){match=false;break;}if(match)return entry.check;}
    if(validatorCount>=512||keys.some(key=>!property.test(key)))return null;
    let check=null;
    try{check=new Function('source','values','same','keys','let value;return keys.length==='+keys.length+keys.map((key,i)=>'&&keys['+i+']==='+JSON.stringify(key)+'&&((value=source['+JSON.stringify(key)+']),Object.is(value,values['+i+'])||same(value,values['+i+']))').join('')+';');}catch{}
    const entries=bucket||[];entries.push({keys:keys.slice(),check});validators.set(signature,entries);validatorCount++;return check;
  }
  function capture(state,{part,complete,failed,valid=()=>true,budgetMs=2,now=()=>performance.now(),schedule=fn=>setTimeout(fn,0)}={}){
    const records=[],ids=new WeakMap(),stats={cpuMs:0,maxSliceMs:0,validationMs:0,objects:0};let cancelled=false;
    const arrays=window.nativeShipSystems?.saveValue||((value)=>value),ports=window.nativePortDocking?.saveValue||((value)=>value);
    const unwrap=value=>value&&typeof value==='object'?ports(arrays(value)):value;
    const same=(value,old)=>Object.is(unwrap(value),old);
    const reference=(value,normalized=false)=>{if(!normalized)value=unwrap(value);if(value===undefined||typeof value==='function'||typeof value==='symbol')return [-1];if(value===null||typeof value!=='object')return value;
      if(typeof value.toJSON==='function')throw Error('Custom JSON conversion requires direct capture');
      let id=ids.get(value);if(id===undefined){if(records.length>=1_000_000)throw Error('Checkpoint object limit exceeded');id=records.length;ids.set(value,id);records.push({id,source:value,array:Array.isArray(value),sampled:null});}return [id];};
    const root=reference(state);
    function read(row){
      const keys=row.array?null:Object.keys(row.source),length=row.array?row.source.length:keys.length,sampled=new Array(length),values=new Array(length);
      for(let i=0;i<length;i++){const value=unwrap(row.source[row.array?i:keys[i]]);sampled[i]=value;values[i]=reference(value,true);}
      row.keys=keys;row.sampled=sampled;row.values=values;if(keys)row.validator=validator(keys);return {id:row.id,array:row.array,keys,values};
    }
    function changed(row){
      if(!row.sampled)return true;
      if(row.array){if(row.source.length!==row.sampled.length)return true;}
      else{const keys=Object.keys(row.source);if(row.validator)return !row.validator(row.source,row.sampled,same,keys);if(keys.length!==row.keys.length)return true;for(let i=0;i<keys.length;i++)if(keys[i]!==row.keys[i])return true;}
      const source=row.source,sampled=row.sampled,keys=row.keys;for(let i=0;i<sampled.length;i++){const value=source[row.array?i:keys[i]];if(!Object.is(value,sampled[i])&&!same(value,sampled[i]))return true;}
      return false;
    }
    let cursor=0;
    function pump(){
      if(cancelled||!valid())return;const started=now();
      try{
        const batch=[];do{batch.push(read(records[cursor++]));}while(cursor<records.length&&now()-started<budgetMs);
        part(batch);const elapsed=now()-started;stats.cpuMs+=elapsed;stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
        if(cursor<records.length){schedule(pump);return;}
        // No simulation can interleave with this final read. Recheck EVERY key
        // and value, including deletions, array edits and replaced subgraphs.
        // Repair changed rows/new children before publishing the commit marker.
        const validation=now(),patches=[];
        for(let i=0;i<records.length;i++)if(changed(records[i]))patches.push(read(records[i]));
        if(!valid())return;
        stats.validationMs=now()-validation;stats.cpuMs+=stats.validationMs;stats.maxSliceMs=Math.max(stats.maxSliceMs,stats.validationMs);stats.objects=records.length;stats.patchedRows=patches.length;
        // The checked values are now immutable transfer records. Their upload
        // can yield as well; it need not extend the atomic verification turn.
        let sent=0;
        const transfer=()=>{if(cancelled||!valid())return;const at=now();if(sent<patches.length){part(patches.slice(sent,sent+256));sent+=256;}const elapsed=now()-at;stats.cpuMs+=elapsed;stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);if(sent<patches.length)schedule(transfer);else complete(root,stats);};
        schedule(transfer);
      }catch(error){cancelled=true;failed(error);}
    }
    schedule(pump);return {cancel(){cancelled=true;},stats};
  }
  function setValue(object,key,value){
    // Ordinary assignment creates the same mutable data fields much faster.
    // Inherited names (especially __proto__) still need an own data property.
    if(key in Object.prototype)Object.defineProperty(object,key,{value,writable:true,enumerable:true,configurable:true});
    else object[key]=value;
  }
  function restore(rows,root){
    const objects=rows.map(row=>row.array?[]:{}),value=item=>Array.isArray(item)?item[0]<0?undefined:objects[item[0]]:item;
    for(let i=0;i<rows.length;i++){
      const row=rows[i],object=objects[i];if(!row||row.id!==i)throw Error('Incomplete checkpoint transfer');
      if(row.array)for(const item of row.values)object.push(value(item));
      else for(let k=0;k<row.keys.length;k++)setValue(object,row.keys[k],value(row.values[k]));
    }
    return value(root);
  }
  async function restoreAsync(rows,root,{signal,budgetMs=2,schedule=fn=>setTimeout(fn,0)}={}){
    const objects=new Array(rows.length),value=item=>Array.isArray(item)?item[0]<0?undefined:objects[item[0]]:item;
    const steps=(function*(){
      for(let i=0;i<rows.length;i++){const row=rows[i];if(!row||row.id!==i)throw Error('Incomplete checkpoint transfer');objects[i]=row.array?[]:{};if(i%128===127)yield;}
      for(let i=0;i<rows.length;i++){
        const row=rows[i],object=objects[i];
        if(row.array){for(let k=0;k<row.values.length;k++){object.push(value(row.values[k]));if(k%256===255)yield;}}
        else for(let k=0;k<row.keys.length;k++)setValue(object,row.keys[k],value(row.values[k]));
        yield;
      }
      return value(root);
    })();
    let result;
    do{
      if(signal?.aborted)throw Error('State preparation cancelled.');
      const at=performance.now();
      do{result=steps.next();}while(!result.done&&performance.now()-at<budgetMs);
      if(!result.done)await new Promise(schedule);
    }while(!result.done);
    return result.value;
  }
  window.nativeSaveSnapshot=Object.freeze({capture,restore,restoreAsync});
})();
