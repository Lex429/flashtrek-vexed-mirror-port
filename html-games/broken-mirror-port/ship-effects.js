/* Shared ship artwork, impacts and destruction. All mutation happens in hit/advance. */
(() => {
  'use strict';
  const prepared=new Map(),pending=new Map(),visuals=new Map(),bursts=[],fragments=[],wrecks=[];
  const now=state=>window.nativeSimulation?.now(state)??performance.now();
  const key=(type,category)=>`${Number(type)}:${window.nativeShipDefinitions.get(type,category).artwork.source}`;
  const units=()=>window.showcaseWeaponAppearance?.units??.91976;
  const worldPoint=(descriptor,local)=>window.nativeCombatShots.worldPoint?window.nativeCombatShots.worldPoint(descriptor,local):{
    x:descriptor.x+local.x*Math.cos(descriptor.heading+Math.PI/2)-local.y*Math.sin(descriptor.heading+Math.PI/2),
    y:descriptor.y+local.x*Math.sin(descriptor.heading+Math.PI/2)+local.y*Math.cos(descriptor.heading+Math.PI/2)};
  function prepare(type,category='player'){
    const cacheKey=key(type,category);
    if(prepared.has(cacheKey))return Promise.resolve(prepared.get(cacheKey));
    if(pending.has(cacheKey))return pending.get(cacheKey);
    if(!window.vexedFlightAssets?.loadShip)return Promise.resolve(null);
    const definition=window.nativeShipDefinitions.get(type,category),maximum=definition.hull||100;
    const promise=Promise.all([1,.7,.4,.1].map(fraction=>window.vexedFlightAssets.loadShip(type,maximum*fraction,{showcase:definition.artwork.source==='showcase'}))).then(assets=>{
      const profile=assets[0]?.profile,art=assets.map(asset=>asset.art);
      const result={assets,fragments:profile?.breakAnchors&&window.showcaseStageFragments?.prepare(art,profile.breakAnchors),destruction:null};
      if(profile?.destruction&&window.createShipDestruction){result.destruction=window.createShipDestruction();result.destruction.prepare(art,profile.destruction);}
      prepared.set(cacheKey,result);return result;
    }).catch(error=>{console.warn('Ship damage artwork unavailable',type,error);return null;}).finally(()=>pending.delete(cacheKey));
    pending.set(cacheKey,promise);return promise;
  }
  function data(descriptor){return prepared.get(key(descriptor.shipType,descriptor.category));}
  function asset(descriptor){const ready=data(descriptor);if(!ready)prepare(descriptor.shipType,descriptor.category);return ready?.assets[window.nativeShipDefinitions.stage(descriptor)]||null;}
  function visual(state,descriptor){
    let value=visuals.get(descriptor.entity);
    if(!value){value={state,descriptor,flash:null};visuals.set(descriptor.entity,value);}
    value.descriptor=descriptor;return value;
  }
  function burst(state,descriptor,point,strength=1,sparksOnly=false){
    const first=bursts.length;window.showcaseHullBurst?.burst(bursts,point,now(state),units(),1,strength,sparksOnly);
    for(let i=first;i<bursts.length;i++)Object.assign(bursts[i],{state,system:descriptor.system,entity:descriptor.entity});
  }
  function flash(state,descriptor,contact,event={},absorbed=0){
    if(!contact)return;
    const charge=Math.max(0,descriptor.entity.shields)/Math.max(1,descriptor.definition.shields);
    visual(state,descriptor).flash={born:now(state),x:contact.local.x,y:contact.local.y,dx:contact.dx,dy:contact.dy,
      kind:event.kind||'beam',energy:event.energy??1+Math.min(.55,absorbed/Math.max(1,absorbed+descriptor.entity.shields)*.7),charge,color:'#50d5ff'};
  }
  function visualImpact(state,descriptor,event={}){
    if(!descriptor?.entity||descriptor.entity.hull<=0||descriptor.entity.phase==='destroyed'||descriptor.system!==state.system)return;
    const shielded=descriptor.entity.shields>0,contact=window.nativeShipDamage.collision(descriptor,event,shielded);
    if(shielded)flash(state,descriptor,contact,{...event,kind:event.kind||'debris'});
    else burst(state,descriptor,contact.world,event.energy||.65,true);
    return {ok:true,shields:descriptor.entity.shields,hull:descriptor.entity.hull,contact};
  }
  function emitWreck(wreck){
    const preparedData=prepared.get(wreck.assetKey),destruction=preparedData?.destruction;
    if(wreck.prepared||!destruction)return;
    const {descriptor}=wreck,d=descriptor.dimensions;
    destruction.emit(wreck,{x:wreck.x,y:wreck.y,w:d.width,h:d.height},piece=>worldPoint(descriptor,{x:piece.x*d.width,y:piece.y*d.height}),wreck.stage,1);
    for(const piece of wreck.debris){piece.system=wreck.system;piece.sourceKey=wreck.sourceKey;}
    wreck.prepared=true;
  }
  function hit(state,descriptor,result,event={}){
    if(!result?.ok||!(result.amount>0))return result;
    if(descriptor.system===state.system){
      if(result.absorbed>0)flash(state,descriptor,result.contacts.shield,event,result.absorbed);
      if(result.hullDamage>0){
        burst(state,descriptor,result.contacts.hull.world);
        const ready=data(descriptor);
        if(!result.destroyed&&result.afterStage>result.beforeStage&&ready?.fragments){
          const d=descriptor.dimensions,first=fragments.length,time=now(state);
          window.showcaseStageFragments.emit({debris:fragments,fragments:ready.fragments,before:result.beforeStage,after:result.afterStage,
            layout:{x:descriptor.x,y:descriptor.y,w:d.width,h:d.height},world:piece=>worldPoint(descriptor,{x:piece.x*d.width,y:piece.y*d.height}),
            angle:descriptor.heading+Math.PI/2,time,zoom:1,burst:(point,strength,sparksOnly)=>burst(state,descriptor,point,strength,sparksOnly)});
          for(let i=first;i<fragments.length;i++)Object.assign(fragments[i],{state,system:descriptor.system,sourceKey:`ship:${descriptor.category}:${descriptor.entity.id}`});
        }
      }
    }
    if(result.destroyed){
      prepare(descriptor.shipType,descriptor.category);
      const sourceKey=descriptor.category==='player'?'ship:player':`ship:${descriptor.category}:${descriptor.entity.id}`;
      const wreck={state,descriptor,assetKey:key(descriptor.shipType,descriptor.category),system:descriptor.system,x:descriptor.x,y:descriptor.y,
        angle:descriptor.heading+Math.PI/2,stage:result.beforeStage,time:0,debris:[],particles:[],prepared:false,sourceKey};
      wrecks.push(wreck);if(wrecks.length>36)wrecks.shift();emitWreck(wreck);
      window.nativeEnvironmentalImpacts?.explode(state,{...descriptor.entity,x:descriptor.x,y:descriptor.y,system:descriptor.system,size:Math.max(descriptor.dimensions.width,descriptor.dimensions.height)},{sourceKey});
    }
    return result;
  }
  function advance(state,dt){
    if(!(dt>0)||window.nativeSimulation?.blocked?.())return;
    const time=now(state);
    for(const piece of fragments)if(piece.state===state&&time>=piece.born){
      const oldX=piece.x,oldY=piece.y;window.showcaseStageFragments?.update(piece,dt);
      if(piece.system===state.system)window.nativeEnvironmentalImpacts?.debris(state,piece,oldX,oldY,{sourceKey:piece.sourceKey});
    }
    for(let i=fragments.length-1;i>=0;i--)if(fragments[i].state===state&&time-fragments[i].born>=fragments[i].ttl)fragments.splice(i,1);
    for(const particle of bursts)if(particle.state===state&&time>=particle.born)window.showcaseHullBurst?.update(particle,dt);
    for(let i=bursts.length-1;i>=0;i--)if(bursts[i].state===state&&time-bursts[i].born>=bursts[i].ttl)bursts.splice(i,1);
    for(let i=wrecks.length-1;i>=0;i--){
      const wreck=wrecks[i];if(wreck.state!==state)continue;wreck.time+=dt*1000;emitWreck(wreck);
      for(const piece of wreck.debris){const oldX=piece.x,oldY=piece.y;piece.x+=piece.vx*dt;piece.y+=piece.vy*dt;piece.angle+=piece.spin*dt;
        if(wreck.system===state.system)window.nativeEnvironmentalImpacts?.debris(state,piece,oldX,oldY,{sourceKey:wreck.sourceKey});}
      for(const particle of wreck.particles)if(wreck.time>=particle.born){particle.x+=(particle.vx||0)*dt;particle.y+=(particle.vy||0)*dt;}
      prepared.get(wreck.assetKey)?.destruction?.updateTrails(wreck);
      wreck.debris=wreck.debris.filter(piece=>wreck.time-piece.born<piece.ttl);wreck.particles=wreck.particles.filter(particle=>wreck.time-particle.born<particle.ttl);
      if(wreck.time>17000)wrecks.splice(i,1);
    }
    for(const [entity,value] of visuals)if(value.state===state&&value.flash&&time-value.flash.born>=620)visuals.delete(entity);
  }
  function position(descriptor,view){const zoom=view.zoom??1;return {x:view.x??view.cx+(descriptor.x-view.ship.x)*zoom,y:view.y??view.cy+(descriptor.y-view.ship.y)*zoom};}
  function paintSurface(ctx,descriptor,view,{front=false}={}){
    const impact=visuals.get(descriptor.entity)?.flash,time=now(descriptor.state),art=view.asset||asset(descriptor),d=view.dimensions||descriptor.dimensions;
    if(!impact||!art||time-impact.born>=(impact.charge===0?430:620)||view.warpEffect)return;
    const surfaceRadii=window.nativeShipDefinitions.surfaceRadii(d,true,descriptor.definition);
    const p=position(descriptor,view);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(descriptor.heading+Math.PI/2);if(view.zoom!==undefined&&view.zoom!==1)ctx.scale(view.zoom,view.zoom);
    if(front)window.drawShowcaseShieldFlash?.(ctx,art.art,d.width,d.height,impact,time,{surfaceRadii});
    window.drawShowcaseShieldSurface?.(ctx,0,0,d.width,d.height,'#50d5ff',Math.max(.08,impact.charge),time,{front,refract:!front,impact,surfaceRadii});ctx.restore();
  }
  function paintShip(ctx,descriptor,view){
    const art=view.asset||asset(descriptor),d=view.dimensions||descriptor.dimensions,p=position(descriptor,view),warp=view.warpEffect,zoom=view.zoom??1;
    paintSurface(ctx,descriptor,{...view,asset:art},{front:false});
    if(art)window.vexedFlightAssets.drawShip(ctx,art,p.x,p.y,d.width*zoom,warp?.angle??descriptor.heading+Math.PI/2,now(descriptor.state),
      {...warp,height:d.height*zoom,lights:descriptor.entity.phase!=='disabled',damage:true,lightGain:descriptor.category==='player'?2.8:1,lightBloom:descriptor.category==='player'?2.5:1,...view.appearance});
    paintSurface(ctx,descriptor,{...view,asset:art},{front:true});return art;
  }
  function paint(state,ctx,view){
    const time=now(state),visible=point=>point.state===state&&point.system===state.system;
    const zoom=view.zoom??1,onScreen=(point,radius)=>!window.nativeEffectVisibility||window.nativeEffectVisibility.circle(view.cx+(point.x-view.ship.x)*zoom,view.cy+(point.y-view.ship.y)*zoom,radius*zoom,view);
    ctx.save();if(zoom===1)ctx.translate(view.cx-view.ship.x,view.cy-view.ship.y);else{ctx.translate(view.cx,view.cy);ctx.scale(zoom,zoom);ctx.translate(-view.ship.x,-view.ship.y);}
    for(const piece of fragments)if(visible(piece)&&onScreen(piece,Math.hypot(piece.w,piece.h)/2))window.showcaseStageFragments?.draw(ctx,piece,time);
    for(const wreck of wrecks){
      if(!visible(wreck)||!wreck.prepared)continue;const destruction=prepared.get(wreck.assetKey)?.destruction;if(!destruction)continue;
      for(const piece of wreck.debris){if(!onScreen(piece,Math.hypot(piece.w,piece.h)/2+28))continue;ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);
        if(piece.structural)destruction.drawStructuralWreck(ctx,piece,wreck.time);
        else{ctx.drawImage(piece.texture,-piece.w/2,-piece.h/2,piece.w,piece.h);destruction.drawWreckGlow(ctx,piece,wreck.time);}ctx.restore();}
      for(const particle of wreck.particles)if(onScreen(particle,particle.size*4+12))destruction.drawParticle(ctx,particle,wreck.time);
    }
    for(const particle of bursts)if(visible(particle)&&onScreen(particle,(particle.size||0)+2)&&(!view.entity||particle.entity===view.entity))window.showcaseHullBurst?.draw(ctx,particle,time);
    ctx.restore();
  }
  function snapshot(descriptor){const value=descriptor?visuals.get(descriptor.entity):null;return {flash:value?.flash?{...value.flash}:null,particles:bursts.filter(p=>!descriptor||p.entity===descriptor.entity).length};}
  function reset(){visuals.clear();bursts.length=0;fragments.length=0;wrecks.length=0;}
  const ready=(type,category='player')=>Boolean(prepared.get(key(type,category)));
  window.nativeShipEffects=Object.freeze({prepare,ready,asset,hit,visualImpact,advance,paintShip,paintSurface,paint,reset,snapshot});
})();
