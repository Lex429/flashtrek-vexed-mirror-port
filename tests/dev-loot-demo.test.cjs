const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
async function setup(saved){
 const f=await fixture({repairs:true,economic:false,federation:true,orion:true,population:true,access:true,regional:true,saved});
 for(const file of ['dev-loot-demo.js','ship-looting.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),f.context);
 return f;
}
test('normal games, other systems and isolated Dev sessions do not receive practice casualties',async()=>{
 const f=await setup(),s=f.state;
 for(const change of [{devMode:false},{devMode:true,system:2},{devMode:true,system:1,localCruise:{to:3}}]){
  Object.assign(s,change);const before=JSON.stringify(s);assert.equal(f.window.nativeDevLootDemo.start(s).ok,false);assert.equal(JSON.stringify(s),before);
 }
 s.localCruise=null;f.window.nativeDevTraffic={active:()=>true};const before=JSON.stringify(s);
 assert.equal(f.window.nativeDevLootDemo.start(s).ok,false);assert.equal(JSON.stringify(s),before);
});
test('Dev workshop supplies leave room for freight while ordinary holds and real contracted cargo keep their limits',async()=>{
 const {window:w,state:s}=await setup();Object.assign(s,{devMode:false,deuranium:7,minerals:{gallicite:25},solFreightHold:{5:2},localContracts:[{tons:3}]});
 assert.equal(w.nativeShipEquipment.cargoUsed(s),37);s.devMode=true;s.devInventoryKitVersion=2;w.nativeShipEquipment.prepareDevCargo(s);assert.equal(w.nativeShipEquipment.cargoUsed(s),3);
 s.solFreightHold[5]++;assert.equal(w.nativeShipEquipment.cargoUsed(s),4);w.nativeShipEquipment.prepareDevCargo(s);assert.equal(w.nativeShipEquipment.cargoUsed(s),4);
 s.solFreightHold[5]=2+w.nativeShipDefinitions.forEntity(s).cargo-3;assert.equal(w.nativeShipEquipment.cargoUsed(s),w.nativeShipDefinitions.forEntity(s).cargo);
});
test('three existing Sol crews retain their real fitting, buy finite cargo and use transferred Dev supplies without duplicating on Continue',async()=>{
 let f=await setup(),s=f.state,w=f.window;Object.assign(s,{devMode:true,deuranium:1000,phase:'flight',landed:false});
 const ids=s.civilianTraffic.ships.map(e=>e.id),owned=s.civilianTraffic.ships.map(e=>Object.keys(e.shipEquipment.instances));
 const markets=w.nativeSolEconomy.ports.map(port=>f.lives.market(s,1,port));
 const money=()=>s.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0)+markets.reduce((n,m)=>n+m.credits,0);
 const food=()=>s.civilianTraffic.ships.reduce((n,e)=>n+(e.cargo?.good===5?e.cargo.tons:0),0)+markets.reduce((n,m)=>n+m.stock[5],0);
 const supplies=()=>s.deuranium+s.civilianTraffic.ships.reduce((n,e)=>n+(e.repairDeuranium||0),0);
 const initial={money:money(),food:food(),supplies:supplies()},demo=w.nativeDevLootDemo.start(s);
 assert.equal(demo.ok,true);assert.equal(demo.ships.length,3);assert.equal(s.civilianTraffic.ships.length,1200);
 assert.deepEqual(s.civilianTraffic.ships.map(e=>e.id),ids);assert.deepEqual(s.civilianTraffic.ships.map(e=>Object.keys(e.shipEquipment.instances)),owned);
 assert.equal(money(),initial.money);assert.equal(food(),initial.food);assert.equal(supplies(),initial.supplies);
 for(const row of demo.ships){const e=f.lives.find(s,row.id);assert.equal(e.system,1);assert.equal(e.phase,'disabled');assert.equal(e.shields,0);assert.ok(e.cargo.tons>0);assert.ok(e.repairDeuranium>0);assert.ok(w.nativeShipRepairs.missionFor(s,w.nativeShipRepairs.ref('civilian',e)));}
 const first=demo.ships[0],e=f.lives.find(s,first.id),ref=w.nativeShipLoot.reference(w.nativeShipDefinitions.describe(s,e,{category:'civilian'}));
 assert.equal(w.nativeShipLoot.take(s,ref,'cargo',1).ok,true);const remaining=e.cargo.tons;
 const before=JSON.stringify(s);assert.equal(w.nativeDevLootDemo.start(s).created,false);assert.equal(JSON.stringify(s),before);
 f=await setup(JSON.parse(before));s=f.state;assert.equal(f.window.nativeDevLootDemo.start(s).created,false);
 assert.equal(f.lives.find(s,first.id).cargo.tons,remaining);assert.equal(s.solFreightHold[5],1);assert.deepEqual(Array.from(s.civilianTraffic.ships,e=>e.id),Array.from(ids));
});
test('practice ships are neutral and an old Dev test alert clears once without restaging belongings or changing other systems',async()=>{
 const f=await setup(),s=f.state,w=f.window;Object.assign(s,{devMode:true,deuranium:1000,localPrestige:{1:100,2:-60}});
 const demo=w.nativeDevLootDemo.start(s),ship=f.lives.find(s,demo.ships[0].id),id=ship.shipEquipment.slots.weapon[0];
 assert.equal(ship.ownerGovernmentId,0);assert.equal(w.nativeFactionDefence.isFaction(ship),false);
 const before=JSON.stringify(s.localPrestige);w.nativeCivilianTraffic.hit(s,ship.id,1,{source:'player',sourceId:'player',weaponEventId:'practice-shot'});
 assert.equal(JSON.stringify(s.localPrestige),before);assert.equal(s.factionDefence?.systems?.[1]?.aggressors?.length||0,0);assert.equal(ship.retaliationTargetId,undefined);
 const dot=w.nativeShipRepairs.drones(s,1)[0];if(dot)assert.equal(w.nativeDevLootDemo.isPractice(s,dot),true);
 delete s.devLootDemo.neutralVersion;ship.ownerGovernmentId=1;ship.npcRole='faction';s.localPrestige[1]=-20;
 s.factionDefence={version:2,revision:0,systems:{1:{government:1,aggressors:[{id:'player',until:500},{id:888,until:500}]},2:{government:2,aggressors:[{id:'player',until:500}]}},orders:[{shipId:999,targetId:'player',system:1}]};
 const cargo=ship.cargo.tons,owned=ship.shipEquipment.instances[id];w.nativeDevLootDemo.start(s);
 assert.equal(ship.ownerGovernmentId,0);assert.equal(ship.cargo.tons,cargo);assert.equal(ship.shipEquipment.instances[id],owned);assert.equal(s.localPrestige[1],100);assert.equal(s.localPrestige[2],-60);
 assert.deepEqual(Array.from(s.factionDefence.systems[1].aggressors,e=>e.id),[888]);assert.equal(s.factionDefence.systems[2].aggressors[0].id,'player');
 s.localPrestige[1]=25;w.nativeDevLootDemo.start(s);assert.equal(s.localPrestige[1],25);
 s.devMode=false;assert.equal(w.nativeDevLootDemo.isPractice(s,ship),false);ship.ownerGovernmentId=1;w.nativeFactionDefence.hit(s,ship,{sourceId:'player'});assert.equal(s.localPrestige[1],20);
});
