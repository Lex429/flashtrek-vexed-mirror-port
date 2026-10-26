/* The saved gameplay clock. Wall time is only used to measure the next frame. */
(() => {
  'use strict';
  function blocked(){return !!(document.hidden||window.nativeOpeningCinematic?.active||window.nativePause?.active||window.nativeShipInventory?.active||window.nativeShipyardServices?.active);}
  function ensure(state){
    if(!state.shipSimulation||state.shipSimulation.version!==1){
      const player=Math.max(0,Number(state.weaponCombat?.clock)||0),civilian=Math.max(0,Number(state.civilianTraffic?.clock)||0);
      state.shipSimulation={version:1,seconds:Math.max(player,civilian),legacyClocks:{player,civilian}};
    }
    if(!Number.isFinite(state.shipSimulation.seconds))state.shipSimulation.seconds=0;
    return state.shipSimulation;
  }
  const seconds=state=>state?ensure(state).seconds:0;
  const now=state=>seconds(state)*1000;
  // Visibility/pause gates discard suspended wall time at the host boundary.
  // A slow active frame keeps all its elapsed time for physical integration.
  const frameSeconds=milliseconds=>Number.isFinite(milliseconds)?Math.max(0,milliseconds)/1000:0;
  function advance(state,dt){
    if(!state||blocked()||!Number.isFinite(dt)||dt<=0)return 0;
    ensure(state).seconds+=dt;
    return dt;
  }
  window.nativeSimulation=Object.freeze({ensure,seconds,now,advance,blocked,frameSeconds});
})();
