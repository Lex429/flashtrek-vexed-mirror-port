/* Continuous coordinates for ordinary flight between the game's systems. */
(() => {
  'use strict';
  const systems = window.VexedMirrorWorld.systems;
  const byId = new Map(systems.map(system => [system.id, system]));
  const earth = byId.get(1).mapPosition;
  const unitsPerChartPoint = 1000;
  const arrivalRadius = 2500;
  // These two original systems have no chart coordinates or warp lane.
  const unchartedPositions = new Map([[51, {x:-250, y:-125}], [52, {x:-220, y:-160}]]);

  function chartPosition(id) {
    if(Number(id)===30&&window.nativeSystemCatalog){const base=byId.get(31).mapPosition,body=window.nativeSystemCatalog.bodies(31).find(b=>b.legacyWorldId===30);return {x:base.x+body.x/1000,y:base.y+body.y/1000};}
    return byId.get(Number(id))?.mapPosition || unchartedPositions.get(Number(id)) || null;
  }
  function anchor(id) {
    const position = chartPosition(id);
    return position ? {x:(position.x-earth.x)*unitsPerChartPoint, y:(position.y-earth.y)*unitsPerChartPoint} : null;
  }
  function localPosition(state) {
    return state.system === 1 && window.vexedSolFlight
      ? window.vexedSolFlight.shipPosition(state)
      : {x:Number(state.x)||0, y:Number(state.y)||0};
  }
  function position(state) {
    const origin = anchor(state.system), local = localPosition(state);
    return origin && {x:origin.x+local.x, y:origin.y+local.y};
  }
  function chartShipPosition(state) {
    const ship=position(state);
    return ship && {x:earth.x+ship.x/unitsPerChartPoint,y:earth.y+ship.y/unitsPerChartPoint};
  }
  function planetPosition(id) {
    const origin = anchor(id);
    return origin && {x:origin.x-220, y:origin.y+75};
  }
  function guidance(state,id=state.manualTargetSystem) {
    const ship=position(state),destination=planetPosition(id),system=byId.get(Number(id));
    if(!ship||!destination||!system)return null;
    const dx=destination.x-ship.x,dy=destination.y-ship.y;
    const known=state.devMode||state.discovered?.includes(system.id);
    return {id:system.id,name:known?system.name:`Unknown system S-${String(system.id).padStart(3,'0')}`,dx,dy,distance:Math.hypot(dx,dy)};
  }
  function nearbySystem(state) {
    const ship=position(state);
    if(!ship)return null;
    let nearest=null,distance=arrivalRadius;
    for(const system of systems){
      if(system.id===state.system||window.nativeSystemCatalog?.sameSystem(system.id,state.system))continue;
      const destination=planetPosition(system.id);
      if(!destination)continue;
      const d=Math.hypot(destination.x-ship.x,destination.y-ship.y);
      if(d<distance){nearest=system;distance=d;}
    }
    return nearest;
  }
  function enter(state,system) {
    const ship=position(state),origin=anchor(system.id);
    if(!ship||!origin)return false;
    state.system=system.id;
    state.planet=system.name;
    state.x=ship.x-origin.x;
    state.y=ship.y-origin.y;
    state.localBody=window.nativeSystemCatalog?.homeId(system.id)??(system.id===1?3:0);
    window.nativeSystemCatalog?.initialize(state);
    window.vexedSolFlight?.setTarget(state.localBody,state.system);
    state.landed=false;
    state.discovered=[...new Set([...(state.discovered||[]),system.id])];
    return true;
  }
  window.nativeManualFlight={systems,chartPosition,anchor,position,chartShipPosition,planetPosition,guidance,nearbySystem,enter,unitsPerChartPoint,arrivalRadius};
})();
