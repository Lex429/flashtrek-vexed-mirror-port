/* Bounded diagnostics only; these wall-clock measurements never drive gameplay. */
(() => {
  'use strict';
  const samples=[],limit=360;
  const average=(items,key)=>items.reduce((total,item)=>total+item[key],0)/Math.max(1,items.length);
  function record(state,{frame,simulation,render,mode}){
    if(!state)return;
    const lives=window.nativeNpcLives?.metrics(state)||{},sol=state?.solEconomy?.lifeMetrics||{};
    samples.push({frame,simulation,render,mode,detailed:(lives.detailed||lives.detailedShips||0)+(sol.detailed||0),distantUpdates:(lives.distantUpdates||0)+(sol.distantUpdates||0),scheduledEvents:(lives.scheduledEvents||0)+(sol.scheduledEvents||0)});
    if(samples.length>limit)samples.shift();
  }
  function snapshot(mode){
    const items=mode?samples.filter(item=>item.mode===mode):samples;
    const frames=items.map(item=>item.frame).sort((a,b)=>a-b),last=items.at(-1)||{};
    return {samples:items.length,simulationMs:average(items,'simulation'),renderMs:average(items,'render'),frameMs:average(items,'frame'),p95FrameMs:frames[Math.floor((frames.length-1)*.95)]||0,maxFrameMs:frames.at(-1)||0,detailed:last.detailed||0,distantUpdates:last.distantUpdates||0,scheduledEvents:last.scheduledEvents||0};
  }
  window.nativeSimulationMetrics=Object.freeze({record,snapshot,reset(){samples.length=0;}});
})();
