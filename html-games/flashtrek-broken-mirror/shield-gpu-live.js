/* Live presentation adapter. Shared ship effects retain visual-event ownership. */
(() => {
  'use strict';
  let installation=null;
  window.installVexedShieldGPU=function(){
    if(window.vexedShieldGPU)return Promise.resolve(window.vexedShieldGPU);
    if(installation)return installation;
    const space=document.getElementById('space');
    if(!space||!window.nativeShipEffects)return Promise.reject(Error('Live renderer not ready'));
    // Release modules load asynchronously. Pick the renderer only after the
    // released profile is ready, including on a cold ordinary-game startup.
    installation=Promise.resolve(window.nativeEffectProfiles?.ready)
      .then(()=>window.createVexedShieldPresentation({space,radii:(descriptor,d)=>window.nativeShipDefinitions.surfaceRadii(d,true,descriptor.definition),onRestore:()=>window.installVexedShieldGPU().catch(warn)}))
      .then(api=>{window.vexedShieldGPU=api;return api;}).catch(error=>{installation=null;throw error;});
    return installation;
  };
  window.createVexedShieldPresentation=async function({space,radii,onRestore=()=>{},matchCanvasBox=false}={}){
      if(!space||typeof radii!=='function')throw Error('Shield presentation needs a canvas and surface geometry');
      const canvas=document.createElement('canvas');
      canvas.id='gpu-shield-overlay';canvas.setAttribute('aria-hidden','true');
      canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
      canvas.hidden=true;canvas.width=space.width;canvas.height=space.height;
      space.parentNode.insertBefore(canvas,space.nextSibling);
      let renderer;
      try{renderer=await window.createVexedShieldGPU({canvas,sourceCanvas:space,transparent:true});}
      catch(error){canvas.remove();throw error;}
      let shipLamps=null;
      try{shipLamps=window.createVexedShipLampBatch?.(renderer,space)||null;}catch(error){console.warn('GPU ship lamps unavailable; using the existing Canvas lamps.',error.message);}
      const capacity=256,seen=new Uint8Array(capacity),slotData=new Array(capacity);
      const emptyFleet=Array.from({length:capacity},(_,id)=>({id,x:-1e5,y:-1e5,w:1,h:1,rx:1,ry:1,phase:0,motion:0,angle:0}));
      const contacts=Array.from({length:8},()=>({x:0,y:0,born:0,time:0,ship:null}));
      let slots=new WeakMap(),count=0,frameOpen=false,enabled=true,available=true,disposed=false,legacy=false;
      const stats={frames:0,submissions:0,events:0,overBudget:0,lastActiveShields:0,peakActiveShields:0,collapseEvents:0};
      renderer.setFleet(emptyFleet);
      function reset(){slots=new WeakMap();count=0;slotData.fill(null);seen.fill(0);renderer.setFleet(emptyFleet);canvas.hidden=true;stats.lastActiveShields=0;}
      function beginFrame(ctx){
        if(ctx.canvas!==space)return;
        frameOpen=available&&!disposed;if(!frameOpen)canvas.hidden=true;seen.fill(0);
        renderer.beginFrame?.();
        shipLamps?.begin(frameOpen&&enabled&&!legacy&&window.nativeShipLampGPUEnabled!==false);
        window.showcaseWeaponAppearance?.beginFrame?.(space);
        if(matchCanvasBox){const box=space.getBoundingClientRect(),parent=space.parentElement.getBoundingClientRect();
          Object.assign(canvas.style,{inset:'auto',left:(box.left-parent.left)+'px',top:(box.top-parent.top)+'px',width:box.width+'px',height:box.height+'px'});}
        if(canvas.width!==space.width||canvas.height!==space.height){canvas.width=space.width;canvas.height=space.height;}
      }
      function submit(ctx,descriptor,view,flash,time,{front=false}={}){
        if(ctx.canvas!==space||!frameOpen||!available||disposed)return false;
        if(!enabled)return true;
        if(!front)return !legacy;
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
          r=radii(descriptor,d),m=ctx.getTransform(),
          sx=Math.hypot(m.a,m.b)*zoom,sy=Math.hypot(m.c,m.d)*zoom,
          px=view.x??view.cx+(descriptor.x-view.ship.x)*zoom,py=view.y??view.cy+(descriptor.y-view.ship.y)*zoom,
          angle=descriptor.heading+Math.PI/2;
        renderer.updatePose(index,{x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f,
          angle:angle+Math.atan2(m.b,m.a),rx:r.rx*sx,ry:r.ry*sy,w:d.width*sx,h:d.height*sy});
        let x=Number.isFinite(flash.x)?flash.x:0,y=Number.isFinite(flash.y)?flash.y:-r.ry*.78;
        const n=Math.hypot(x/r.rx,y/r.ry);if(n>1){x/=n;y/=n;}
        const profile=window.nativeEffectProfiles?.shield()||{duration:900,energy:1};
        const energy=renderer.weaponAware&&Number.isFinite(flash.absorbed)?Math.min(1.8,.55+1.25*Math.sqrt(Math.max(0,flash.absorbed)/Math.max(1,flash.shieldCapacity||1))):(flash.energy||1);
        renderer.hit(index,{x:x*sx,y:y*sy,born:flash.born,kind:flash.kind,charge:flash.charge,strength:energy*profile.energy,collapse:flash.charge===0,eventId:flash.weaponEventId??null,duration:legacy?620:profile.duration});
        const slot=slotData[index];
        if(slot.born!==flash.born||slot.event!==flash.weaponEventId){stats.events++;if(flash.charge===0)stats.collapseEvents++;}
        slot.born=flash.born;slot.event=flash.weaponEventId;slot.lastSeen=stats.frames;seen[index]=1;
        const c=Math.cos(angle)*zoom,s=Math.sin(angle)*zoom,lx=c*x-s*y,ly=s*x+c*y;
        Object.assign(contacts[stats.submissions%contacts.length],{x:m.a*(px+lx)+m.c*(py+ly)+m.e,
          y:m.b*(px+lx)+m.d*(py+ly)+m.f,born:flash.born,time,ship:descriptor.id});
        if(!legacy)renderer.queueImpact?.({...contacts[stats.submissions%contacts.length],kind:flash.kind,color:flash.weaponColor,
          strength:energy,age:time-flash.born,scale:Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)),shield:true});
        stats.submissions++;return !legacy;
      }
      function endFrame(ctx,time){
        if(ctx.canvas!==space||!frameOpen)return;
        frameOpen=false;for(let i=0;i<count;i++)if(!seen[i])renderer.hide(i);
        const probe=window.nativeEffectGameProbe;
        probe?.beginEffects?.(ctx,renderer.gl);
        let status,lamps=0;try{status=renderer.render(time,{effects:enabled&&!legacy,ships:false,background:false,beforeEffects:()=>{lamps=shipLamps?.render()||0;}});}
        finally{probe?.endEffects?.(ctx);}
        stats.frames++;stats.lastActiveShields=enabled?status.active:0;
        stats.peakActiveShields=Math.max(stats.peakActiveShields,stats.lastActiveShields);
        const hidden=legacy||stats.lastActiveShields===0&&!status.activePrimitives&&!lamps;if(canvas.hidden!==hidden)canvas.hidden=hidden;
        window.showcaseWeaponAppearance?.endFrame?.(space);
      }
      function lost(event){event.preventDefault();available=false;frameOpen=false;canvas.hidden=true;}
      function restored(){api.destroy();onRestore();}
      canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
      const api=Object.freeze({canvas,renderer,get duration(){return legacy?620:window.nativeEffectProfiles?.shield().duration||900;},beginFrame,submit,endFrame,reset,
        get available(){return available&&!disposed;},
        setLegacy(value){legacy=!!value;renderer.setPresentationMode?.({legacy,enabled});if(legacy)canvas.hidden=true;},
        setEnabled(value){enabled=!!value;renderer.setPresentationMode?.({legacy,enabled});if(!enabled)canvas.hidden=true;},
        snapshot:()=>({...stats,slots:count,capacity,enabled,available,legacy,contacts:contacts.map(p=>({...p})),shipLamps:shipLamps?.snapshot()||null,resources:renderer.snapshot()}),
        destroy(){if(disposed)return;disposed=true;available=false;frameOpen=false;
          canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
          shipLamps?.destroy();renderer.destroy();canvas.remove();if(window.vexedShieldGPU===api){delete window.vexedShieldGPU;installation=null;}}});
      return api;
  };
  function warn(error){console.warn('GPU shields unavailable; retaining shared Canvas shield visuals.',error.message);}
  if(document.getElementById('space')&&window.nativeShipEffects)window.vexedShieldGPUReady=window.installVexedShieldGPU().catch(error=>{warn(error);return null;});
})();
