const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
async function setup(saved){
 const f=await fixture({full:false,economic:false,regional:true,repairs:true,saved}),w=f.window,s=f.state,e=f.ship;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-looting.js'),'utf8'),f.context);
 if(!saved){
  Object.assign(s,{shipType:7,system:1,x:90000,y:90000,hull:50,shields:50,phase:'flight',landed:false,journey:null,localCruise:null,deuranium:0,solFreightHold:{},minerals:{}});
  f.lives.interrupt(s,e,'disabled');Object.assign(e,{shipType:7,weapons:[1],system:1,x:s.x+120,y:s.y,hull:10,shields:0,cargo:{good:5,tons:10,owner:e.id},repairDeuranium:12,oreHold:0});
  delete e.shipEquipment;delete e.weaponLoadout;delete e.repairBay;
  w.nativeShipSystems.invalidate(s);w.nativeShipEquipment.ensure(s);w.nativeShipEquipment.ensure(s,e);
 }
 const ref=w.nativeShipLoot.reference(w.nativeShipDefinitions.describe(s,e,{category:'civilian'}));
 return {...f,loot:w.nativeShipLoot,ref};
}
test('looting requires the same live disabled hull, shields down, range and real capacity',async()=>{
 const f=await setup(),{window:w,state:s,ship:e,loot,ref}=f;
 assert.equal(loot.status(s,ref).ok,true);
 for(const change of [{phase:'cruise'},{shields:1},{hull:0},{x:s.x+351},{lifeGeneration:1}]){
  const old=Object.fromEntries(Object.keys(change).map(k=>[k,e[k]]));Object.assign(e,change);w.nativeShipSystems.refreshShip(s,e,'civilian');
  assert.equal(loot.take(s,ref,'cargo',1).ok,false,JSON.stringify(change));Object.assign(e,old);w.nativeShipSystems.refreshShip(s,e,'civilian');
 }
 s.deuranium=w.nativeShipDefinitions.forEntity(s).cargo;
 assert.equal(loot.take(s,ref,'cargo',1).ok,false);assert.equal(e.cargo.tons,10);
});
test('actual cargo and fractional repair reserves transfer once, with hold limits and reload conservation',async()=>{
 let f=await setup(),{state:s,ship:e,loot,ref}=f;
 const total=e.cargo.tons+(s.solFreightHold[5]||0);
 assert.equal(loot.take(s,ref,'cargo',3).quantity,3);assert.equal(e.cargo.tons,7);assert.equal(s.solFreightHold[5],3);
 assert.equal(loot.take(s,ref,'repairDeuranium',.25).quantity,.25);assert.equal(e.repairDeuranium,11.75);assert.equal(s.deuranium,.25);
 f=await setup(copy(s));assert.equal(f.ship.cargo.tons+f.state.solFreightHold[5],total);
 assert.equal(f.loot.take(f.state,f.ref,'cargo',999).quantity,7);assert.equal(f.ship.cargo,null);assert.equal(f.state.solFreightHold[5],10);
 assert.equal(f.loot.take(f.state,f.ref,'cargo',1).ok,false);
});
test('raw mined deuranium stays raw, and remaining cargo does not overflow the player hold',async()=>{
 const {window:w,state:s,ship:e,loot,ref}=await setup();e.cargo={good:7,tons:10,oreType:'deuranium',raw:true,name:'Deuranium ore',owner:e.id};
 s.deuranium=w.nativeShipDefinitions.forEntity(s).cargo-2;
 assert.equal(loot.take(s,ref,'cargo',10).quantity,2);assert.equal(e.cargo.tons,8);assert.equal(s.minerals.deuranium,2);
 assert.equal(s.deuranium,w.nativeShipDefinitions.forEntity(s).cargo-2);assert.equal(w.nativeShipEquipment.cargoUsed(s),w.nativeShipDefinitions.forEntity(s).cargo);
});
test('equipment ownership moves the same worn instance and deadline, resolving local ID collisions without replacement',async()=>{
 const f=await setup(),{window:w,state:s,ship:e,loot,ref}=f,a=w.nativeShipEquipment.ensure(s,e),b=w.nativeShipEquipment.ensure(s),id=a.slots.weapon.find(Boolean),item=a.instances[id];
 assert.ok(b.instances[id],'Fixture must exercise an actual local-ID collision');item.readyAt=123.75;item.upgrades={level:2};
 const count=Object.keys(a.instances).length+Object.keys(b.instances).length;
 const result=loot.take(s,ref,'equipment:'+id);assert.equal(result.ok,true);
 const owned=b.instances[b.locker.at(-1)];assert.equal(owned,item);assert.equal(owned.readyAt,123.75);assert.equal(owned.upgrades.level,2);assert.notEqual(owned.id,id);
 assert.equal(a.instances[id],undefined);assert.equal(a.slots.weapon.includes(id),false);
 assert.equal(Object.keys(a.instances).length+Object.keys(b.instances).length,count);
 const g=await setup(copy(s));assert.equal(g.window.nativeShipEquipment.ensure(g.state,g.ship).slots.weapon.filter(Boolean).length,a.slots.weapon.filter(Boolean).length);
 assert.equal(g.state.shipEquipment.instances[owned.id].readyAt,123.75);
});
test('failed verified saves roll back both holders and the theft journal for cargo and fitted hardware',async()=>{
 const {window:w,state:s,ship:e,loot,ref}=await setup();loot.status(s,ref);
 for(const key of ['cargo','equipment:'+e.shipEquipment.slots.weapon.find(Boolean)]){
  const before=JSON.stringify(s),result=loot.take(s,ref,key,1,{commit:()=>({ok:false,error:'Storage quota exceeded'})});
  assert.equal(result.ok,false);assert.match(result.error,/quota/);assert.deepEqual(copy(s),JSON.parse(before));
 }
 assert.equal(w.nativeShipSystems.resolve(s,e.id).shields,0);
});
test('a stowed DOT transfers with its actual damage; launch and destruction immediately remove its loot eligibility',async()=>{
 const {window:w,state:s,ship:e,loot,ref}=await setup(),eq=e.shipEquipment,id=eq.slots.repairDrone[0],dot=eq.instances[id];
 dot.phase='launching';assert.equal(loot.take(s,ref,'equipment:'+id).ok,false);
 dot.phase='destroyed';dot.hull=0;assert.equal(loot.take(s,ref,'equipment:'+id).ok,false);
 dot.phase='stowed';dot.hull=17;dot.readyAt=99;
 assert.equal(loot.take(s,ref,'equipment:'+id).ok,true);
 const owned=s.shipEquipment.instances[s.shipEquipment.locker.at(-1)];assert.equal(owned.hull,17);assert.equal(owned.readyAt,99);assert.equal(owned.phase,'stowed');
 assert.equal(eq.slots.repairDrone[0],null);w.nativeShipEquipment.ensure(s,e);assert.equal(eq.slots.repairDrone[0],null);
});
test('taking freight cancels only its old funded agreement and preserves the active repair mission',async()=>{
 const f=await setup(),{state:s,ship:e,loot,ref}=f,life=f.lives.initialize(s),buyer=f.lives.market(s,2),source=f.lives.market(s,1,3);
 const job=e.task={id:'theft-funded-contract',kind:'freight',status:'active',phase:'combat',agreement:{payment:120}};
 e.combatInterruption={taskId:job.id};e.cargo={good:5,tons:10,owner:e.id};buyer.incoming[5]+=10;buyer.fundsReserved+=120;
 life.reservations[job.id]={version:2,owner:e.id,system:1,port:3,good:5,tons:10,sourceReserved:false,destination:{system:2,port:buyer.port},destinationReserved:true,payment:120};
 const mission=f.window.nativeShipRepairs.launch(s,ref,ref),money=buyer.credits,stock=buyer.stock[5],reserve=buyer.fundsReserved,incoming=buyer.incoming[5];assert.ok(mission);
 assert.equal(loot.take(s,ref,'cargo',2,{commit:()=>({ok:false,error:'Denied'})}).ok,false);
 assert.equal(buyer.fundsReserved,reserve);assert.equal(buyer.incoming[5],incoming);assert.equal(life.reservations[job.id].destinationReserved,true);assert.equal(job.status,'active');
 assert.equal(loot.take(s,ref,'cargo',2).ok,true);assert.equal(buyer.fundsReserved,reserve-120);assert.equal(buyer.incoming[5],incoming-10);
 assert.equal(buyer.credits,money);assert.equal(buyer.stock[5],stock);assert.equal(e.cargo.tons,8);assert.equal(s.solFreightHold[5],2);
 assert.equal(job.status,'failed');assert.equal(life.reservations[job.id],undefined);assert.equal(e.phase,'disabled');assert.equal(mission.status,'active');assert.equal(source.reserved[5],0);
});
test('Sol company freight transfers its real remaining tons without a duplicate unload or fabricated stock',async()=>{
 const {window:w,state:s,loot}=await setup(),e=s.solEconomy.freighters[0];
 Object.assign(e,{x:s.x+100,y:s.y,system:1,phase:'disabled',hull:10,shields:0,good:4,tons:8,assignment:{from:1,to:3,good:4,tons:8}});w.nativeShipSystems.refreshShip(s,e,'tug');
 const ref=loot.reference(w.nativeShipDefinitions.describe(s,e,{category:'tug'})),ports=JSON.stringify(s.solEconomy.ports);
 assert.equal(loot.take(s,ref,'tons',3).quantity,3);assert.equal(e.tons,5);assert.equal(e.assignment.tons,5);assert.equal(s.solFreightHold[4],3);
 assert.equal(loot.take(s,ref,'tons',10).quantity,5);assert.equal(e.tons,0);assert.equal(e.assignment,null);assert.equal(JSON.stringify(s.solEconomy.ports),ports);
});
test('Take All moves real items with one verified commit, respects capacity, and reports receiving quantities',async()=>{
 const {window:w,state:s,ship:e,loot,ref}=await setup();let saves=0;
 const all=loot.status(s,ref).items,gear=Object.values(e.shipEquipment.instances),totalGear=gear.length+Object.keys(s.shipEquipment.instances).length;
 s.deuranium=w.nativeShipDefinitions.forEntity(s).cargo-3;
 const result=loot.takeAll(s,ref,{commit:()=>{saves++;return {ok:true};}});
 assert.equal(result.ok,true);assert.equal(saves,1);assert.equal(result.full,true);assert.equal(s.solFreightHold[5],3);assert.equal(e.cargo.tons,7);assert.equal(e.repairDeuranium,12);
 assert.equal(result.transfers.filter(r=>r.equipment).length,all.filter(r=>r.equipment).length);
 assert.equal(Object.keys(e.shipEquipment.instances).length+Object.keys(s.shipEquipment.instances).length,totalGear);
 for(const item of gear)assert.ok(Object.values(s.shipEquipment.instances).includes(item));
 const cargo=result.transfers.find(r=>r.sourceKey==='cargo');assert.equal(cargo.destinationKey,'freight:5');assert.equal(cargo.beforeQuantity,0);assert.equal(cargo.afterQuantity,3);
});
test('a failed Take All save rolls back every owner, item ID and ledger without a partial transfer',async()=>{
 const {state:s,loot,ref}=await setup();loot.status(s,ref);const before=copy(s);let saves=0;
 const result=loot.takeAll(s,ref,{commit:()=>{saves++;return {ok:false,error:'Storage denied'};}});
 assert.equal(result.ok,false);assert.equal(saves,1);assert.match(result.error,/Storage denied/);assert.deepEqual(copy(s),before);
});
test('Take All can empty a holder once, never takes deployed DOTs, and persists without duplication',async()=>{
 let f=await setup(),{state:s,ship:e,loot,ref}=f;const dot=e.repairBay.slots[0];dot.phase='launching';dot.missionId='still-working';
 const result=loot.takeAll(s,ref);assert.equal(result.ok,true);assert.equal(e.cargo,null);assert.equal(e.repairDeuranium,0);assert.equal(s.solFreightHold[5],10);assert.equal(s.deuranium,12);
 assert.equal(e.shipEquipment.instances[dot.id],dot);assert.equal(loot.takeAll(s,ref).ok,false);
 f=await setup(copy(s));assert.equal(f.state.solFreightHold[5],10);assert.equal(f.ship.cargo,null);
});
test('Dev repair supplies use its weightless reserve even when freight space is full',async()=>{
 const {window:w,state:s,ship:e,loot,ref}=await setup();s.devMode=true;s.solFreightHold[5]=w.nativeShipDefinitions.forEntity(s).cargo;
 const result=loot.takeAll(s,ref);assert.equal(result.ok,true);assert.equal(e.cargo.tons,10);assert.equal(e.repairDeuranium,0);assert.equal(s.deuranium,12);
});
