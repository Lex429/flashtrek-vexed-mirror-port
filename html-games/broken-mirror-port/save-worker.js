/* Encode a captured checkpoint away from flight. Storage remains in its owner. */
'use strict';
self.window=self;
importScripts('save-codec.js?v=checkpoint-text-3','save-snapshot.js?v=stutter-3-warp-latency-1');
const captures=new Map();
self.onmessage=event=>{
  const {id,state,text,action,rows,rowsText,root}=event.data;
  if(action==='discard'){captures.delete(id);return;}
  if(action==='part'){try{let saved=captures.get(id);if(!saved)captures.set(id,saved=[]);for(const row of rows||JSON.parse(rowsText))saved[row.id]=row;}catch(error){captures.delete(id);self.postMessage({id,error:String(error.message||error)});}return;}
  try{const started=performance.now(),snapshot=action==='commit'?self.nativeSaveSnapshot.restore(captures.get(id)||[],root):state;captures.delete(id);if(action==='commit')snapshot.saveSlotVersion=3;const serialized=typeof text==='string'?self.nativeSaveCodec.encodeText(text):self.nativeSaveCodec.stringify(snapshot);self.postMessage({id,serialized,serializationMs:performance.now()-started});}
  catch(error){self.postMessage({id,error:String(error.message||error)});}
};
