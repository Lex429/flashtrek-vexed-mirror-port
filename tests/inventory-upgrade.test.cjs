const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
async function setup(){const f=await fixture({full:false,economic:false,regional:true});vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/shipyard-refits.js','utf8'),f.context);return f;}
const copy=v=>JSON.parse(JSON.stringify(v));

test('Dev restock supplies every catalog model and ore, including Federation equipment, without duplicating existing stock',async()=>{
  const {window:w,state:s}=await setup(),api=w.nativeShipEquipment;assert.equal(api.restockDev(s).ok,false);
  s.devMode=true;const eq=api.ensure(s),fitted=copy(eq.slots),jobs=copy(s.localContracts||[]);
  assert.ok(api.restockDev(s).added>0);
  for(const model of api.models())assert.ok(eq.locker.some(id=>String(eq.instances[id].modelId)===String(model.id)),model.name);
  for(const ore of Object.keys(w.nativeRegionalMinerals.ores))assert.ok(s.minerals[ore]>=25);
  assert.ok(api.models().some(m=>m.id==='fed-adaptive'));assert.equal(s.devInventoryKitVersion,2);
  assert.deepEqual(copy(eq.slots),fitted);assert.deepEqual(copy(s.localContracts||[]),jobs);
  const ids=Object.keys(eq.instances);assert.equal(api.restockDev(s).added,0);assert.deepEqual(Object.keys(eq.instances),ids);
  const restored=copy(s);assert.equal(api.restockDev(restored).added,0);assert.deepEqual(Object.keys(restored.shipEquipment.instances),ids);
  assert.equal(api.canChangeHull(s,7).ok,true,'Dev samples must not prevent trying smaller hulls');
});

test('shield tiers change actual capacity for every controller and cannot refill charge by swapping or downgrade above the cap',async()=>{
  const {window:w}=await setup(),api=w.nativeShipEquipment;
  for(const model of ['standard-shield','upgraded-shield','advanced-shield']){
    const factor=api.model(model).shieldMultiplier,s={shipType:7,weapons:[1],shields:20,hull:50},npc=copy(s);
    for(const holder of [s,npc]){const eq=api.ensure(s,holder),result=api.grant(s,model,{holder});assert.ok(result.ok);assert.ok(api.move(s,{holder,category:'shield',fromType:'locker',fromIndex:eq.locker.indexOf(result.instance.id),toType:'slot',toIndex:0}).ok);}
    assert.equal(w.nativeShipDefinitions.forEntity(s).shields,Math.round(w.nativeShipDefinitions.get(7).shields*factor));
    assert.equal(w.nativeShipDefinitions.forEntity(s,npc,{category:'civilian'}).shields,w.nativeShipDefinitions.forEntity(s).shields);
    assert.equal(s.shields,20,'fitting a stronger generator cannot grant free shield charge');
    s.shields=w.nativeShipDefinitions.forEntity(s).shields;
    const item=api.grant(s,'standard-shield').instance,eq=s.shipEquipment;api.move(s,{category:'shield',fromType:'locker',fromIndex:eq.locker.indexOf(item.id),toType:'slot',toIndex:0});
    assert.ok(s.shields<=w.nativeShipDefinitions.get(7).shields);
    const restored=copy(s);api.ensure(restored);assert.equal(restored.shipEquipment.slots.shield[0],item.id);
  }
});

test('new shield purchases charge exactly once and same-clock model edits invalidate effective hardware stats',async()=>{
  const {window:w,state:s}=await setup(),api=w.nativeShipEquipment;s.latinum=5000;
  const purchased=api.purchase(s,'advanced-shield');assert.ok(purchased.ok);assert.equal(s.latinum,0);
  const eq=api.ensure(s);api.move(s,{category:'shield',fromType:'locker',fromIndex:eq.locker.indexOf(purchased.instance.id),toType:'slot',toIndex:0});
  const capacity=w.nativeShipDefinitions.forEntity(s).shields;purchased.instance.modelId='standard-shield';
  assert.ok(w.nativeShipDefinitions.forEntity(s).shields<capacity);
  const before=JSON.stringify(eq);assert.equal(api.purchase(s,'advanced-shield').ok,false);assert.equal(JSON.stringify(eq),before);
});
