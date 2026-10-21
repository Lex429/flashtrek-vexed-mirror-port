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
      frame.src='../flashtrek-broken-mirror/live-repair-assets.html?v=fleet-culling-1';document.body.append(frame);
    });
    loading.catch(error=>{console.warn(error);});return loading;
  }
  function state(s){let r=states.get(s);if(!r){r={damage:art?.damage.createEffects(),destruction:art?.showcase.createDestruction()};states.set(s,r);}if(art&&!r.damage){r.damage=art.damage.createEffects();r.destruction=art.showcase.createDestruction();}return r;}
  function drawDrone(ctx,d,view){
    if(!art){ensure();return false;}
    const z=view.zoom??1,scale=d.definition.artwork.scale,x=view.cx+(d.x-view.ship.x)*z,y=view.cy+(d.y-view.ship.y)*z;
    ctx.save();ctx.translate(x,y);ctx.scale(z*scale,z*scale);ctx.rotate(d.heading);
    const drawn=art.sprites.draw(ctx,'basic',{role:'repair',health:d.entity.hull,maxHealth:40,time:time(d.state),lights:true,thrust:d.entity.phase==='repairing'?0:.8,activity:d.entity.phase==='repairing'?1:0});
    ctx.restore();return drawn;
  }
  function hit(s,d,result){
    if(!art||d.system!==s.system)return;
    const r=state(s),pose={tier:'basic',role:'repair',position:{x:d.x,y:d.y},heading:d.heading,scale:d.definition.artwork.scale,time:time(s),before:result.beforeStage,after:result.afterStage};
    if(result.destroyed)r.destruction.emit(pose);else r.damage.emit(pose);
  }
  function advance(s,dt){if(!(dt>0)||window.nativeSimulation.blocked())return;const r=states.get(s);r?.damage?.update(time(s));r?.destruction?.advance(time(s));}
  const noStages=Object.freeze([]),baseStages=Object.freeze([0,3]),repairStages=Object.freeze([
    baseStages,Object.freeze([0,3,1]),Object.freeze([0,3,2]),baseStages]);
  const startStage=(d,m)=>d.definition.damageStages.filter(t=>m.startHull/d.definition.hull<t).length;
  function requiredStages(d){
    if(!d.state.shipRepairs)return noStages;
    const m=window.nativeShipRepairs.missionFor(d.state,window.nativeShipRepairs.ref(d.category,d.entity));
    return m?(repairStages[startStage(d,m)]||baseStages):noStages;
  }
  function surface(d,assets,fallback){
    if(!assets?.[0]||!assets?.[3]||!d.state.shipRepairs)return fallback;
    const r=window.nativeShipRepairs.ref(d.category,d.entity),m=window.nativeShipRepairs.missionFor(d.state,r);
    if(!m||m.restoredHull<=0)return fallback;
    const max=d.definition.hull,q=Math.min(1,Math.max(0,(d.entity.hull-m.startHull)/Math.max(.001,max-m.startHull))),bucket=Math.floor(q*80);
    const id=m,old=surfaces.get(id);if(old?.bucket===bucket)return old.asset;
    const initial=assets[startStage(d,m)],intact=assets[0];
    if(!initial)return fallback;
    const width=256,height=Math.max(1,Math.round(width*intact.height/intact.width)),canvas=old?.canvas||Object.assign(document.createElement('canvas'),{width,height}),g=canvas.getContext('2d');
    g.clearRect(0,0,width,height);g.drawImage(initial.art,0,0,width,height);
    g.save();g.beginPath();g.rect(0,0,width*q,height);g.clip();g.clearRect(0,0,width,height);g.drawImage(intact.art,0,0,width,height);g.restore();
    // Suppress changing damage effects on the composited plate. Lamp power still
    // follows the real disabled state in the shared ship renderer.
    const asset={...fallback,art:canvas,repairSurface:true};surfaces.set(id,{bucket,canvas,asset});
    while(surfaces.size>16)surfaces.delete(surfaces.keys().next().value);return asset;
  }
  function beam(s,d,rendered=false){
    let target=window.nativeShipRepairs.pose(s,d.entity.target);if(!target)return null;
    if(rendered)target=window.nativeSimulationFrame?.renderPose?.(s,target)||target;
    const nozzle=art?.sprites.nozzle('basic');if(!nozzle)return null;
    const scale=d.definition.artwork.scale,c=Math.cos(d.heading),sn=Math.sin(d.heading),from={x:d.x+(nozzle.x*c-nozzle.y*sn)*scale,y:d.y+(nozzle.x*sn+nozzle.y*c)*scale};
    return {from,to:window.nativeShipRepairs.workPoint(target,d.entity)};
  }
  function paint(s,ctx,view){
    const drones=window.nativeShipRepairs.drones(s,s.system),z=view.zoom??1,visibility=window.nativeEffectVisibility;
    const near=[];
    for(const raw of drones){
      const d=window.nativeSimulationFrame?.renderPose?.(s,raw)||raw;
      let visible=visibility?.ship?visibility.ship(d,view,12):Math.abs(d.x-view.ship.x)*z<view.w/2+30&&Math.abs(d.y-view.ship.y)*z<view.h/2+30;
      // A welding line can cross the camera even with both craft offscreen.
      if(!visible&&d.entity.phase==='repairing'){
        let target=window.nativeShipRepairs.pose(s,d.entity.target);
        if(target){target=window.nativeSimulationFrame?.renderPose?.(s,target)||target;const hit=window.nativeShipRepairs.workPoint(target,d.entity);visible=visibility?.segment?.(view.cx+(d.x-view.ship.x)*z,view.cy+(d.y-view.ship.y)*z,view.cx+(hit.x-view.ship.x)*z,view.cy+(hit.y-view.ship.y)*z,12*z,view)||false;}
      }
      if(visible)near.push(d);
    }
    if(near.length&&!art)ensure();
    for(const d of near){
      window.nativeShipEffects.paintShip(ctx,d,view);
      if(d.entity.phase!=='repairing'||!art)continue;
      const b=beam(s,d,true);if(!b)continue;
      const x=p=>view.cx+(p.x-view.ship.x)*z,y=p=>view.cy+(p.y-view.ship.y)*z,now=time(s),pulse=.7+.3*Math.sin(now*.073)**2,effectZoom=z*d.definition.artwork.scale;
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#4dffac';ctx.globalAlpha=pulse;ctx.shadowColor='#48ff9d';ctx.shadowBlur=Math.max(1.5*z,6*effectZoom);ctx.lineWidth=Math.max(.65*z,1.2*effectZoom);
      ctx.beginPath();ctx.moveTo(x(b.from),y(b.from));ctx.lineTo(x(b.to),y(b.to));ctx.stroke();
      ctx.fillStyle='#f0fff5';ctx.beginPath();ctx.arc(x(b.to),y(b.to),2*effectZoom,0,Math.PI*2);ctx.fill();
      for(let i=0;i<4;i++){const a=now*.003+i*1.7,age=(now*.002+i*.27)%1,len=age*11*effectZoom;ctx.globalAlpha=1-age;ctx.beginPath();ctx.moveTo(x(b.to)+Math.cos(a)*len,y(b.to)+Math.sin(a)*len);ctx.lineTo(x(b.to)+Math.cos(a)*(len+3*effectZoom),y(b.to)+Math.sin(a)*(len+3*effectZoom));ctx.stroke();}ctx.restore();
    }
    // Effects share simulation time/world coordinates, including camera rotation
    // and zoom. No completion, health or resource mutation occurs here.
    const r=states.get(s);if(r){const visible=(x,y,radius)=>!visibility?.worldCircle||visibility.worldCircle(x,y,radius,view);ctx.save();ctx.translate(view.cx,view.cy);ctx.scale(z,z);ctx.translate(-view.ship.x,-view.ship.y);r.damage?.draw(ctx,time(s),{visible});r.destruction?.draw(ctx,time(s),{visible});ctx.restore();}
  }
  window.nativeRepairVisuals=Object.freeze({ensure,drawDrone,hit,advance,requiredStages,surface,paint,beam,ready:()=>!!art,
    snapshot:s=>({ready:!!art,surfaces:surfaces.size,destruction:states.get(s)?.destruction?.snapshot()||null})});
})();
