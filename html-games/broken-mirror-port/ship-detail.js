/* One simulation boundary, independent of rendering and map visibility.
   Expanded worlds keep the player's chunk and its neighbors physically active;
   distant ordinary journeys retain the existing saved event/route owners. */
(() => {
  'use strict';
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const regions=new WeakMap();
  function region(state){
    const policy=window.nativeCivilianPopulation?.simulation;
    if(!state||!policy||!(state.civilianTraffic?.population?.version>=1))return null;
    const player=state.system===1?window.vexedSolFlight?.shipPosition(state)||state:state;
    if(!point(player))return null;
    const size=policy.chunkSize,buffer=policy.buffer,x=Math.floor(player.x/size),y=Math.floor(player.y/size),old=regions.get(state);
    if(old&&old.system===state.system&&old.chunkX===x&&old.chunkY===y&&old.chunkSize===size&&old.buffer===buffer)return old;
    const value=Object.freeze({version:policy.version,system:state.system,chunkX:x,chunkY:y,chunkSize:size,buffer,
      minX:(x-buffer)*size,minY:(y-buffer)*size,maxX:(x+buffer+1)*size,maxY:(y+buffer+1)*size,generation:(old?.generation||0)+1});
    regions.set(state,value);return value;
  }
  function radius(state){const active=region(state);if(active)return active.chunkSize*(active.buffer+1)*Math.SQRT2;const value=Number(state?.civilianTraffic?.life?.config?.detailedRadius);return Number.isFinite(value)&&value>0?value:6500;}
  function bounds(state){
    const active=region(state);if(active)return active;
    const player=state.system===1?window.vexedSolFlight?.shipPosition(state)||state:state,r=radius(state);
    return {system:state.system,minX:player.x-r,minY:player.y-r,maxX:player.x+r,maxY:player.y+r};
  }
  function contains(state,location,system=location?.system??state.system,padding=0){
    const active=region(state);if(!active)return true;
    return system===active.system&&point(location)&&location.x+padding>=active.minX&&location.y+padding>=active.minY&&location.x-padding<=active.maxX&&location.y-padding<=active.maxY;
  }
  function pose(state,target,{category=target?.category,pose:provided}={}){
    if(point(provided))return provided;
    const entity=target?.entity||target;
    if(entity===state||category==='player')return state.system===1?window.vexedSolFlight?.shipPosition(state)||state:state;
    if(category==='tug'&&entity?.lifeLeg){const result={...entity};window.nativeShipMotion.sampleLeg(result,entity.lifeLeg,Math.min(window.nativeSimulation.seconds(state),entity.lifeEventAt));return result;}
    if(entity?.localLeg&&window.nativeNpcLives?.pose)return window.nativeNpcLives.pose(state,entity);
    return entity;
  }
  function isDetailed(state,target,options={}){
    const entity=target?.entity||target,category=options.category||target?.category;
    // Critical player hull keeps its physical presence, controls and enemy lock.
    // Disabled NPCs retain their existing inactive job/combat policy.
    if(!state||!entity||state.landed||entity.hull<=0||entity.journey||['warp','arriving','destroyed'].includes(entity.phase)||entity.phase==='disabled'&&entity!==state&&category!=='player')return false;
    if((target.system??entity.system??(category==='tug'?1:state.system))!==state.system)return false;
    const player=pose(state,state,{category:'player'}),location=pose(state,target,options);
    if(region(state))return contains(state,location,state.system);
    return point(player)&&point(location)&&Math.hypot(location.x-player.x,location.y-player.y)<=radius(state);
  }
  const lookahead=state=>region(state)?window.nativeCivilianPopulation.simulation.lookAheadSeconds:6;
  window.nativeShipDetail=Object.freeze({radius,pose,isDetailed,region,bounds,contains,lookahead});
})();
