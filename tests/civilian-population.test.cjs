const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value));
const expanded=options=>fixture({regional:true,access:true,repairs:true,population:true,...options});
const medical=ship=>ship.shipType===58;
const money=f=>Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,s)=>n+s.credits,0);
function valid(f){
 const {state,window:w}=f,ships=state.civilianTraffic.ships;
 assert.equal(new Set(ships.map(s=>s.id)).size,ships.length);
 for(const ship of ships){assert.ok(ship.credits>=0&&Number.isFinite(ship.credits));assert.ok(!w.nativeCivilianAccess.blocked(ship.system));}
 for(const market of Object.values(f.lives.initialize(state).markets)){
  assert.ok(market.credits>=0);assert.ok(market.fundsReserved>=-1e-5&&market.fundsReserved<=market.credits+1e-5);
  for(let good=0;good<market.stock.length;good++)assert.ok(market.stock[good]>=-1e-7&&market.reserved[good]>=-1e-7&&market.incoming[good]>=-1e-7&&market.reserved[good]<=market.stock[good]+1e-7);
 }
}
test('fresh regional fleet has 1200 persistent civilians, 100 medical crews and coverage at all 69 inhabited bases',async()=>{
 const f=await expanded(),{state,window:w}=f,ships=state.civilianTraffic.ships,plan=w.nativeCivilianPopulation.plan(state);
 assert.equal(plan.length,69);assert.equal(ships.length,1200);assert.equal(ships.filter(medical).length,100);assert.equal(state.solEconomy.freighters.length,9);
 assert.equal(f.lives.initialize(state).config.eventBudget,8);
 const equipment=new Set();
 for(const row of plan){
  const based=ships.filter(s=>(s.operatingBase??s.stationSystem)===row.system);
  assert.equal(based.length,row.total,`fleet at ${row.system}`);assert.equal(based.filter(medical).length,row.medical,`medical coverage at ${row.system}`);
  assert.ok(w.nativeCivilianAccess.inhabited(state,row.system));
 }
 for(const ship of ships){for(const id of Object.keys(ship.shipEquipment.instances)){const key=ship.shipEquipment.owner+'/'+id;assert.ok(!equipment.has(key),'owned equipment identity must be unique');equipment.add(key);}if(medical(ship)){assert.equal(ship.repairBay.slots.length,6);assert.equal(ship.repairDeuranium,100);assert.equal(ship.medicalRegion,ship.operatingBase);}}
 assert.equal(state.shipRepairs.ledger.medicalCapital,1500000);assert.equal(state.shipRepairs.ledger.medicalInitialSupplies,10000);
 assert.equal(new Set(ships.filter(s=>medical(s)&&s.stationSystem===1).map(s=>s.port)).size,8);
 valid(f);
});
test('legacy save expansion retains ships, active freight, owned equipment and treasury balances, recording new capital once',async()=>{
 const old=await fixture({regional:true,access:true,repairs:true,economic:false}),s=old.state,ship=old.lives.find(s,2);
 const job=old.lives.startDelivery(s,ship.id,{fromSystem:1,fromPort:3,toSystem:4,good:5,tons:4});assert.ok(job.ok);
 const fields=['id','name','system','x','y','hull','shields','credits','cargo','weapons','shipEquipment','task','journey','nextActionAt'];
 const preserved=s.civilianTraffic.ships.map(ship=>Object.fromEntries(fields.map(k=>[k,copy(ship[k]??null)]))),beforeMoney=money(old),oldCapital=s.shipRepairs.ledger.medicalCapital;
 const f=await expanded({saved:copy(s),economic:false});
 assert.equal(f.state.civilianTraffic.ships.length,1200);assert.equal(f.state.civilianTraffic.ships.filter(medical).length,100);
 for(const before of preserved){const after=f.lives.find(f.state,before.id);for(const k of fields)assert.deepEqual(copy(after[k]??null),before[k],`${before.id}: ${k}`);}
 assert.equal(money(f)-beforeMoney,f.state.civilianTraffic.population.ledger.initialCapital+f.state.shipRepairs.ledger.medicalCapital-oldCapital);
 const r=await expanded({saved:copy(f.state),economic:false});assert.equal(money(r),money(f));assert.equal(r.state.civilianTraffic.ships.length,1200);valid(r);
});
test('reload never resurrects lost crews or replenishes expended equipment, supplies or capital',async()=>{
 const f=await expanded({economic:false}),med=f.state.civilianTraffic.ships.find(medical);med.phase='destroyed';med.hull=0;med.repairDeuranium=0;
 const before=copy(f.state),r=await expanded({saved:copy(before),economic:false});
 assert.equal(r.state.civilianTraffic.ships.length,1200);assert.equal(r.lives.find(r.state,med.id).hull,0);assert.equal(r.lives.find(r.state,med.id).repairDeuranium,0);
 assert.deepEqual(copy(r.state.civilianTraffic.population),before.civilianTraffic.population);assert.deepEqual(copy(r.state.shipRepairs.ledger),before.shipRepairs.ledger);
});
test('expanding a retained fleet invalidates local membership and keeps newly placed hulls clear of existing parking',async()=>{
 const f=await fixture({regional:true,access:true,repairs:true}),w=f.window,s=f.state;
 w.nativeShipSystems.collectShips(s,1);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/civilian-population.js'),'utf8'),f.context);
 w.nativeCivilianTraffic.initialize(s);
 const additions=s.civilianTraffic.ships.filter(e=>e.populationVersion===1);
 assert.equal(s.civilianTraffic.ships.filter(e=>!medical(e)).length,1100);
 assert.equal(w.nativeNpcLives.members(s,1).length,s.civilianTraffic.ships.filter(e=>e.system===1).length);
 const physical=w.nativeShipSystems.collectShips(s,1);for(const ship of additions.filter(e=>e.system===1))assert.ok(physical.some(d=>d.id===ship.id));
 const points=Object.values(s.portDocking.ships).filter(p=>additions.some(e=>`civilian:${e.id}`===p.owner));
 for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)if(points[i].system===points[j].system)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)+1e-6>=points[i].radius+points[j].radius+40);
});
test('expanded markets retain real stock and reservations while scaling demand and port capacity',async()=>{
 const f=await expanded({economic:false}),w=f.window,major=f.lives.market(f.state,4),small=f.lives.market(f.state,90);
 assert.ok(major.target[5]>small.target[5]);assert.equal(w.nativeCivilianPopulation.dockLimits(4).berths,12);assert.equal(w.nativeCivilianPopulation.dockLimits(90).berths,4);
 const before=copy({stock:major.stock,credits:major.credits,reserved:major.reserved});f.lives.market(f.state,4);
 assert.deepEqual(copy({stock:major.stock,credits:major.credits,reserved:major.reserved}),before);valid(f);
});
test('thirty minutes sustains the expanded fleet, conserved money, funded deliveries and regional medical coverage',async()=>{
 const f=await expanded(),startMoney=money(f),ledger=copy(f.lives.initialize(f.state).economicLedger);f.state.system=32;f.state.landed=true;
 for(let step=0;step<108000;step++){f.step(1/60);if(step%7200===0)valid(f);}
 // Service any due work at the final clock boundary through bounded owner calls,
 // without advancing time or deleting retained deadlines.
 for(let pass=0;f.lives.metrics(f.state).backlog>0&&pass<500;pass++)f.lives.advance(f.state,1/60);
 assert.equal(f.lives.metrics(f.state).backlog,0,'overdue scheduling work must finish without advancing or discarding time');
 const end=f.lives.initialize(f.state).economicLedger;valid(f);
 assert.equal(f.state.civilianTraffic.ships.length,1200);assert.ok(f.state.civilianTraffic.ships.reduce((n,s)=>n+(s.deliveries||0),0)>600);
 assert.ok(Math.abs(money(f)-startMoney-(end.initialMarketCredits-ledger.initialMarketCredits)-(end.householdSpending-ledger.householdSpending))<1e-4);
 const medics=f.state.civilianTraffic.ships.filter(medical);assert.ok(medics.filter(s=>s.system===s.medicalRegion&&!s.journey).length>=90);
 const saved=copy(f.state),restored=await expanded({saved:copy(saved)});assert.equal(restored.state.civilianTraffic.ships.length,1200);assert.equal(money(restored),money(f));valid(restored);
 fs.mkdirSync(path.join(__dirname,'../test-results/population'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../test-results/population/economy.json'),JSON.stringify({seconds:1800,civilians:1200,medical:100,deliveries:f.state.civilianTraffic.ships.reduce((n,s)=>n+(s.deliveries||0),0),medicalAtBase:medics.filter(s=>s.system===s.medicalRegion&&!s.journey).length,phases:f.state.civilianTraffic.ships.reduce((r,s)=>(r[s.phase]=(r[s.phase]||0)+1,r),{}),metrics:f.lives.metrics(f.state)},null,2));
});
