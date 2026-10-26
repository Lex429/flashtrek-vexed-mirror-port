const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('all 66 hulls start with the same owned engine and actual Intrepid speed for player and NPC',async()=>{
 const {window:w}=await fixture({full:false,economic:false});
 const original=w.VexedMirrorWorld.ships.find(s=>s.id===36).speedOrOtherStationValue*4.5;
 assert.equal(original,427.5);
 for(const {id,turn} of w.VexedMirrorWorld.ships){
  const s={shipType:id},npc={shipType:id,id:1000+id};
  for(const [e,category] of [[s,'player'],[npc,'civilian']]){
   const eq=w.nativeShipEquipment.ensure(s,e),d=w.nativeShipDefinitions.forEntity(s,e,{category});
   assert.equal(eq.instances[eq.slots.engineering[0]].modelId,'standard-engine');
   near(d.movement.maxSpeed,original);near(d.movement.turnRate,Math.max(.5,turn/4));
   assert.equal(d.hull,w.nativeShipDefinitions.get(id).hull);
  }
 }
});

test('each purchased tier changes real shared flight, swaps identities, and survives hull changes and reload',async()=>{
 const {window:w,state:s}=await fixture({full:false,economic:false});s.latinum=10000;s.system=2;s.phase='flight';
 const api=w.nativeShipEquipment,eq=api.ensure(s),original=eq.slots.engineering[0];
 for(const [id,rating,price] of [['upgraded-engine',104.5,2500],['advanced-engine',114,5000]]){
  const wallet=s.latinum,result=api.purchase(s,id);assert.ok(result.ok);assert.equal(s.latinum,wallet-price);
  const owned=result.instance;owned.readyAt=42;owned.upgrades.tuned=2;
  assert.ok(api.move(s,{category:'engineering',fromType:'locker',fromIndex:eq.locker.indexOf(owned.id),toType:'slot',toIndex:0}).ok);
  const d=w.nativeShipDefinitions.forEntity(s);near(d.speedOrOtherStationValue,rating);
  Object.assign(s,{x:0,y:0,angle:0,speed:0,vx:0,vy:0});
  for(let i=0;i<180;i++)w.nativeShipSystems.move(s,s,'player',{throttle:1},undefined,1/60);
  near(s.speed,rating*4.5);assert.ok(s.x>rating*4.5);
  const restored=plain(s);api.ensure(restored);near(w.nativeShipDefinitions.forEntity(restored).movement.maxSpeed,rating*4.5);
  assert.equal(restored.shipEquipment.slots.engineering[0],owned.id);assert.equal(restored.shipEquipment.instances[owned.id].readyAt,42);
  assert.ok(api.changeHull(s,36).ok);assert.equal(eq.slots.engineering[0],owned.id);near(w.nativeShipDefinitions.forEntity(s).movement.maxSpeed,rating*4.5);s.phase='flight';
  const npc={shipType:7,id:999,credits:10000};api.ensure(s,npc);const n=api.grant(s,id,{holder:npc,location:'slot',slot:0});assert.ok(n.ok);
  near(w.nativeShipDefinitions.forEntity(s,npc,{category:'civilian'}).movement.maxSpeed,rating*4.5);
 }
 assert.ok(eq.locker.includes(original));
 const before=JSON.stringify(eq);s.latinum=0;assert.equal(api.purchase(s,'advanced-engine').ok,false);assert.equal(JSON.stringify(eq),before);
});

test('an empty engineering bay still accelerates, steers and brakes at original Saber speed for every hull',async()=>{
 const {window:w}=await fixture({full:false,economic:false,regional:true});
 const basic=w.VexedMirrorWorld.ships.find(s=>s.id===6).speedOrOtherStationValue*4.5;
 for(const {id} of w.VexedMirrorWorld.ships){
  const s={shipType:id,system:2,phase:'flight',x:0,y:0,angle:0,speed:0,mineralUpgrades:{[id]:{engine:3}}};
  const eq=w.nativeShipEquipment.ensure(s),engine=eq.slots.engineering[0];
  assert.ok(w.nativeShipEquipment.move(s,{category:'engineering',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length}).ok);
  const d=w.nativeShipDefinitions.forEntity(s);assert.equal(d.engineOnline,false);near(d.movement.maxSpeed,basic);
  for(let i=0;i<180;i++)w.nativeShipSystems.move(s,s,'player',{throttle:1},undefined,1/60);
  near(s.speed,basic);assert.ok(s.x>basic);
  w.nativeShipSystems.move(s,s,'player',{turn:1},undefined,.25);assert.ok(s.angle>0);
  for(let i=0;i<180;i++)w.nativeShipSystems.move(s,s,'player',{brake:true},undefined,1/60);
  near(s.speed,0);
  const saved=plain(s);w.nativeShipEquipment.ensure(saved);assert.equal(saved.shipEquipment.slots.engineering[0],null);assert.ok(saved.shipEquipment.locker.includes(engine));near(w.nativeShipDefinitions.forEntity(saved).movement.maxSpeed,basic);
 }
});

test('legacy engine identity and tuning remain attached to hardware and explicit drone motion stays intact',async()=>{
 const {window:w}=await fixture({full:false,economic:false,regional:true,repairs:true});
 const s={shipType:10,tugEngineLevel:2,mineralUpgrades:{10:{engine:1}}},api=w.nativeShipEquipment,eq=api.ensure(s),old=eq.slots.engineering[0];
 near(w.nativeShipDefinitions.forEntity(s).speedOrOtherStationValue,(95+30)*1.08);
 api.grant(s,'advanced-engine',{location:'slot',slot:0});near(w.nativeShipDefinitions.forEntity(s).speedOrOtherStationValue,114*1.08);
 assert.equal(eq.instances[old].upgrades.tugEngineLevel,2);
 const again=plain(s);api.ensure(again);assert.deepEqual(plain(again.shipEquipment),plain(eq));
 assert.equal(w.nativeShipDefinitions.get(9001).movement.maxSpeed,85);
 for(const id of ['standard-engine','upgraded-engine','advanced-engine']){
  const m=api.model(id);assert.ok(fs.statSync('html-games/broken-mirror-port/'+m.icon).size>10000);
 }
});
