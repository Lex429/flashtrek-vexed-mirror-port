/* Common world-target interface. Controllers register consequences, not physics. */
(() => {
  'use strict';
  const kinds=new Map(),rockGeometry=new WeakMap(),cellSize=256;
  const caches=state=>window.nativeSimulationFrame?.cache?.(state)||window.nativeSimulationFrame?.current(state)?.caches;
  const register=(kind,adapter)=>{if(!adapter?.collect||!adapter?.hit)throw Error('A target adapter needs collect and hit');kinds.set(kind,adapter);};
  const idKey=id=>String(id);
  const living=target=>target&&(!target.entity||!(target.entity.hull<=0)&&!['destroyed','warp','arriving'].includes(target.entity.phase)&&(target.entity.system??target.system)===target.system)&&
    (target.category!=='player'||!target.state?.landed&&!window.vexedWarp?.active&&target.state?.system===target.system);
  function rockTarget(state,rock,system){
    const cached=rockGeometry.get(rock);
    if(cached&&['x','y','size','angle','vx','vy','previousX','previousY'].every(key=>cached[key]===rock[key]))return cached.target;
    const old=cached?.target,dimensions=old?.size===rock.size?old.dimensions:{width:rock.size,height:rock.size};
    const target={...rock,id:'rock:'+rock.slotId,rockId:rock.slotId,category:'asteroid',system,heading:rock.angle||0,
      dimensions,radius:rock.size*.43,entity:rock,targetable:true};
    rockGeometry.set(rock,{target,...Object.fromEntries(['x','y','size','angle','vx','vy','previousX','previousY'].map(key=>[key,rock[key]]))});
    if(!old||old.size!==rock.size)window.nativeSimulationFrame?.count(state,'asteroidGeometryBuilds');
    window.nativeSimulationFrame?.count(state,'asteroidDescriptors');return target;
  }
  const rockGone=(state,id)=>state.minedAsteroids?.includes(id)||state.destroyedAsteroids?.includes(id);
  function asteroidTargets(state,system){
    return (window.nativeSolAsteroids?.forSystem?.(system)||(system===1?window.nativeSolAsteroids?.placements:[])||[])
      .filter(rock=>!rockGone(state,rock.slotId)).map(rock=>rockTarget(state,rock,system));
  }
  function collect(state,system=state.system){
    const targets=[];
    for(const [category,adapter] of kinds)for(const target of adapter.collect(state,system)||[])targets.push({...target,category:target.category||category});
    return targets;
  }
  function collectShips(state,system=state.system){
    const frameCache=caches(state),cacheKey='ships:'+system,cached=frameCache?.get(cacheKey);
    if(cached)return cached;
    const targets=[];
    for(const [category,adapter] of kinds)if(category!=='asteroid')for(const target of adapter.collect(state,system)||[])targets.push({...target,category:target.category||category});
    frameCache?.set(cacheKey,targets);
    if(frameCache){const slots=new Map();for(let index=0;index<targets.length;index++){
      const target=targets[index];let categories=slots.get(target.entity);if(!categories)slots.set(target.entity,categories=new Map());categories.set(target.category,index);
    }frameCache.set('shipSlots:'+system,slots);}
    return targets;
  }
  function scene(state,{system=state.system}={}){
    const frameCache=caches(state),cacheKey='targets:'+system,cached=frameCache?.get(cacheKey);
    if(cached)return cached.scene;
    const ships=collectShips(state,system),rocks=asteroidTargets(state,system),targets=[...ships,...rocks];
    const bodies=bodyTargets(state,system);
    const result={state,targets,bystanders:ships,rocks,destructibles:[],bodies,
      querySwept:(from,to,padding=0,{instant=false,horizon=0}={})=>query(state,{system,
        minX:Math.min(from.x,to.x)-padding,minY:Math.min(from.y,to.y)-padding,maxX:Math.max(from.x,to.x)+padding,maxY:Math.max(from.y,to.y)+padding,swept:!instant,predictSeconds:horizon})};
    frameCache?.set(cacheKey,{scene:result,byId:new Map(targets.map(target=>[idKey(target.id),target])),space:null});
    window.nativeSimulationFrame?.count(state,'sceneCollections');
    return result;
  }
  function clearCaches(state,system){
    const frameCache=caches(state);if(!frameCache)return;
    if(system===undefined)frameCache.clear();else{frameCache.delete('targets:'+system);frameCache.delete('ships:'+system);frameCache.delete('shipSlots:'+system);frameCache.delete('spatial:'+system);}
  }
  function invalidate(state,system){
    window.nativeSolAsteroids?.invalidateIndex?.(system);
    clearCaches(state,system);
  }
  // A scene is a live registry view for this integration step. Replace only the
  // changed descriptor; previously returned descriptor snapshots stay immutable.
  function refreshShip(state,entity,category,system=category==='tug'?1:entity.system??state.system,prepared){
    const frameCache=caches(state);if(!frameCache)return;
    const record=frameCache.get('targets:'+system),spaceRecord=frameCache.get('spatial:'+system),ships=frameCache.get('ships:'+system);
    if(!record&&!ships&&!spaceRecord)return;
    const index=frameCache.get('shipSlots:'+system)?.get(entity)?.get(category)??-1;
    if(index<0){clearCaches(state,system);return;}
    const previous=ships[index],builtin=['player','civilian','tug'].includes(category);
    const descriptor=prepared||(builtin?window.nativeShipDefinitions.describe(state,entity,{category}):kinds.get(category)?.resolve?.(state,previous.id,system));
    if(!descriptor){clearCaches(state,system);return;}
    if(!living(descriptor)||descriptor.system!==system||index<0){clearCaches(state,system);return;}
    if(builtin&&['state','id','shipType','system','definition','x','y','heading','speed','vx','vy','previousX','previousY','angularVelocity','hull','shields','dimensions','radius','hullRadii','radii'].every(key=>previous[key]===descriptor[key]))return previous;
    ships[index]=descriptor;
    if(record){record.scene.targets[index]=descriptor;record.byId.set(idKey(descriptor.id),descriptor);
      if(record.space)updateSpatial(record.space,descriptor);
    }
    if(spaceRecord?.space)updateSpatial(spaceRecord.space,descriptor);
    return descriptor;
  }
  function refreshAsteroid(state,rock){
    const frameCache=caches(state),system=rock.system??1,record=frameCache?.get('targets:'+system);
    // Query-only consumers read the existing asteroid index and authoritative
    // pose lazily. Offscreen motion needs no display/collision descriptor until
    // a full scene already retains one or a bounded query actually finds it.
    if(!record)return;
    if(rockGone(state,rock.slotId)){frameCache.delete('targets:'+system);return null;}
    const target=rockTarget(state,rock,system);
    const previous=record.byId.get(idKey(target.id));
    if(previous){record.scene.rocks[record.scene.rocks.indexOf(previous)]=target;record.scene.targets[record.scene.targets.indexOf(previous)]=target;record.byId.set(idKey(target.id),target);}
    else frameCache.delete('targets:'+system);
    return target;
  }
  function extent(target){return Math.max(1,target.radius||15,target.radii?.rx||0,target.radii?.ry||0,target.hullRadii?.rx||0,target.hullRadii?.ry||0);}
  function bounds(target,swept=true,predictSeconds=0){
    const radius=extent(target),x0=swept?(target.previousX??target.x):target.x,y0=swept?(target.previousY??target.y):target.y;
    const x1=target.x+(target.vx||0)*predictSeconds,y1=target.y+(target.vy||0)*predictSeconds;
    return {minX:Math.min(x0,target.x,x1)-radius,minY:Math.min(y0,target.y,y1)-radius,maxX:Math.max(x0,target.x,x1)+radius,maxY:Math.max(y0,target.y,y1)+radius};
  }
  const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
  function cells(box){const minX=Math.floor(box.minX/cellSize),maxX=Math.floor(box.maxX/cellSize),minY=Math.floor(box.minY/cellSize),maxY=Math.floor(box.maxY/cellSize);return {minX,maxX,minY,maxY,count:(maxX-minX+1)*(maxY-minY+1)};}
  function updateSpatial(space,target){
    const id=idKey(target.id),old=space.entries.get(id);
    const box=bounds(target),range=cells(box);
    space.maxVelocity=Math.max(space.maxVelocity,Math.abs(target.vx||0),Math.abs(target.vy||0));
    if(old&&range.minX===old.range.minX&&range.maxX===old.range.maxX&&range.minY===old.range.minY&&range.maxY===old.range.maxY){old.target=target;old.box=box;return;}
    if(old){for(const key of old.cells){const bucket=space.grid.get(key);bucket?.delete(id);if(!bucket?.size)space.grid.delete(key);}space.overflow.delete(id);}
    const entry={target,box,range,cells:[]};space.entries.set(id,entry);
    if(range.count>4096)space.overflow.add(id);
    else for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++){
      const key=x+':'+y;let bucket=space.grid.get(key);if(!bucket)space.grid.set(key,bucket=new Set());bucket.add(id);entry.cells.push(key);
    }
  }
  function spatial(record){
    if(!record.space){record.space={grid:new Map(),entries:new Map(),overflow:new Set(),maxVelocity:0};for(const target of record.scene.bystanders)updateSpatial(record.space,target);}
    return record.space;
  }
  function query(state,{system=state.system,minX,minY,maxX,maxY,swept=true,predictSeconds=0,categories}={}){
    const frameCache=caches(state),cacheKey='spatial:'+system;
    let record=frameCache?.get(cacheKey);if(!record){record={scene:{bystanders:collectShips(state,system)}};frameCache?.set(cacheKey,record);}
    const space=spatial(record);
    const box={minX,minY,maxX,maxY};
    if(![minX,minY,maxX,maxY].every(Number.isFinite))return scene(state,{system});
    predictSeconds=Number.isFinite(Number(predictSeconds))?Math.max(0,Number(predictSeconds)):0;
    const reach=space.maxVelocity*predictSeconds,range=cells({minX:minX-reach,minY:minY-reach,maxX:maxX+reach,maxY:maxY+reach}),ids=new Set(space.overflow);
    if(range.count>4096)for(const id of space.entries.keys())ids.add(id);
    else for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++)for(const id of space.grid.get(x+':'+y)||[])ids.add(id);
    const allowed=categories?new Set(Array.isArray(categories)?categories:[categories]):null,bystanders=[];
    for(const id of ids){const target=space.entries.get(id).target;if((!allowed||allowed.has(target.category))&&living(target)&&intersects(box,bounds(target,swept,predictSeconds)))bystanders.push(target);}
    const asteroids=window.nativeSolAsteroids,nearRocks=allowed&&!allowed.has('asteroid')?[]:asteroids?.queryBounds?asteroids.queryBounds(system,box,{swept,predictSeconds}):asteroids?.forSystem?.(system)||(system===1?asteroids?.placements:[])||[];
    const rocks=[];for(const rock of nearRocks)if(!rockGone(state,rock.slotId)){
      const target=rockTarget(state,rock,system);if(intersects(box,bounds(target,swept,predictSeconds)))rocks.push(target);
    }
    window.nativeSimulationFrame?.count(state,'spatialQueries');window.nativeSimulationFrame?.count(state,'spatialShipCandidates',ids.size);window.nativeSimulationFrame?.count(state,'spatialAsteroidCandidates',nearRocks.length);
    const bodies=bodyTargets(state,system);
    return {state,targets:[...bystanders,...rocks],bystanders,rocks,destructibles:[],bodies,
      querySwept:(from,to,padding=0,{instant=false,horizon=0}={})=>query(state,{system,minX:Math.min(from.x,to.x)-padding,minY:Math.min(from.y,to.y)-padding,maxX:Math.max(from.x,to.x)+padding,maxY:Math.max(from.y,to.y)+padding,swept:!instant,predictSeconds:horizon})};
  }
  function bodyTargets(state,system){
    const frameCache=caches(state),key='bodies:'+system,cached=frameCache?.get(key);if(cached)return cached;
    const bodies=system===1?(window.nativeSystemHub?.sol||[]).filter(body=>body.id!==6).map(body=>({x:body.x-220,y:body.y+75,radius:(window.vexedSolFlight?.bodySize(body)||100)*.44})):[];
    frameCache?.set(key,bodies);return bodies;
  }
  function collisionScene(state,{system=state.system}={}){
    const frameCache=caches(state),key='collision:'+system,cached=frameCache?.get(key);if(cached)return cached;
    const result={state,bystanders:[],rocks:[],destructibles:[],bodies:bodyTargets(state,system),querySwept:(from,to,padding=0,{instant=false,horizon=0}={})=>query(state,{system,minX:Math.min(from.x,to.x)-padding,minY:Math.min(from.y,to.y)-padding,maxX:Math.max(from.x,to.x)+padding,maxY:Math.max(from.y,to.y)+padding,swept:!instant,predictSeconds:horizon})};
    frameCache?.set(key,result);return result;
  }
  function resolve(state,id,system=state.system){
    const frameCache=caches(state);
    // An ID lookup must not prepare a complete asteroid scene to find one ship.
    const key=idKey(id);let entity,category;
    if(key==='player'){entity=state;category='player';if(system!==state.system||state.hull<=0||state.landed||window.vexedWarp?.active)return null;}
    else if(key.startsWith('tug:')){entity=state.solEconomy?.freighters?.find(ship=>idKey(ship.id)===key.slice(4));category='tug';}
    else{entity=state.civilianTraffic?.ships?.find(ship=>idKey(ship.id)===key);category='civilian';}
    if(entity){const target=window.nativeShipDefinitions.describe(state,entity,{category});if(!living(target)||target.system!==system)return null;return refreshShip(state,entity,category,system,target)||target;}
    if(key.startsWith('rock:')){const rock=window.nativeSolAsteroids?.find?.(Number(key.slice(5)),system)||(window.nativeSolAsteroids?.forSystem?.(system)||window.nativeSolAsteroids?.placements||[]).find(rock=>idKey(rock.slotId)===key.slice(5));return rock&&!rockGone(state,rock.slotId)?rockTarget(state,rock,system):null;}
    // Optional category resolvers (including owned repair drones) already know
    // their entities. Consult them before preparing unrelated fleet/rock views.
    for(const [registeredCategory,adapter] of kinds){
      if(!adapter.resolve)continue;
      const resolved=adapter.resolve(state,id,system);if(!resolved||idKey(resolved.id)!==key)continue;
      const target={...resolved,category:resolved.category||registeredCategory,system:resolved.system??resolved.entity?.system??system};
      if(!living(target)||target.system!==system)return null;
      return target.entity?refreshShip(state,target.entity,target.category,system,target)||target:target;
    }
    if(!frameCache)return collect(state,system).find(target=>idKey(target.id)===key)||null;
    scene(state,{system});
    const target=frameCache.get('targets:'+system)?.byId.get(idKey(id));if(!target)return null;
    const targetEntity=target.entity;
    if(target.category==='asteroid')return state.minedAsteroids?.includes(target.rockId)||state.destroyedAsteroids?.includes(target.rockId)?null:target;
    if(targetEntity&&(targetEntity.hull<=0||['destroyed','warp','arriving'].includes(targetEntity.phase)||(targetEntity.system??system)!==system))return null;
    // A resolver's missing result is authoritative, for example a stowed drone;
    // do not fall back to a stale cached descriptor for that category.
    return kinds.get(target.category)?.resolve?null:target;
  }
  // Inspection is a lightweight read model, not collision collection or simulation activation.
  // Categories with transit/dead entities supply inspect; ordinary extensions inherit collect.
  function inspectAll(state){
    if(!state)return [];
    const result=[],seen=new Set();
    for(const [category,adapter] of kinds){
      if(category==='asteroid')continue;
      const entries=adapter.inspect?adapter.inspect(state):
        (window.VexedMirrorWorld.systems||[{id:state.system}]).flatMap(system=>adapter.collect(state,system.id)||[]);
      for(const target of entries||[]){
        const key=String(target.id);if(seen.has(key))continue;seen.add(key);
        result.push({...target,category:target.category||category});
      }
    }
    return result;
  }
  function applyHit(state,result,event,source){
    const collisionTarget=result.target;if(!collisionTarget)return {ok:false};
    // Refresh after every collision: earlier shots may already have destroyed it.
    const target=resolve(state,collisionTarget.id,collisionTarget.system??source.system??state.system);
    if(!target)return {ok:false};
    const impact={from:result.from||result.point,point:result.point,contact:result.contact,collision:result,
      kind:event.kind,weaponEventId:event.id,source:source.id==='player'?'player':'ai',sourceId:source.id};
    const damageResult=kinds.get(target.category)?.hit(state,target,event.damage,impact)||{ok:false};
    if(['player','civilian','tug'].includes(target.category))refreshShip(state,target.entity,target.category,target.system);
    else if(target.category==='asteroid')refreshAsteroid(state,target.entity);
    else if(target.entity)refreshShip(state,target.entity,target.category,target.system);
    else invalidate(state,target.system);return damageResult;
  }
  function visualImpact(state,target,event){return kinds.get(target.category)?.visualImpact?.(state,target,event);}
  function resolved(state,result,event){for(const adapter of kinds.values())adapter.onResolved?.(state,result,event);}
  function applyContact(state,ship,pose){
    const entity=ship.entity,offsetX=ship.category==='player'?ship.x-entity.x:0,offsetY=ship.category==='player'?ship.y-entity.y:0;
    window.nativeShipMotion.applyImpulse(entity,{x:pose.vx-ship.vx,y:pose.vy-ship.vy},window.nativeSimulation.seconds(state),{x:pose.x-ship.x,y:pose.y-ship.y});
    Object.assign(entity,{x:pose.x-offsetX,y:pose.y-offsetY,vx:pose.vx,vy:pose.vy,speed:Math.hypot(pose.vx,pose.vy)});
    if(Number.isFinite(pose.angularVelocity)){
      window.nativeShipMotion.applySpinImpulse(entity,pose.angularVelocity-(ship.angularVelocity||0),window.nativeSimulation.seconds(state),window.nativeShipMotion.wrap(pose.heading-ship.heading));
      if(ship.category==='player')entity.angle=pose.heading;else entity.heading=pose.heading;
    }
    refreshShip(state,entity,ship.category,ship.system);
  }
  function move(state,entity,category,command,profile,dt){
    if(!(dt>0)||window.nativeSimulation.blocked())return {arrived:false,moved:0};
    const descriptor=window.nativeShipDefinitions.describe(state,entity,{category});
    const pose={x:descriptor.x,y:descriptor.y,heading:descriptor.heading,speed:entity.speed||0,
      vx:entity.vx,vy:entity.vy,motionAngularVelocity:entity.motionAngularVelocity,motionKick:entity.motionKick,motionSpin:entity.motionSpin,motionTime:window.nativeSimulation.seconds(state)};
    const origin={x:descriptor.x-entity.x,y:descriptor.y-entity.y};
    profile||=descriptor.definition.movement;
    if(entity.phase==='disabled'||descriptor.definition.engineOnline===false){command={coast:true};profile={maxSpeed:Infinity,turnRate:0,damping:0,inertial:true};}
    command=window.nativeShipTraffic?.steer(state,descriptor,command,profile)||command;
    const result=window.nativeShipMotion.step(pose,command,profile,dt);
    Object.assign(entity,{x:pose.x-origin.x,y:pose.y-origin.y,speed:pose.speed,vx:pose.vx,vy:pose.vy,motionAngularVelocity:pose.motionAngularVelocity,
      previousX:pose.previousX,previousY:pose.previousY,motionKick:pose.motionKick,motionSpin:pose.motionSpin});
    if(category==='player')entity.angle=pose.heading;else entity.heading=pose.heading;
    refreshShip(state,entity,category,descriptor.system);
    return result;
  }
  function player(state,system){
    if(system!==state.system||state.hull<=0||state.landed||window.vexedWarp?.active)return [];
    return [window.nativeShipDefinitions.describe(state,state,{category:'player'})];
  }
  function inspectPlayer(state){
    const cargo=[...Object.entries(state.solFreightHold||{}).filter(([,tons])=>Number(tons)>0).map(([good,tons])=>({good:Number(good),tons:Number(tons)})),
      ...(state.localContracts||[]).map(job=>({good:job.good,tons:job.tons,contractId:job.id,destination:job.to}))];
    return [{...window.nativeShipDefinitions.describe(state,state,{category:'player'}),name:state.shipName||'Player',role:'player',detail:state.hull>0?'detailed':'inactive',faction:state.government||state.faction,credits:Number(state.latinum)||0,cargo}];
  }
  register('player',{collect:player,inspect:inspectPlayer,hit:(state,_,amount,impact)=>window.nativeCombatShots.onPlayerHit?.(state,amount,impact),
    visualImpact:(state,_,event)=>window.nativePlayerCombat.visualImpact(state,event)});
  register('tug',{collect:(state,system)=>system===1?(state.solEconomy?.freighters||[]).filter(ship=>ship.phase!=='destroyed').map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'tug'})):[],
    inspect:state=>window.nativeSolEconomy.lifeDescriptors?.(state)||(state.solEconomy?.freighters||[]).map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'tug'})),
    hit:(state,target,amount,impact)=>window.nativeSolEconomy.hit(state,target.entity.id,amount,impact),
    visualImpact:(state,target,event)=>window.nativeSolEconomy.visualImpact(state,target.entity.id,event)});
  register('civilian',{collect:(state,system)=>(state.civilianTraffic?.ships||[]).filter(ship=>ship.system===system&&!['warp','arriving','destroyed'].includes(ship.phase)).map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'civilian'})),
    inspect:state=>window.nativeNpcLives?.descriptors(state)||(state.civilianTraffic?.ships||[]).map(ship=>window.nativeShipDefinitions.describe(state,ship,{category:'civilian'})),
    hit:(state,target,amount,impact)=>window.nativeCivilianTraffic.hit(state,target.entity.id,amount,impact),
    visualImpact:(state,target,event)=>window.nativeCivilianTraffic.visualImpact(state,target.entity.id,event),
    onResolved(state,result,event){
      const traffic=state.civilianTraffic;
      const conflict=[...(traffic?.disputes||[]),...(traffic?.retaliations||[])].find(record=>record.id===event.owner);
      if(conflict){if(result.kind==='hit')conflict.hits=(conflict.hits||0)+1;else conflict.misses=(conflict.misses||0)+1;}
    }});
  register('asteroid',{collect:asteroidTargets,hit:(state,target,amount,impact)=>window.nativeAsteroidCombat.weaponHit(state,target.rockId,amount,impact)});
  window.nativeShipSystems=Object.freeze({register,registered:()=>[...kinds.keys()],collect,collectShips,scene,collisionScene,query,resolve,applyHit,visualImpact,resolved,move,applyContact,inspectAll,invalidate,invalidateShips:clearCaches,refreshShip,refreshAsteroid});
})();
