/* Shared system relationships, chart colors and faction consequences. */
(() => {
  'use strict';
  const world=window.VexedMirrorWorld;
  const destructionLoss=10;
  const attackLoss=5;
  const colors=Object.freeze({Allied:'#4ab3ff',Hostile:'#ff0000','Your territory':'#0fff0f',Neutral:'#cacaca',Forbidden:'#ffed15',Uninhabited:'#eda91d',Unknown:'#858585'});
  const devNeighborhood=Object.freeze([
    {system:55,prestige:-75}, // Epsilon Indi: hostile.
    {system:4,prestige:125}, // Alpha Centauri: allied.
    {system:2,prestige:0}, // Orion: neutral.
    {system:8,prestige:100,government:16} // Epsilon: player-owned.
  ].map(Object.freeze));
  const devFactionPrestige=Object.freeze({
    0:0,1:100,2:-60,3:-40,4:25,5:125,6:-50,7:20,8:110,9:15,10:15,
    11:-65,12:0,13:-80,14:-100,15:-90
  });
  function initializeDev(state){
    if(!state?.devMode||Number(state.devNeighborhoodVersion)>1||Number(state.devDiplomacyVersion)>1)return false;
    if(Number(state.devNeighborhoodVersion)>=1&&Number(state.devDiplomacyVersion)>=1)return false;
    state.localPrestige||={};state.planetGovts||={};
    if(!(Number(state.devNeighborhoodVersion)>=1)){
      for(const preset of devNeighborhood){
        const system=world.systems.find(system=>system.id===preset.system);
        state.localPrestige[preset.system]=preset.prestige;
        state.planetGovts[preset.system]=preset.government??system.governmentId;
      }
      state.devNeighborhoodVersion=1;
    }
    if(!(Number(state.devDiplomacyVersion)>=1)){
      for(const system of world.systems){
        const government=Number(state.planetGovts[system.id]??system.governmentId),current=Number(state.localPrestige[system.id]);
        // Old Dev defaults were all +100. Keep played standings and changed owners.
        if(government===16||government!==Number(system.governmentId)||Number.isFinite(current)&&current!==100)continue;
        state.localPrestige[system.id]=devFactionPrestige[government]??0;
      }
      state.devDiplomacyVersion=1;
    }
    return true;
  }
  function relationship(state,systemId,{known=true}={}){
    const raw=Number(state.localPrestige?.[systemId]),prestige=Number.isFinite(raw)?raw:0;
    const government=Number(state.planetGovts?.[systemId]??world.systems.find(system=>system.id===Number(systemId))?.governmentId);
    const status=!known?'Unknown':government===16?'Your territory':prestige>=100?'Allied':prestige<0?'Hostile':'Neutral';
    return {status,prestige:known?prestige:null,color:colors[status],tone:status==='Your territory'?'owned':status.toLowerCase()};
  }
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
  function shipAttacked(state,systemId,governmentId){
    state.localPrestige||={};const current=Number(state.localPrestige[systemId]);state.localPrestige[systemId]=(Number.isFinite(current)?current:0)-attackLoss;
    return {faction:world.governments.find(government=>government.id===governmentId)?.name||'the defending faction',amount:attackLoss,affectedSystems:1,system:systemId};
  }
  window.nativeFactionStanding=Object.freeze({shipDestroyed,shipAttacked,relationship,colors,initializeDev});
})();
