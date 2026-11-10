const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const options={regional:true,access:true,population:true,corridors:true,traffic:true,repairs:true},copy=v=>JSON.parse(JSON.stringify(v));
const money=f=>Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0);
const supplies=f=>Object.values(f.state.solEconomy.ports).reduce((n,a)=>n+a[7],0)+Object.values(f.lives.initialize(f.state).markets).filter(m=>m.system!==1).reduce((n,m)=>n+m.stock[7],0)+[...f.state.civilianTraffic.ships,...f.state.solEconomy.freighters].reduce((n,e)=>n+(e.repairDeuranium||0)+(e.cargo?.good===7?e.cargo.tons:0)+(e.good===7?e.tons:0),0);

test('six minutes of route-biased jobs conserve funds and deuranium, retain the complete fleet and reload without replaying claims',async()=>{
 let f=await fixture(options);f.state.landed=true;for(let i=0;i<2700;i++)f.step();
 const cash=money(f),reserve=supplies(f),ledger0=copy(f.lives.initialize(f.state).economicLedger),flow0=copy(f.state.solEconomy.flows),repair0=copy(f.state.shipRepairs.ledger),ids=copy(f.state.civilianTraffic.ships.map(e=>e.id));
 const a=f.window.nativeManualFlight.planetPosition(2),b=f.window.nativeManualFlight.planetPosition(20),length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
 // Leave Earth selected while the real observer flies Orion to Oce Nu.
 Object.assign(f.state,{system:2,landed:false,manualTargetSystem:1,speed:427.5,vx:ux*427.5,vy:uy*427.5});f.lives.observeCourse(f.state,2,1);
 const seenMiners=new Set(),seenOpenTraders=new Set();for(let i=0;i<21600;i++){
  const origin=f.window.nativeManualFlight.anchor(f.state.system),distance=Math.min(length-1800,i/60*427.5);f.state.x=a.x+ux*distance-origin.x;f.state.y=a.y+uy*distance-origin.y;f.window.nativeManualFlight.advanceRegion(f.state);f.step();
  if(i%60===0){const p=f.window.nativeManualFlight.position(f.state);for(const e of f.state.civilianTraffic.ships)if(e.phase==='mining'||e.travelResume&&['freight','trade'].includes(e.task?.kind)){const q=f.lives.galaxyPosition(f.state,e);if(Math.abs(q.x-p.x)<640&&Math.abs(q.y-p.y)<425){if(e.phase==='mining')seenMiners.add(e.id);else if(f.window.nativeManualFlight.regionAtPoint(f.state,q).kind==='interstellar')seenOpenTraders.add(e.id);}}}
  if(i===10800){const saved=copy(f.state),cash0=money(f),reserve0=supplies(f);f=await fixture({...options,saved});assert.equal(money(f),cash0);assert.equal(supplies(f),reserve0);}
 }
 assert.deepEqual(copy(f.state.civilianTraffic.ships.map(e=>e.id)),ids);assert.equal(f.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 const life=f.lives.initialize(f.state),ledger=life.economicLedger,flows=f.state.solEconomy.flows,r=f.state.shipRepairs.ledger;
 assert.ok(life.activity.assigned.mining>=4);assert.ok(life.activity.assigned.trade>=4);assert.ok(seenMiners.size>=2,'No working mining encounters along the observer route');
 assert.ok(seenOpenTraders.size>=2,'Too little genuine travelling trade in open space');console.log(JSON.stringify({scope:'Authoritative six-minute route poses, not rendered FPS',earthRemainedSelected:f.state.manualTargetSystem===1,miningCrews:seenMiners.size,openSpaceTraders:seenOpenTraders.size}));
 assert.ok(Math.abs(money(f)-cash-(ledger.initialMarketCredits-ledger0.initialMarketCredits)-(ledger.householdSpending-ledger0.householdSpending))<1e-4);
 const expected=reserve+(ledger.initialMarketGoods[7]-ledger0.initialMarketGoods[7])+(ledger.produced[7]-ledger0.produced[7])+(flows.produced[7]-flow0.produced[7])-(ledger.consumed[7]-ledger0.consumed[7])-(flows.consumed[7]-flow0.consumed[7])-(ledger.lost[7]-ledger0.lost[7])-(flows.lost[7]-flow0.lost[7])-(r.consumed-repair0.consumed)-(r.lost-repair0.lost);
 assert.ok(Math.abs(supplies(f)-expected)<1e-4,JSON.stringify({actual:supplies(f),expected}));assert.equal(new Set(f.state.minedAsteroids).size,f.state.minedAsteroids.length);
 for(const m of Object.values(life.markets)){assert.ok(m.fundsReserved>=-1e-6&&m.fundsReserved<=m.credits+1e-6);for(let g=0;g<9;g++)assert.ok(m.reserved[g]>=-1e-6&&m.reserved[g]<=m.stock[g]+1e-6);}
});
