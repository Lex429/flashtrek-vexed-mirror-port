/* Live presentation adapter. Shared ship effects retain visual-event ownership. */
(() => {
  'use strict';
  let installation=null;
  window.installVexedShieldGPU=function(){
    if(window.vexedShieldGPU)return Promise.resolve(window.vexedShieldGPU);
    if(installation)return installation;
    installation=(async()=>{
      const space=document.getElementById('space');
      if(!space||!window.nativeShipEffects)throw Error('Live renderer not ready');
      const canvas=document.createElement('canvas');
      canvas.id='gpu-shield-overlay';canvas.setAttribute('aria-hidden','true');
      canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
      canvas.hidden=true;canvas.width=space.width;canvas.height=space.height;
      space.parentNode.insertBefore(canvas,space.nextSibling);
      let renderer;
      try{renderer=await window.createVexedShieldGPU({canvas,transparent:true});}
      catch(error){canvas.remove();throw error;}
      const capacity=128,seen=new Uint8Array(capacity),slotData=new Array(capacity);
      const emptyFleet=Array.from({length:capacity},(_,id)=>({id,x:-1e5,y:-1e5,w:1,h:1,rx:1,ry:1,phase:0,motion:0,angle:0}));
      const contacts=Array.from({length:8},()=>({x:0,y:0,born:0,time:0,ship:null}));
      let slots=new WeakMap(),count=0,frameOpen=false,enabled=true,available=true,disposed=false;
      const stats={frames:0,submissions:0,events:0,overBudget:0,lastActiveShields:0,peakActiveShields:0,collapseEvents:0};
      renderer.setFleet(emptyFleet);
      function reset(){slots=new WeakMap();count=0;slotData.fill(null);seen.fill(0);renderer.setFleet(emptyFleet);canvas.hidden=true;stats.lastActiveShields=0;}
      function beginFrame(ctx){
        if(ctx.canvas!==space)return;
        frameOpen=available&&!disposed;canvas.hidden=true;seen.fill(0);
        if(canvas.width!==space.width||canvas.height!==space.height){canvas.width=space.width;canvas.height=space.height;}
      }
      function submit(ctx,descriptor,view,flash,time,{front=false}={}){
        if(ctx.canvas!==space||!frameOpen||!available||disposed)return false;
        if(!enabled||!front)return true;
        let index=slots.get(descriptor.entity);
        if(index===undefined){
          if(count<capacity)index=count++;
          else{
            index=0;for(let i=1;i<capacity;i++)if(slotData[i].lastSeen<slotData[index].lastSeen)index=i;
            slots.delete(slotData[index].entity);stats.overBudget++;
          }
          slots.set(descriptor.entity,index);slotData[index]={entity:descriptor.entity,born:null,event:null,lastSeen:0};
        }
        const d=view.dimensions||descriptor.dimensions,zoom=view.zoom??1,
          r=window.nativeShipDefinitions.surfaceRadii(d,true,descriptor.definition),m=ctx.getTransform(),
          sx=Math.hypot(m.a,m.b)*zoom,sy=Math.hypot(m.c,m.d)*zoom,
          px=view.x??view.cx+(descriptor.x-view.ship.x)*zoom,py=view.y??view.cy+(descriptor.y-view.ship.y)*zoom,
          angle=descriptor.heading+Math.PI/2;
        renderer.updatePose(index,{x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f,
          angle:angle+Math.atan2(m.b,m.a),rx:r.rx*sx,ry:r.ry*sy,w:d.width*sx,h:d.height*sy});
        let x=Number.isFinite(flash.x)?flash.x:0,y=Number.isFinite(flash.y)?flash.y:-r.ry*.78;
        const n=Math.hypot(x/r.rx,y/r.ry);if(n>1){x/=n;y/=n;}
        renderer.hit(index,{x:x*sx,y:y*sy,born:flash.born,strength:flash.energy||1,collapse:flash.charge===0});
        const slot=slotData[index];
        if(slot.born!==flash.born||slot.event!==flash.weaponEventId){stats.events++;if(flash.charge===0)stats.collapseEvents++;}
        slot.born=flash.born;slot.event=flash.weaponEventId;slot.lastSeen=stats.frames;seen[index]=1;
        const c=Math.cos(angle)*zoom,s=Math.sin(angle)*zoom,lx=c*x-s*y,ly=s*x+c*y;
        Object.assign(contacts[stats.submissions%contacts.length],{x:m.a*(px+lx)+m.c*(py+ly)+m.e,
          y:m.b*(px+lx)+m.d*(py+ly)+m.f,born:flash.born,time,ship:descriptor.id});
        stats.submissions++;return true;
      }
      function endFrame(ctx,time){
        if(ctx.canvas!==space||!frameOpen)return;
        frameOpen=false;for(let i=0;i<count;i++)if(!seen[i])renderer.hide(i);
        const status=renderer.render(time,{effects:enabled,ships:false,background:false});
        stats.frames++;stats.lastActiveShields=enabled?status.active:0;
        stats.peakActiveShields=Math.max(stats.peakActiveShields,stats.lastActiveShields);
        canvas.hidden=stats.lastActiveShields===0;
      }
      function lost(event){event.preventDefault();available=false;frameOpen=false;canvas.hidden=true;}
      function restored(){api.destroy();window.installVexedShieldGPU().catch(warn);}
      canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
      const api=Object.freeze({canvas,renderer,duration:900,beginFrame,submit,endFrame,reset,
        get available(){return available&&!disposed;},
        setEnabled(value){enabled=!!value;if(!enabled)canvas.hidden=true;},
        snapshot:()=>({...stats,slots:count,capacity,enabled,available,contacts:contacts.map(p=>({...p})),resources:renderer.snapshot()}),
        destroy(){if(disposed)return;disposed=true;available=false;frameOpen=false;
          canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
          renderer.destroy();canvas.remove();if(window.vexedShieldGPU===api)delete window.vexedShieldGPU;installation=null;}});
      window.vexedShieldGPU=api;return api;
    })().catch(error=>{installation=null;throw error;});
    return installation;
  };
  function warn(error){console.warn('GPU shields unavailable; retaining shared Canvas shield visuals.',error.message);}
  window.vexedShieldGPUReady=window.installVexedShieldGPU().catch(error=>{warn(error);return null;});
})();
