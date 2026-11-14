const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function setup(){
 const f=await fixture({full:false,regional:true,economic:false});
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/shipyard-refits.js','utf8'),f.context);
 const s=f.state,w=f.window;Object.assign(s,{system:1,latinum:1000000,dilithium:1000,minerals:{tritanium:1000,trellium:1000,gallicite:1000,benamite:1000,deuranium:1000},shipyardDock:{station:'mars-earth-shipyard-01',phase:'docked'},phase:'docked',hull:50,shields:50});
 w.nativeShipEquipment.ensure(s);return {...f,r:w.nativeShipyardRefits,api:w.nativeShipEquipment,save:()=>({ok:true})};
}
test('every existing weapon family keeps its hit/range/power/visual ratings and has I, V, X recharge grades',async()=>{
 const {window:w,api}=await setup();
 for(const base of api.models().filter(m=>m.category==='weapon')){
  const item={id:'test',modelId:base.id},kind=w.nativeCombatShots.weaponVisual(base).kind;
  const original=w.nativeWeaponRules.weaponSpec(base,kind);
  for(const [level,factor] of [1,.75,.5].entries()){
   item.weaponGrade={version:1,level};const data=api.forInstance(item),spec=w.nativeWeaponRules.weaponSpec(data,kind);
   assert.equal(data.name.split(' ').at(-1),['I','V','X'][level]);
   for(const key of ['damage','range','arc','speed','turn','mount','spread','radius'])assert.equal(spec[key],original[key],`${base.id}/${key}`);
   assert.equal(data.id,base.id);assert.equal(data.visualId,base.visualId);assert.equal(data.power,base.power);
   assert.ok(Math.abs(spec.recharge-original.recharge*factor)<1e-12);
  }
 }
});
test('paid upgrades improve one owned copy, retain its slot and active deadline, and cap at X',async()=>{
 const {state:s,api,r,save}=await setup();
 const a=api.grant(s,1002,{location:'slot',slot:1}).instance,b=api.grant(s,1002).instance;a.readyAt=29;b.readyAt=11;
 for(const level of [1,2]){
  const q=r.weaponQuote(s,a.id),before=plain(s),slots=plain(s.shipEquipment.slots);
  assert.equal(r.upgradeWeapon(s,a.id,save).ok,true);
  assert.equal(s.latinum,before.latinum-q.price);assert.deepEqual(plain(s.shipEquipment.slots),slots);
  for(const [key,n] of Object.entries(q.materials))assert.equal(key==='dilithium'?s.dilithium:s.minerals[key],(key==='dilithium'?before.dilithium:before.minerals[key])-n);
  assert.equal(a.weaponGrade.level,level);assert.equal(a.modelId,1002);assert.equal(a.readyAt,29);
  assert.equal(api.weaponGrade(b),0);assert.equal(b.readyAt,11);assert.equal(api.forInstance(b).name,'Phaser Array I');
 }
 const before=plain(s);assert.equal(r.upgradeWeapon(s,a.id,save).ok,false);assert.deepEqual(plain(s),before);
 assert.equal(api.forInstance(a).name,'Phaser Array X');
});
test('real firing reads the graded copy through the shared combat cooldown owner',async()=>{
 const {window:w,state:s,ship:enemy,api,r,save}=await setup();
 const graded=api.grant(s,1002,{location:'slot',slot:1}).instance,base=api.grant(s,1002,{location:'slot',slot:2}).instance;
 assert.equal(r.upgradeWeapon(s,graded.id,save).ok,true);assert.equal(r.upgradeWeapon(s,graded.id,save).ok,true);
 Object.assign(s,{system:2,x:0,y:0,angle:0,phase:'flight',landed:false});delete s.shipyardDock;
 Object.assign(enemy,{system:2,x:200,y:0,heading:Math.PI,hull:100,shields:100});
 const now=w.nativeSimulation.seconds(s),shooter=w.nativeShipDefinitions.describe(s),target=w.nativeShipDefinitions.describe(s,enemy,{category:'civilian'});
 for(const slot of [1,2]){const shot=w.nativeCombatShots.fireFor({state:s,shooter,target,selection:{slot}});assert.equal(shot.ok,true,shot.error);}
 assert.equal(graded.readyAt-now,(10/13)*.5);assert.equal(base.readyAt-now,10/13);
});
test('legacy copies stay at their existing recharge until upgraded; JSON, fitting and transfers retain the grade',async()=>{
 const {window:w,state:s,ship:enemy,api,r,save}=await setup();const item=api.grant(s,1).instance;
 delete item.weaponGrade;item.readyAt=41;const raw=w.VexedMirrorWeapons.find(m=>m.id===1).recharge;
 assert.equal(api.forInstance(item).recharge,raw);assert.equal(item.weaponGrade,undefined);
 assert.equal(r.upgradeWeapon(s,item.id,save).ok,true);
 const restored=plain(s);api.ensure(restored);const copy=restored.shipEquipment.instances[item.id];
 assert.equal(api.forInstance(copy).recharge,raw*.75);assert.equal(copy.readyAt,41);
 const fromIndex=s.shipEquipment.locker.indexOf(item.id);
 assert.equal(api.move(s,{category:'weapon',fromType:'locker',fromIndex,toType:'slot',toIndex:1}).ok,true);
 assert.equal(api.forInstance(item).recharge,raw*.75);assert.equal(item.readyAt,41);
 const moved=api.transfer(s,{from:s,to:enemy,id:item.id});assert.equal(moved.ok,true);
 const transferred=Object.values(enemy.shipEquipment.instances).find(i=>i.readyAt===41&&i.weaponGrade?.level===1);
 assert.ok(transferred);assert.equal(api.forInstance(transferred).recharge,raw*.75);
 assert.equal(api.changeHull(s,58,{holder:enemy}).ok,true);
 assert.equal(api.forInstance(transferred).recharge,raw*.75);
 assert.equal(api.ownedWeapons(s).some(entry=>entry.instance===transferred),false);
});
test('invalid ownership, non-weapons, insufficient stock, undocking and save failures cannot grant a grade',async()=>{
 const {state:s,api,r,save}=await setup();const item=api.grant(s,1006).instance;
 for(const id of ['not-owned',s.shipEquipment.slots.engineering[0]]){
  const before=plain(s);assert.equal(r.upgradeWeapon(s,id,save).ok,false);assert.deepEqual(plain(s),before);
 }
 const before=plain(s);assert.equal(r.upgradeWeapon(s,item.id,()=>({ok:false,error:'Denied write'})).ok,false);assert.deepEqual(plain(s),before);
 s.latinum=0;const poor=plain(s);assert.equal(r.upgradeWeapon(s,item.id,save).ok,false);assert.deepEqual(plain(s),poor);
 s.latinum=1000000;s.shipyardDock.phase='departing';const departing=plain(s);assert.equal(r.upgradeWeapon(s,item.id,save).ok,false);assert.deepEqual(plain(s),departing);
});
