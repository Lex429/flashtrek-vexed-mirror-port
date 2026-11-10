const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
const options={repairs:true,regional:true,access:true,population:true,corridors:true};
const money=f=>Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0);
const supplies=f=>Object.values(f.state.solEconomy.ports).reduce((n,a)=>n+a[7],0)+Object.values(f.lives.initialize(f.state).markets).filter(m=>m.system!==1).reduce((n,m)=>n+m.stock[7],0)+[...f.state.civilianTraffic.ships,...f.state.solEconomy.freighters].reduce((n,e)=>n+(e.repairDeuranium||0)+(e.cargo?.good===7?e.cargo.tons:0)+(e.good===7?e.tons:0),0);
function valid(f){
 assert.equal(f.state.civilianTraffic.ships.length,1200);assert.equal(f.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 for(const m of Object.values(f.lives.initialize(f.state).markets)){assert.ok(m.fundsReserved>=-1e-6&&m.fundsReserved<=m.credits+1e-6);for(let g=0;g<9;g++)assert.ok(m.reserved[g]>=-1e-6&&m.reserved[g]<=m.stock[g]+1e-6);}
 assert.equal(new Set(f.state.minedAsteroids).size,f.state.minedAsteroids.length);
}
test('thirty minutes of the full corridor fleet conserves money and deuranium, retains medical coverage and reloads midway',async()=>{
 let f=await fixture(options);const cash=money(f),reserve=supplies(f),initial=copy(f.lives.initialize(f.state).economicLedger),flow=copy(f.state.solEconomy.flows),ids=copy(f.state.civilianTraffic.ships.map(e=>e.id));let damaged=false;
 Object.assign(f.state,{system:32,landed:true});
 for(let i=0;i<108000;i++){
  f.step(1/60);
  if(i===18000){const e=f.state.civilianTraffic.ships.find(e=>e.shipType!==58&&!e.journey&&e.repairDeuranium>0);assert.ok(e);f.lives.interrupt(f.state,e,'disabled');e.hull=10;e.shields=0;damaged=true;}
  if(i===54000){const saved=copy(f.state),wallet=money(f),material=supplies(f);f=await fixture({...options,saved});assert.equal(money(f),wallet);assert.equal(supplies(f),material);}
  if(i%7200===0)valid(f);
 }
 for(let n=0;f.lives.metrics(f.state).backlog>0&&n<500;n++)f.lives.advance(f.state,1/60);
 assert.equal(f.lives.metrics(f.state).backlog,0);valid(f);assert.deepEqual(copy(f.state.civilianTraffic.ships.map(e=>e.id)),ids);assert.ok(damaged);
 const life=f.lives.initialize(f.state),ledger=life.economicLedger,flows=f.state.solEconomy.flows,r=f.state.shipRepairs.ledger;
 assert.ok(Math.abs(money(f)-cash-(ledger.initialMarketCredits-initial.initialMarketCredits)-(ledger.householdSpending-initial.householdSpending))<1e-4);
 const expected=reserve+(ledger.initialMarketGoods[7]-initial.initialMarketGoods[7])+(ledger.produced[7]-initial.produced[7])+(flows.produced[7]-flow.produced[7])-(ledger.consumed[7]-initial.consumed[7])-(flows.consumed[7]-flow.consumed[7])-(ledger.lost[7]-initial.lost[7])-(flows.lost[7]-flow.lost[7])-r.consumed-r.lost;
 assert.ok(Math.abs(supplies(f)-expected)<1e-4);assert.ok(r.consumed>0);
 assert.ok(f.state.minedAsteroids.some(id=>id>=1_000_000_000));assert.ok(f.state.civilianTraffic.ships.reduce((n,e)=>n+e.deliveries,0)>600);
 assert.ok(f.state.civilianTraffic.ships.filter(e=>e.shipType===58&&e.system===e.medicalRegion&&!e.journey).length>=90);
});
