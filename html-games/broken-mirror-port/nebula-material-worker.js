/* Runs the same conservative gas model without blocking flight or controls. */
'use strict';
try{importScripts('nebula-flow-kernel.js'+self.location.search);}catch{/* Same numeric model remains available in JavaScript. */}
importScripts('nebula-material.js'+self.location.search);
importScripts('plasma-vortices.js'+self.location.search);
importScripts('badlands-currents.js'+self.location.search);
let field=null,sequence=0,bodies=[],visibleSequence=-1,visibleRevision=-1,lastCheckpoint=0,recoveryRect=null,cpuMs=0,packMs=0,queue=[],cursor=0;const masks=new Map();
const reusable=[];let pooledBytes=0,reusedBuffers=0;
function takeBuffer(bytes){const index=reusable.findIndex(buffer=>buffer.byteLength===bytes);if(index<0)return undefined;const [buffer]=reusable.splice(index,1);pooledBytes-=bytes;reusedBuffers++;return buffer;}
const continuation=typeof MessageChannel==='function'?new MessageChannel():null;
if(continuation)continuation.port1.onmessage=()=>advance();
function resume(){if(continuation)continuation.port2.postMessage(0);else setTimeout(advance,0);}
function publish(force=false,initial=false,complete=false){
  const began=performance.now();
  const clock=field.metrics().clock,d=field.dirty;if(d){if(!recoveryRect)recoveryRect={...d};else{const x=Math.min(recoveryRect.x,d.x),y=Math.min(recoveryRect.y,d.y),right=Math.max(recoveryRect.x+recoveryRect.w,d.x+d.w),bottom=Math.max(recoveryRect.y+recoveryRect.h,d.y+d.h);recoveryRect={x,y,w:right-x,h:bottom-y};}}
  let checkpoint=null,frame=null;const buffers=[];
  if(initial||clock-lastCheckpoint>=1){checkpoint=field.checkpoint(recoveryRect,takeBuffer);lastCheckpoint=clock;recoveryRect=null;field.uploaded();buffers.push(checkpoint.density.buffer,checkpoint.rate.buffer,checkpoint.u.buffer,checkpoint.v.buffer,checkpoint.swept.buffer,checkpoint.solid.buffer);}
  else if(force&&(sequence!==visibleSequence||field.revision!==visibleRevision)){frame=field.densityPatch(takeBuffer,true);field.uploaded();buffers.push(frame.density.buffer,frame.rate.buffer);}
  if(checkpoint||frame){visibleSequence=sequence;visibleRevision=field.revision;}
  packMs+=performance.now()-began;postMessage({kind:'updated',sequence,bodies,checkpoint,frame,complete,metrics:{...field.metrics(),workerCpuMs:cpuMs,workerPackMs:packMs,pooledBytes,reusedBuffers,workerScheduler:continuation?'message-channel':'timer'}},buffers);
}
function advance(){
  try{
    const slice=performance.now();
    while(field.hasPendingFlow||cursor<queue.length){
      const began=performance.now();
      if(field.hasPendingFlow)field.continueFlow(1);
      else{const command=queue[cursor++];if(command.sequence<=sequence)continue;
        bodies=command.bodies;field.updateMany(bodies.map(b=>({id:b.id,pose:b.pose,from:b.from,mask:masks.get(b.maskId)})),command.dt,command.options);sequence=command.sequence;}
      cpuMs+=performance.now()-began;
      // Fresh hull displacement is visible after this slice; the underlying
      // fluid/refill solver retains its independent fixed 30-Hz cadence.
      // Fluid debt belongs to the accepted pose even when no newer pose has
      // arrived. Finish it in cooperative slices before acknowledging completion.
      if(performance.now()-slice>=4&&(field.hasPendingFlow||cursor<queue.length)){publish(true,false,false);resume();return;}
    }
    queue=[];cursor=0;publish(true,false,true);
  }catch(error){postMessage({kind:'error',reason:String(error.stack||error)});}
}
onmessage=event=>{
  try{
    const message=event.data;
    if(message.kind==='init'){field=nativeNebulaMaterial.createField(message.config);field.seed(message.rgba,message.sw,message.sh);publish(true,true,true);}
    // Nearest-surface geometry is needed only when the hull actually displaces
    // gas. Passing through empty space must not prepare an unused transform.
    else if(message.kind==='mask'){const m=message.mask;masks.set(message.id,nativeNebulaMaterial.createMask(m.alpha,m.w,m.h,m.aspect,false));}
    else if(message.kind==='release')for(const id of message.ids)masks.delete(id);
    else if(message.kind==='recycle'){for(const buffer of message.buffers||[])if(buffer.byteLength&&reusable.length<64&&pooledBytes+buffer.byteLength<=32*1024*1024){reusable.push(buffer);pooledBytes+=buffer.byteLength;}}
    else if(message.kind==='advance'){
      queue=message.commands;cursor=0;advance();
    }
    else if(message.kind==='publish')publish(true,false,true);
  }catch(error){postMessage({kind:'error',reason:String(error.stack||error)});}
};
