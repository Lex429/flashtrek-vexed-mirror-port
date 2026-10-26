const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const source=fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/constitution-ships.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
async function setup(){
 const f=await fixture({full:false});
 // Startup workers receive only artwork dimensions, never Canvas/effect objects.
 for(const id of [426,427])f.window.starterShips.set(id,{width:1024,height:1536});
 vm.runInContext(source,f.context,{filename:'constitution-ships.js'});
 return f;
}
test('both Constitution hulls register with worker-safe geometry and existing aligned artwork without altering the original roster',async()=>{
 const f=await fixture({full:false}),w=f.window,before=plain(w.VexedMirrorWorld.ships);
 for(const id of [426,427])w.starterShips.set(id,{width:1024,height:1536});
 vm.runInContext(source,f.context);vm.runInContext(source,f.context);
 assert.deepEqual(plain(w.VexedMirrorWorld.ships.filter(s=>s.id!==426&&s.id!==427)),before);
 for(const id of [426,427]){
  assert.equal(w.VexedMirrorWorld.ships.filter(s=>s.id===id).length,1);
  const d=w.nativeShipDefinitions.get(id);
  assert.deepEqual(plain(w.nativeShipDefinitions.validate(d)),[]);
  assert.equal(d.hull,200);assert.equal(d.shields,200);assert.equal(d.cargo,150);
  assert.deepEqual(plain(d.slots),{weapon:3,repairDrone:2,ability:2,engineering:1,shield:1});
  for(const category of ['player','civilian','tug'])assert.deepEqual(plain(w.nativeShipDefinitions.dimensions({shipType:id},category)),{width:100*1024/1536,height:100});
  assert.equal(d.artwork.frames.length,4);
  for(const file of d.artwork.frames)assert.ok(fs.existsSync(path.join(__dirname,'../html-games/flashtrek-broken-mirror/showcase-assets',file)),file);
  assert.equal(d.devOnly,true);
 }
});
test('Dev hull changes preserve owned equipment, empty bays and recharge through both variants and save reconciliation',async()=>{
 const {window:w,state:s}=await setup();s.devMode=true;
 const equipment=w.nativeShipEquipment.ensure(s),ids=Object.keys(equipment.instances).sort();
 const weapon=equipment.instances[equipment.slots.weapon[0]];weapon.readyAt=77;weapon.upgrades.test=2;
 for(const id of [426,427,7,426]){
  assert.equal(w.nativeShipEquipment.changeHull(s,id).ok,true);
  const eq=w.nativeShipEquipment.ensure(s);
  assert.deepEqual(Object.keys(eq.instances).sort(),ids);
  assert.equal(eq.instances[weapon.id].readyAt,77);assert.equal(eq.instances[weapon.id].upgrades.test,2);
  if(id!==7){assert.equal(eq.slots.repairDrone.length,2);assert.equal(eq.slots.repairDrone[1],null);}
 }
 const saved=plain(s);w.nativeShipEquipment.ensure(saved);
 assert.equal(saved.shipType,426);assert.deepEqual(plain(saved.shipEquipment),plain(s.shipEquipment));
});
test('both variants share actual movement and damage-stage transitions across player and NPC ownership',async()=>{
 const {window:w,state:s}=await setup();
 for(const id of [426,427]){
  const player={...plain(s),system:11,shipType:id,hull:200,shields:0,weapons:[1,15],shipEquipment:undefined},npc=plain(player);
  w.nativeShipEquipment.ensure(player);w.nativeShipEquipment.ensure(player,npc);
  const a=w.nativeShipDefinitions.forEntity(player),b=w.nativeShipDefinitions.forEntity(player,npc,{category:'civilian'});
  assert.deepEqual(plain(a.movement),plain(b.movement));
  for(const holder of [player,npc]){
   const category=holder===player?'player':'civilian';
   for(const [amount,hull,stage] of [[70,130,1],[50,80,2],[50,30,3]]){
    const d=w.nativeShipDefinitions.describe(player,holder,{category});
    const result=w.nativeShipDamage.apply(d,amount,{from:{x:-100,y:0}});
    assert.equal(result.hull,hull);assert.equal(result.afterStage,stage);
   }
  }
 }
});
