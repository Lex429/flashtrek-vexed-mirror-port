const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
async function setup(saved){
 const f=await fixture({saved,repairs:true,population:true,corridors:true,regional:true,access:true,factions:true,orion:true});
 if(!saved)for(let i=0;i<45;i++)f.step(1);
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/interstellar-distress.js','utf8'),f.context);
 f.distress=f.window.nativeInterstellarDistress;return f;
}
function money(f){return f.state.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0)+Object.values(f.state.civilianTraffic.life.markets).reduce((n,m)=>n+m.credits,0);}
function supplies(f){return f.state.civilianTraffic.ships.reduce((n,e)=>n+(e.repairDeuranium||0),0)+Object.values(f.state.civilianTraffic.life.markets).reduce((n,m)=>n+(m.stock[7]||0),0);}
function settle(f){for(let i=0;i<3;i++)f.distress.initialize(f.state);return f.state.shipRepairs.interstellarDistress;}

test('interstellar casualties have an uneven, stable spread with isolated ships, clusters and empty lanes',async()=>{
 const f=await setup(),points=f.distress.plan(f.state),w=f.window;
 assert.equal(points.length,96);assert.deepEqual(copy(f.distress.plan(f.state)),copy(points));
 const counts=new Map();for(const p of points){
  assert.equal(w.nativeManualFlight.regionAtPoint(f.state,p).system,null);
  assert.ok(!w.nativeBadlands?.containsGlobal(p.x,p.y,500));
  counts.set(p.lane,(counts.get(p.lane)||0)+1);
 }
 assert.ok(counts.size<w.nativeTravelCorridors.lanes().length);
 for(const count of [1,2,3])assert.ok([...counts.values()].includes(count));
 assert.ok(points.some(p=>p.lane===1002));
});

test('one-time placement retains the population, paid jobs, equipment identities and finite economic balances',async()=>{
 const f=await setup(),s=f.state,w=f.window,beforeMoney=money(f),beforeSupplies=supplies(f),beforeLost=s.shipRepairs.ledger.lost;
 const ids=s.civilianTraffic.ships.map(e=>e.id),medical=s.civilianTraffic.ships.filter(e=>e.role==='medical').map(copy);
 const committed=s.civilianTraffic.ships.filter(e=>e.task?.status==='active'||e.cargo||e.journey).map(e=>({id:e.id,data:copy(e)}));
 const gear=new Map(s.civilianTraffic.ships.map(e=>[e.id,Object.keys(e.shipEquipment.instances)]));
 const reservations=copy(s.civilianTraffic.life.reservations),out=settle(f);
 assert.ok(out.complete);assert.ok(out.ships.length>=85&&out.ships.length<=96);
 assert.deepEqual(s.civilianTraffic.ships.map(e=>e.id),ids);assert.equal(ids.length,1200);
 assert.deepEqual(s.civilianTraffic.ships.filter(e=>e.role==='medical').map(copy),medical);
 for(const {id,data}of committed)assert.deepEqual(copy(f.lives.find(s,id)),data);
 assert.deepEqual(copy(s.civilianTraffic.life.reservations),reservations);
 assert.ok(Math.abs(money(f)-beforeMoney)<1e-7);
 assert.ok(Math.abs(supplies(f)+s.shipRepairs.ledger.lost-beforeSupplies-beforeLost)<1e-7);
 assert.ok(out.suppliesLost>=0&&out.dotsLost>0);
 const reasons=new Set(out.ships.map(e=>e.reason));assert.deepEqual([...reasons].sort(),['both','drones','supplies']);
 for(const row of out.ships){
  const e=f.lives.find(s,row.id),d=w.nativeShipDefinitions.forEntity(s,e),dots=e.repairBay.slots.filter(d=>d.hull>0);
  assert.equal(e.phase,'disabled');assert.ok(e.hull>0&&e.hull<=d.hull*.25);assert.equal(e.shields,0);
  assert.deepEqual(Object.keys(e.shipEquipment.instances),gear.get(e.id));
  assert.equal(f.lives.galaxyPosition(s,e).x,out.points.find(p=>p.key===row.site).x);
  if(row.reason!=='drones')assert.equal(e.repairDeuranium,0);else assert.ok(e.repairDeuranium>0);
  if(row.reason!=='supplies')assert.equal(dots.length,0);else assert.ok(dots.length>0);
 }
 const saved=JSON.stringify(s);f.distress.initialize(s);assert.equal(JSON.stringify(s),saved);
});

