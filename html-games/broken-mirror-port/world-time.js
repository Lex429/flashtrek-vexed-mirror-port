/* Calendar skips and NPC jobs share the saved gameplay clock. */
(() => {
  'use strict';
  const secondsPerDay=120;
  function advanceDays(state,days,random=Math.random){
    days=Math.max(0,Number(days)||0);
    if(!state||!Number.isFinite(days)||!days||window.nativeSimulation.blocked())return 0;
    const elapsed=window.nativeSimulation.advance(state,days*secondsPerDay);
    if(!elapsed)return 0;
    state.day=(Number(state.day)||0)+days;
    window.nativePopulation?.advanceDays(state,days,random);
    // Scheduling owners retain any bounded catch-up debt in the save.
    window.nativeSolEconomy?.advance(state,elapsed);
    window.nativeCivilianTraffic?.advance(state,elapsed);
    return elapsed;
  }
  window.nativeWorldTime=Object.freeze({secondsPerDay,advanceDays});
})();
