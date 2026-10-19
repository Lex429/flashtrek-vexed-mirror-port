/* Compatibility entry point: player hits use the same systems as every NPC. */
(() => {
  'use strict';
  let currentState=null;
  const describe=state=>window.nativeShipDefinitions.describe(state,state,{category:'player'});
  function hit(state,damage,impact={}){
    currentState=state;const descriptor=describe(state),result=window.nativeShipDamage.apply(descriptor,damage,impact);
    window.nativeShipEffects.hit(state,descriptor,result,impact);
    if(result.ok&&(result.destroyed||result.disabled)){window.nativeShipMotion.stop(state);state.localCruise=null;state.arrivalApproach=null;state.phase=result.destroyed?'destroyed':'disabled';}
    return result.ok?{ok:true,destroyed:result.destroyed,disabled:result.disabled,shields:result.shields,hull:result.hull}:result;
  }
  function visualImpact(state,impact={}){currentState=state;return window.nativeShipEffects.visualImpact(state,describe(state),impact);}
  // Active gameplay calls effects.advance once centrally. Kept for embedders.
  function advance(dt){if(currentState)window.nativeShipEffects.advance(currentState,dt);}
  function paint(ctx,view){currentState=view.state;window.nativeShipEffects.paintSurface(ctx,describe(view.state),view,{front:!!view.front});
    if(view.front)window.nativeShipEffects.paint(view.state,ctx,{...view,entity:view.state});}
  function reset(){currentState=null;window.nativeShipEffects.reset();}
  window.nativePlayerCombat={hit,visualImpact,advance,paint,reset,snapshot:()=>window.nativeShipEffects.snapshot(currentState?describe(currentState):null)};
})();
