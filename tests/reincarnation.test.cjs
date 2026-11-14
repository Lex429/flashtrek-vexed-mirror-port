const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function setup(options={}){
  const f=await fixture({full:false,economic:false,regional:true,...options}),w=f.window,s=f.state,values=new Map();
  Object.assign(f.context,{setTimeout,clearTimeout});
  w.localStorage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null};
  for(const name of ['sol-flight.js','save-codec.js','save-storage.js','reincarnation.js'])
    vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+name,'utf8'),f.context,{filename:name});
  Object.assign(s,{devMode:false,hull:50,shields:50,phase:'flight',x:4e6,y:4e6,landed:false});
  s.localPrestige={1:100,55:-75};w.nativeManualFlight.initializeRegion(s);w.nativeReincarnation.initialize(s);
  return {...f,values,store:w.nativeSaveStorage,policy:w.nativeReincarnation};
}
test('combat autosaves preserve a separate whole-world checkpoint from before the offence',async()=>{
  const {state:s,window:w,store,policy}=await setup();
  s.latinum=100;s.day=4;s.planetGovts={1:1};s.solFreightHold={5:2.75};
  const npc=s.civilianTraffic.ships[0];npc.credits=98.125;
  assert.equal(store.write(s).ok,true);const before=copy(store.readReincarnation(s));
  assert.equal(policy.beforeDanger(s).ok,true);
  w.nativeFactionStanding.shipAttacked(s,1,1);w.nativeFactionStanding.shipDestroyed(s,1);
  s.factionDefence={systems:{1:{government:1,aggressors:[{id:'player',until:120}]}},orders:[{shipId:npc.id,targetId:'player'}]};
  s.latinum=5;s.day=9;s.solFreightHold[5]=0;npc.credits=5.5;s.shipSimulation.seconds+=7;
  assert.equal(store.write(s).ok,true);assert.equal(store.read('normal').latinum,5);
  s.hull=0;s.phase='destroyed';store.retire(s);
  const rewind=policy.prepare(policy.saved(s));assert.equal(rewind.ok,true);assert.equal(rewind.relocated,false);
  const r=rewind.state;
  assert.equal(r.latinum,100);assert.equal(r.day,4);assert.equal(r.localPrestige[1],100);assert.equal(r.localPrestige[55],-75);
  assert.equal(r.factionDefence,undefined);assert.equal(r.solFreightHold[5],2.75);
  assert.equal(r.civilianTraffic.ships[0].credits,98.125);assert.equal(r.shipSimulation.seconds,before.shipSimulation.seconds);
  assert.equal(store.write(r).ok,true);assert.equal(store.read('normal').latinum,100,'Continue must follow the rewound branch');
  assert.deepEqual(copy(r.civilianTraffic.life.reservations),before.civilianTraffic.life.reservations);
});
test('hostile regions, alerts, retaliation, launched shots and recent damage cannot become safe checkpoints',async()=>{
  const {state:s,window:w,store,policy,values}=await setup();store.write(s);
  const initial=values.get(store.recoveryKeys.normal);
  const variants=[
    ()=>{s.factionDefence={systems:{2:{aggressors:[{id:'player',until:999}]}}};},
    ()=>{s.civilianTraffic.retaliations=[{a:8,b:'player'}];},
    ()=>{s.weaponCombat={version:2,events:[{targetId:'player',alive:true,projectile:false}]};},
    ()=>{s.phase='disabled';},
    ()=>{s.hull=20;},
    ()=>{const b=w.nativeManualFlight.boundaries().find(b=>b.id===55),a=w.nativeManualFlight.anchor(1),body=w.nativeSystemHub.sol.find(b=>b.id===s.localBody)||w.nativeSystemHub.sol.find(b=>b.id===3);s.x=b.x-a.x-body.x;s.y=b.y-a.y-body.y;w.nativeManualFlight.initializeRegion(s);}
  ];
  for(const change of variants){
    const baseline=copy(s);change();s.shipSimulation.seconds+=20;
    assert.equal(store.checkpointReincarnation(s,{force:true}).checkpoint,false);
    assert.equal(values.get(store.recoveryKeys.normal),initial);
    for(const key of Object.keys(s))delete s[key];Object.assign(s,baseline);w.nativeManualFlight.initializeRegion(s);
  }
  policy.danger(s);assert.equal(store.checkpointReincarnation(s,{force:true}).checkpoint,false);
  w.nativePause.active=true;w.nativeSimulation.advance(s,60);
  assert.equal(store.checkpointReincarnation(s,{force:true}).checkpoint,false,'Paused wall time cannot make a checkpoint safe');
  w.nativePause.active=false;w.nativeSimulation.advance(s,16);
  assert.equal(store.checkpointReincarnation(s,{force:true}).checkpoint,true);
});
test('legacy hostile saves keep old enemies and paid jobs while returning outside every system',async()=>{
  const {state:s,window:w,policy}=await setup();
  Object.assign(s,{system:55,x:0,y:0,localBody:0,localCruise:{to:1},pendingTransit:{version:1},vx:200,vy:10,speed:201});
  s.factionDefence={systems:{55:{government:1,aggressors:[{id:'player',until:120}]}},orders:[]};
  const jobs=copy(s.civilianTraffic.life.reservations),crew=copy(s.civilianTraffic.ships),before=w.nativeManualFlight.position(s);
  const result=policy.prepare(s);assert.equal(result.ok,true);assert.equal(result.relocated,true);
  assert.equal(s.system,55,'The saved coordinate frame is retained');assert.equal(w.nativeManualFlight.currentRegion(s).system,null);
  const point=w.nativeManualFlight.position(s);assert.ok(Math.hypot(point.x-before.x,point.y-before.y)>12000);
  for(const boundary of w.nativeManualFlight.boundaries())assert.ok(Math.hypot((point.x-boundary.x)/boundary.rx,(point.y-boundary.y)/boundary.ry)>1);
  assert.equal(s.localPrestige[55],-75);assert.equal(s.factionDefence.systems[55].aggressors[0].id,'player');
  assert.deepEqual(copy(s.civilianTraffic.life.reservations),jobs);assert.deepEqual(copy(s.civilianTraffic.ships),crew);
  assert.equal(s.vx,0);assert.equal(s.localCruise,null);assert.equal(s.pendingTransit,undefined);
});
test('Sol refuge accounts for body-relative offsets and never changes the normal crossing envelope',async()=>{
  const {state:s,window:w}=await setup();Object.assign(s,{system:1,localBody:4,x:100,y:90});
  const body=w.nativeSystemHub.sol.find(b=>b.id===4);assert.notEqual(body.x,0);
  const expected=w.nativeManualFlight.relocateOutside(s);
  assert.ok(expected);assert.deepEqual(copy(w.nativeManualFlight.position(s)),copy(expected));
  assert.equal(w.nativeManualFlight.currentRegion(s).system,null);assert.equal(w.nativeManualFlight.boundaryMargin,0);
});
test('checkpoints are verified, mode-separated, campaign-bound and immune to destroyed graphs',async()=>{
  const {state:s,window:w,store,policy,values}=await setup();store.write(s);
  const normal=values.get(store.recoveryKeys.normal),dev=copy(s);dev.devMode=true;dev.latinum=99;
  store.write(dev);assert.equal(store.readReincarnation(dev).latinum,99);assert.equal(values.get(store.recoveryKeys.normal),normal);
  const other=copy(s);delete other.reincarnation;policy.initialize(other);
  assert.equal(store.readReincarnation(other),null);assert.equal(policy.saved(other),null);
  s.shipSimulation.seconds+=20;
  const denied={getItem:w.localStorage.getItem,setItem(){throw Error('Quota');}};
  const lost={getItem:()=>null,setItem(){}};
  for(const storage of [denied,lost])assert.equal(store.checkpointReincarnation(s,{force:true,storage}).ok,false);
  assert.equal(values.get(store.recoveryKeys.normal),normal);
  s.hull=0;store.retire(s);assert.equal(store.checkpointReincarnation(s,{force:true}).ok,false);
  assert.equal(values.get(store.recoveryKeys.normal),normal);
});
test('late checkpoint and durable encoders cannot bless a world after combat starts',async()=>{
  for(const durable of [false,true]){
    const {state:s,window:w,store,policy,values}=await setup({full:true,population:true,access:true});
    store.write(s);const before=values.get(store.recoveryKeys.normal),workers=[];
    w.Worker=class{
      constructor(){workers.push(this);}
      postMessage(message){this.message=JSON.parse(JSON.stringify(message));}
      terminate(){}
      reply(){const m=this.message;this.onmessage({data:{id:m.id,serialized:m.text||w.nativeSaveCodec.stringify(m.state)}});}
    };
    s.shipSimulation.seconds+=20;s.latinum=100;
    let promise;
    if(durable)promise=store.writeAsync(s);
    else{store.schedule(s,{now:0});store.flushDue(s,{now:1});}
    assert.equal(workers.length,1);policy.danger(s);s.latinum=5;
    workers[0].reply();if(promise)assert.equal((await promise).ok,true);
    assert.equal(values.get(store.recoveryKeys.normal),before);
  }
});
