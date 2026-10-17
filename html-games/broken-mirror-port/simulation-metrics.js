/* Bounded diagnostics only; these wall-clock measurements never drive gameplay. */
(() => {
  'use strict';
  const samples=[],limit=360;
  const average=(items,key)=>items.reduce((total,item)=>total+item[key],0)/Math.max(1,items.length);
  function record(state,{frame,simulation,render,mode}){
    if(!state)return;
    const lives=window.nativeNpcLives?.metrics(state)||{},sol=state?.solEconomy?.lifeMetrics||{};
    const work=window.nativeSimulationFrame?.snapshot(state)||{steps:0,counters:{}},c=work.counters;
    samples.push({frame,simulation,render,mode,detailed:(lives.detailed||lives.detailedShips||0)+(sol.detailed||0),distantUpdates:(lives.distantUpdates||0)+(sol.distantUpdates||0),scheduledEvents:(c.civilianEvents||0)+(c.solEvents||0),backlog:(lives.backlog||0)+(sol.deferred||0),steps:work.steps,tacticalUpdates:c.tacticalUpdates||0,tacticalFiringAttempts:c.tacticalFiringAttempts||0,sceneCollections:c.sceneCollections||0});
    if(samples.length>limit)samples.shift();
  }
  function snapshot(mode){
    const items=mode?samples.filter(item=>item.mode===mode):samples;
    const frames=items.map(item=>item.frame).sort((a,b)=>a-b),last=items.at(-1)||{};
    const percentile=p=>frames[Math.max(0,Math.ceil(frames.length*p)-1)]||0;
    return {samples:items.length,simulationMs:average(items,'simulation'),renderMs:average(items,'render'),frameMs:average(items,'frame'),medianFrameMs:percentile(.5),p95FrameMs:percentile(.95),p99FrameMs:percentile(.99),maxFrameMs:frames.at(-1)||0,over33ms:frames.filter(ms=>ms>33).length,over50ms:frames.filter(ms=>ms>50).length,detailed:last.detailed||0,distantUpdates:last.distantUpdates||0,scheduledEvents:last.scheduledEvents||0,backlog:last.backlog||0,meanSteps:average(items,'steps'),tacticalUpdates:average(items,'tacticalUpdates'),tacticalFiringAttempts:average(items,'tacticalFiringAttempts'),sceneCollections:average(items,'sceneCollections')};
  }
  window.nativeSimulationMetrics=Object.freeze({record,snapshot,reset(){samples.length=0;}});
})();
