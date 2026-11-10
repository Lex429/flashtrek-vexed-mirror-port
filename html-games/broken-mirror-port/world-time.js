/* Calendar skips and NPC jobs share the saved gameplay clock. */
(() => {
  'use strict';
  const secondsPerDay=120;
  function advanceDays(state,days,random=Math.random){
    days=Math.max(0,Number(days)||0);
    if(!state||!Number.isFinite(days)||!days||window.nativeSimulation.blocked())return 0;
    if(window.nativeSimulationFrame?.transitionReady&&!window.nativeSimulationFrame.transitionReady(state))return 0;
    const elapsed=window.nativeSimulation.advance(state,days*secondsPerDay);
    if(!elapsed)return 0;
    state.day=(Number(state.day)||0)+days;
    window.nativeAsteroidMotion?.advance(state,elapsed);
    window.nativePopulation?.advanceDays(state,days,random);
    // Scheduling owners retain any bounded catch-up debt in the save.
    window.nativeSolEconomy?.advance(state,elapsed);
    window.nativeCivilianTraffic?.advance(state,elapsed);
    return elapsed;
  }
  // Warp has already advanced the saved clock. Drain only overdue scheduled
  // freight/production through its owner; civilian scheduling retains its bounded
  // saved deadlines. Never integrate another second or discard debt.
  function settleTransit(state,{maxPasses=4096}={}){
    if(window.nativeSimulation.blocked())throw Error('Transit calendar preparation is paused.');
    const at=window.nativeSimulation.seconds(state);let passes=0;
    const pending=()=>window.nativeSolEconomy.calendarPending(state);
    while(pending()&&passes++<maxPasses){
      window.nativeSimulationFrame?.begin(state);
      try{window.nativeSolEconomy.settleCalendar(state);}
      finally{window.nativeSimulationFrame?.end(state);}
    }
    if(window.nativeSimulation.seconds(state)!==at)throw Error('Transit preparation changed the saved clock.');
    if(pending())throw Error('Destination calendar preparation is still busy. Retry the journey.');
    return {passes,seconds:at,pending:false};
  }
  window.nativeWorldTime=Object.freeze({secondsPerDay,advanceDays,settleTransit});
})();
