const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const root=path.join(__dirname,'../html-games/flashtrek-broken-mirror');
function fixture(storage=new Map()){
  const window={};
  const context=vm.createContext({window,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},console});
  for(const file of ['repair-drone-fleet.js','steamrunner-repair.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return {fleet:window.repairDroneFleet,plan:window.steamrunnerRepair.plan,storage};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('legacy purchases migrate; role upgrades share slots but enemy upgrades never spend credits',()=>{
  const old={version:1,credits:5800,owned:{basic:2,upgraded:1,advanced:0}};
  const {fleet,storage}=fixture(new Map([['vexedMirrorRepairWorkshop.v1',JSON.stringify(old)]]));
  assert.deepEqual(plain(fleet.read().owned),old.owned);assert.equal(fleet.read().credits,5800);
  assert.equal(fleet.buy('basic','defense').ok,true);assert.equal(fleet.upgrade('basic','defense').ok,true);
  assert.equal(fleet.read().credits,4600);assert.equal(fleet.upgrade('upgraded','defense').ok,true);
  assert.equal(fleet.read().credits,2800);assert.equal(fleet.read().defense.advanced,1);
  const before=plain(fleet.read());assert.equal(fleet.configureWave('basic','upgrade'),true);assert.equal(fleet.configureWave('upgraded','upgrade'),true);
  assert.equal(fleet.read().credits,before.credits);assert.deepEqual(plain(fleet.read().owned),before.owned);
  assert.equal(fleet.read().wave.advanced,1);assert.equal(fleet.lose('advanced','attack'),false);
  assert.equal(fleet.lose('advanced','defense'),true);assert.equal(fixture(storage).fleet.read().defense.advanced,0);
  for(let i=0;i<5;i++)assert.equal(fleet.buy('basic','defense').ok,true);
  assert.equal(fleet.buy('basic').ok,false);assert.equal(fleet.buy('basic','defense').ok,false);
});
test('buying and upgrading preserve ownership, charge exactly once, and persist separately from game saves',()=>{
  const storage=new Map([['gameSave','untouched']]),{fleet}=fixture(storage);
  assert.deepEqual(plain(fleet.read()),{version:2,credits:6000,owned:{basic:1,upgraded:0,advanced:0},defense:{basic:0,upgraded:0,advanced:0},wave:{basic:2,upgraded:0,advanced:0}});
  assert.equal(fleet.buy('basic').ok,true);
  assert.equal(fleet.read().credits,5700);
  assert.equal(fleet.upgrade('basic').ok,true);
  assert.equal(fleet.read().credits,5100);
  assert.equal(fleet.upgrade('upgraded').ok,true);
  assert.equal(fleet.read().credits,3600);
  assert.deepEqual(plain(fleet.read().owned),{basic:1,upgraded:0,advanced:1});
  const saved=plain(fleet.read());
  assert.deepEqual(plain(fixture(storage).fleet.read()),saved);
  assert.equal(storage.get('gameSave'),'untouched');
  const exposed=fleet.read();exposed.owned.basic=100;exposed.credits=0;
  assert.deepEqual(plain(fleet.read()),saved,'readers cannot mutate saved inventory');
});
test('insufficient funds, missing upgrades, invalid tiers and full hangars cannot spend or create drones',()=>{
  const {fleet}=fixture();
  assert.equal(fleet.buy('advanced').ok,true);assert.equal(fleet.buy('advanced').ok,true);
  const before=plain(fleet.read());
  for(const action of [()=>fleet.buy('advanced'),()=>fleet.upgrade('upgraded'),()=>fleet.upgrade('advanced'),()=>fleet.buy('unknown')]){
    assert.equal(action().ok,false);assert.deepEqual(plain(fleet.read()),before);
  }
  const full=fixture().fleet;
  for(let i=0;i<7;i++)assert.equal(full.buy('basic').ok,true);
  const capped=plain(full.read());assert.equal(full.buy('basic').ok,false);assert.deepEqual(plain(full.read()),capped);
  assert.equal(full.upgrade('basic').ok,true,'an upgrade does not require a free hangar slot');
  assert.equal(Object.values(full.read().owned).reduce((a,b)=>a+b),8);
});
test('malformed inventories recover to a usable starter fleet',()=>{
  for(const saved of ['broken','null',JSON.stringify({version:1,credits:-5,owned:{basic:1,upgraded:0,advanced:0}}),JSON.stringify({version:1,credits:5,owned:{basic:99,upgraded:0,advanced:0}})]){
    const {fleet}=fixture(new Map([['vexedMirrorRepairWorkshop.v1',saved]]));
    assert.equal(fleet.read().credits,6000);assert.equal(fleet.read().owned.basic,1);
  }
});
test('lost drones are removed once per loss; a saved empty fleet never grants a free replacement',()=>{
  const {fleet,storage}=fixture();
  assert.equal(fleet.lose('basic'),true);assert.equal(fleet.lose('basic'),false);assert.equal(fleet.lose('unknown'),false);
  assert.equal(fleet.read().credits,6000);assert.equal(fixture(storage).fleet.read().owned.basic,0);
  assert.equal(fleet.buy('basic').ok,true);assert.equal(fleet.read().credits,5700);
  assert.deepEqual(plain(fleet.tiers.map(t=>t.health)),[40,90,180]);
});
test('quality and fleet size shorten the same job, with unique work assignments and a limited final breach',()=>{
  const {plan}=fixture();let next=0;
  const regions=[170,290,340,270,184].map(count=>Array.from({length:count},()=>({id:next++})));
  const basic=plan(regions,{basic:1}),upgraded=plan(regions,{upgraded:1}),advanced=plan(regions,{advanced:1});
  const pair=plan(regions,{basic:2}),large=plan(regions,{basic:8}),mixed=plan(regions,{basic:1,upgraded:1,advanced:1});
  assert.ok(advanced.duration<upgraded.duration&&upgraded.duration<basic.duration);
  assert.ok(large.duration<pair.duration&&pair.duration<basic.duration);
  for(const mission of [basic,upgraded,advanced,pair,large,mixed]){
    const assigned=mission.drones.flatMap(d=>d.jobs.flatMap(j=>j.cells.map(c=>c.id)));
    assert.equal(assigned.length,next);assert.equal(new Set(assigned).size,next,'each damaged tile has one repair owner');
    for(const drone of mission.drones){
      for(let i=1;i<drone.jobs.length;i++)assert.ok(drone.jobs[i].start>drone.jobs[i-1].end);
      assert.ok(drone.returnAt>drone.end&&drone.dockAt>drone.returnAt);
    }
  }
  const singleBreach=plan([[{id:1}]],{basic:8});
  assert.equal(singleBreach.drones.length,1,'surplus drones stay aboard when there is only one work site');
  assert.equal(singleBreach.duration,plan([[{id:1}]],{basic:1}).duration);
  assert.equal(plan(regions,{basic:0,upgraded:0,advanced:0}).drones.length,0,'an empty saved fleet cannot launch a free drone');
});
test('escort deployment shifts launch times while preserving every welding duration and assignment',()=>{
  const {plan}=fixture(),regions=[Array.from({length:240},(_,id)=>({id}))];
  const normal=plan(regions,{advanced:2}),escorted=plan(regions,{advanced:2},1,{launchDelay:800});
  for(const [i,d] of normal.drones.entries()){
    const shifted=escorted.drones[i];assert.equal(shifted.launch-d.launch,800);
    for(const [j,job] of d.jobs.entries()){
      assert.ok(Math.abs((shifted.jobs[j].end-shifted.jobs[j].start)-(job.end-job.start))<1e-8);
      assert.deepEqual(plain(shifted.jobs[j].cells),plain(job.cells));
    }
  }
  assert.ok(Math.abs(escorted.duration-normal.duration-800)<1e-8);
});
