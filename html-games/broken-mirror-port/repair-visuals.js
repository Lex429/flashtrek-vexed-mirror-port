/* Live repair presentation. Reuses the Dot showcase's immutable artwork,
   lamps, nozzle and destruction helpers; observes the saved simulation only. */
(() => {
  'use strict';
  let loading=null,art=null;
  const surfaces=new Map(),states=new WeakMap();
  const time=s=>window.nativeSimulation.now(s);
  function ensure(){
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe');frame.hidden=true;frame.title='Repair artwork cache';
      frame.onload=async()=>{try{
        const w=frame.contentWindow;
        art={sprites:w.droneSprites,damage:w.dotBasicDamage,showcase:w.droneShowcase};
        const loaded=await w.droneSprites.ready;
        if(!loaded.every(Boolean))throw Error('Dot artwork preparation failed');
        resolve(art);
      }catch(error){reject(error);}};
      frame.onerror=()=>reject(Error('Could not load repair artwork'));
      frame.src='../flashtrek-broken-mirror/live-repair-assets.html?v=progressive-1';document.body.append(frame);
    });
    loading.catch(error=>{console.warn(error);});return loading;
  }
  function state(s){let r=states.get(s);if(!r){r={damage:art?.damage.createEffects(),destruction:art?.showcase.createDestruction()};states.set(s,r);}if(art&&!r.damage){r.damage=art.damage.createEffects();r.destruction=art.showcase.createDestruction();}return r;}
  function drawDrone(ctx,d,view){
    if(!art){ensure();return false;}
    const z=view.zoom??1,scale=d.definition.artwork.scale,x=view.cx+(d.x-view.ship.x)*z,y=view.cy+(d.y-view.ship.y)*z;
    ctx.save();ctx.translate(x,y);ctx.scale(z*scale,z*scale);ctx.rotate(d.heading);
    const lights=window.nativeFlightLightingEnabled!==false;
    const drawn=art.sprites.draw(ctx,'basic',{role:'repair',health:d.entity.hull,maxHealth:40,time:time(d.state),lights,thrust:d.entity.phase==='repairing'?0:.8,activity:d.entity.phase==='repairing'?1:0});
    if(drawn)window.nativeRepairWork.drawThrusters(ctx,{role:'repair',health:d.entity.hull,lights,thrust:d.entity.phase==='repairing'?0:.8});
    ctx.restore();return drawn;
  }
  function hit(s,d,result){
    if(!art||d.system!==s.system)return;
    const r=state(s),pose={tier:'basic',role:'repair',position:{x:d.x,y:d.y},heading:d.heading,scale:d.definition.artwork.scale,time:time(s),before:result.beforeStage,after:result.afterStage};
    if(result.destroyed)r.destruction.emit(pose);else r.damage.emit(pose);
  }
  function advance(s,dt){if(!(dt>0)||window.nativeSimulation.blocked())return;const r=states.get(s);r?.damage?.update(time(s));r?.destruction?.advance(time(s));}
  function surface(d,assets,fallback){
    if(!assets?.[0]||!assets?.[3]||!d.state.shipRepairs)return fallback;
    const r=window.nativeShipRepairs.ref(d.category,d.entity),m=window.nativeShipRepairs.missionFor(d.state,r);
    if(!m||m.restoredHull<=0)return fallback;
    const max=d.definition.hull,q=Math.min(1,Math.max(0,(d.entity.hull-m.startHull)/Math.max(.001,max-m.startHull))),bucket=Math.floor(q*80);
    const id=m,old=surfaces.get(id);if(old?.bucket===bucket)return old.asset;
    const initial=assets[d.definition.damageStages.filter(t=>m.startHull/max<t).length]||assets[3],intact=assets[0];
    const width=256,height=Math.max(1,Math.round(width*intact.height/intact.width)),canvas=old?.canvas||Object.assign(document.createElement('canvas'),{width,height}),g=canvas.getContext('2d');
    window.nativeRepairWork.paintHull(g,initial.art,intact.art,window.VexedRepairSites?.ships[d.shipType],q,Math.max(1,m.drones.length));
    // Suppress changing damage effects on the composited plate. Lamp power still
    // follows the real disabled state in the shared ship renderer.
    const asset={...fallback,art:canvas,repairSurface:true};surfaces.set(id,{bucket,canvas,asset});
    while(surfaces.size>16)surfaces.delete(surfaces.keys().next().value);return asset;
  }
  function beam(s,d){
    const target=window.nativeShipRepairs.pose(s,d.entity.target);if(!target)return null;
    const nozzle=art?.sprites.nozzle('basic');if(!nozzle)return null;
    const scale=d.definition.artwork.scale,c=Math.cos(d.heading),sn=Math.sin(d.heading),from={x:d.x+(nozzle.x*c-nozzle.y*sn)*scale,y:d.y+(nozzle.x*sn+nozzle.y*c)*scale};
    return {from,to:window.nativeShipRepairs.workPoint(target,d.entity)};
  }
  function paint(s,ctx,view){
    const drones=window.nativeShipRepairs.drones(s,s.system),z=view.zoom??1;
    const visible=d=>{const x=view.cx+(d.x-view.ship.x)*z,y=view.cy+(d.y-view.ship.y)*z;return x>-100&&y>-100&&x<view.w+100&&y<view.h+100;};
    const near=drones.filter(visible);if((near.length||s.phase==='disabled')&&!art)ensure();
    const groups=new Map();
    for(const d of near)if(d.entity.phase==='repairing'){
      const p=window.nativeShipRepairs.pose(s,d.entity.target),m=window.nativeShipRepairs.missionFor(s,d.entity.target),entry=surfaces.get(m);
      if(!entry||!p)continue;
      if(!groups.has(m))groups.set(m,{entry,p,contacts:[]});
      groups.get(m).contacts.push({x:(.5+d.entity.workLocal.x/p.dimensions.width)*entry.canvas.width,y:(.5+d.entity.workLocal.y/p.dimensions.height)*entry.canvas.height});
    }
    if(window.nativeFlightLightingEnabled!==false)for(const {entry,p,contacts} of groups.values()){
      entry.glow||=Object.assign(document.createElement('canvas'),{width:entry.canvas.width,height:entry.canvas.height});
      window.nativeRepairWork.reflection(entry.glow.getContext('2d'),entry.canvas,contacts,42*entry.canvas.width/(window.VexedRepairSites.ships[p.shipType]?.w||512));
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(view.cx+(p.x-view.ship.x)*z,view.cy+(p.y-view.ship.y)*z);ctx.rotate(p.heading+Math.PI/2);
      ctx.drawImage(entry.glow,-p.dimensions.width*z/2,-p.dimensions.height*z/2,p.dimensions.width*z,p.dimensions.height*z);ctx.restore();
    }
    for(const d of near){
      window.nativeShipEffects.paintShip(ctx,d,view);
      if(d.entity.phase!=='repairing'||!art)continue;
      const b=beam(s,d);if(!b)continue;
      ctx.save();ctx.translate(view.cx,view.cy);ctx.scale(z,z);ctx.translate(-view.ship.x,-view.ship.y);
      window.nativeRepairWork.drawWeld(ctx,{nozzle:b.from,hit:b.to,heading:d.heading,tier:'basic'},time(s),d.id,d.definition.artwork.scale);
      ctx.restore();
    }
    // Effects share simulation time/world coordinates, including camera rotation
    // and zoom. No completion, health or resource mutation occurs here.
    const r=states.get(s);if(r){ctx.save();ctx.translate(view.cx,view.cy);ctx.scale(z,z);ctx.translate(-view.ship.x,-view.ship.y);r.damage?.draw(ctx,time(s));r.destruction?.draw(ctx,time(s));ctx.restore();}
    ctx.save();ctx.translate(view.cx,view.cy);ctx.scale(z,z);ctx.translate(-view.ship.x,-view.ship.y);
    window.nativeRepairWork.drawSparks(ctx,(s.shipRepairs?.weldSparks||[]).filter(p=>p.system===s.system),time(s));ctx.restore();
  }
  window.nativeRepairVisuals=Object.freeze({ensure,drawDrone,hit,advance,surface,paint,beam,ready:()=>!!art,
    snapshot:s=>({ready:!!art,surfaces:surfaces.size,weldSparks:s.shipRepairs?.weldSparks?.length||0,destruction:states.get(s)?.destruction?.snapshot()||null})});
})();
