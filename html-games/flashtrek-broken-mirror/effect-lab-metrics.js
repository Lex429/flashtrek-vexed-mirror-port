/* Wall-clock diagnostics only. No sample changes simulation speed or rendering. */
((root) => {
  'use strict';
  const percentile=(sorted,p)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:0;
  class FrameMeter {
    constructor(limit=20000){this.limit=limit;this.reset();}
    reset(){this.frames=[];this.cpu=[];this.gpu=[];this.total=0;this.invalid=null;this.worst=[];}
    add(ms,cpu=0,at=0){
      if(!Number.isFinite(ms)||ms<=0||!Number.isFinite(cpu)||cpu<0)return false;
      if(this.frames.length>=this.limit){this.invalid='Sample capacity exceeded';return false;}
      this.frames.push(ms);this.cpu.push(cpu);this.total+=ms;
      if(this.worst.length<5||ms>this.worst.at(-1).ms){this.worst.push({ms,at});this.worst.sort((a,b)=>b.ms-a.ms);this.worst.length=Math.min(5,this.worst.length);}
      return true;
    }
    addGPU(ms){if(Number.isFinite(ms)&&ms>=0&&this.gpu.length<this.limit)this.gpu.push(ms);}
    invalidate(reason){this.invalid=reason;}
    snapshot(target=120){
      const sorted=[...this.frames].sort((a,b)=>a-b),n=sorted.length,slow=sorted.slice(Math.max(0,n-Math.max(1,Math.ceil(n*.01))));
      const mean=a=>a.reduce((sum,x)=>sum+x,0)/Math.max(1,a.length),budget=1000/target,average=this.total/Math.max(1,n);
      return {samples:n,elapsedMs:this.total,fps:this.total?n*1000/this.total:0,frameMs:average,
        medianMs:percentile(sorted,.5),p95Ms:percentile(sorted,.95),p99Ms:percentile(sorted,.99),maxMs:sorted.at(-1)||0,
        low1FPS:n?1000/mean(slow):0,cpuMs:mean(this.cpu),gpuMs:this.gpu.length?mean(this.gpu):null,gpuSamples:this.gpu.length,
        overBudget:sorted.filter(ms=>ms>budget+1e-6).length,over16:sorted.filter(ms=>ms>1000/60+1e-6).length,over33:sorted.filter(ms=>ms>1000/30+1e-6).length,
        target,budgetMs:budget,worst:[...this.worst],valid:!this.invalid&&n>0,invalidReason:this.invalid,
        targetObserved:!this.invalid&&n>=30&&1000/average>=target*.98&&percentile(sorted,.99)<=budget*1.15&&1000/mean(slow)>=target*.9};
    }
  }
  const stable=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}'):JSON.stringify(value);
  // Renderer choice is the effect being compared; fleet, load, view and
  // hardware must still match exactly. Keep that choice in the saved report.
  const comparisonKey=run=>{const fixture={...run.fixture};delete fixture.shieldRenderer;return {fixture,environment:run.environment,code:run.code};};
  const comparable=(a,b)=>stable(comparisonKey(a))===stable(comparisonKey(b));
  // Sparse asynchronous queries never wait for the GPU or force a readback.
  function createGPUTimer(gl,onSample){
    const extension=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[];
    let open=null,frame=0;
    const clear=()=>{if(open){gl.endQuery(extension.TIME_ELAPSED_EXT);gl.deleteQuery(open);open=null;}
      for(const query of queries)gl.deleteQuery(query);queries.length=0;};
    return Object.freeze({supported:Boolean(extension),
      begin(index=frame++){if(!extension||open||queries.length>=4||index%10||gl.isContextLost?.())return;
        open=gl.createQuery();if(open)gl.beginQuery(extension.TIME_ELAPSED_EXT,open);},
      end(){if(open){gl.endQuery(extension.TIME_ELAPSED_EXT);queries.push(open);open=null;}},
      poll(){
        // A sparse timer needs no driver query while it owns no samples.
        // Keep disjoint/context-loss checks for every pending or open query.
        if(!extension||!open&&!queries.length)return;
        if(gl.isContextLost?.()||gl.getParameter(extension.GPU_DISJOINT_EXT)){clear();return;}
        while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){
          const query=queries.shift(),ms=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
          gl.deleteQuery(query);if(Number.isFinite(ms)&&ms>=0)onSample(ms);
        }
      },clear});
  }
  root.EffectLabMetrics=Object.freeze({FrameMeter,stable,comparable,createGPUTimer});
})(typeof window==='undefined'?globalThis:window);
