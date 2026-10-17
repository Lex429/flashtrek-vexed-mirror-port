/* Per-animation-frame work budgets; simulation seconds still advance in substeps. */
(() => {
  'use strict';
  const active=new WeakMap(),recent=new WeakMap();let sequence=0;
  function begin(state){if(!state)return null;const frame={id:++sequence,counters:{},caches:new Map(),steps:0};active.set(state,frame);return frame;}
  const current=state=>state?active.get(state)||null:null;
  function take(state,name,limit,amount=1){
    const frame=current(state);if(!frame)return true;
    limit=Number.isFinite(limit)?Math.max(0,limit):0;amount=Math.max(1,Number(amount)||1);
    const used=frame.counters[name]||0;if(used+amount>limit)return false;frame.counters[name]=used+amount;return true;
  }
  function count(state,name,amount=1){const frame=current(state);if(frame)frame.counters[name]=(frame.counters[name]||0)+amount;}
  function step(state){const frame=current(state);if(frame){frame.steps++;frame.caches.clear();}}
  function snapshot(state){const frame=current(state)||recent.get(state);return frame?{id:frame.id,steps:frame.steps,counters:{...frame.counters}}:{id:0,steps:0,counters:{}};}
  function end(state){if(!state)return;const frame=current(state);if(frame){recent.set(state,snapshot(state));active.delete(state);}}
  window.nativeSimulationFrame=Object.freeze({begin,current,take,count,step,end,snapshot});
})();
