const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
async function setup(){
 const f=await fixture({full:false,regional:true,economic:false});
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/shipyard-refits.js','utf8'),f.context);
 const s=f.state,w=f.window;
 Object.assign(s,{system:1,latinum:1000000,dilithium:1000,minerals:{trellium:1000,tritanium:1000,gallicite:1000,benamite:1000,deuranium:1000},shipyardDock:{station:'mars-earth-shipyard-01',phase:'docked'},deuranium:0});
 w.nativeShipEquipment.ensure(s);return {...f,r:w.nativeShipyardRefits,save:()=>({ok:true})};
}
test('refits are hull-local, typed, capped and identical for every ownership category',async()=>{
 const {window:w,state:s,r}=await setup();
 for(const ship of w.VexedMirrorWorld.ships){
  const a={shipType:ship.id,shipRefit:{version:1,hullType:ship.id,levels:{cargo:1,hull:1,weapon:1}}},b=plain(a);
  w.nativeShipEquipment.ensure(a);w.nativeShipEquipment.ensure(a,b);
  const da=w.nativeShipDefinitions.forEntity(a),db=w.nativeShipDefinitions.forEntity(a,b,{category:'civilian'});
  for(const key of ['slots','hull','shields','cargo','movement'])assert.deepEqual(plain(da[key]),plain(db[key]),`${ship.id}/${key}`);
  assert.equal(da.slots.weapon,w.nativeShipDefinitions.get(ship.id).slots.weapon+1);
 }
 assert.equal(r.level({shipType:7,shipRefit:{version:1,hullType:8,levels:{hull:3}}},'hull'),0);
 assert.ok(r.budget(s).total>=8);
});
test('purchases charge real ore exactly once, preserve damage and survive JSON reload',async()=>{
 const {window:w,state:s,r,save}=await setup(),before=w.nativeShipDefinitions.forEntity(s);s.hull=before.hull*.5;
 const quote=r.quote(s,'hull'),latinum=s.latinum,tritanium=s.minerals.tritanium;
 assert.equal(r.upgrade(s,'hull',save).ok,true);
 assert.equal(s.latinum,latinum-quote.price);assert.equal(s.minerals.tritanium,tritanium-quote.materials.tritanium);
 assert.equal(s.shipyardLedger.materials.tritanium,quote.materials.tritanium);
 assert.equal(s.hull/w.nativeShipDefinitions.forEntity(s).hull,.5);
 const restored=plain(s);w.nativeShipEquipment.ensure(restored);assert.equal(r.level(restored,'hull'),1);
 assert.equal(w.nativeShipDefinitions.forEntity(restored).hull,w.nativeShipDefinitions.forEntity(s).hull);
});
test('save failure, insufficient resources and an undocked purchase leave resources and owned gear unchanged',async()=>{
 const {state:s,r,save}=await setup();const before=JSON.stringify(s),lives=s.civilianTraffic;
 assert.equal(r.upgrade(s,'weapon',()=>({ok:false,error:'Storage quota exceeded'})).ok,false);assert.deepEqual(plain(s),JSON.parse(before));assert.equal(s.civilianTraffic,lives);
 s.latinum=0;const poor=JSON.stringify(s);assert.equal(r.buy(s,1003,save).ok,false);assert.deepEqual(plain(s),JSON.parse(poor));
 delete s.shipyardDock;const undocked=JSON.stringify(s);assert.equal(r.upgrade(s,'cargo',save).ok,false);assert.deepEqual(plain(s),JSON.parse(undocked));
});
test('shared budget forces a shield-versus-hull tradeoff and legacy technology cannot bypass it',async()=>{
 const {window:w,state:s,r,save}=await setup();
 while(r.quote(s,'hull').allowed)assert.equal(r.upgrade(s,'hull',save).ok,true);
 while(r.quote(s,'shield').allowed)assert.equal(r.upgrade(s,'shield',save).ok,true);
 assert.ok(r.budget(s).used<=r.budget(s).total);
 assert.equal(r.upgrade(s,'weapon',save).ok,false);assert.equal(r.canMineralUpgrade(s),false);
 assert.equal(r.buy(s,'fed-adaptive',save).ok,true);
 const eq=w.nativeShipEquipment.ensure(s),id=eq.locker.find(id=>eq.instances[id].modelId==='fed-adaptive'),before=JSON.stringify(eq);
 assert.equal(r.fit(s,id,0,save).ok,false);assert.equal(JSON.stringify(w.nativeShipEquipment.ensure(s)),before);
});
test('Federation weapons use real shared visuals, power limits, range and cooldowns',async()=>{
 const {window:w,state:s,r,save,ship}=await setup();
 for(const weapon of r.weapons){assert.ok(w.nativeCombatShots.weaponVisual(weapon).style,weapon.name);assert.equal(w.nativeWeaponRules.weaponSpec(weapon,w.nativeCombatShots.weaponVisual(weapon).kind).range,weapon.range);}
 assert.equal(r.upgrade(s,'weapon',save).ok,true);assert.equal(w.nativeShipEquipment.capacities(s).weapon,4);
 assert.equal(r.buy(s,1002,save).ok,true);let eq=w.nativeShipEquipment.ensure(s);const id=eq.locker.find(id=>eq.instances[id].modelId===1002);
 assert.equal(r.fit(s,id,3,save).ok,true);delete s.shipyardDock;s.landed=false;Object.assign(s,{system:2,x:0,y:0,angle:0});Object.assign(ship,{system:2,x:200,y:0,hull:200,shields:100});
 const fired=w.nativeCombatShots.fireFor({state:s,shooter:w.nativeShipDefinitions.describe(s),target:w.nativeShipDefinitions.describe(s,ship,{category:'civilian'}),selection:{slot:3}});
 assert.equal(fired.ok,true,fired.error);assert.equal(fired.event.weaponInstanceId,id);assert.ok(eq.instances[id].readyAt>w.nativeSimulation.seconds(s));
 const heavy=w.nativeShipEquipment.grant(s,1009).instance;
 const result=w.nativeShipEquipment.move(s,{category:'weapon',fromType:'locker',fromIndex:eq.locker.indexOf(heavy.id),toType:'slot',toIndex:2});assert.equal(result.ok,false);
 assert.equal(w.nativeShipEquipment.purchase(s,1001).ok,false);
});
test('shield fitting retains displaced gear, recharges after damage delay and adapts only on shields',async()=>{
 const {window:w,state:s,r,save}=await setup();let eq=w.nativeShipEquipment.ensure(s),original=eq.slots.shield[0];
 assert.equal(r.buy(s,'fed-adaptive',save).ok,true);const id=eq.locker.find(id=>eq.instances[id].modelId==='fed-adaptive');assert.equal(r.fit(s,id,0,save).ok,true);assert.ok(eq.locker.includes(original));
 s.shields=40;s.hull=100;
 let hit=w.nativeShipDamage.apply(w.nativeShipDefinitions.describe(s),10,{kind:'beam',from:{x:100,y:0}});assert.equal(hit.absorbed,10);
 hit=w.nativeShipDamage.apply(w.nativeShipDefinitions.describe(s),10,{kind:'beam',from:{x:100,y:0}});assert.equal(hit.absorbed,8);
 const shield=s.shields;r.advance(s,1);assert.equal(s.shields,shield);w.nativeSimulation.advance(s,7);r.advance(s,1);assert.ok(s.shields>shield);
 s.shields=0;s.hull=100;hit=w.nativeShipDamage.apply(w.nativeShipDefinitions.describe(s),10,{kind:'beam',from:{x:100,y:0}});assert.equal(hit.hullDamage,10);
});
test('removing bays keeps equipment identities and charge; loaded cargo prevents unsafe downsizing',async()=>{
 const {window:w,state:s,r,save}=await setup();assert.equal(r.upgrade(s,'weapon',save).ok,true);
 const item=w.nativeShipEquipment.grant(s,1001,{location:'slot',slot:3}).instance;item.readyAt=123;
 assert.equal(r.remove(s,'weapon',save).ok,true);const eq=w.nativeShipEquipment.ensure(s);assert.ok(eq.locker.includes(item.id));assert.equal(eq.instances[item.id].readyAt,123);
 assert.equal(r.upgrade(s,'cargo',save).ok,true);const before=JSON.stringify(s);assert.equal(r.remove(s,'cargo',save).ok,false);assert.deepEqual(plain(s),JSON.parse(before));
 s.minerals={};s.solFreightHold={};s.localContracts=[];assert.equal(r.remove(s,'cargo',save).ok,true);
});
test('a newly bought hull receives fresh refits while retaining all owned equipment',async()=>{
 const {window:w,state:s,r,save}=await setup();s.minerals={tritanium:14,deuranium:6};assert.equal(r.upgrade(s,'hull',save).ok,true);
 const ids=Object.keys(s.shipEquipment.instances).sort();s.minerals={};s.deuranium=0;s.solFreightHold={};s.localContracts=[];
 assert.equal(w.nativeShipEquipment.changeHull(s,57).ok,true);assert.equal(r.level(s,'hull'),0);assert.deepEqual(Object.keys(s.shipEquipment.instances).sort(),ids);
});
test('regional yards settle through the same owner and cannot authorize a purchase from another system',async()=>{
 const {window:w,state:s}=await setup(),r=w.nativeShipyardRefits;
 for(const y of w.VexedMirrorWorld.shipyards){s.system=y.system;s.shipyardDock={station:y.id,phase:'docked'};assert.equal(r.docked(s),true);s.system=56;assert.equal(r.docked(s),false);}
 s.system=55;s.shipyardDock={station:'invented-yard',phase:'docked'};assert.equal(r.docked(s),false);
});

