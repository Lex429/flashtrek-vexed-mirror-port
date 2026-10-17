const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,summary}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function checkSpaces(state){
 const all=Object.values(state.portDocking?.ships||{});
 for(const a of all){assert.ok([a.x,a.y,a.radius].every(Number.isFinite));
  for(const b of all)if(a.owner<b.owner&&a.system===b.system)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+39.999,`${a.owner} overlaps ${b.owner}`);
 }
 for(const key of new Set(all.map(r=>`${r.system}:${r.port}`))){const r=all.filter(x=>`${x.system}:${x.port}`===key),slots=r.flatMap(x=>x.kind==='berth'?[x.slot]:x.clearing?[x.clearing.slot]:[]);assert.equal(new Set(slots).size,slots.length,`${key} exclusive berth`);assert.ok(slots.length<=4);assert.ok(r.filter(x=>x.kind==='queue').length<=12);}
}
function balances(f){
 const life=f.lives.initialize(f.state),goods=Array(9).fill(0),add=(g,n)=>{if(Number.isInteger(g))goods[g]+=Number(n)||0;};
 for(const stock of Object.values(f.state.solEconomy.ports))stock.forEach((n,g)=>add(g,n));
 for(const m of Object.values(life.markets))if(m.system!==1)m.stock.forEach((n,g)=>add(g,n));
 for(const ship of f.state.solEconomy.freighters)add(ship.good,ship.tons);
 for(const ship of f.state.civilianTraffic.ships){if(ship.cargo)add(ship.cargo.good,ship.cargo.tons);add(0,ship.oreHold);}
 const money=Object.values(life.markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,s)=>n+s.credits,0),ledger=life.economicLedger,flow=f.state.solEconomy.flows;
 const moneySources=ledger.initialMarketCredits+ledger.householdSpending;
 const goodsSources=goods.map((_,g)=>ledger.initialMarketGoods[g]+ledger.produced[g]-ledger.consumed[g]-ledger.lost[g]+flow.produced[g]-flow.consumed[g]-flow.lost[g]+(g===0?f.state.civilianTraffic.ships.reduce((n,s)=>n+(s.mined||0),0):0));
 return {money,goods,moneySources,goodsSources};
}
test('size-aware exclusive berths, bounded FIFO queue and overflow positions survive reload',async()=>{
 const f=await fixture({full:false,economic:false}),api=f.window.nativePortDocking;
 const ships=Array.from({length:36},(_,i)=>({...copy(f.ship),id:100+i,dimensions:{width:35+i*2,height:90+i*3}}));
 f.state.civilianTraffic.ships=ships;
 for(const ship of ships)api.request(f.state,ship,1,3);
 checkSpaces(f.state);assert.equal(ships.filter(s=>api.inspect(f.state,s).kind==='berth').length,4);assert.equal(ships.filter(s=>api.inspect(f.state,s).kind==='queue').length,12);assert.equal(ships.filter(s=>api.inspect(f.state,s).kind==='overflow').length,20);
 const saved=copy(f.state),d=JSON.stringify(saved.portDocking);api.reconcile(saved);assert.equal(JSON.stringify(saved.portDocking),d);
 api.release(f.state,ships[0]);assert.equal(api.request(f.state,ships[20],1,3).kind,'overflow','overflow cannot jump the queue');assert.equal(api.request(f.state,ships[4],1,3).kind,'berth');checkSpaces(f.state);
 const held=api.park(f.state,ships[1],1,3);assert.ok(held.clearing);assert.equal(api.request(f.state,ships[5],1,3).kind,'queue','departing hull still owns the old berth');api.parked(f.state,ships[1]);assert.equal(api.request(f.state,ships[5],1,3).kind,'berth');checkSpaces(f.state);
 ships[5].phase='destroyed';api.reconcile(f.state);assert.equal(api.inspect(f.state,ships[5]),null);
});
test('ordinary delivery policy chooses funded Sol ports and subtracts committed arrivals',async()=>{
 const f=await fixture({full:false,economic:false});f.ship.system=2;f.ship.port=0;
 for(const port of f.window.nativeSolEconomy.ports){const m=f.lives.market(f.state,1,port);m.credits=0;m.stock[5]=0;m.target[5]=12;}
 const moon=f.lives.market(f.state,1,4);moon.credits=264;
 const job=f.lives.startDelivery(f.state,f.ship.id,{toSystem:1,good:5,tons:16});assert.ok(job.ok);assert.equal(job.destination.port,4);assert.equal(f.lives.demand(moon,5),0);
 f.lives.interrupt(f.state,f.ship,'cancelled');assert.equal(f.window.nativePortDocking.inspect(f.state,f.ship),null);assert.equal(moon.fundsReserved,0);assert.equal(f.lives.demand(moon,5),12);
});
test('a funded legacy waiting delivery retains its agreed buyer and reaches a real berth',async()=>{
 const f=await fixture({full:false,economic:false}),s=f.ship;
 for(const id of [1,2,4])for(const port of id===1?f.window.nativeSolEconomy.ports:[0])f.lives.market(f.state,id,port).credits=0;
 const buyer=f.lives.market(f.state,2);buyer.stock[5]=0;buyer.credits=88;
 Object.assign(s,{system:2,port:0,phase:'docked',nextActionAt:0,localLeg:null,journey:null,cargo:{good:5,tons:4,fromSystem:1,fromPort:3,toSystem:2,toPort:0,purchasedFor:64},task:{id:'funded-legacy',kind:'freight',status:'active',phase:'waiting-payment',origin:{system:1,port:3},destination:{system:2,port:0},requirements:{good:5,tons:4}}});
 const restored=await fixture({saved:copy(f.state),economic:false}),ship=restored.ship;
 assert.equal(ship.task.agreement.payment,88);restored.step();assert.equal(ship.task.phase,'approaching');assert.equal(ship.task.recovery,undefined);
 for(let i=0;i<120*60&&!ship.deliveries;i++)restored.step();assert.equal(ship.deliveries,1);assert.equal(ship.task.id,'funded-legacy');assert.equal(ship.task.payment,88);assert.equal(restored.lives.market(restored.state,2).credits,0);
});
test('docking migration cannot finish an already paid repair before its saved deadline',async()=>{
 const f=await fixture({full:false,economic:false}),s=f.ship;
 Object.assign(s,{hull:10,shields:0,nextActionAt:20,task:{id:'paid-repair',kind:'repair',status:'active',phase:'repairing',origin:{system:1,port:3},destination:{system:1,port:3},requirements:{hull:40,shields:40,cost:0}}});delete s.dockingVersion;
 const restored=await fixture({saved:copy(f.state),economic:false});
 for(let i=0;i<19*60;i++)restored.step();assert.equal(restored.ship.hull,10);assert.equal(restored.ship.shields,0);
 for(let i=0;i<2*60;i++)restored.step();assert.equal(restored.ship.hull,40);assert.equal(restored.ship.shields,40);
});
test('live queued cargo and berth ownership resume after save/load and every queued delivery progresses',async()=>{
 const f=await fixture({full:false,economic:false});
 f.state.civilianTraffic.ships=Array.from({length:8},(_,i)=>({...copy(f.ship),id:200+i,name:'Queue '+i}));f.lives.initialize(f.state);
 for(const ship of f.state.civilianTraffic.ships)assert.ok(f.lives.startDelivery(f.state,ship.id,{toSystem:2,good:5,tons:4}).ok);
 for(let i=0;i<20*60&&!f.state.civilianTraffic.ships.some(s=>s.task?.phase==='dock-queue');i++)f.step();
 assert.ok(f.state.civilianTraffic.ships.some(s=>s.task?.phase==='dock-queue'));
 const saved=copy(f.state),restored=await fixture({saved:copy(saved),economic:false});
 assert.deepEqual(copy(restored.state.portDocking),saved.portDocking);
 for(let i=0;i<300*60&&!restored.state.civilianTraffic.ships.every(s=>s.deliveries>=1);i++)restored.step();
 assert.ok(restored.state.civilianTraffic.ships.every(s=>s.deliveries>=1));checkSpaces(restored.state);assert.equal(restored.lives.metrics(restored.state).backlog,0);
});
test('the audited Earth save physically clears its jam without deleting cargo or restarting identities',async()=>{
 const saved=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/earth-jam-c415.json'),'utf8'));
 const stuck=saved.civilianTraffic.ships.filter(s=>s.system===1&&s.port===3&&s.task?.phase==='waiting-payment');assert.equal(stuck.length,36);
 assert.equal(new Set(stuck.map(s=>`${s.x},${s.y}`)).size,12);
 const f=await fixture({saved:copy(saved)}),ids=f.state.civilianTraffic.ships.map(s=>s.id),initialDeliveries=summary(f).completedDeliveries;
 for(const old of saved.civilianTraffic.ships){const ship=f.lives.find(f.state,old.id);assert.deepEqual(copy(ship.cargo),old.cargo);assert.equal(ship.credits,old.credits);assert.equal(ship.x,old.x);assert.equal(ship.y,old.y);}
 for(const [key,m] of Object.entries(saved.civilianTraffic.life.markets))assert.equal(f.lives.initialize(f.state).markets[key].credits,m.credits);
 const initialBalances=balances(f),series=[summary(f)],movement=new Set(),departed=new Set(),completed=new Set(),initial=new Map(stuck.map(s=>[s.id,{x:s.x,y:s.y,deliveries:s.deliveries||0}])) ,leases=new Set();
 let maxQueue=0,clearedBerths=0,previous=new Set();
 for(let i=0;i<108000;i++){
  f.step();
  if(i%60===0){
   const records=Object.values(f.state.portDocking.ships);checkSpaces(f.state);
   const earth=records.filter(r=>r.system===1&&r.port===3);maxQueue=Math.max(maxQueue,earth.filter(r=>r.kind==='queue').length);
   const current=new Set(earth.filter(r=>r.kind==='berth').map(r=>r.owner+':'+r.ticket));for(const id of previous)if(!current.has(id))clearedBerths++;previous=current;for(const id of current)leases.add(id);
   for(const [id,old] of initial){const ship=f.lives.find(f.state,id),pose=f.lives.pose(f.state,ship);if(Math.hypot(pose.x-old.x,pose.y-old.y)>1)movement.add(id);if(ship.journey||ship.port!==3||ship.system!==1)departed.add(id);if((ship.deliveries||0)>old.deliveries)completed.add(id);}
  }
  if((i+1)%18000===0)series.push(summary(f));
 }
 const finalBalances=balances(f);assert.equal(finalBalances.money-initialBalances.money,finalBalances.moneySources-initialBalances.moneySources);
 assert.deepEqual(finalBalances.goods.map((n,g)=>n-initialBalances.goods[g]),finalBalances.goodsSources.map((n,g)=>n-initialBalances.goodsSources[g]),'Jam recovery conserves cargo and accounts for every source/sink');
 const final=summary(f);assert.deepEqual(f.state.civilianTraffic.ships.map(s=>s.id),ids);assert.equal(movement.size,36);assert.equal(new Set([...completed,...departed]).size,36);assert.ok(clearedBerths>4);assert.ok(final.completedDeliveries-initialDeliveries>200);assert.ok(final.waitingPayment<10);assert.equal(final.metrics.backlog,0);
 const earth=f.state.civilianTraffic.ships.filter(s=>s.system===1&&s.port===3&&!s.journey&&!s.localLeg&&s.phase!=='destroyed');assert.equal(new Set(earth.map(s=>`${s.x},${s.y}`)).size,earth.length,'stationary ships no longer stack');
 const output=path.join(__dirname,'../test-results/earth-jam-recovery.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({source:'c41559c 1800 seconds at 60 Hz; 36 unpaid Earth civilians at 12 coordinates',seconds:1800,step:1/60,initialWaiting:36,moved:movement.size,departed:departed.size,delivered:completed.size,clearedBerths,maxQueue,uniqueEarthLeases:leases.size,initialBalances,finalBalances,series},null,2));
});
