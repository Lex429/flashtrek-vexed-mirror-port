const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function setup(saved){
  const f=await fixture({full:false,economic:false,repairs:true,saved});
  if(!saved)Object.assign(f.state,{hull:50,shields:50,dilithium:20,latinum:100,minerals:{trellium:30,gallicite:30},phase:'flight'});
  const eq=f.window.nativeShipEquipment.ensure(f.state);
  return {...f,eq,engine:eq.instances[eq.slots.engineering[0]],shield:eq.instances[eq.slots.shield[0]]};
}
const stats=f=>f.window.nativeShipDefinitions.forEntity(f.state);
const hit=(f,damage)=>f.window.nativeShipDamage.apply(f.window.nativeShipDefinitions.describe(f.state),damage);

test('legacy devices gain condition without changing vitals, IDs, upgrades or storage',async()=>{
  let f=await setup();f.engine.upgrades.tugEngineLevel=2;
  const engineId=f.engine.id,shieldId=f.shield.id;
  delete f.engine.condition;delete f.shield.condition;f.state.hull=23;f.state.shields=7;
  f=await setup(plain(f.state));
  assert.equal(f.engine.condition,100);assert.equal(f.shield.condition,100);
  assert.equal(f.engine.id,engineId);assert.equal(f.shield.id,shieldId);assert.equal(f.engine.upgrades.tugEngineLevel,2);
  assert.equal(f.state.hull,23);assert.equal(f.state.shields,7);
});

test('shared shield-first damage wears the struck hardware and immediately reduces capabilities',async()=>{
  const f=await setup(),s=f.state;
  const first=hit(f,10);assert.equal(first.absorbed,10);assert.equal(first.hullDamage,0);
  assert.equal(f.shield.condition,80);assert.equal(f.engine.condition,100);
  assert.equal(s.shields,40);assert.equal(stats(f).shields,40);assert.equal(stats(f).ratedShields,50);
  const second=hit(f,50);assert.equal(second.absorbed,40);assert.equal(second.hullDamage,10);
  assert.equal(f.shield.condition,0);assert.equal(f.engine.condition,80);assert.equal(s.hull,40);
  assert.equal(stats(f).shields,0);assert.equal(stats(f).movement.maxSpeed,342);
  assert.equal(stats(f).movement.acceleration,256.5);
  assert.ok(f.eq.instances[f.shield.id]);
});

test('Trellium repairs shield hardware and energy, Gallicite repairs engines, and other supplies stay intact',async()=>{
  const f=await setup(),s=f.state,r=f.window.nativeShipRepairs;
  hit(f,60);const id=f.shield.id,engineId=f.engine.id;f.shield.upgrades.example=3;
  const q=r.deviceRepairQuote(s,id);assert.equal(q.currency,'trellium');assert.equal(q.cost,10);assert.equal(q.maximum,50);
  assert.ok(r.repairDevice(s,id).ok);assert.equal(f.shield.condition,100);assert.equal(s.shields,50);assert.equal(s.hull,40);
  assert.equal(s.minerals.trellium,20);assert.equal(s.dilithium,20);assert.equal(s.latinum,100);
  assert.equal(f.shield.upgrades.example,3);assert.equal(f.eq.slots.shield[0],id);
  assert.equal(r.deviceRepairQuote(s,engineId).cost,2);assert.ok(r.repairDevice(s,engineId).ok);
  assert.equal(f.engine.condition,100);assert.equal(s.minerals.gallicite,28);assert.equal(stats(f).movement.maxSpeed,427.5);
  assert.equal(s.hull,40);assert.equal(s.shipRepairs.ledger.deviceRepairs.count,2);
});

test('healthy depleted shields recharge with ore at either location using effective upgraded capacity',async()=>{
  const f=await setup(),s=f.state,r=f.window.nativeShipRepairs,api=f.window.nativeShipEquipment;
  const item=api.grant(s,'advanced-shield').instance;
  assert.ok(api.move(s,{category:'shield',fromType:'locker',fromIndex:f.eq.locker.indexOf(item.id),toType:'slot',toIndex:0}).ok);
  for(const options of [{},{atPort:true}]){
    s.shields=0;const q=r.shieldRepairQuote(s,options);assert.equal(q.maximum,60);assert.equal(q.cost,6);assert.equal(q.currency,'trellium');
    assert.ok(r.repairShields(s,options).ok);assert.equal(s.shields,60);assert.equal(item.condition,100);
  }
  assert.equal(s.minerals.trellium,18);assert.equal(s.latinum,100);
});

test('insufficient ore, full devices, missing equipment and destroyed hulls reject without mutation',async()=>{
  const f=await setup(),s=f.state,r=f.window.nativeShipRepairs;
  assert.equal(r.repairDevice(s,f.engine.id).ok,false);
  assert.equal(r.deviceRepairQuote(s,f.engine.id).cost,0);
  s.shields=0;s.minerals.trellium=5-1e-8;
  for(const id of [f.shield.id,'missing',f.eq.slots.weapon[0]]){
    const before=JSON.stringify(s);assert.equal(r.repairDevice(s,id).ok,false);assert.equal(JSON.stringify(s),before);
  }
  s.minerals.trellium=20;s.hull=0;s.phase='destroyed';assert.equal(r.repairDevice(s,f.shield.id).ok,false);
});

