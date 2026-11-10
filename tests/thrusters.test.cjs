const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(saved){
 const f=await fixture({full:false,economic:false,regional:true,repairs:true,saved});
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/shipyard-refits.js','utf8'),f.context);
 if(!saved)Object.assign(f.state,{system:1,latinum:100000,minerals:{},shipyardDock:{station:'mars-earth-shipyard-01',phase:'docked'},phase:'flight'});
 const eq=f.window.nativeShipEquipment.ensure(f.state);
 return {...f,eq,t:f.window.nativeShipThrusters,r:f.window.nativeShipyardRefits,stats:()=>f.window.nativeShipDefinitions.forEntity(f.state)};
}
test('every ship receives independent permanent hull thrusters and legacy migration preserves owned gear and vitals',async()=>{
 const f=await setup(),w=f.window,s=f.state,gear=JSON.stringify(f.eq),hull=s.hull,shield=s.shields,money=s.latinum;
 delete s.shipThrusters;w.nativeShipEquipment.ensure(s);assert.equal(s.shipThrusters.version,1);assert.equal(f.t.level(s),0);
 assert.equal(JSON.stringify(f.eq),gear);assert.equal(s.hull,hull);assert.equal(s.shields,shield);assert.equal(s.latinum,money);
 const records=new Set();for(const definition of w.VexedMirrorWorld.ships){const e={shipType:definition.id,id:1000+definition.id};w.nativeShipEquipment.ensure(s,e);assert.ok(!records.has(e.shipThrusters));records.add(e.shipThrusters);const d=w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'});assert.ok(d.thrusters.maxSpeed>0&&d.thrusters.acceleration>0&&d.thrusters.braking>0&&d.thrusters.turnRate>0);}
 assert.equal(w.nativeShipEquipment.model('thrusters'),null);assert.ok(!w.nativeShipEquipment.kinds.includes('thrusters'));
});
test('hull mass selects distinct baseline thrusters while the same engine retains its standard flight speed',async()=>{
 const f=await setup(),d=f.window.nativeShipDefinitions;
 d.register(9901,{name:'Light thruster test',hull:50,shields:0,cargo:20,dimensions:{width:20,height:30},physical:{mass:1}});
 d.register(9902,{name:'Heavy thruster test',hull:500,shields:0,cargo:300,dimensions:{width:100,height:200},physical:{mass:128}});
 assert.ok(d.get(9901).thrusters.maxSpeed>d.get(9902).thrusters.maxSpeed);near(d.get(9901).movement.maxSpeed,d.get(9902).movement.maxSpeed);
 assert.throws(()=>d.register(9903,{name:'Invalid thrusters',dimensions:{width:20,height:30},thrusters:{acceleration:0}}),/thruster/);
});
test('complete engine failure retains momentum and permits bounded low-speed thrust, braking and steering even with an explicit profile',async()=>{
 const f=await setup(),w=f.window,s=f.state,e=f.eq.instances[f.eq.slots.engineering[0]];e.condition=0;
 Object.assign(s,{system:2,x:1e6,y:1e6,angle:0,speed:300,vx:300,vy:0});const p=f.stats().movement,t=f.stats().thrusters;
 w.nativeShipSystems.move(s,s,'player',{throttle:1},{maxSpeed:5000,acceleration:5000,turnRate:99},1/60);
 assert.ok(s.speed>t.maxSpeed);assert.ok(300-s.speed<=p.braking/60+1e-8);
 Object.assign(s,{speed:0,vx:0,vy:0});for(let i=0;i<240;i++)w.nativeShipSystems.move(s,s,'player',{throttle:1},undefined,1/60);
 near(s.speed,t.maxSpeed);assert.ok(s.speed<100);const heading=s.angle;w.nativeShipSystems.move(s,s,'player',{turn:1},undefined,.2);assert.ok(s.angle>heading);
 const speed=s.speed;w.nativeShipSystems.move(s,s,'player',{brake:true},undefined,.2);assert.ok(s.speed<speed);
 assert.equal(e.condition,0);assert.equal(s.phase,'flight');
 s.phase='disabled';const vx=s.vx,vy=s.vy;w.nativeShipSystems.move(s,s,'player',{throttle:1,turn:1},undefined,.2);near(s.vx,vx);near(s.vy,vy);
});
test('docking upgrades charge once, improve handling and emergency performance, retain velocity and persist on that hull',async()=>{
 const f=await setup(),s=f.state,w=f.window,before=f.stats(),quote=f.t.quote(s),money=s.latinum;Object.assign(s,{speed:30,vx:30,vy:0});let saves=0;
 assert.equal(f.r.upgradeThrusters(s,()=>{saves++;return {ok:true};}).ok,true);assert.equal(saves,1);assert.equal(s.latinum,money-quote.price);assert.equal(s.shipyardLedger.latinum,quote.price);
 const after=f.stats();assert.equal(f.t.level(s),1);assert.ok(after.thrusters.maxSpeed>before.thrusters.maxSpeed);assert.ok(after.movement.acceleration>before.movement.acceleration&&after.movement.braking>before.movement.braking&&after.movement.turnRate>before.movement.turnRate);near(after.movement.maxSpeed,before.movement.maxSpeed);near(s.speed,30);near(s.vx,30);
 const restored=await setup(copy(s));assert.equal(restored.t.level(restored.state),1);near(restored.stats().thrusters.maxSpeed,after.thrusters.maxSpeed);
 const item=w.nativeShipEquipment.grant(s,'advanced-engine').instance;w.nativeShipEquipment.move(s,{category:'engineering',fromType:'locker',fromIndex:f.eq.locker.indexOf(item.id),toType:'slot',toIndex:0});assert.equal(f.t.level(s),1);
});
test('insufficient money, failed verified saves, maximum levels and undocked purchases cannot spend or alter the hull',async()=>{
 const f=await setup(),s=f.state;const snapshot=()=>copy(s);
 const original=snapshot();assert.equal(f.r.upgradeThrusters(s,()=>({ok:false,error:'Storage denied'})).ok,false);assert.deepEqual(snapshot(),original);
 assert.equal(f.r.upgradeThrusters(s,()=>{throw Error('Storage lost');}).ok,false);assert.deepEqual(snapshot(),original);
 s.latinum=0;const poor=snapshot();assert.equal(f.r.upgradeThrusters(s,()=>({ok:true})).ok,false);assert.deepEqual(snapshot(),poor);
 s.latinum=100000;delete s.shipyardDock;const undocked=snapshot();assert.equal(f.r.upgradeThrusters(s,()=>({ok:true})).ok,false);assert.deepEqual(snapshot(),undocked);
 for(let i=0;i<f.t.maxLevel;i++)assert.equal(f.r.upgradeThrusters(s,()=>({ok:true}),{atPort:true}).ok,true);
 const full=snapshot();assert.equal(f.r.upgradeThrusters(s,()=>({ok:true}),{atPort:true}).ok,false);assert.deepEqual(snapshot(),full);assert.equal(f.t.quote(s).price,0);
});
test('buying a replacement hull never transfers thruster upgrades, including a same-class replacement or a new NPC generation',async()=>{
 const f=await setup(),s=f.state,w=f.window;s.shipThrusters.level=2;const other={shipType:s.shipType,id:800,hull:100};w.nativeShipEquipment.ensure(s,other);assert.equal(f.t.level(other),0);
 const oldType=s.shipType;assert.equal(w.nativeShipEquipment.changeHull(s,8).ok,true);assert.equal(f.t.level(s),0);assert.equal(w.nativeShipEquipment.changeHull(s,oldType).ok,true);assert.equal(f.t.level(s),0);
 s.shipThrusters.level=2;assert.equal(w.nativeShipEquipment.changeHull(s,s.shipType).ok,true);assert.equal(f.t.level(s),0);
 other.shipThrusters.level=3;other.lifeGeneration=1;w.nativeShipEquipment.ensure(s,other);assert.equal(f.t.level(other),0);
});
