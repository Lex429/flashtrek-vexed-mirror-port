/* Shared consequences for destroying a faction-owned ship. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld;
  const destructionLoss=10;
  function shipDestroyed(state,governmentId){
    governmentId=Number(governmentId);
    const systems=world.systems.filter(system=>Number(state.planetGovts?.[system.id]??system.governmentId)===governmentId);
    state.localPrestige ||= {};
    for(const system of systems){
      const current=Number(state.localPrestige[system.id]);
      state.localPrestige[system.id]=(Number.isFinite(current)?current:0)-destructionLoss;
    }
    return {faction:world.governments.find(government=>government.id===governmentId)?.name||'the owning faction',amount:destructionLoss,affectedSystems:systems.length};
  }
  window.nativeFactionStanding=Object.freeze({shipDestroyed});
})();
