const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
async function setup(saved){
  const f=await fixture({repairs:true,economic:false,saved});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/dev-repair-demo.js'),'utf8'),f.context);
  return f;
}

test('normal games cannot start or mutate the Dev rescue demonstration',async()=>{
  const f=await setup(),before=JSON.stringify(f.state);
  assert.equal(f.window.nativeDevRepairDemo.start(f.state).ok,false);
  assert.equal(JSON.stringify(f.state),before);
});

test('a fresh Dev rescue reuses local ships and pays for finite supplies before an immediate distress response',async()=>{
  const f=await setup(),s=f.state;s.devMode=true;
  const ids=s.civilianTraffic.ships.map(e=>e.id),medic=s.civilianTraffic.ships.find(e=>e.shipType===58&&e.system===1);
  const market=f.lives.market(s,1,medic.port),stock=market.stock[7],cash=market.credits+medic.credits;
  const result=f.window.nativeDevRepairDemo.start(s);
  assert.equal(result.ok,true);assert.deepEqual(s.civilianTraffic.ships.map(e=>e.id),ids);
  const target=f.lives.find(s,result.targetId),responder=f.lives.find(s,result.medicalId);
  assert.equal(target.phase,'disabled');assert.equal(target.hull,70);assert.equal(target.shields,0);
  assert.equal(responder.repairBay.slots.length,6);assert.equal(responder.task.kind,'medical');
  assert.equal(responder.task.phase,'rescue-approach');assert.equal(responder.localLeg.duration,0);
  assert.equal(s.shipRepairs.calls.length,1);assert.equal(s.shipRepairs.calls[0].status,'claimed');
  assert.equal(responder.repairDeuranium,stock-market.stock[7]);assert.equal(market.credits+responder.credits,cash);
  for(const ship of [target,responder]){
    assert.equal(ship.system,s.system);assert.ok(Math.abs(ship.x-s.x)<320);assert.ok(Math.abs(ship.y-s.y)<270);
    const d=f.window.nativeShipDefinitions.describe(s,ship,{category:'civilian'}),motion=f.window.nativeShipMotion;
    assert.ok(motion.clearSegment(ship,ship,motion.navigationObstacles(s,ship.system,ship,ship,100),motion.shipRadius(d)+24));
  }
  const before=JSON.stringify(s);assert.equal(f.window.nativeDevRepairDemo.start(s).ok,true);assert.equal(JSON.stringify(s),before);
});

test('the ordinary scheduler deploys six small DOTs, survives reload and completes the Dev rescue without replaying setup',async()=>{
  let f=await setup();f.state.devMode=true;
  const demo=f.window.nativeDevRepairDemo.start(f.state);assert.equal(demo.ok,true);
  let steps=0;while(!f.state.shipRepairs.missions.some(m=>m.restoredHull>5)){f.step(.25);assert.ok(steps++<160);}
  const mission=f.state.shipRepairs.missions[0];assert.equal(mission.drones.length,6);
  assert.equal(f.window.nativeShipDefinitions.get(9001,'repair-drone').dimensions.width,3.5);
  const ids=Array.from(f.state.civilianTraffic.ships,e=>e.id),saved=JSON.parse(JSON.stringify(f.state));
  f=await setup(saved);assert.deepEqual(Array.from(f.state.civilianTraffic.ships,e=>e.id),ids);
  const before=JSON.stringify(f.state);f.window.nativeDevRepairDemo.start(f.state);assert.equal(JSON.stringify(f.state),before);
  while(f.state.shipRepairs.missions[0].status==='active'){f.step(.25);assert.ok(steps++<600);}
  assert.equal(f.lives.find(f.state,demo.targetId).hull,350);
  assert.equal(f.state.shipRepairs.missions[0].status,'completed');
  assert.ok(Math.abs(f.state.shipRepairs.ledger.consumed-56)<1e-6);
  assert.equal(f.lives.find(f.state,demo.medicalId).repairBay.slots.filter(d=>d.phase==='stowed').length,6);
});

test('a prepared Dev world buys finite stock at another local berth and polls its new distress call immediately',async()=>{
  const f=await setup(),s=f.state;s.devMode=true;
  f.window.nativeSimulation.advance(s,45);s.shipRepairs.nextPollAt=46;
  const medic=s.civilianTraffic.ships.find(e=>e.shipType===58&&e.system===1);
  medic.repairDeuranium=34;
  const markets=f.window.nativeSolEconomy.ports.map(port=>f.lives.market(s,1,port));
  for(const market of markets){market.stock[7]=market.port===5?61:0;market.reserved[7]=0;}
  const material=()=>medic.repairDeuranium+markets.reduce((n,m)=>n+m.stock[7],0);
  const money=()=>medic.credits+markets.reduce((n,m)=>n+m.credits,0);
  const beforeMaterial=material(),beforeMoney=money();
  const result=f.window.nativeDevRepairDemo.start(s);
  assert.equal(result.ok,true);assert.equal(medic.port,5);assert.equal(medic.task.kind,'medical');
  assert.equal(s.shipRepairs.calls[0].status,'claimed');
  assert.equal(material(),beforeMaterial);assert.equal(money(),beforeMoney);
});
