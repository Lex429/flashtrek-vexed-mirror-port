/* Per-animation-frame work budgets; simulation seconds still advance in substeps. */
(() => {
  'use strict';
  const active=new WeakMap(),recent=new WeakMap(),completedCaches=new WeakMap();let sequence=0;
  function begin(state){if(!state)return null;const frame={id:++sequence,counters:{},caches:new Map(),steps:0};active.set(state,frame);return frame;}
  const current=state=>state?active.get(state)||null:null;
  function cache(state){
    const frame=current(state);if(frame)return frame.caches;
    // Drawing reads the final authoritative pose of the completed step. Retain
    // its read models until another step, an explicit mutation or clock advance.
    if(!state)return null;const at=Number(state.shipSimulation?.seconds)||0;
    let completed=completedCaches.get(state);
    if(!completed||completed.at!==at){completed={at,caches:new Map()};completedCaches.set(state,completed);}
    return completed.caches;
  }
  function take(state,name,limit,amount=1){
    const frame=current(state);if(!frame)return true;
    limit=Number.isFinite(limit)?Math.max(0,limit):0;amount=Math.max(1,Number(amount)||1);
    const used=frame.counters[name]||0;if(used+amount>limit)return false;frame.counters[name]=used+amount;return true;
  }
  function count(state,name,amount=1){const frame=current(state);if(frame)frame.counters[name]=(frame.counters[name]||0)+amount;}
  function step(state){const frame=current(state);if(frame){frame.steps++;frame.caches.clear();}}
  function snapshot(state){const frame=current(state)||recent.get(state);return frame?{id:frame.id,steps:frame.steps,counters:{...frame.counters}}:{id:0,steps:0,counters:{}};}
  function end(state){if(!state)return;const frame=current(state);if(frame){recent.set(state,snapshot(state));completedCaches.set(state,{at:Number(state.shipSimulation?.seconds)||0,caches:frame.caches});active.delete(state);}}
  window.nativeSimulationFrame=Object.freeze({begin,current,cache,take,count,step,end,snapshot});
})();
