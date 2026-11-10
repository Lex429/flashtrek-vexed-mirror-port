/* Runs the same conservative gas model without blocking flight or controls. */
'use strict';
importScripts('nebula-material.js'+self.location.search);
let field=null,sequence=0,bodies=[],lastPublish=0,lastCheckpoint=0,recoveryRect=null,cpuMs=0,packMs=0;const masks=new Map();
function publish(force=false,initial=false){
  const began=performance.now();
  const clock=field.metrics().clock,d=field.dirty;if(d){if(!recoveryRect)recoveryRect={...d};else{const x=Math.min(recoveryRect.x,d.x),y=Math.min(recoveryRect.y,d.y),right=Math.max(recoveryRect.x+recoveryRect.w,d.x+d.w),bottom=Math.max(recoveryRect.y+recoveryRect.h,d.y+d.h);recoveryRect={x,y,w:right-x,h:bottom-y};}}
  let checkpoint=null,frame=null;const buffers=[];
  if(initial||clock-lastCheckpoint>=1){checkpoint=field.checkpoint(recoveryRect);lastCheckpoint=lastPublish=clock;recoveryRect=null;field.uploaded();buffers.push(checkpoint.density.buffer,checkpoint.u.buffer,checkpoint.v.buffer,checkpoint.swept.buffer,checkpoint.solid.buffer);}
  else if(force||clock-lastPublish>=1/30){frame=field.densityPatch();lastPublish=clock;field.uploaded();buffers.push(frame.density.buffer);}
  packMs+=performance.now()-began;postMessage({kind:'updated',sequence,bodies,checkpoint,frame,metrics:{...field.metrics(),workerCpuMs:cpuMs,workerPackMs:packMs}},buffers);
}
onmessage=event=>{
  try{
    const message=event.data;
    if(message.kind==='init'){field=nativeNebulaMaterial.createField(message.config);field.seed(message.rgba,message.sw,message.sh);publish(true,true);}
    else if(message.kind==='mask'){const m=message.mask;masks.set(message.id,nativeNebulaMaterial.createMask(m.alpha,m.w,m.h,m.aspect));}
    else if(message.kind==='release')for(const id of message.ids)masks.delete(id);
    else if(message.kind==='advance'){
      const began=performance.now();
      for(const command of message.commands){if(command.sequence<=sequence)continue;bodies=command.bodies;field.updateMany(bodies.map(b=>({id:b.id,pose:b.pose,mask:masks.get(b.maskId)})),command.dt,command.options);sequence=command.sequence;}
      cpuMs+=performance.now()-began;publish();
    }
    else if(message.kind==='publish')publish(true);
  }catch(error){postMessage({kind:'error',reason:String(error.stack||error)});}
};