test('all playable hulls have finite approach plans and oversized ships face an outside collar',async()=>{
 const f=await setup(),{window:w,state:s}=f;
 const node=()=>({hidden:true,setAttribute(){},append(){},addEventListener(){},querySelector(){return null;}});
 f.context.document.createElement=node;f.context.document.querySelector=node;w.addEventListener=()=>{};
 w.nativeMarsShipyard={definition:{size:220},definitionFor:()=>({size:220}),position:()=>({x:5100,y:1755})};
 const fetch=f.context.fetch;f.context.fetch=async url=>String(url).includes('earth-shipyard-docking-profiles')?{ok:true,json:async()=>JSON.parse(fs.readFileSync('html-games/flashtrek-broken-mirror/earth-shipyard-docking-profiles.json','utf8'))}:fetch(url);
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/shipyard-services.js','utf8'),f.context);assert.equal(await w.nativeShipyardServices.ready,true);
 let external=0;
 for(const ship of w.VexedMirrorWorld.ships){
  const holder={shipType:ship.id,system:1},before=JSON.stringify(holder),p=w.nativeShipyardServices.plan(holder);
  for(const n of [p.x,p.y,p.heading,p.entry.x,p.entry.y])assert.ok(Number.isFinite(n),ship.name);
  assert.equal(JSON.stringify(holder),before);
  const dx=p.x-p.entry.x,dy=p.y-p.entry.y;assert.ok(dx*Math.cos(p.heading)+dy*Math.sin(p.heading)>0);
  if(p.external){external++;assert.ok(p.entry.x>p.x);assert.ok(Math.cos(p.heading)<0);assert.ok(p.collar.noseX>p.collar.x);}
 }
 assert.ok(external>=4);
});
