const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const data=new Map(),writes=[];let time=0;
  const storage={setItem(key,value){data.set(key,value);writes.push(key);},getItem:key=>data.get(key)||null};
  const window={localStorage:storage,performance:{now:()=>time*1000}},context=vm.createContext({window});
  vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/save-storage.js','utf8'),context);
  return {api:window.nativeSaveStorage,storage,data,writes,time:seconds=>{time=seconds;}};
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
