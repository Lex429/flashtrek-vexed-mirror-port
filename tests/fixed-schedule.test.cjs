const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(){
  let blocked=false,work=0;
  const context={window:{},document:{get hidden(){return blocked;}},performance:{now:()=>work},Date,Math,Map,WeakMap,WeakSet,Object,Number};
  context.window=context;vm.createContext(context);
  for(const file of ['simulation-clock.js','simulation-frame.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),context);
  return {context,frame:context.nativeSimulationFrame,time:context.nativeSimulation,state:{},pause:value=>blocked=value,cost:ms=>work+=ms};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
test('60, 120 and 144 display callbacks integrate the same sixty fixed physical steps',()=>{
  for(const hz of [60,120,144]){
    const f=fixture(),steps=[];
    for(let i=0;i<hz;i++){f.frame.begin(f.state);f.frame.run(f.state,1/hz,dt=>steps.push(dt));f.frame.end(f.state);}
    assert.equal(steps.length,60);assert.ok(steps.every(dt=>dt===1/60));close(f.time.seconds(f.state),1);close(f.frame.schedule(f.state).pendingSeconds,0);
  }
});
test('injected stalls retain all active time, bound main-thread work and recover without a catch-up burst of events',()=>{
  const f=fixture();let accepted=0,hits=0,next=0;
  const integrate=dt=>{f.cost(2);const now=f.time.seconds(f.state);if(now>=next){accepted++;next=now+.25;}if(hits===0&&now>=.4)hits++;};
  f.frame.begin(f.state);const initial=f.frame.run(f.state,.735,integrate);f.frame.end(f.state);
  assert.equal(initial.steps,3);assert.ok(initial.debtSeconds>.68);assert.equal(f.frame.snapshot(f.state).physics.budgetExhausted,true);
  const first=f.time.seconds(f.state)+initial.debtSeconds;close(first,.735);
  for(let i=0;i<30;i++){f.frame.begin(f.state);f.frame.run(f.state,0,integrate);f.frame.end(f.state);}
  close(f.time.seconds(f.state)+f.frame.schedule(f.state).pendingSeconds,.735);assert.ok(f.frame.schedule(f.state).pendingSeconds<1/60);
  assert.equal(hits,1);assert.equal(accepted,3);
});
test('sustained overload exposes growing debt and preserves it across pause and JSON reload',()=>{
  const f=fixture();let calls=0;
  for(let i=0;i<100;i++)f.frame.run(f.state,.1,()=>{calls++;f.cost(8);});
  assert.equal(calls,100);assert.ok(f.frame.schedule(f.state).pendingSeconds>8);
  close(f.time.seconds(f.state)+f.frame.schedule(f.state).pendingSeconds,10);
  const saved=JSON.stringify(f.state);f.pause(true);f.frame.run(f.state,10,()=>assert.fail('paused integration'));
  assert.equal(JSON.stringify(f.state),saved);
  const restored=fixture();restored.state=JSON.parse(saved);
  for(let i=0;i<100;i++)restored.frame.run(restored.state,0,()=>{});
  close(restored.time.seconds(restored.state)+restored.frame.schedule(restored.state).pendingSeconds,10);
  assert.ok(restored.frame.schedule(restored.state).pendingSeconds<1/60);
});
test('legacy clocks migrate scheduling only and keep owned absolute deadlines',()=>{
  const f=fixture();f.state={weaponCombat:{clock:12},civilianTraffic:{clock:11},owned:{readyAt:17}};
  f.frame.run(f.state,1/120,()=>assert.fail('half a physical step'));
  assert.equal(f.time.seconds(f.state),12);assert.equal(f.state.owned.readyAt,17);
  assert.equal(f.state.shipSimulation.schedule.version,1);close(f.state.shipSimulation.schedule.pendingSeconds,1/120);
});
test('calendar and system transitions cannot leap ahead of unpaid physical steps',()=>{
  const f=fixture(),order=[];
  f.context.VexedMirrorWorld={systems:[],governments:[]};
  f.context.nativeSolEconomy={advance:(_state,dt)=>order.push(['calendar',dt])};
  for(const file of ['world-time.js','travel-events.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),f.context);
  f.frame.schedule(f.state).pendingSeconds=.055;
  const before=JSON.stringify(f.state);
  assert.equal(f.context.nativeWorldTime.advanceDays(f.state,1),0);
  assert.throws(()=>f.context.vexedTravelEvents.plan(f.state,{}),/catching up/);
  assert.equal(JSON.stringify(f.state),before);assert.deepEqual(order,[]);
  f.frame.run(f.state,0,dt=>order.push(['physics',dt]));
  assert.equal(f.frame.transitionReady(f.state),true);close(f.frame.schedule(f.state).pendingSeconds,.005);
  assert.equal(f.context.nativeWorldTime.advanceDays(f.state,1),120);
  assert.deepEqual(order.map(row=>row[0]),['physics','physics','physics','calendar']);
  close(f.time.seconds(f.state)+f.frame.schedule(f.state).pendingSeconds,120.055);
});
test('render interpolation is immutable, idempotent, uses the short turn and never leaks to authoritative collisions',()=>{
  const f=fixture(),entity={},before={entity,id:1,state:f.state,shipType:7,system:1,x:0,y:2,heading:3.13},after={...before,x:10,y:6,heading:-3.13};
  f.frame.begin(f.state);f.frame.step(f.state);f.frame.schedule(f.state).pendingSeconds=1/120;
  f.frame.trackPose(f.state,entity,before,after);const rendered=f.frame.renderPose(f.state,after);
  close(rendered.x,5);close(rendered.y,4);close(rendered.heading,Math.PI);
  assert.equal(f.frame.renderPose(f.state,rendered),rendered);assert.equal(after.x,10);assert.equal(after.heading,-3.13);
  f.frame.trackPose(f.state,entity,after,{...after,x:12});const contactPose=f.frame.renderPose(f.state,{...after,x:12});close(contactPose.x,6);
  assert.equal(rendered.x,5);f.frame.end(f.state);
  f.pause(true);assert.equal(f.frame.renderPose(f.state,after),after);
});
test('teleports, hull changes and old steps snap to the authoritative pose',()=>{
  const f=fixture(),entity={},from={entity,shipType:7,system:1,x:0,y:0,heading:0};
  f.frame.step(f.state);f.frame.schedule(f.state).pendingSeconds=0;
  const distant={...from,x:1e6};f.frame.trackPose(f.state,entity,from,distant);assert.equal(f.frame.renderPose(f.state,distant).x,1e6);
  const changed={...from,shipType:58,x:10};f.frame.trackPose(f.state,entity,from,changed);assert.equal(f.frame.renderPose(f.state,changed).x,10);
  f.frame.step(f.state);assert.equal(f.frame.renderPose(f.state,changed),changed);
});
test('standalone and calendar clock advances cannot retain an old interpolation origin',()=>{
  const f=fixture(),entity={},from={entity,shipType:7,system:1,x:0,y:0,heading:0};
  f.frame.schedule(f.state).pendingSeconds=1/120;
  f.frame.trackPose(f.state,entity,from,{...from,x:10});close(f.frame.renderPose(f.state,{...from,x:10}).x,5);
  f.time.advance(f.state,1);assert.equal(f.frame.renderPose(f.state,{...from,x:10}).x,10);
  f.frame.trackPose(f.state,entity,{...from,x:10},{...from,x:20});close(f.frame.renderPose(f.state,{...from,x:20}).x,15);
});
test('real asynchronous service recovers accepted debt between display callbacks, retains event ownership and carries diagnostics once',async()=>{
  const f=fixture();f.context.MessageChannel=require('node:worker_threads').MessageChannel;
  let state=f.state,hits=0,shots=0,readyAt=0,transactions=0;
  const integrate=()=>{
    f.cost(2);const at=f.time.seconds(state);
    f.frame.count(state,'physicalOwners');f.frame.take(state,'jobs',1);
    if(at>=readyAt){shots++;readyAt=at+.25;}
    if(!hits&&at>=.4){hits++;transactions++;}
  };
  const service=f.frame.createService({getState:()=>state,advance:()=>f.frame.run(state,0,integrate)});
  try{
    f.frame.begin(state);const first=f.frame.run(state,.735,integrate);f.frame.end(state);
    assert.equal(first.steps,3);assert.ok(service.request(state));
    const deadline=Date.now()+2000;
    while(!f.frame.transitionReady(state)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok(f.frame.transitionReady(state),'background event-loop tasks did not recover debt');
    close(f.time.seconds(state)+f.frame.schedule(state).pendingSeconds,.735);
    assert.equal(hits,1);assert.equal(transactions,1);assert.equal(shots,3);
    const pending=f.frame.pendingWork(state);assert.equal(pending.steps,41);assert.equal(pending.counters.physicalOwners,41);assert.ok(pending.tasks>1);assert.ok(pending.counters.jobs>=pending.tasks);
    const copy=f.frame.pendingWork(state);copy.counters.physicalOwners=-100;assert.equal(f.frame.pendingWork(state).counters.physicalOwners,41);
    f.frame.begin(state);f.frame.run(state,0,integrate);const display=f.frame.snapshot(state);
    assert.equal(display.steps,41);assert.equal(display.physics.steps,0);assert.equal(display.background.steps,41);assert.equal(display.counters.physicalOwners,41);
    assert.equal(f.frame.take(state,'jobs',1),true,'carried diagnostic totals starved a new task budget');
    assert.equal(f.frame.take(state,'jobs',1),false);f.frame.end(state);
    assert.equal(f.frame.pendingWork(state).steps,0);f.frame.begin(state);f.frame.run(state,0,integrate);assert.equal(f.frame.snapshot(state).steps,0);f.frame.end(state);
  }finally{service.dispose();}
});
test('queued service respects pause, hidden/inventory gates, warp and state changes without accepting any extra wall time',()=>{
  const f=fixture(),queue=[];let state=f.state,allowed=true,calls=0;
  const service=f.frame.createService({getState:()=>state,allowed:()=>allowed,advance:()=>f.frame.run(state,0,()=>calls++),postTask:callback=>queue.push(callback)});
  const runQueued=()=>{const callback=queue.shift();assert.ok(callback);callback();};
  f.frame.schedule(state).pendingSeconds=.1;assert.ok(service.request(state));f.pause(true);runQueued();assert.equal(calls,0);close(f.frame.schedule(state).pendingSeconds,.1);
  f.pause(false);assert.ok(service.request(state));allowed=false;runQueued();assert.equal(calls,0);close(f.frame.schedule(state).pendingSeconds,.1);
  allowed=true;assert.ok(service.request(state));const old=state;state={};f.frame.schedule(state).pendingSeconds=.05;runQueued();close(f.frame.schedule(old).pendingSeconds,.1);assert.equal(calls,0);
  assert.ok(service.request(state));service.cancel();runQueued();close(f.frame.schedule(state).pendingSeconds,.05);assert.equal(calls,0);
  assert.ok(service.request(state));runQueued();assert.equal(calls,3);close(f.time.seconds(state),.05);close(f.frame.schedule(state).pendingSeconds,0);assert.equal(queue.length,0);service.dispose();
});
