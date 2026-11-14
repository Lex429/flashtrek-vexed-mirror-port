/* Compatibility entry point: player hits use the same systems as every NPC. */
(() => {
  'use strict';
  let currentState=null;
  const describe=state=>window.nativeShipDefinitions.describe(state,state,{category:'player'});
  function hit(state,damage,impact={}){
    currentState=state;const descriptor=describe(state),result=window.nativeShipDamage.apply(descriptor,damage,impact);
    if(result.ok&&state.prometheus?.assembly)window.nativePrometheus.repairProgress(state,result.before.hull);
    const continuing=result.destroyed&&window.nativePrometheus?.canTakeCommand?.(state);
    const struck=continuing?{...descriptor,entity:{...state,shipEquipment:undefined,repairBay:undefined,prometheus:undefined}}:descriptor;
    window.nativeShipEffects.hit(state,struck,result,impact);
    if(continuing){const transfer=window.nativePrometheus.takeCommand(state);if(transfer)return {ok:true,destroyed:false,disabled:state.phase==='disabled',transferred:true,sectionDestroyed:true,message:transfer.message,hull:state.hull,shields:state.shields,beforeStage:result.beforeStage,afterStage:window.nativeShipDefinitions.stage(describe(state))};}
    if(result.ok&&(result.destroyed||result.disabled)){if(result.destroyed)window.nativeShipMotion.stop(state);state.localCruise=null;state.arrivalApproach=null;state.phase=result.destroyed?'destroyed':'disabled';}
    return result.ok?{ok:true,destroyed:result.destroyed,disabled:result.disabled,shields:result.shields,hull:result.hull,beforeStage:result.beforeStage,afterStage:result.afterStage}:result;
  }
  function visualImpact(state,impact={}){currentState=state;return window.nativeShipEffects.visualImpact(state,describe(state),impact);}
  // Active gameplay calls effects.advance once centrally. Kept for embedders.
  function advance(dt){if(currentState)window.nativeShipEffects.advance(currentState,dt);}
  function paint(ctx,view){currentState=view.state;window.nativeShipEffects.paintSurface(ctx,describe(view.state),view,{front:!!view.front});
    if(view.front)window.nativeShipEffects.paint(view.state,ctx,{...view,entity:view.state});}
  function reset(){currentState=null;window.nativeShipEffects.reset();}
  window.nativePlayerCombat={hit,visualImpact,advance,paint,reset,snapshot:()=>window.nativeShipEffects.snapshot(currentState?describe(currentState):null)};
})();
