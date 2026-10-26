const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));

test('inventory tiles retain gaps, swap any cargo and survive reload without changing quantities',async()=>{
 const {window:w,state:s}=await fixture({full:false}),api=w.nativeShipEquipment;
 Object.assign(s,{dilithium:25,food:40,deuranium:12,minerals:{iron:7},solFreightHold:{0:9},localContracts:[{id:81,good:0,tons:3,pay:120}]});
 const before=plain({minerals:s.minerals,hold:s.solFreightHold,jobs:s.localContracts,equipment:api.ensure(s)});
 let layout=api.inventoryLayout(s),source=layout.cells.indexOf('supply:food');
 assert.equal(api.moveInventory(s,{from:{type:'cell',index:source,key:'supply:food'},to:{type:'cell',index:23}}).ok,true);
 assert.equal(s.inventoryLayout.cells[23],'supply:food');assert.equal(s.inventoryLayout.cells[source],null);
 source=s.inventoryLayout.cells.indexOf('freight:0');
 assert.equal(api.moveInventory(s,{from:{type:'cell',index:source},to:{type:'cell',index:23}}).ok,true);
 assert.equal(s.inventoryLayout.cells[source],'supply:food');assert.equal(s.inventoryLayout.cells[23],'freight:0');
 assert.equal(api.moveInventory(s,{from:{type:'cell',index:23},to:{type:'cell',index:51}}).ok,true);
 const saved=plain(s);assert.deepEqual(plain(api.inventoryLayout(saved)),plain(s.inventoryLayout));
 assert.deepEqual(plain({minerals:s.minerals,hold:s.solFreightHold,jobs:s.localContracts,equipment:api.ensure(s)}),before);
 assert.equal(s.food,40);assert.equal(s.deuranium,12);assert.equal(s.dilithium,25);
});

test('Danube weapons, engines, hull shield, mining laser and DOT all drag out and back with the same identities',async()=>{
 const {window:w}=await fixture({full:false}),api=w.nativeShipEquipment;
 const s={shipType:7,weapons:[1],miningTool:true,hull:50,shields:50};
 const eq=api.ensure(s),original=plain(eq),ids=Object.keys(eq.instances);
 for(const category of api.kinds){
  const index=eq.slots[category].findIndex(Boolean);assert.ok(index>=0,category);
  const id=eq.slots[category][index];eq.instances[id].readyAt=93;
  assert.equal(api.moveInventory(s,{from:{type:'slot',category,index,key:'equipment:'+id},to:{type:'cell',index:20}}).ok,true,category);
  assert.equal(eq.slots[category][index],null);assert.equal(s.inventoryLayout.cells[20],'equipment:'+id);
  if(category==='engineering'){assert.equal(w.nativeShipDefinitions.forEntity(s).movement.maxSpeed,90);assert.ok(w.nativeShipDefinitions.forEntity(s).movement.acceleration>0);}
  if(category==='shield'){assert.equal(s.shields,0);assert.equal(w.nativeShipDefinitions.forEntity(s).shields,0);}
  if(category==='ability')assert.equal(s.miningTool,false);
  assert.equal(api.moveInventory(s,{from:{type:'cell',index:20,key:'equipment:'+id},to:{type:'slot',category,index}}).ok,true);
  assert.equal(eq.slots[category][index],id);assert.equal(eq.instances[id].readyAt,93);
 }
 assert.deepEqual(Object.keys(eq.instances),ids);assert.deepEqual(plain(eq.slots),original.slots);
});

test('occupied drops preserve both items and incompatible bays reject without equipment loss',async()=>{
 const {window:w}=await fixture({full:false}),api=w.nativeShipEquipment,s={shipType:7,weapons:[1],food:8,miningTool:true};
 const eq=api.ensure(s),second=api.grant(s,2).instance,old=eq.slots.weapon[0];
 let cells=api.inventoryLayout(s).cells,index=cells.indexOf('equipment:'+second.id);
 assert.equal(api.moveInventory(s,{from:{type:'cell',index},to:{type:'slot',category:'weapon',index:0}}).ok,true);
 assert.equal(eq.slots.weapon[0],second.id);assert.equal(s.inventoryLayout.cells[index],'equipment:'+old);
 const food=s.inventoryLayout.cells.indexOf('supply:food');
 assert.equal(api.moveInventory(s,{from:{type:'slot',category:'engineering',index:0},to:{type:'cell',index:food}}).ok,true);
 assert.ok(s.inventoryLayout.cells.includes('supply:food'));assert.ok(s.inventoryLayout.cells[food].startsWith('equipment:'));
 const before=JSON.stringify(s);
 assert.equal(api.moveInventory(s,{from:{type:'cell',index:food},to:{type:'slot',category:'weapon',index:0}}).ok,false);
 assert.equal(JSON.stringify(s),before);
 assert.equal(api.moveInventory(s,{from:{type:'cell',index:food,key:'stale'},to:{type:'cell',index:0}}).ok,false);
 assert.equal(JSON.stringify(s),before);
});

test('layout reconciles purchases, consumed cargo, changed hulls and duplicate historical positions safely',async()=>{
 const {window:w,state:s}=await fixture({full:false}),api=w.nativeShipEquipment;
 s.food=2;s.inventoryLayout={version:1,cells:['supply:food','supply:food','missing',null]};
 api.inventoryLayout(s);assert.equal(s.inventoryLayout.cells.filter(k=>k==='supply:food').length,1);
 assert.equal(api.moveInventory(s,{from:{type:'cell',index:0},to:{type:'cell',index:40}}).ok,true);
 const dot=api.grant(s,'basic-dot').instance;api.inventoryLayout(s);
 assert.equal(s.inventoryLayout.cells[40],'supply:food');assert.ok(s.inventoryLayout.cells.includes('equipment:'+dot.id));
 s.food=0;api.inventoryLayout(s);assert.ok(!s.inventoryLayout.cells.includes('supply:food'));
 const eq=api.ensure(s),drone=eq.instances[eq.slots.repairDrone[0]];drone.phase='repairing';
 const before=JSON.stringify(eq);
 assert.equal(api.moveInventory(s,{from:{type:'slot',category:'repairDrone',index:0},to:{type:'cell',index:6}}).ok,false);
 assert.equal(JSON.stringify(eq),before);
});
