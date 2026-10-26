const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
async function setup(){
  const f=await tacticalFixture(),w=f.window,s=f.state,rocks=Array.from({length:30},(_,slotId)=>({slotId,system:1,x:1e6+slotId*100,y:500,size:40,angle:.2}));
  w.nativeSolAsteroids={...w.nativeSolAsteroids,forSystem:()=>rocks,find:id=>rocks[id]};
  w.nativeSimulationFrame.begin(s);w.nativeSimulationFrame.step(s);const scene=w.nativeShipSystems.scene(s);w.nativeSimulationFrame.end(s);
  return {...f,scene,rocks,frames:w.nativeSimulationFrame,systems:w.nativeShipSystems};
}
test('zero-step display frames retain an actual shared scene without repeating ship/asteroid construction and still refresh changed actors',async()=>{
  const {window:w,state:s,ships,scene,frames,systems}=await setup(),ship=ships[0],original=scene.bystanders.find(d=>d.entity===ship),rock=scene.rocks[0];
  for(let display=0;display<20;display++){
    frames.begin(s);assert.equal(systems.scene(s),scene);assert.equal(frames.snapshot(s).steps,0);
    const counts=frames.snapshot(s).counters;assert.equal(counts.sceneCollections,undefined);assert.equal(counts.shipDescriptorBuilds,undefined);assert.equal(counts.asteroidDescriptors,undefined);frames.end(s);
  }
  frames.begin(s);Object.assign(ship,{x:ship.x+45,heading:Math.PI/2,shields:0});systems.refreshShip(s,ship,'civilian',1);
  const changed=systems.scene(s).bystanders.find(d=>d.entity===ship);assert.equal(changed.x,original.x+45);assert.equal(changed.heading,Math.PI/2);assert.equal(changed.radii,changed.hullRadii);
  assert.equal(original.shields,100);assert.equal(original.x,1e6);assert.equal(systems.scene(s).rocks[0],rock);
  const eq=w.nativeShipEquipment.ensure(s,ship),engine=eq.slots.engineering[0];assert.ok(engine);
  const moved=w.nativeShipEquipment.move(s,{holder:ship,category:'engineering',fromType:'slot',fromIndex:0,toType:'locker',toIndex:eq.locker.length});assert.equal(moved.ok,true);
  systems.refreshShip(s,ship,'civilian',1);const unequipped=systems.scene(s).bystanders.find(d=>d.entity===ship);
  assert.equal(unequipped.definition.engineOnline,false);assert.equal(unequipped.definition.movement.maxSpeed,90);assert.ok(eq.locker.includes(engine));frames.end(s);
  frames.begin(s);assert.equal(systems.scene(s).bystanders.find(d=>d.entity===ship),unequipped);assert.equal(frames.snapshot(s).counters.sceneCollections,undefined);frames.end(s);
});
test('retained scenes invalidate for explicit membership changes, physical steps and standalone clock changes',async()=>{
  const {window:w,state:s,ships,scene,frames,systems}=await setup(),added={...ships[1],id:5555,x:2e6,shipEquipment:undefined,weaponLoadout:undefined};
  s.civilianTraffic.ships.push(added);systems.invalidateShips(s,1);
  frames.begin(s);const membership=systems.scene(s);assert.notEqual(membership,scene);assert.ok(membership.bystanders.some(d=>d.entity===added));assert.equal(frames.snapshot(s).counters.sceneCollections,1);frames.end(s);
  frames.begin(s);frames.step(s);const stepped=systems.scene(s);assert.notEqual(stepped,membership);assert.equal(frames.snapshot(s).counters.sceneCollections,1);frames.end(s);
  w.nativeSimulation.advance(s,1/60);frames.begin(s);const advanced=systems.scene(s);assert.notEqual(advanced,stepped);assert.equal(frames.snapshot(s).counters.sceneCollections,1);frames.end(s);
});
test('same-clock category and definition registration invalidate retained read models without a population scan on unchanged displays',async()=>{
  const {window:w,state:s,ships,scene,frames,systems}=await setup(),custom={id:'new-static',shipType:47,system:1,x:3e6,y:0,heading:0,hull:100,shields:0,phase:'stationary'};
  const describe=()=>({...w.nativeShipDefinitions.describe(s,custom,{category:'custom-fixture'}),id:'custom:new-static'});
  systems.register('custom-fixture',{collect:(_,system)=>system===1?[describe()]:[],resolve:(_,id)=>id==='custom:new-static'?describe():null,hit:()=>({ok:false})});
  frames.begin(s);const registered=systems.scene(s);assert.notEqual(registered,scene);assert.ok(registered.bystanders.some(d=>d.entity===custom));frames.end(s);
  const old=registered.bystanders.find(d=>d.entity===ships[0]);w.nativeShipDefinitions.register(47,{hull:777,dimensions:{width:50,height:90}});
  frames.begin(s);const redefined=systems.scene(s),current=redefined.bystanders.find(d=>d.entity===ships[0]);assert.notEqual(redefined,registered);assert.equal(current.definition.hull,777);assert.equal(current.dimensions.height,90);assert.notEqual(old.definition.hull,777);frames.end(s);
  frames.begin(s);assert.equal(systems.scene(s),redefined);assert.equal(frames.snapshot(s).counters.shipPoseChecks,undefined);assert.equal(frames.snapshot(s).counters.shipDescriptorBuilds,undefined);frames.end(s);
});