test('saved casualties are ordinary targetable ships and medical rescue consumes supplies before resuming work',async()=>{
 let f=await setup();let out=settle(f),s=f.state,w=f.window;
 const id=out.ships.find(e=>e.reason==='supplies').id,point=f.lives.galaxyPosition(s,f.lives.find(s,id));
 const initial=copy(out);f=await setup(copy(s));s=f.state;w=f.window;f.distress.initialize(s);
 assert.deepEqual(copy(s.shipRepairs.interstellarDistress),initial);
 const e=f.lives.find(s,id),origin=w.nativeManualFlight.anchor(e.system);
 Object.assign(s,{system:e.system,x:point.x-origin.x-230,y:point.y-origin.y,landed:false});
 const before=f.lives.galaxyPosition(s,e);f.step(.25);
 assert.ok(w.nativeShipSystems.resolve(s,id,s.system));
 assert.deepEqual(copy(f.lives.galaxyPosition(s,e)),copy(before));
 const call=s.shipRepairs.calls.find(c=>c.target.id===id);assert.ok(call&&['claimed','servicing'].includes(call.status));
 const medic=s.civilianTraffic.ships.find(m=>w.nativeShipRepairs.key(w.nativeShipRepairs.ref('civilian',m))===call.claim);assert.ok(medic);
 // The normal medical owner performs a local physical approach and welding.
 for(const other of s.shipRepairs.calls)if(other!==call)other.status='completed';
 for(const other of s.civilianTraffic.ships)if(other!==medic&&other!==e)other.scriptedDemo=true;
 w.nativeNpcLives.interrupt(s,medic,'test reset');
 Object.assign(medic,{system:e.system,x:e.x+160,y:e.y,repairDeuranium:100});
 w.nativeNpcLives.refreshLocation(s,medic);call.claim=w.nativeShipRepairs.key(w.nativeShipRepairs.ref('civilian',medic));call.status='claimed';
 assert.ok(w.nativeNpcLives.startRescue(s,medic,call,w.nativeSimulation.seconds(s)));
 const consumed=s.shipRepairs.ledger.consumed;
 for(let i=0;i<2400&&e.phase==='disabled';i++)f.step(.25);
 assert.notEqual(e.phase,'disabled');assert.equal(e.hull,w.nativeShipDefinitions.forEntity(s,e).hull);
 assert.ok(s.shipRepairs.ledger.consumed>consumed);assert.equal(e.id,id);
 const cleared=copy(s);f=await setup(cleared);f.distress.initialize(f.state);
 assert.notEqual(f.lives.find(f.state,id).phase,'disabled');assert.equal(f.state.shipRepairs.interstellarDistress.ships.length,initial.ships.length);
});

test('busy crews are deferred without moving their work and retry work remains bounded',async()=>{
 const f=await setup(),s=f.state;
 const idle=s.civilianTraffic.ships.filter(e=>!e.task||e.task.status!=='active');
 const tasks=new Map(idle.map(e=>[e,e.task]));for(const e of idle)e.task={status:'active',kind:'trade',phase:'loading'};
 const snapshots=copy(s.civilianTraffic.ships),out=f.distress.initialize(s);
 assert.equal(out.ships.length,0);assert.ok(!out.complete);assert.deepEqual(copy(s.civilianTraffic.ships),snapshots);
 for(const [e,task]of tasks){if(task)e.task=task;else delete e.task;}
 f.window.nativeSimulation.advance(s,16);f.distress.advance(s);assert.ok(out.ships.length>0&&out.ships.length<=2);
});
