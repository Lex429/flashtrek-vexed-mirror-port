/* Run the same immutable pixel algorithms without blocking controls or paint. */
'use strict';
self.window=self;
self.document={createElement:()=>new OffscreenCanvas(1,1)};
importScripts('wreckage-effects.js?v=fast-start-2','cthia-destruction.js?v=fast-start-2','showcase-stage-fragments.js?v=fast-start-2');
function transferable(value,transfers,seen=new Map()){
  if(!value||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  if(value instanceof OffscreenCanvas){const bitmap=value.transferToImageBitmap();seen.set(value,bitmap);transfers.push(bitmap);return bitmap;}
  const result=Array.isArray(value)?[]:{};seen.set(value,result);
  for(const [key,item] of Object.entries(value))result[key]=transferable(item,transfers,seen);
  return result;
}
self.onmessage=event=>{
  const {id,kind,frames,config}=event.data,started=performance.now();
  try{
    let data;
    if(kind==='destruction'){
      if(config.partition?.serialized?.kind==='torn-anchors-v1')config.partition=self.createTornHullPartition(config.partition.serialized);
      const destruction=self.createShipDestruction();destruction.prepare(frames,config);data=destruction.serialized();
      for(const stage of data)for(const piece of stage.pieces)piece.material=self.wreckageEffects.get(piece.texture);
    }else{
      data=self.showcaseStageFragments.prepare(frames,config);
      for(const stage of data)for(const piece of stage)piece.material=self.wreckageEffects.get(piece.texture);
    }
    const transfers=[];data=transferable(data,transfers);
    self.postMessage({id,data,workMs:performance.now()-started},transfers);
  }catch(error){self.postMessage({id,error:String(error.stack||error)});}
  finally{for(const frame of frames)frame.close();}
};
