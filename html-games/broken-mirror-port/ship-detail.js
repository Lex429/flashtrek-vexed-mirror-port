/* One tactical detail boundary, independent of rendering and map visibility. */
(() => {
  'use strict';
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  function radius(state){const value=Number(state?.civilianTraffic?.life?.config?.detailedRadius);return Number.isFinite(value)&&value>0?value:6500;}
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
    if(!state||!entity||state.landed||entity.hull<=0||entity.journey||['warp','arriving','destroyed','disabled'].includes(entity.phase))return false;
    if((target.system??entity.system??(category==='tug'?1:state.system))!==state.system)return false;
    const player=pose(state,state,{category:'player'}),location=pose(state,target,options);
    return point(player)&&point(location)&&Math.hypot(location.x-player.x,location.y-player.y)<=radius(state);
  }
  window.nativeShipDetail=Object.freeze({radius,pose,isDetailed});
})();
