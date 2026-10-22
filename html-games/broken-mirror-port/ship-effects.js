/* Shared ship artwork, impacts and destruction. All mutation happens in hit/advance. */
(() => {
  'use strict';
  const prepared=new Map(),pending=new Map(),loading=new Map(),stagePending=new Map(),background=new Map(),visuals=new Map(),bursts=[],fragments=[],wrecks=[],deferredStages=[];
  const limits={entries:12,bytes:64*1024*1024,pending:8,deferredStages:48,backgroundDelayMs:120};
  const counters={loads:0,stageLoads:0,backgroundStages:0,foregroundStages:0,evictions:0,failures:0,optionalWallMs:0,stageGeometryEmissions:0,wreckGeometryEmissions:0,materialBindings:0};
  let backgroundScheduled=false,backgroundActive=false;
  const now=state=>window.nativeSimulation?.now(state)??performance.now();
  const key=type=>`${Number(type)}:shared`;
  const units=()=>window.showcaseWeaponAppearance?.units??.91976;
  const fragmentBytes=value=>(value||[]).reduce((total,stage)=>total+stage.reduce((sum,piece)=>sum+(piece.texture?.width||0)*(piece.texture?.height||0)*4+(window.wreckageEffects?.memoryBytes(piece.texture)||0),0),0);
  const assetBytes=value=>value.assets.reduce((sum,asset)=>sum+(asset?.width||0)*(asset?.height||0)*4,0)+fragmentBytes(value.fragments)+(value.destruction?.memoryBytes?.()||0);
  function prune(){
    let bytes=0;for(const entry of prepared.values())bytes+=assetBytes(entry);
    for(const [cacheKey,value] of prepared){if(prepared.size<=limits.entries&&bytes<=limits.bytes)break;
      if(pending.has(cacheKey)||loading.has(cacheKey))continue;prepared.delete(cacheKey);background.delete(cacheKey);bytes-=assetBytes(value);counters.evictions++;}
  }
  function remember(cacheKey,value){prepared.delete(cacheKey);prepared.set(cacheKey,value);prune();return value;}
  const worldPoint=(descriptor,local)=>window.nativeCombatShots.worldPoint?window.nativeCombatShots.worldPoint(descriptor,local):{
    x:descriptor.x+local.x*Math.cos(descriptor.heading+Math.PI/2)-local.y*Math.sin(descriptor.heading+Math.PI/2),
    y:descriptor.y+local.x*Math.sin(descriptor.heading+Math.PI/2)+local.y*Math.cos(descriptor.heading+Math.PI/2)};
  const newData=()=>({assets:[],fragments:null,destruction:null,optionalReady:false});
  function valueFor(cacheKey){return prepared.get(cacheKey)||loading.get(cacheKey)||newData();}
  function stageRequest(type,category,stage,value,{backgroundWork=false,visible=false}={}){
    if(value.assets[stage])return Promise.resolve(visible?(window.vexedFlightAssets?.retainShip?.(value.assets[stage],{markVisible:true})||value.assets[stage]):value.assets[stage]);
    const cacheKey=key(type,category),stageKey=cacheKey+':'+stage;
    if(stagePending.has(stageKey)){const promise=stagePending.get(stageKey).promise;return visible?promise.then(asset=>window.vexedFlightAssets?.retainShip?.(asset,{markVisible:true})||asset):promise;}
    if(!window.vexedFlightAssets?.loadShip)return Promise.resolve(null);
    loading.set(cacheKey,value);counters.stageLoads++;counters[backgroundWork?'backgroundStages':'foregroundStages']++;
    const definition=window.nativeShipDefinitions.get(type,category),maximum=definition.hull||100;
    const promise=window.vexedFlightAssets.loadShip(type,maximum*[1,.7,.4,.1][stage],{showcase:definition.artwork.source==='showcase',visible})
      .then(asset=>{value.assets[stage]=asset;remember(cacheKey,value);return asset;})
      .finally(()=>{stagePending.delete(stageKey);if(![...stagePending.values()].some(job=>job.cacheKey===cacheKey))loading.delete(cacheKey);prune();});
    stagePending.set(stageKey,{promise,cacheKey,backgroundWork});return promise;
  }
  function scheduleBackground(){
    if(backgroundScheduled||backgroundActive||!background.size)return;
    const schedule=(typeof setTimeout==='function')?callback=>setTimeout(()=>{
      if(window.requestIdleCallback)window.requestIdleCallback(callback,{timeout:500});else callback();
    },limits.backgroundDelayMs):null;
    if(!schedule)return; // Synchronous showcase/Node fixtures explicitly call prepare.
    backgroundScheduled=true;schedule(()=>{backgroundScheduled=false;pumpBackground();});
  }
  function pumpBackground(){
    if(backgroundActive||!background.size)return;
    // Current appearances outrank optional stages. A stage already in progress
    // shares the cooperative pixel queue, rather than starting another worker.
    if([...stagePending.values()].some(job=>!job.backgroundWork)){scheduleBackground();return;}
    const [cacheKey,job]=background.entries().next().value;
    if(prepared.get(cacheKey)!==job.value||pending.has(cacheKey)){background.delete(cacheKey);scheduleBackground();return;}
    const next=[0,1,2,3].find(index=>!job.value.assets[index]);
    if(next===undefined){background.delete(cacheKey);scheduleBackground();return;}
    backgroundActive=true;
    stageRequest(job.type,job.category,next,job.value,{backgroundWork:true}).catch(()=>{counters.failures++;background.delete(cacheKey);})
      .finally(()=>{backgroundActive=false;if(job.value.assets.filter(Boolean).length===4)background.delete(cacheKey);scheduleBackground();});
  }
  function deferStages(type,category,value){
    const cacheKey=key(type,category);if(pending.has(cacheKey)||value.assets.filter(Boolean).length===4)return;
    // The same retention limit bounds deferred appearances; evicted classes
    // cannot keep preparing invisible damage art in the background.
    background.set(cacheKey,{type,category,value});scheduleBackground();
  }
  function request(type,category='player',{stage=0,visible=false}={}){
    stage=Math.max(0,Math.min(3,Math.floor(stage)||0));const cacheKey=key(type,category),value=valueFor(cacheKey);
    if(!value.assets[stage]&&!loading.has(cacheKey)&&loading.size>=limits.pending)return Promise.resolve(null);
    const promise=stageRequest(type,category,stage,value,{visible});
    promise.then(asset=>{if(asset)deferStages(type,category,value);},()=>{counters.failures++;});
    return promise;
  }
  function prepare(type,category='player',{stage=0}={}){
    const cacheKey=key(type,category);
    if(pending.has(cacheKey))return pending.get(cacheKey);
    if(prepared.get(cacheKey)?.optionalReady)return Promise.resolve(prepared.get(cacheKey));
    if(pending.size>=limits.pending)return Promise.resolve(null);
    if(!window.vexedFlightAssets?.loadShip)return Promise.resolve(null);
    const value=valueFor(cacheKey);counters.loads++;background.delete(cacheKey);
    stage=Math.max(0,Math.min(3,Math.floor(stage)||0));
    // The requested plate is published before unused damage stages compete for
    // alignment and lamp preparation. Explicit full preparation keeps its old
    // promise contract for fragments, wrecks and inspection tools.
    const first=stageRequest(type,category,stage,value);
    const promise=first.then(()=>Promise.all([0,1,2,3].map(index=>stageRequest(type,category,index,value)))).then(async assets=>{
      const profile=assets[0]?.profile,art=assets.map(asset=>asset.art);
      const started=performance.now(),jobs=[];
      if(profile?.breakAnchors&&window.showcaseStageFragments){const api=window.showcaseStageFragments;
        jobs.push(Promise.resolve(api.prepareAsync?api.prepareAsync(art,profile.breakAnchors):api.prepare(art,profile.breakAnchors)).then(fragments=>{value.fragments=fragments;}));}
      if(profile?.destruction&&window.createShipDestruction){const destruction=window.createShipDestruction();
        jobs.push(Promise.resolve(destruction.prepareAsync?destruction.prepareAsync(art,profile.destruction):destruction.prepare(art,profile.destruction)).then(()=>{value.destruction=destruction;}));}
      await Promise.all(jobs);value.optionalReady=true;counters.optionalWallMs+=performance.now()-started;remember(cacheKey,value);return value;
    }).catch(error=>{counters.failures++;console.warn('Ship damage artwork unavailable',type,error);return value.assets.some(Boolean)?value:null;}).finally(()=>{pending.delete(cacheKey);prune();scheduleBackground();});
    pending.set(cacheKey,promise);return promise;
  }
  function data(descriptor){const cacheKey=key(descriptor.shipType,descriptor.category),value=prepared.get(cacheKey);if(value){prepared.delete(cacheKey);prepared.set(cacheKey,value);}return value;}
  function asset(descriptor){
    if(descriptor.definition.renderer)return null;
    const ready=data(descriptor),stage=window.nativeShipDefinitions.stage(descriptor),loader=window.vexedFlightAssets;
    // Optional fragments/wreck data has a deliberately small class LRU. Its
    // eviction must not blank a fleet whose base appearances are still owned
    // by the shared asset cache. Lookup is synchronous and hull/stage keyed.
    const exact=ready?.assets[stage]||loader?.peekShip?.(descriptor.shipType,stage);
    if(!exact)request(descriptor.shipType,descriptor.category,{stage,visible:true});
    const art=exact||ready?.assets[0]||ready?.assets.find(Boolean)||loader?.peekShip?.(descriptor.shipType,stage,{fallback:true})||null;
    if(art)loader?.retainShip?.(art,{markVisible:true});
    return art;
  }
  function visual(state,descriptor){
    let value=visuals.get(descriptor.entity);
    if(!value){value={state,descriptor,flash:null,contact:null};visuals.set(descriptor.entity,value);}
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
      kind:event.kind||'beam',weaponEventId:event.weaponEventId,energy:event.energy??1+Math.min(.55,absorbed/Math.max(1,absorbed+descriptor.entity.shields)*.7),charge,color:'#50d5ff'};
  }
  function visualImpact(state,descriptor,event={}){
    if(!descriptor?.entity||descriptor.entity.hull<=0||descriptor.entity.phase==='destroyed'||descriptor.system!==state.system)return;
    if(event.physicalContact){
      const contact=window.nativeShipDamage.collision(descriptor,event,false),value=visual(state,descriptor),time=now(state);
      if(!value.contact||time-value.contact.born>=160)value.contact={born:time,x:contact.local.x,y:contact.local.y,
        kind:event.kind,energy:Math.max(.1,Math.min(1,event.energy??.5)),shielded:descriptor.entity.shields>0};
      return {ok:true,shields:descriptor.entity.shields,hull:descriptor.entity.hull,contact};
    }
    const shielded=descriptor.entity.shields>0,contact=window.nativeShipDamage.collision(descriptor,event,shielded);
    if(shielded)flash(state,descriptor,contact,{...event,kind:event.kind||'debris'});
    else burst(state,descriptor,contact.world,event.energy||.65,true);
    return {ok:true,shields:descriptor.entity.shields,hull:descriptor.entity.hull,contact};
  }
  function emitWreck(wreck){
    const preparedData=effectArtwork(wreck),topology=wreck.geometry?.wrecks?.[wreck.stage],destruction=topology?window.cthiaDestruction:preparedData?.destruction;
    if(wreck.prepared)return;
    if(wreck.geometry&&!topology){wreck.prepared=true;return true;}
    if(!destruction)return;
    const {descriptor}=wreck,d=descriptor.dimensions;
    const elapsed=wreck.time;wreck.time=0;
    destruction.emit(wreck,{x:wreck.x,y:wreck.y,w:d.width,h:d.height},piece=>worldPoint(descriptor,{x:piece.x*d.width,y:piece.y*d.height}),wreck.stage,1,null,topology||null);
    wreck.time=elapsed;wreck.artwork=preparedData;
    for(let index=0;index<wreck.debris.length;index++){const piece=wreck.debris[index];piece.system=wreck.system;piece.sourceKey=wreck.sourceKey;piece.geometryPart=index;
      if(elapsed>0)piece.pendingSweep={x:piece.x,y:piece.y};
      piece.x+=piece.vx*elapsed/1000;piece.y+=piece.vy*elapsed/1000;piece.angle+=piece.spin*elapsed/1000;}
    for(const particle of wreck.particles){const age=Math.max(0,elapsed-particle.born)/1000;particle.x+=(particle.vx||0)*age;particle.y+=(particle.vy||0)*age;}
    wreck.prepared=true;if(topology)counters.wreckGeometryEmissions++;
    bindWreckArtwork(wreck);
    return true;
  }
  function effectArtwork(event){
    const cached=prepared.get(event.assetKey||key(event.descriptor.shipType,event.descriptor.category));
    if(!event.artwork?.optionalReady&&cached?.optionalReady)event.artwork=cached;
    return event.artwork;
  }
  function bindWreckArtwork(wreck){
    const artwork=effectArtwork(wreck);if(!artwork?.destruction||wreck.boundArtwork===artwork)return;
    const pieces=artwork.destruction.serialized?.()[wreck.stage]?.pieces;if(!pieces)return;
    for(let index=0;index<wreck.debris.length;index++){
      const piece=wreck.debris[index],source=pieces[piece.geometryPart??index];if(!source)continue;
      // Never replace authoritative geometry, velocity, age or collision state
      // when a native surface becomes available.
      for(const field of ['texture','lit','edge','hot','side'])if(source[field])piece[field]=source[field];
      counters.materialBindings++;
    }
    wreck.boundArtwork=artwork;
  }
  function bindFragmentArtwork(piece){
    if(piece.texture||!piece.artworkSource)return;
    const source=piece.artworkSource;bindEventFragments(source,effectArtwork(source));
    if(!piece.texture&&piece.artworkSource)requestVisibleArtwork(source);
  }
  function bindEventFragments(event,artwork){
    const pieces=event.materialPieces;if(!pieces)return;
    const expired=now(event.state)-event.time>=4200;let waiting=0;
    for(const piece of pieces){
      const texture=artwork?.fragments?.[piece.geometryStage]?.[piece.geometryPart]?.texture;
      if(texture||expired){if(texture&&!expired){piece.texture=texture;counters.materialBindings++;}delete piece.artworkSource;}
      else pieces[waiting++]=piece;
    }
    pieces.length=waiting;
    // Live chips retain only their required native surfaces, not all four
    // hull plates and every wreck material after optional-cache eviction.
    if(!waiting){event.materialPieces=null;event.artwork=null;}
  }
  function requestVisibleArtwork(event){
    if(!event.artworkRequested&&(!window.nativeSimulationFrame||window.nativeSimulationFrame.take(event.state,'damageArtAdmissions',1)))requestArtwork(event);
  }
  function requestArtwork(event){
    if(event.artwork?.optionalReady||event.artworkRequested)return;
    event.artworkRequested=true;
    prepare(event.descriptor.shipType,event.descriptor.category,{stage:window.nativeShipDefinitions.stage(event.descriptor)}).then(artwork=>{if(artwork){event.artwork=artwork;if(event.geometry&&event.materialPieces)bindEventFragments(event,artwork);}}).finally(()=>{event.artworkRequested=false;});
  }
  function retryArtwork(state,dt,time){
    if(pending.size>=limits.pending)return;
    const available=event=>!event.geometry&&event.state===state&&!event.artwork?.optionalReady&&!event.artworkRequested;
    const event=wrecks.find(event=>available(event)&&event.time+dt*1000<17000)||deferredStages.find(event=>available(event)&&time-event.time<4200);
    if(event&&(!window.nativeSimulationFrame||window.nativeSimulationFrame.take(state,'damageArtAdmissions',1)))requestArtwork(event);
  }
  function emitStage(event){
    const {state,descriptor,before,after,time}=event,artwork=effectArtwork(event),topology=event.geometry?.fragments,material=topology||artwork?.fragments;if(!material)return false;
    const d=descriptor.dimensions,first=fragments.length;
    window.showcaseStageFragments.emit({debris:fragments,fragments:material,before,after,
      layout:{x:descriptor.x,y:descriptor.y,w:d.width,h:d.height},world:piece=>worldPoint(descriptor,{x:piece.x*d.width,y:piece.y*d.height}),
      angle:descriptor.heading+Math.PI/2,time,zoom:1,burst:(point,strength,sparksOnly)=>burst(state,descriptor,point,strength,sparksOnly)});
    const elapsed=Math.max(0,now(state)-time)/1000;
    let stage=before+1,part=0;if(topology)event.materialPieces=[];
    for(let i=first;i<fragments.length;i++){const piece=fragments[i];Object.assign(piece,{state,system:descriptor.system,sourceKey:descriptor.category==='player'?'ship:player':`ship:${descriptor.category}:${descriptor.entity.id}`,updatedAt:now(state)});
      if(topology){while(stage<=after&&part>=topology[stage].length){stage++;part=0;}piece.geometryStage=stage;piece.geometryPart=part++;piece.texture=artwork?.fragments?.[stage]?.[piece.geometryPart]?.texture;if(!piece.texture){piece.artworkSource=event;event.materialPieces.push(piece);}}
      if(elapsed){piece.pendingSweep={x:piece.x,y:piece.y};window.showcaseStageFragments.update(piece,elapsed);}}
    if(topology)counters.stageGeometryEmissions++;
    return true;
  }
  function hit(state,descriptor,result,event={}){
    if(!result?.ok||!(result.amount>0))return result;
    if(result.destroyed)window.nativeShipRepairs?.destroyed(state,descriptor.entity,descriptor.category);
    if(descriptor.definition.renderer){descriptor.definition.renderer.hit?.(state,descriptor,result,event);return result;}
    if(descriptor.system===state.system){
      if(result.absorbed>0)flash(state,descriptor,result.contacts.shield,event,result.absorbed);
      if(result.hullDamage>0){
        burst(state,descriptor,result.contacts.hull.world);
        const ready=data(descriptor);
        if(!result.destroyed&&result.afterStage>result.beforeStage){
          const event={state,descriptor:{...descriptor,dimensions:{...descriptor.dimensions}},geometry:descriptor.definition.debrisGeometry,artwork:ready,before:result.beforeStage,after:result.afterStage,time:now(state)};
          if(!emitStage(event)){deferredStages.push(event);if(deferredStages.length>limits.deferredStages)deferredStages.shift();
            requestArtwork(event);}
        }
      }
    }
    if(result.destroyed){
      if(!descriptor.definition.debrisGeometry)prepare(descriptor.shipType,descriptor.category,{stage:result.beforeStage});
      const sourceKey=descriptor.category==='player'?'ship:player':`ship:${descriptor.category}:${descriptor.entity.id}`;
      const wreck={state,descriptor,assetKey:key(descriptor.shipType,descriptor.category),system:descriptor.system,x:descriptor.x,y:descriptor.y,
        angle:descriptor.heading+Math.PI/2,stage:result.beforeStage,time:0,debris:[],particles:[],prepared:false,sourceKey,geometry:descriptor.definition.debrisGeometry,artwork:data(descriptor)};
      if(!wreck.geometry)requestArtwork(wreck);
      wrecks.push(wreck);if(wrecks.length>36)wrecks.shift();emitWreck(wreck);
      window.nativeEnvironmentalImpacts?.explode(state,{...descriptor.entity,x:descriptor.x,y:descriptor.y,system:descriptor.system,size:Math.max(descriptor.dimensions.width,descriptor.dimensions.height)},{sourceKey});
    }
    return result;
  }
  function advance(state,dt){
    if(!(dt>0)||window.nativeSimulation?.blocked?.())return;
    const time=now(state);
    retryArtwork(state,dt,time);
    for(let i=deferredStages.length-1;i>=0;i--){const event=deferredStages[i];if(event.state===state&&(time-event.time>=4200||emitStage(event)))deferredStages.splice(i,1);}
    for(const piece of fragments)if(piece.state===state&&time>=piece.born){
      const oldX=piece.pendingSweep?.x??piece.x,oldY=piece.pendingSweep?.y??piece.y,elapsed=Math.min(dt,Math.max(0,time-(piece.updatedAt??time-dt*1000))/1000);window.showcaseStageFragments?.update(piece,elapsed);piece.updatedAt=time;delete piece.pendingSweep;
      if(piece.system===state.system)window.nativeEnvironmentalImpacts?.debris(state,piece,oldX,oldY,{sourceKey:piece.sourceKey,dt:elapsed});
    }
    for(let i=fragments.length-1;i>=0;i--)if(fragments[i].state===state&&time-fragments[i].born>=fragments[i].ttl)fragments.splice(i,1);
    for(const particle of bursts)if(particle.state===state&&time>=particle.born)window.showcaseHullBurst?.update(particle,dt);
    for(let i=bursts.length-1;i>=0;i--)if(bursts[i].state===state&&time-bursts[i].born>=bursts[i].ttl)bursts.splice(i,1);
    for(let i=wrecks.length-1;i>=0;i--){
      const wreck=wrecks[i];if(wreck.state!==state)continue;wreck.time+=dt*1000;const elapsed=emitWreck(wreck)?0:dt;
      for(const piece of wreck.debris){const oldX=piece.pendingSweep?.x??piece.x,oldY=piece.pendingSweep?.y??piece.y;delete piece.pendingSweep;piece.x+=piece.vx*elapsed;piece.y+=piece.vy*elapsed;piece.angle+=piece.spin*elapsed;
        if(wreck.system===state.system)window.nativeEnvironmentalImpacts?.debris(state,piece,oldX,oldY,{sourceKey:wreck.sourceKey,dt:elapsed});}
      for(const particle of wreck.particles)if(wreck.time>=particle.born){particle.x+=(particle.vx||0)*elapsed;particle.y+=(particle.vy||0)*elapsed;}
      ((wreck.artwork||prepared.get(wreck.assetKey))?.destruction||(wreck.geometry?window.cthiaDestruction:null))?.updateTrails(wreck);
      wreck.debris=wreck.debris.filter(piece=>wreck.time-piece.born<piece.ttl);wreck.particles=wreck.particles.filter(particle=>wreck.time-particle.born<particle.ttl);
      if(wreck.time>17000)wrecks.splice(i,1);
    }
    for(const [entity,value] of visuals)if(value.state===state){
      if(value.flash&&time-value.flash.born>=(window.vexedShieldGPU?.available?900:620))value.flash=null;
      if(value.contact&&time-value.contact.born>=180)value.contact=null;
      if(!value.flash&&!value.contact)visuals.delete(entity);
    }
  }
  function position(descriptor,view){const zoom=view.zoom??1;return {x:view.x??view.cx+(descriptor.x-view.ship.x)*zoom,y:view.y??view.cy+(descriptor.y-view.ship.y)*zoom};}
  function paintSurface(ctx,descriptor,view,{front=false}={}){
    descriptor=window.nativeSimulationFrame?.renderPose?.(descriptor.state,descriptor)||descriptor;
    const value=visuals.get(descriptor.entity),contact=value?.contact,time=now(descriptor.state),d=view.dimensions||descriptor.dimensions;
    let impact=value?.flash;
    // The hot contact of a still-visible beam uses the same pure line query as
    // the beam. The saved flash remains a historical effect after it fades out.
    if(impact?.kind==='beam'&&impact.weaponEventId!=null){
      const current=window.nativeCombatShots.beamContactFor?.(descriptor.state,impact.weaponEventId,descriptor.id,{render:true});
      if(current?.shielded)impact={...impact,x:current.local.x,y:current.local.y,dx:current.dx,dy:current.dy};
    }
    const shield=impact&&time-impact.born<(impact.charge===0?430:window.vexedShieldGPU?.available?900:620),touch=front&&contact&&time-contact.born<180;
    if((!shield&&!touch)||view.warpEffect)return;
    const gpuShield=shield&&window.vexedShieldGPU?.submit(ctx,descriptor,view,impact,time,{front});
    const p=position(descriptor,view);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(descriptor.heading+Math.PI/2);if(view.zoom!==undefined&&view.zoom!==1)ctx.scale(view.zoom,view.zoom);
    if(shield&&!gpuShield){
      const art=view.asset||asset(descriptor),surfaceRadii=window.nativeShipDefinitions.surfaceRadii(d,true,descriptor.definition);
      if(art){
        if(front)window.drawShowcaseShieldFlash?.(ctx,art.art,d.width,d.height,impact,time,{surfaceRadii});
        window.drawShowcaseShieldSurface?.(ctx,0,0,d.width,d.height,'#50d5ff',Math.max(.08,impact.charge),time,{front,refract:!front,impact,surfaceRadii});
      }
    }
    if(touch){
      const fade=Math.max(0,1-(time-contact.born)/180),matrix=ctx.getTransform(),scale=Math.max(.001,Math.hypot(matrix.a,matrix.b)),radius=Math.min(2+contact.energy*3,3/scale);
      ctx.globalAlpha*=fade*.65;ctx.fillStyle=contact.shielded?'#b4ecff':'#ffd8a1';
      ctx.beginPath();ctx.arc(contact.x,contact.y,radius,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function paintShip(ctx,descriptor,view){
    descriptor=window.nativeSimulationFrame?.renderPose?.(descriptor.state,descriptor)||descriptor;
    // Visibility is presentation-only. Do this before custom renderers, artwork
    // requests or repair compositing; offscreen mechanics continue in advance.
    if(window.nativeEffectVisibility?.ship&&!window.nativeEffectVisibility.ship(descriptor,view))return null;
    if(descriptor.definition.renderer){window.nativeShipSpriteCache?.flush?.(ctx);return descriptor.definition.renderer.draw(ctx,descriptor,view);}
    let art=view.asset||asset(descriptor);
    if(descriptor.entity.phase==='disabled'&&window.nativeRepairVisuals){
      const ready=data(descriptor),loader=window.vexedFlightAssets,plates=ready?.assets.slice()||[],
        required=window.nativeRepairVisuals.requiredStages?.(descriptor)||[0,3];
      // Blending needs source plates, not optional fragments/wreck data. The
      // shared loader can retain these even after its class leaves that LRU.
      for(const stage of required){
        plates[stage]||=loader?.peekShip?.(descriptor.shipType,stage);
        if(plates[stage])loader?.retainShip?.(plates[stage],{markVisible:true});
        else request(descriptor.shipType,descriptor.category,{stage,visible:true});
      }
      if(required.every(stage=>plates[stage]))art=window.nativeRepairVisuals.surface(descriptor,plates,art);
    }
    const d=view.dimensions||descriptor.dimensions,p=position(descriptor,view),warp=view.warpEffect,zoom=view.zoom??1;
    const impact=visuals.get(descriptor.entity),barrier=Boolean(view.warpEffect||art?.repairSurface||impact?.flash||impact?.contact);
    if(barrier)window.nativeShipSpriteCache?.flush?.(ctx);
    paintSurface(ctx,descriptor,{...view,asset:art},{front:false});
    if(art)window.vexedFlightAssets.drawShip(ctx,art,p.x,p.y,d.width*zoom,warp?.angle??descriptor.heading+Math.PI/2,now(descriptor.state),
      {...warp,height:d.height*zoom,lights:descriptor.entity.phase!=='disabled',damage:!art.repairSurface,lightGain:2.8,lightBloom:2.5,effectRate:descriptor.category==='player'?60:20,
        light:window.vexedSpace?.light,...view.appearance,owner:descriptor.entity,canvasOnly:barrier});
    paintSurface(ctx,descriptor,{...view,asset:art},{front:true});return art;
  }
  function paint(state,ctx,view){
    const time=now(state),visible=point=>point.state===state&&point.system===state.system;
    const zoom=view.zoom??1,onScreen=(point,radius)=>!window.nativeEffectVisibility||window.nativeEffectVisibility.circle(view.cx+(point.x-view.ship.x)*zoom,view.cy+(point.y-view.ship.y)*zoom,radius*zoom,view);
    ctx.save();if(zoom===1)ctx.translate(view.cx-view.ship.x,view.cy-view.ship.y);else{ctx.translate(view.cx,view.cy);ctx.scale(zoom,zoom);ctx.translate(-view.ship.x,-view.ship.y);}
    for(const piece of fragments)if(visible(piece)&&onScreen(piece,Math.hypot(piece.w,piece.h)/2+52)){bindFragmentArtwork(piece);if(piece.texture)window.showcaseStageFragments?.draw(ctx,piece,time);}
    for(const wreck of wrecks){
      if(!visible(wreck)||!wreck.prepared)continue;let destruction=(wreck.artwork||prepared.get(wreck.assetKey))?.destruction||(wreck.geometry?window.cthiaDestruction:null);if(!destruction)continue;
      for(const piece of wreck.debris){if(!onScreen(piece,Math.hypot(piece.w,piece.h)/2+52))continue;ctx.save();ctx.translate(piece.x,piece.y);ctx.rotate(piece.angle);
        bindWreckArtwork(wreck);if(!piece.texture)requestVisibleArtwork(wreck);
        if(piece.texture){if(piece.structural)destruction.drawStructuralWreck(ctx,piece,wreck.time);
        else{destruction.drawWreckSurface(ctx,piece,wreck.time);destruction.drawWreckGlow(ctx,piece,wreck.time);}}ctx.restore();}
      for(const particle of wreck.particles)if(onScreen(particle,particle.size*4+12))destruction.drawParticle(ctx,particle,wreck.time);
    }
    for(const particle of bursts)if(visible(particle)&&onScreen(particle,(particle.size||0)+2)&&(!view.entity||particle.entity===view.entity))window.showcaseHullBurst?.draw(ctx,particle,time);
    ctx.restore();
  }
  function snapshot(descriptor){const value=descriptor?visuals.get(descriptor.entity):null;return {flash:value?.flash?{...value.flash}:null,contact:value?.contact?{...value.contact}:null,particles:bursts.filter(p=>!descriptor||p.entity===descriptor.entity).length};}
  function reset(){visuals.clear();bursts.length=0;fragments.length=0;wrecks.length=0;deferredStages.length=0;window.vexedShieldGPU?.reset();}
  function metrics(){const values=new Set([...prepared.values(),...wrecks.map(wreck=>wreck.artwork).filter(Boolean),...deferredStages.map(event=>event.artwork).filter(Boolean),...fragments.map(piece=>piece.artworkSource?.artwork).filter(Boolean)]);
    let bytes=0;for(const value of values)bytes+=assetBytes(value);
    const countedTextures=new Set();for(const value of values)for(const stage of value.fragments||[])for(const piece of stage)if(piece.texture)countedTextures.add(piece.texture);
    let liveFragmentBytes=0;for(const piece of fragments)if(piece.texture&&!countedTextures.has(piece.texture)){countedTextures.add(piece.texture);liveFragmentBytes+=piece.texture.width*piece.texture.height*4+(window.wreckageEffects?.memoryBytes(piece.texture)||0);}bytes+=liveFragmentBytes;
    const profiles=Array.from(window.starterShips?.values?.()||[]).map(profile=>profile.effects?.preparationMetrics?.()).filter(Boolean);
    return {...counters,entries:prepared.size,pending:new Set([...pending.keys(),...loading.keys(),...background.keys()]).size,foregroundPending:loading.size,
      backgroundPending:background.size,backgroundActive,bytes,liveFragmentBytes,cacheBytes:[...prepared.values()].reduce((n,value)=>n+assetBytes(value),0),
      optionalReady:[...prepared.values()].filter(value=>value.optionalReady).length,deferredStages:deferredStages.length,physicalFragments:fragments.length,wrecks:wrecks.length,wreckPieces:wrecks.reduce((n,wreck)=>n+wreck.debris.length,0),limits:{...limits},
      profileLamps:{registeredProfiles:profiles.length,frames:profiles.reduce((n,p)=>n+p.frames,0),maxFramesPerProfile:4,bytes:profiles.reduce((n,p)=>n+p.bytes,0)},
      preparation:window.nativeDamageArtPreparation?.snapshot?.()||null};}
  const ready=(type,category='player')=>Boolean(prepared.get(key(type,category))?.assets.some(Boolean));
  const optionalReady=(type,category='player')=>Boolean(prepared.get(key(type,category))?.optionalReady);
  window.nativeShipEffects=Object.freeze({prepare,request,ready,optionalReady,asset,hit,visualImpact,advance,paintShip,paintSurface,paint,reset,snapshot,metrics});
})();
