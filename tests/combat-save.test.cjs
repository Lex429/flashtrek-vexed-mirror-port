const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const data=new Map(),writes=[];let time=0;
  const storage={setItem(key,value){data.set(key,value);writes.push(key);},getItem:key=>data.get(key)||null};
  const window={localStorage:storage,performance:{now:()=>time*1000}},context=vm.createContext({window});
  vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/save-storage.js','utf8'),context);
  return {api:window.nativeSaveStorage,window,storage,data,writes,time:seconds=>{time=seconds;}};
}
test('combat checkpoints coalesce the latest mutable state with a bounded trailing deadline',()=>{
  const f=fixture(),state={devMode:false,hull:100};
  for(let i=0;i<10;i++){f.time(i*.1);state.hull--;assert.equal(f.api.schedule(state).pending,true);assert.equal(f.api.flushDue(state).pending,true);}
  assert.equal(f.writes.length,0);f.time(1.01);assert.equal(f.api.flushDue(state).ok,true);
  assert.equal(JSON.parse(f.data.get(f.api.keys.normal)).hull,90);
  assert.equal(f.writes.filter(k=>k===f.api.keys.normal).length,1);assert.equal(f.api.pending(state),false);
});
test('explicit durable writes supersede queued saves without another delayed write',()=>{
  const f=fixture(),state={hull:100};f.api.schedule(state);state.hull=89;
  assert.equal(f.api.write(state).ok,true);f.time(10);f.api.flushDue(state);
  assert.equal(f.writes.filter(k=>k===f.api.keys.normal).length,1);
  assert.equal(f.api.read('normal').hull,89);
});
test('normal and Dev queues remain mode-separated and flush before a lifecycle boundary',()=>{
  const f=fixture(),normal={hull:91},dev={devMode:true,hull:50};
  f.api.schedule(normal);f.api.schedule(dev);
  assert.equal(f.api.flush(normal).ok,true);assert.equal(f.api.pending(dev),true);
  f.api.flush(dev);assert.equal(f.api.read('normal').hull,91);assert.equal(f.api.read('dev').hull,50);
});
test('denied and silently lost combat saves report failure, remain dirty and retry at a bounded rate',()=>{
  for(const failure of ['throw','silent']){
    const f=fixture(),state={hull:80};let attempts=0;
    const broken={getItem:()=>null,setItem(){attempts++;if(failure==='throw')throw Error('Quota');}};
    f.api.schedule(state);f.time(.3);
    const result=f.api.flushDue(state,{storage:broken});assert.equal(result.ok,false);assert.match(result.error,/Save failed/);assert.equal(f.api.pending(state),true);
    f.api.flushDue(state,{storage:broken});assert.equal(attempts,1,'no frame-by-frame failure loop');
    f.time(1.31);assert.equal(f.api.flushDue(state).ok,true);assert.equal(f.api.read('normal').hull,80);
  }
});

test('continued hits cannot shorten a failed save retry delay',()=>{
  const f=fixture(),state={hull:100};let attempts=0;
  const broken={getItem:()=>null,setItem(){attempts++;throw Error('Quota');}};
  f.api.schedule(state);f.time(.3);assert.equal(f.api.flushDue(state,{storage:broken}).ok,false);
  for(let i=1;i<=19;i++){
    f.time(.3+i*.05);state.hull--;f.api.schedule(state);f.api.flushDue(state,{storage:broken});
  }
  assert.equal(attempts,1,'each new hit must retain the outstanding one-second retry deadline');
  f.time(1.31);assert.equal(f.api.flushDue(state).ok,true);
  assert.equal(f.api.read('normal').hull,81);assert.equal(f.api.pending(state),false);
});