test('stored condition follows the same item through swapping and reload; stored repairs do not refill fitted shields',async()=>{
  let f=await setup(),s=f.state,api=f.window.nativeShipEquipment;
  f.shield.condition=25;f.engine.condition=45;
  const oldShield=f.shield.id,oldEngine=f.engine.id;
  const next=api.grant(s,'advanced-shield').instance;
  api.move(s,{category:'shield',fromType:'locker',fromIndex:f.eq.locker.indexOf(next.id),toType:'slot',toIndex:0});
  s.shields=12;assert.ok(f.window.nativeShipRepairs.repairDevice(s,oldShield).ok);
  assert.equal(s.shields,12);assert.equal(f.eq.slots.shield[0],next.id);assert.equal(f.shield.condition,100);
  f=await setup(plain(s));s=f.state;api=f.window.nativeShipEquipment;
  assert.equal(f.eq.instances[oldEngine].condition,45);assert.equal(f.eq.instances[oldShield].condition,100);
  api.move(s,{category:'shield',fromType:'locker',fromIndex:f.eq.locker.indexOf(oldShield),toType:'slot',toIndex:0});
  assert.equal(s.shields,12);assert.equal(f.eq.slots.shield[0],oldShield);
});

test('failed verified saves restore condition, ore, energy, derived stats and accounting',async()=>{
  const f=await setup(),s=f.state,r=f.window.nativeShipRepairs;hit(f,60);
  for(const id of [f.shield.id,f.engine.id])for(const save of [()=>({ok:false,error:'Storage denied'}),()=>{throw Error('Storage unavailable');}]){
    const before=JSON.stringify(s),capacity=stats(f).shields,speed=stats(f).movement.maxSpeed;
    const result=r.repairDevice(s,id,{save});assert.equal(result.ok,false);assert.match(result.error,/Storage/);
    assert.equal(JSON.stringify(s),before);assert.equal(stats(f).shields,capacity);assert.equal(stats(f).movement.maxSpeed,speed);
  }
});

test('offline engine retains its item while built-in thrusters provide slow movement without equipment wear',async()=>{
  const f=await setup(),s=f.state;
  Object.assign(s,{x:0,y:0,angle:0,vx:40,vy:0,speed:40});f.engine.condition=0;
  assert.equal(stats(f).engineOnline,false);assert.equal(stats(f).movement.maxSpeed,stats(f).thrusters.maxSpeed);
  f.window.nativeShipSystems.move(s,s,'player',{throttle:1},{maxSpeed:500,acceleration:500,turnRate:2},1);
  assert.ok(s.speed>40&&s.speed<=stats(f).thrusters.maxSpeed);assert.ok(s.x>0);assert.equal(s.phase,'flight');assert.ok(f.eq.instances[f.engine.id]);
  f.engine.condition=70;
  f.window.nativeShipSystems.move(s,s,'player',{throttle:1},undefined,1);
  assert.equal(f.engine.condition,70);assert.equal(f.shield.condition,100);
});

test('successive hull hits can break the retained engine even when hull health was restored between hits',async()=>{
  const f=await setup(),s=f.state;s.shields=0;
  hit(f,20);assert.equal(f.engine.condition,60);
  s.hull=50;hit(f,30);assert.equal(s.hull,20);assert.equal(f.engine.condition,0);
  assert.equal(stats(f).movement.maxSpeed,stats(f).thrusters.maxSpeed);assert.equal(s.phase,'flight');
  assert.ok(f.window.nativeShipRepairs.repairDevice(s,f.engine.id).ok);
  assert.equal(f.engine.condition,100);assert.equal(s.hull,20);assert.equal(s.minerals.gallicite,20);
});

test('NPC hardware wears through the same shared damage and effective-stat owners',async()=>{
  const f=await setup(),s=f.state,w=f.window,npc=f.ship;
  const eq=w.nativeShipEquipment.ensure(s,npc),engine=eq.instances[eq.slots.engineering[0]],before=w.nativeShipDefinitions.forEntity(s,npc,{category:'civilian'});
  npc.hull=before.hull;npc.shields=0;npc.phase='flight';
  w.nativeShipDamage.apply(w.nativeShipDefinitions.describe(s,npc,{category:'civilian'}),before.hull*.1);
  assert.ok(Math.abs(engine.condition-90)<1e-9);
  const after=w.nativeShipDefinitions.forEntity(s,npc,{category:'civilian'});
  assert.ok(Math.abs(after.movement.maxSpeed-before.movement.maxSpeed*.9)<1e-9);
  assert.equal(eq.slots.engineering[0],engine.id);
});

test('Dev device repair is free and does not revive a hull disabled by combat',async()=>{
  const f=await setup(),s=f.state;s.devMode=true;s.phase='disabled';s.minerals={};f.engine.condition=0;f.shield.condition=0;s.shields=0;
  const r=f.window.nativeShipRepairs;
  assert.ok(r.repairDevice(s,f.engine.id,{save:()=>({ok:true})}).ok);
  assert.ok(r.repairDevice(s,f.shield.id,{save:()=>({ok:true})}).ok);
  assert.equal(f.engine.condition,100);assert.equal(s.shields,50);assert.equal(s.phase,'disabled');assert.deepEqual(s.minerals,{});
});
