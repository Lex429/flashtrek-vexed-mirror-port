/* Player course intent. Shared ship systems still integrate every movement. */
(() => {
  'use strict';
  const pilots=new WeakMap();
  const steering=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyX','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  function target(state){
    const route=state?.localCruise;
    return window.nativeNavigation.destination(state,{system:route?.system??state.system,body:route?.to??window.nativeSystemCatalog.currentId(state)});
  }
  function start(state,selection){
    const destination=window.nativeNavigation.destination(state,selection);
    if(!destination.ok||!destination.canCruise)return {ok:false,error:destination.cruiseError||destination.error};
    state.localCruise={version:1,system:destination.system,from:window.nativeSystemCatalog.currentId(state),to:destination.bodyId,
      startDistance:destination.distance,startedAt:window.nativeSimulation.seconds(state)};
    delete state.arrivalApproach;state.landed=false;pilots.delete(state);
    return {ok:true,destination};
  }
  function command(state,held,controls,dt){
    const route=state.localCruise||state.arrivalApproach;
    if(!route){pilots.delete(state);return null;}
    let pilot=pilots.get(state);if(!pilot||pilot.route!==route){pilot={route,manual:false};pilots.set(state,pilot);}
    if(steering.some(code=>held(code))||controls.maneuvering){
      pilot.manual=true;return {manual:true,command:controls.command(state,held,dt)};
    }
    if(pilot.manual){
      controls.reset();pilot.manual=false;
      // Resume from this position, rather than returning to the old approach.
      if(state.localCruise){delete route.stopX;delete route.stopY;}
    }
    if(!state.localCruise){
      const offset=state.system===1?window.vexedSolFlight.shipPosition(state):state;
      return {manual:false,command:{goal:{x:route.x+offset.x-state.x,y:route.y+offset.y-state.y},snap:true}};
    }
    const destination=target(state);if(!destination.ok)return {error:destination.error};
    route.system??=state.system;
    const anchor=window.nativeManualFlight.anchor(destination.system),frame=window.nativeManualFlight.anchor(state.system);
    if(!Number.isFinite(route.stopX)||!Number.isFinite(route.stopY)){
      const length=destination.distance||1,clearance=destination.clearance;
      route.stopX=destination.local.x-destination.dx/length*clearance;
      route.stopY=destination.local.y-destination.dy/length*clearance;
    }
    return {manual:false,destination,command:{goal:{x:anchor.x+route.stopX-frame.x,y:anchor.y+route.stopY-frame.y},snap:true}};
  }
  function snapshot(state){
    if(!state?.localCruise&&!state?.arrivalApproach)return null;
    const destination=target(state);if(!destination.ok)return null;
    return {name:destination.name,distance:Math.max(0,destination.distance-destination.clearance),manual:pilots.get(state)?.manual||false};
  }
  window.nativePlayerCruise=Object.freeze({start,command,target,snapshot,reset:state=>pilots.delete(state)});
})();
