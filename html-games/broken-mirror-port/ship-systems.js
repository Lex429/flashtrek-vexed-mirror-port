/* Common world-target interface. Controllers register consequences, not physics. */
(() => {
  'use strict';
  const kinds=new Map();
  const register=(kind,adapter)=>{if(!adapter?.collect||!adapter?.hit)throw Error('A target adapter needs collect and hit');kinds.set(kind,adapter);};
  const idKey=id=>String(id);
  function collect(state,system=state.system){
    const targets=[];
    for(const [category,adapter] of kinds)for(const target of adapter.collect(state,system)||[])targets.push({...target,category:target.category||category});
    return targets;
  }
  function collectShips(state,system=state.system){
    const frame=window.nativeSimulationFrame?.current(state),cacheKey='ships:'+system,cached=frame?.caches.get(cacheKey);
    if(cached)return cached;
    const targets=[];
    for(const [category,adapter] of kinds)if(category!=='asteroid')for(const target of adapter.collect(state,system)||[])targets.push({...target,category:target.category||category});
    if(frame)frame.caches.set(cacheKey,targets);
    return targets;
  }
  function scene(state,{system=state.system}={}){
    const frame=window.nativeSimulationFrame?.current(state),cacheKey='targets:'+system,cached=frame?.caches.get(cacheKey);
    if(cached)return cached.scene;
    const targets=collect(state,system);
    const bodies=system===1?(window.nativeSystemHub?.sol||[]).filter(body=>body.id!==6).map(body=>({x:body.x-220,y:body.y+75,radius:(window.vexedSolFlight?.bodySize(body)||100)*.44})):[];
    const result={state,targets,bystanders:targets.filter(target=>target.category!=='asteroid'),rocks:targets.filter(target=>target.category==='asteroid'),destructibles:[],bodies};
    if(frame)frame.caches.set(cacheKey,{scene:result,byId:new Map(targets.map(target=>[idKey(target.id),target]))});
    window.nativeSimulationFrame?.count(state,'sceneCollections');
    return result;
  }
  function invalidate(state,system){
    const frame=window.nativeSimulationFrame?.current(state);if(!frame)return;
    if(system===undefined)frame.caches.clear();else{frame.caches.delete('targets:'+system);frame.caches.delete('ships:'+system);}
  }
  function resolve(state,id,system=state.system){
    const frame=window.nativeSimulationFrame?.current(state);
    if(!frame)return collect(state,system).find(target=>idKey(target.id)===idKey(id))||null;
    scene(state,{system});
    const target=frame.caches.get('targets:'+system)?.byId.get(idKey(id));if(!target)return null;
    const entity=target.entity;
    if(target.category==='asteroid')return state.minedAsteroids?.includes(target.rockId)||state.destroyedAsteroids?.includes(target.rockId)?null:target;
    if(entity&&(entity.hull<=0||['destroyed','warp','arriving'].includes(entity.phase)||(entity.system??system)!==system))return null;
    if(['player','civilian','tug'].includes(target.category))return window.nativeShipDefinitions.describe(state,entity,{category:target.category});
    return kinds.get(target.category)?.resolve?.(state,id,system)||target;
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
      kind:event.kind,source:source.id==='player'?'player':'ai',sourceId:source.id};
    const damageResult=kinds.get(target.category)?.hit(state,target,event.damage,impact)||{ok:false};
    invalidate(state,target.system);return damageResult;
  }
  function visualImpact(state,target,event){return kinds.get(target.category)?.visualImpact?.(state,target,event);}
  function resolved(state,result,event){for(const adapter of kinds.values())adapter.onResolved?.(state,result,event);}
  function applyContact(state,ship,pose){
    const entity=ship.entity,offsetX=ship.category==='player'?ship.x-entity.x:0,offsetY=ship.category==='player'?ship.y-entity.y:0;
    window.nativeShipMotion.applyImpulse(entity,{x:pose.vx-ship.vx,y:pose.vy-ship.vy},window.nativeSimulation.seconds(state),{x:pose.x-ship.x,y:pose.y-ship.y});
    Object.assign(entity,{x:pose.x-offsetX,y:pose.y-offsetY,vx:pose.vx,vy:pose.vy,speed:Math.hypot(pose.vx,pose.vy)});
    invalidate(state,ship.system);
  }
  function move(state,entity,category,command,profile,dt){
    if(!(dt>0)||window.nativeSimulation.blocked())return {arrived:false,moved:0};
    const descriptor=window.nativeShipDefinitions.describe(state,entity,{category});
    const pose={x:descriptor.x,y:descriptor.y,heading:descriptor.heading,speed:entity.speed||0,
      vx:entity.vx,vy:entity.vy,motionAngularVelocity:entity.motionAngularVelocity,motionKick:entity.motionKick,motionTime:window.nativeSimulation.seconds(state)};
    const origin={x:descriptor.x-entity.x,y:descriptor.y-entity.y};
    profile||=descriptor.definition.movement;
    command=window.nativeShipTraffic?.steer(state,descriptor,command,profile)||command;
    const result=window.nativeShipMotion.step(pose,command,profile,dt);
    Object.assign(entity,{x:pose.x-origin.x,y:pose.y-origin.y,speed:pose.speed,vx:pose.vx,vy:pose.vy,motionAngularVelocity:pose.motionAngularVelocity,
      previousX:pose.previousX,previousY:pose.previousY,motionKick:pose.motionKick});
    if(category==='player')entity.angle=pose.heading;else entity.heading=pose.heading;
    invalidate(state,descriptor.system);
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
  register('asteroid',{collect:(state,system)=>{
    if(system!==1&&!window.nativeSolAsteroids?.forSystem)return [];
    const gone=new Set([...(state.minedAsteroids||[]),...(state.destroyedAsteroids||[])]);
    return (window.nativeSolAsteroids?.forSystem?.(system)||window.nativeSolAsteroids?.placements||[]).filter(rock=>!gone.has(rock.slotId)).map(rock=>({...rock,id:'rock:'+rock.slotId,rockId:rock.slotId,category:'asteroid',system,heading:rock.angle||0,
      dimensions:{width:rock.size,height:rock.size},radius:rock.size*.43,entity:rock,targetable:true}));
  },hit:(state,target,amount,impact)=>window.nativeAsteroidCombat.weaponHit(state,target.rockId,amount,impact)});
  window.nativeShipSystems=Object.freeze({register,registered:()=>[...kinds.keys()],collect,collectShips,scene,resolve,applyHit,visualImpact,resolved,move,applyContact,inspectAll,invalidate});
})();
