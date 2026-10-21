/* Shared fixed physics schedule, bounded task work and display diagnostics. */
(() => {
  'use strict';
  const active=new WeakMap(),recent=new WeakMap(),completedCaches=new WeakMap(),serials=new WeakMap(),poses=new WeakMap(),pending=new WeakMap(),rendered=new WeakSet();let sequence=0;
  const fixedStep=1/60,epsilon=1e-10,clock=()=>globalThis.performance?.now?.()??Date.now();
  // Saved debt is elapsed active time that still belongs to the simulation.
  // Keep it across pause, reload and bounded host-frame catch-up. Older saves
  // acquire the versioned scheduling record without changing their clock.
  function schedule(state){
    const simulation=window.nativeSimulation.ensure(state);
    if(simulation.schedule?.version!==1)simulation.schedule={version:1,pendingSeconds:0};
    const value=simulation.schedule;
    if(!Number.isFinite(value.pendingSeconds)||value.pendingSeconds<0)value.pendingSeconds=0;
    return value;
  }
  function run(state,elapsed,integrate,{maxSteps=8,budgetMs=6,now=clock}={}){
    if(!state||window.nativeSimulation.blocked())return {steps:0,debtSeconds:state?.shipSimulation?.schedule?.pendingSeconds||0};
    const value=schedule(state),started=now();
    if(Number.isFinite(elapsed)&&elapsed>0)value.pendingSeconds+=elapsed;
    let steps=0;
    while(value.pendingSeconds+epsilon>=fixedStep&&steps<maxSteps&&(steps===0||now()-started<budgetMs)){
      value.pendingSeconds=Math.max(0,value.pendingSeconds-fixedStep);
      window.nativeSimulation.advance(state,fixedStep);step(state);steps++;
      integrate(fixedStep,window.nativeSimulation.now(state));
    }
    const frame=current(state);
    if(frame)frame.physics={stepSeconds:fixedStep,debtSeconds:value.pendingSeconds,elapsedSeconds:Math.max(0,Number(elapsed)||0),steps,backgroundSteps:frame.background.steps,backgroundTasks:frame.background.tasks,backgroundCpuMs:frame.background.cpuMs,budgetExhausted:value.pendingSeconds+epsilon>=fixedStep};
    return {steps,debtSeconds:value.pendingSeconds};
  }
  function alpha(state){return window.nativeSimulation.blocked()?1:Math.min(1,(state?.shipSimulation?.schedule?.pendingSeconds??fixedStep)/fixedStep);}
  // A calendar/system transition must not leap ahead of unpaid whole physical
  // steps. The ordinary fractional display remainder stays owned by the clock.
  const transitionReady=state=>(state?.shipSimulation?.schedule?.pendingSeconds||0)+epsilon<fixedStep;
  const pose=value=>({x:value.x,y:value.y,heading:value.heading??value.angle??0,system:value.system,shipType:value.shipType});
  function trackPose(state,entity,before,after){
    if(!state||!entity||!before||!after)return;
    let entries=poses.get(state);if(!entries){entries=new WeakMap();poses.set(state,entries);}
    const serial=serials.get(state)||0,at=Number(state.shipSimulation?.seconds)||0,previous=entries.get(entity),from=pose(before),to=pose(after);
    if(from.x===to.x&&from.y===to.y&&from.heading===to.heading)return;
    // System/hull changes and observer relocation are discontinuities, rather
    // than ordinary motion to interpolate across the entire screen.
    const travel=Math.hypot(to.x-from.x,to.y-from.y),speed=Math.max(Math.hypot(after.vx||0,after.vy||0),Math.abs(after.speed||0));
    const continuous=from.system===to.system&&from.shipType===to.shipType&&travel<=Math.max(100,speed*fixedStep*4+16);
    entries.set(entity,{serial,at,previous:continuous?(previous?.serial===serial&&previous.at===at?previous.previous:from):to,current:to});
  }
  function renderPose(state,descriptor){
    if(!descriptor||rendered.has(descriptor)||!descriptor.entity)return descriptor;
    const entry=poses.get(state)?.get(descriptor.entity),amount=alpha(state);
    if(!entry||entry.serial!==(serials.get(state)||0)||entry.at!==(Number(state.shipSimulation?.seconds)||0)||amount>=1||entry.current.system!==descriptor.system||entry.current.shipType!==descriptor.shipType||
      entry.current.x!==descriptor.x||entry.current.y!==descriptor.y||entry.current.heading!==descriptor.heading)return descriptor;
    const from=entry.previous,to=entry.current,turn=Math.atan2(Math.sin(to.heading-from.heading),Math.cos(to.heading-from.heading));
    const result={...descriptor,x:from.x+(to.x-from.x)*amount,y:from.y+(to.y-from.y)*amount,heading:from.heading+turn*amount};
    rendered.add(result);return result;
  }
  const pendingWork=state=>{const work=state&&pending.get(state);return {steps:work?.steps||0,tasks:work?.tasks||0,cpuMs:work?.cpuMs||0,counters:{...work?.counters},debtSeconds:state?.shipSimulation?.schedule?.pendingSeconds||0};};
  function begin(state,{collectPending=true}={}){
    if(!state)return null;
    const background=collectPending?pendingWork(state):{steps:0,tasks:0,cpuMs:0,counters:{}};
    if(collectPending)pending.delete(state);
    // Diagnostic counts can span several bounded tasks. Admission budgets
    // belong only to this task, so earlier work cannot starve its job owners.
    const at=Number(state.shipSimulation?.seconds)||0,completed=completedCaches.get(state);
    const frame={id:++sequence,counters:{...background.counters},used:{},caches:completed?.at===at?completed.caches:new Map(),steps:background.steps,background};active.set(state,frame);return frame;
  }
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
    const used=frame.used[name]||0;if(used+amount>limit)return false;frame.used[name]=used+amount;count(state,name,amount);return true;
  }
  function count(state,name,amount=1){const frame=current(state);if(frame)frame.counters[name]=(frame.counters[name]||0)+amount;}
  function step(state){if(!state)return;serials.set(state,(serials.get(state)||0)+1);const frame=current(state);if(frame){frame.steps++;frame.caches.clear();}}
  function snapshot(state){const frame=current(state)||recent.get(state);return frame?{id:frame.id,steps:frame.steps,counters:{...frame.counters},physics:{...frame.physics},background:{...frame.background,counters:{...frame.background?.counters}}}:{id:0,steps:0,counters:{},background:{steps:0,tasks:0,cpuMs:0,counters:{}},physics:{stepSeconds:fixedStep,debtSeconds:state?.shipSimulation?.schedule?.pendingSeconds||0}};}
  function end(state,{background=false,cpuMs=0}={}){
    if(!state)return;const frame=current(state);if(!frame)return;
    if(background){
      const work=pending.get(state)||{steps:0,tasks:0,cpuMs:0,counters:{}};
      work.steps+=frame.steps;work.tasks++;work.cpuMs+=Math.max(0,cpuMs);
      for(const [key,value] of Object.entries(frame.counters))work.counters[key]=(work.counters[key]||0)+value;
      pending.set(state,work);
    }else recent.set(state,snapshot(state));
    completedCaches.set(state,{at:Number(state.shipSimulation?.seconds)||0,caches:frame.caches});active.delete(state);
  }
  // Display callbacks alone accept wall time. While presentation waits on the
  // browser/GPU, separate short tasks service already accepted physics debt.
  // Every task uses the same integrator and yields before another is posted.
  function createService({getState,allowed=()=>true,advance,now=clock,postTask}={}){
    if(typeof getState!=='function'||typeof advance!=='function')throw TypeError('A simulation service needs its authoritative state and integrator');
    let queued=null,generation=0,scheduled=false,disposed=false,channel;
    const post=postTask||((typeof MessageChannel==='function')?(()=>{channel=new MessageChannel();channel.port1.onmessage=()=>service();return ()=>channel.port2.postMessage(0);})():()=>setTimeout(service,0));
    const ready=state=>state&&state===getState()&&!window.nativeSimulation.blocked()&&allowed(state)&&!transitionReady(state);
    function request(state=getState()){
      if(disposed||!ready(state))return false;
      queued={state,generation};if(!scheduled){scheduled=true;post(service);}return true;
    }
    function service(){
      scheduled=false;const job=queued;queued=null;
      if(!job||disposed||job.generation!==generation||!ready(job.state))return;
      // Host drawing and physical integration own their snapshots exclusively.
      if(current(job.state)){request(job.state);return;}
      const started=now();begin(job.state,{collectPending:false});
      try{advance(0);}finally{end(job.state,{background:true,cpuMs:now()-started});}
      if(job.generation===generation)request(job.state);
    }
    return Object.freeze({request,cancel(){generation++;queued=null;},peek(state=getState()){return {...pendingWork(state),queued:!!queued&&queued.state===state};},dispose(){generation++;disposed=true;queued=null;channel?.port1.close();channel?.port2.close();}});
  }
  window.nativeSimulationFrame=Object.freeze({begin,current,cache,take,count,step,end,snapshot,run,schedule,fixedStep,alpha,transitionReady,trackPose,renderPose,pendingWork,createService});
})();
