const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
test('every hull has identical typed capacities, effective upgrades and movement for every controller',async()=>{
 const f=await fixture({full:false,regional:true,repairs:true}),w=f.window;
 for(const {id} of w.VexedMirrorWorld.ships){
  const player={shipType:id,tugEngineLevel:2,mineralUpgrades:{[id]:{hull:2,shield:1,engine:2,weapons:3,drive:1}}},npc=plain(player);
  w.nativeShipEquipment.ensure(player);w.nativeShipEquipment.ensure(player,npc);
  const a=w.nativeShipDefinitions.forEntity(player),b=w.nativeShipDefinitions.forEntity(player,npc,{category:'civilian'});
  for(const key of ['slots','hull','shields','cargo','movement','weaponDamageMultiplier','warpSpeedMultiplier'])assert.deepEqual(plain(a[key]),plain(b[key]),`${id}/${key}`);
  assert.equal(a.slots.engineering,1);assert.equal(a.slots.shield,1);
 }
 assert.equal(w.nativeShipDefinitions.get(58).slots.repairDrone,6);assert.equal(w.nativeShipDefinitions.get(57).cargo,450);
});
test('out of range and wrong-type grants and fitting reject before creating an owned item',async()=>{
 const {window:w,state:s}=await fixture({full:false}),api=w.nativeShipEquipment;
 const eq=api.ensure(s),before=JSON.stringify(eq);
 assert.equal(api.grant(s,1,{location:'slot',slot:9}).ok,false);assert.equal(JSON.stringify(eq),before);
 assert.equal(api.grant(s,'basic-dot',{location:'slot',slot:1}).ok,false);
 const ability=api.grant(s,22).instance;ability.readyAt=39;
 const index=eq.locker.indexOf(ability.id);
 assert.equal(api.move(s,{category:'ability',fromType:'locker',fromIndex:index,toType:'slot',toIndex:0,toCategory:'weapon'}).ok,false);
 assert.equal(api.move(s,{category:'ability',fromType:'locker',fromIndex:index,toType:'slot',toIndex:1}).ok,true);
 assert.equal(eq.slots.ability[1],ability.id);assert.equal(ability.readyAt,39);
 assert.ok(!s.weapons.includes(22));
});
test('a fourth configurable weapon slot really fires through the shared charge and collision owner',async()=>{
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state,e=f.ship;
 w.nativeShipDefinitions.register(7,{slots:{weapon:4}});
 Object.assign(s,{system:2,x:0,y:0,angle:0});Object.assign(e,{system:2,x:200,y:0,heading:Math.PI,hull:100,shields:100});
 const item=w.nativeShipEquipment.grant(s,1,{location:'slot',slot:3}).instance;
 const result=w.nativeCombatShots.fireFor({state:s,shooter:w.nativeShipDefinitions.describe(s),target:w.nativeShipDefinitions.describe(s,e,{category:'civilian'}),selection:{slot:3}});
 assert.equal(result.ok,true,result.error);assert.equal(result.event.slot,3);assert.equal(result.event.weaponInstanceId,item.id);assert.ok(item.readyAt>w.nativeSimulation.seconds(s));
});
test('hull changes resize bays, stow excess without loss and never create drones or reset owned charge',async()=>{
 const {window:w,state:s}=await fixture({full:false}),api=w.nativeShipEquipment,eq=api.ensure(s),original=Object.keys(eq.instances),dot=eq.instances[eq.slots.repairDrone[0]];
 dot.hull=17;eq.instances[eq.slots.weapon[0]].readyAt=90;
 assert.equal(api.changeHull(s,58).ok,true);assert.equal(eq.slots.repairDrone.length,6);assert.equal(s.repairBay.slots.length,1);assert.equal(Object.keys(eq.instances).length,original.length);
 for(let i=1;i<6;i++)assert.equal(api.grant(s,'basic-dot',{location:'slot',slot:i}).ok,true);
 const ids=[...eq.slots.repairDrone],count=Object.keys(eq.instances).length;
 assert.equal(api.changeHull(s,7).ok,true);assert.equal(eq.slots.repairDrone.length,1);for(const id of ids.slice(1))assert.ok(eq.locker.includes(id));
 assert.equal(Object.keys(eq.instances).length,count);assert.equal(dot.hull,17);assert.equal(eq.instances[eq.slots.weapon[0]].readyAt,90);
 s.solFreightHold={0:51};const saved=JSON.stringify(s);assert.equal(api.changeHull(s,7).ok,false);assert.equal(JSON.stringify(s),saved);
});
test('legacy over-capacity equipment and a damaged bay migrate once with stable identity and cooldowns',async()=>{
 const {window:w}=await fixture({full:false});
 const s={shipType:7,weaponLoadout:{version:1,nextId:20,slots:['old',null,null,null,'extra'],locker:['cloak'],instances:{old:{id:'old',modelId:1,readyAt:13,upgrades:{tuned:2}},extra:{id:'extra',modelId:2,readyAt:55},cloak:{id:'cloak',modelId:22,readyAt:67}}},repairBay:{generation:0,slots:[{id:'old-dot',shipType:9001,hull:12,phase:'destroyed'}]}};
 const eq=w.nativeShipEquipment.ensure(s);assert.equal(eq.slots.weapon[0],'old');assert.ok(eq.locker.includes('extra'));assert.ok(eq.locker.includes('cloak'));assert.equal(eq.instances.extra.readyAt,55);assert.equal(eq.instances['old-dot'].hull,12);
 const copied=plain(s),again=w.nativeShipEquipment.ensure(copied);assert.equal(Object.keys(again.instances).length,Object.keys(eq.instances).length);assert.deepEqual(plain(again),plain(eq));
});
test('legacy deployed overflow drones finish their saved mission and return to owned storage',async()=>{
 const f=await fixture({full:false,economic:false,repairs:true}),w=f.window,s=f.state;
 w.nativeShipEquipment.changeHull(s,58);const eq=w.nativeShipEquipment.ensure(s);
 for(let i=1;i<6;i++)w.nativeShipEquipment.grant(s,'basic-dot',{location:'slot',slot:i});
 Object.assign(s,{phase:'disabled',hull:10,deuranium:100});
 const ref=w.nativeShipRepairs.ref('player',s),mission=w.nativeShipRepairs.launch(s,ref,ref);
 assert.equal(mission.drones.length,6);const ids=mission.drones.slice();
 const saved=plain(s);saved.shipType=7; // Reproduce the historical stale-bay hull change.
 const g=await fixture({saved,full:false,economic:false,repairs:true});
 assert.equal(g.state.shipEquipment.slots.repairDrone.length,1);
 for(let i=0;i<1600&&g.state.phase==='disabled';i++)g.step(.25);
 assert.notEqual(g.state.phase,'disabled');assert.equal(g.state.repairBay.slots.length,1);
 for(const id of ids){assert.equal(g.state.shipEquipment.instances[id].phase,'stowed');assert.ok(g.state.shipEquipment.slots.repairDrone.includes(id)||g.state.shipEquipment.locker.includes(id));}
 assert.equal(g.window.nativeShipEquipment.canChangeHull(g.state,58).ok,true);
});
test('a shield slot alone supplies no shields; removing engineering keeps basic propulsion',async()=>{
 const {window:w}=await fixture({full:false}),s={shipType:24,hull:25,shields:0};
 const eq=w.nativeShipEquipment.ensure(s);assert.equal(eq.slots.shield.length,1);assert.equal(eq.slots.shield[0],null);assert.equal(w.nativeShipDefinitions.forEntity(s).shields,0);
 const engine=eq.slots.engineering[0];assert.ok(engine);w.nativeShipEquipment.move(s,{category:'engineering',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length});assert.equal(w.nativeShipDefinitions.forEntity(s).movement.maxSpeed,90);assert.ok(w.nativeShipDefinitions.forEntity(s).movement.acceleration>0);
});
test('cargo policy never selects mining; a configured non-Olympic medical hull answers a real distress call',async()=>{
 const f=await fixture({full:false,regional:true,access:true,repairs:true}),w=f.window,s=f.state;
 w.nativeShipDefinitions.register(57,{npcPolicy:'cargo'});const e=f.ship;Object.assign(e,{shipType:57,role:'mining',regionalResident:true,phase:'docked',cargo:null,task:null,nextActionAt:0});
 w.nativeNpcLives.resumeWork(s,e);for(let i=0;i<120;i++)f.step();assert.notEqual(e.task?.kind,'mining');
 w.nativeShipDefinitions.register(56,{slots:{weapon:4,repairDrone:6,ability:2},npcPolicy:'medical'});
 const rescue=s.civilianTraffic.ships.find(x=>x.shipType===58);rescue.shipType=56;rescue.repairDeuranium=200;w.nativeShipEquipment.ensure(s,rescue);
 for(const other of s.civilianTraffic.ships)if(other!==rescue&&other.shipType===58)other.repairDeuranium=0;
 Object.assign(e,{phase:'disabled',hull:10,repairDeuranium:0});for(const d of e.repairBay.slots){d.hull=0;d.phase='destroyed';}
 s.shipRepairs.nextPollAt=0;w.nativeShipRepairs.advance(s,1);
 assert.equal(rescue.task?.kind,'medical');assert.equal(w.nativeShipDefinitions.get(56).slots.weapon,4);
 for(let i=0;i<2000&&e.phase==='disabled';i++)f.step(.25);assert.notEqual(e.phase,'disabled');assert.equal(e.hull,w.nativeShipDefinitions.get(57).hull);
});
test('definition validation rejects invalid dimensions, capacities, starting fits, artwork and policy names',async()=>{
 const {window:w}=await fixture({full:false}),base=w.nativeShipDefinitions.get(7);
 for(const change of [{artworkProfile:null},{dimensions:{width:0,height:2}},{slots:{...base.slots,weapon:-1}},{slots:{...base.slots,engineering:2}},{npcPolicy:{name:'imaginary'}},{startingEquipment:{...base.startingEquipment,weapon:[22]}}])assert.ok(w.nativeShipDefinitions.validate({...base,artworkProfile:{},dimensions:{width:20,height:40},...change}).length);
});
test('mode-separated storage preserves the legacy copy and reports quota, denied access and silent failures',()=>{
 const window={},context=vm.createContext({window});vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/save-storage.js','utf8'),context);
 const api=window.nativeSaveStorage,data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const normal={devMode:false,latinum:10},dev={devMode:true,latinum:999};data.set(api.legacyKey,JSON.stringify(dev));
 assert.equal(api.read('normal',storage),null);assert.equal(api.read('dev',storage).latinum,999);assert.ok(data.has(api.legacyKey));
 api.write(normal,storage);api.write(dev,storage);assert.equal(api.read('normal',storage).latinum,10);assert.equal(api.read('dev',storage).latinum,999);
 const failed={getItem:storage.getItem,setItem(){throw Error('quota');}};assert.equal(api.write({...normal,latinum:11},failed).ok,false);assert.equal(api.read('normal',storage).latinum,10);
 assert.equal(api.write(normal,{getItem:()=>null,setItem(){}}).ok,false);
 Object.defineProperty(window,'localStorage',{get(){throw Error('denied');}});assert.equal(api.write(normal).ok,false);assert.equal(api.read('normal'),null);
});
test('construction and equipment upgrades cannot spend reserved materials and record their sink once',async()=>{
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state,m=w.nativeNpcLives.market(s,1,7);
 m.stock[2]=4;m.stock[3]=6;m.reserved[2]=1;
 const before=JSON.stringify({stock:m.stock,flows:s.solEconomy.flows});
 assert.equal(w.nativeSolEconomy.consumeMaterials(s,7,[[2,4],[3,6]]).ok,false);
 assert.equal(JSON.stringify({stock:m.stock,flows:s.solEconomy.flows}),before);
 assert.equal(w.nativeSolEconomy.consumeMaterials(s,7,[[3,4],[3,4]]).ok,false);
 assert.equal(JSON.stringify({stock:m.stock,flows:s.solEconomy.flows}),before);
 m.reserved[2]=0;const consumed=s.solEconomy.flows.consumed.slice();
 assert.equal(w.nativeSolEconomy.consumeMaterials(s,7,[[2,4],[3,6]]).ok,true);
 assert.equal(m.stock[2],0);assert.equal(m.stock[3],0);
 assert.equal(s.solEconomy.flows.consumed[2],consumed[2]+4);assert.equal(s.solEconomy.flows.consumed[3],consumed[3]+6);
});
