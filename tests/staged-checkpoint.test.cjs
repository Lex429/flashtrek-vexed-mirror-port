const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const timers=[],workers=[],data=new Map();let time=0,tick=0;
 const storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null},window={localStorage:storage,performance:{now:()=>time*1000},nativeSaveCodec:{stringify:JSON.stringify,parse:JSON.parse}};
 const context=vm.createContext({window,setTimeout:fn=>timers.push(fn),performance:{now:()=>++tick*.05}});
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/save-snapshot.js','utf8'),context);
 window.Worker=class{
  constructor(){this.rows=new Map();this.commits=[];workers.push(this);}
  postMessage(message){const m=structuredClone(message);if(m.action==='discard'){this.rows.delete(m.id);return;}if(m.action==='part'){let rows=this.rows.get(m.id);if(!rows)this.rows.set(m.id,rows=[]);for(const row of m.rows||JSON.parse(m.rowsText))rows[row.id]=row;return;}const state=m.action==='commit'?window.nativeSaveSnapshot.restore(this.rows.get(m.id),m.root):m.state;this.rows.delete(m.id);if(state)state.saveSlotVersion=3;this.commits.push({id:m.id,text:m.text??JSON.stringify(state)});}
  reply(){const m=this.commits.at(-1);this.onmessage({data:{id:m.id,serialized:m.text,serializationMs:12}});}
  terminate(){this.terminated=true;}
 };
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/save-storage.js','utf8'),context);
 const state={devMode:true,hull:100,credits:500,civilianTraffic:{ships:new Proxy(Array.from({length:600},(_,id)=>({id,credits:.125,task:{id:'job:'+id,paid:true}})),{})},solEconomy:{freighters:[]},shipSimulation:{schedule:{pendingSeconds:.735}},portDocking:{ships:new Proxy({one:new Proxy({x:3,clearing:{x:4}},{})},{})}};
 return {state,storage,api:window.nativeSaveStorage,workers,timers,data,drain(){while(timers.length)timers.shift()();},start(){this.api.schedule(state);time=.3;this.api.flushDue(state);},time:v=>{time=v;}};
}
test('streamed checkpoints commit the fully current graph after mutations during transfer and verify storage',()=>{
 const f=fixture();f.start();assert.equal(f.workers[0].commits.length,0);for(let i=0;i<5;i++)f.timers.shift()();
 f.state.credits=350;f.state.civilianTraffic.ships[0].task.payment=12.375;f.state.portDocking.ships.one.clearing.x=9;f.state.shipSimulation.schedule.pendingSeconds=1.125;f.drain();
 f.workers[0].reply();const r=f.api.read('dev');assert.equal(r.credits,350);assert.equal(r.civilianTraffic.ships[0].task.payment,12.375);assert.equal(r.portDocking.ships.one.clearing.x,9);assert.equal(r.shipSimulation.schedule.pendingSeconds,1.125);assert.equal(f.api.metrics().captureMode,'incremental');
});
test('an immediate durable purchase cancels a partial streamed capture without later overwriting it',()=>{
 const f=fixture();f.start();f.timers.shift()();f.state.credits=200;assert.equal(f.api.write(f.state).ok,true);f.drain();assert.equal(f.workers[0].commits.length,0);assert.equal(f.api.read('dev').credits,200);assert.equal(f.api.pending(f.state),false);
});
test('worker failure keeps a partial checkpoint dirty and falls back to a complete verified save',()=>{
 const f=fixture();f.start();f.timers.shift()();f.workers[0].onerror({preventDefault(){}});f.drain();assert.equal(f.api.pending(f.state),true);f.state.hull=77;assert.equal(f.api.flushDue(f.state).ok,true);assert.equal(f.api.read('dev').hull,77);
});

test('state replacement cancels old partial transfers and allows the new full checkpoint immediately',()=>{
 const f=fixture();f.start();f.timers.shift()();const old=f.state,newState=JSON.parse(JSON.stringify(old));newState.credits=777;
 f.api.prepare(newState);f.api.schedule(newState,{now:.3});f.api.flushDue(newState,{now:.6});f.drain();
 assert.equal(f.workers[0].commits.length,1);f.workers[0].reply();assert.equal(f.api.read('dev').credits,777);assert.equal(f.api.pending(newState),false);
});

test('denied streamed storage stays dirty and a later verified retry preserves the latest state',()=>{
 const f=fixture();f.start();f.drain();const set=f.storage.setItem;
 f.storage.setItem=()=>{throw Error('denied');};f.workers[0].reply();assert.equal(f.api.pending(f.state),true);assert.equal(f.api.metrics().ok,false);
 f.storage.setItem=set;f.state.credits=123;f.time(2);assert.equal(f.api.flushDue(f.state).ok,false);f.api.flushDue(f.state);f.drain();f.workers[0].reply();
 assert.equal(f.api.pending(f.state),false);assert.equal(f.api.metrics().ok,true);assert.equal(f.api.read('dev').credits,123);
});

test('text transfer preserves JSON omissions, array holes, nonfinite values and repeated object references',()=>{
 const f=fixture(),shared={value:3.125,omitted:undefined};Object.assign(f.state,{omitted:undefined,method(){},symbol:Symbol('ignored'),array:[undefined,,NaN,Infinity,-0],one:shared,two:shared});
 const expected=JSON.parse(JSON.stringify(f.state));f.start();f.drain();f.workers[0].reply();
 assert.deepEqual(JSON.parse(JSON.stringify(f.api.read('dev'))),{...expected,saveSlotVersion:3});assert.equal(Object.hasOwn(f.api.read('dev'),'omitted'),false);
});