function workerFixture(){
 const f=fixture(),workers=[];
 f.window.Worker=class {
  constructor(){this.messages=[];workers.push(this);}
  postMessage(message){this.messages.push(structuredClone(message));}
  reply(index=this.messages.length-1){const message=this.messages[index];this.onmessage({data:{id:message.id,serialized:message.text,serializationMs:12}});}
  terminate(){this.terminated=true;}
 };
 f.window.nativeSaveCodec={stringify:JSON.stringify,parse:JSON.parse};
 const state={devMode:true,hull:100,credits:500,civilianTraffic:{ships:Array.from({length:600},(_,id)=>({id,credits:100,cargo:{good:5,tons:.125}}))},solEconomy:{freighters:[]},shipSimulation:{schedule:{pendingSeconds:.125}}};
 return {...f,state,workers,start(){f.api.schedule(state);f.time(.3);return f.api.flushDue(state);}};
}
test('optional checkpoint preparation warms only the encoder and never captures, queues or writes a save',()=>{
 const f=workerFixture();assert.equal(f.api.prepare(f.state),true);assert.equal(f.workers.length,1);assert.equal(f.workers[0].messages.length,0);
 assert.equal(f.api.pending(f.state),false);assert.equal(f.writes.length,0);f.start();assert.equal(f.workers.length,1);f.workers[0].reply();assert.equal(f.api.read('dev').hull,100);
});
test('large redundant checkpoints capture one atomic complete JSON state and commit only the verified worker result',()=>{
 const f=workerFixture(),s=f.state,dot={id:'dot',hull:17.25},ship=s.civilianTraffic.ships[0];
 ship.shipEquipment={instances:{dot}};ship.repairBay={slots:[dot]};
 s.civilianTraffic.ships=new Proxy(s.civilianTraffic.ships,{});
 s.portDocking={version:1,ships:new Proxy({one:new Proxy({owner:'civilian:0',clearing:new Proxy({x:4,y:5},{})},{})},{})};
 assert.equal(f.start().pending,true);assert.equal(f.writes.length,0);
 const worker=f.workers[0],captured=JSON.parse(worker.messages[0].text);
 assert.equal(captured.civilianTraffic.ships.length,600);assert.deepEqual(captured.civilianTraffic.ships[0].repairBay.slots[0],captured.civilianTraffic.ships[0].shipEquipment.instances.dot);
 assert.equal(captured.portDocking.ships.one.clearing.x,4);s.credits=499;dot.hull=9;
 worker.reply();assert.equal(f.api.read('dev').credits,500);assert.equal(f.api.read('dev').civilianTraffic.ships[0].repairBay.slots[0].hull,17.25);
 assert.equal(f.api.pending(s),false);assert.equal(f.api.metrics().worker,true);assert.equal(f.api.metrics().serializationMs,12);
});
test('an immediate purchase/save supersedes an older worker checkpoint without any later overwrite',()=>{
 const f=workerFixture();f.start();f.state.credits=350;f.state.shipSimulation.schedule.pendingSeconds=.375;
 assert.equal(f.api.write(f.state).ok,true);const writes=f.writes.length;f.workers[0].reply();
 assert.equal(f.writes.length,writes);assert.equal(f.api.read('dev').credits,350);assert.equal(f.api.read('dev').shipSimulation.schedule.pendingSeconds,.375);
});
test('new work queued during encoding retains its own checkpoint and mode/state changes reject old results',()=>{
 const f=workerFixture();f.start();f.time(.4);f.state.hull=80;f.api.schedule(f.state);f.workers[0].reply();
 assert.equal(f.api.pending(f.state),true);f.time(1);f.api.flushDue(f.state);f.api.flushDue(f.state);f.workers[0].reply();
 assert.equal(f.api.read('dev').hull,80);assert.equal(f.api.pending(f.state),false);
 f.time(2);f.api.schedule(f.state);f.time(2.3);f.api.flushDue(f.state);
 const next={...f.state,hull:60};f.api.schedule(next);f.workers[0].reply();assert.equal(f.api.read('dev').hull,80,'old state cannot overwrite a queued replacement');
 f.time(3);f.api.flushDue(next);f.workers[0].reply();assert.equal(f.api.read('dev').hull,60);
});
test('lifecycle flushes remain immediate, worker failure falls back, and denied asynchronous writes remain dirty',()=>{
 const f=workerFixture();f.start();f.state.hull=91;assert.equal(f.api.flush(f.state).ok,true);const writes=f.writes.length;f.workers[0].reply();assert.equal(f.writes.length,writes);
 f.time(2);f.api.schedule(f.state);f.time(2.3);f.api.flushDue(f.state);f.workers[0].onerror({preventDefault(){}});
 assert.equal(f.api.flushDue(f.state).ok,true);assert.equal(f.api.read('dev').hull,91);
 const g=workerFixture();g.start();const set=g.storage.setItem;g.storage.setItem=()=>{throw Error('Quota');};g.workers[0].reply();
 assert.equal(g.api.flushDue(g.state).ok,false);assert.equal(g.api.pending(g.state),true);g.storage.setItem=set;
 g.time(.6);assert.equal(g.api.flushDue(g.state).pending,true);assert.equal(g.workers[0].messages.length,1,'retry must stay bounded');
 g.time(1.4);g.api.flushDue(g.state);g.workers[0].reply();assert.equal(g.api.read('dev').hull,100);
});
