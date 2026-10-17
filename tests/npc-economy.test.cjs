const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,summary}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function until(f,predicate,seconds=400){for(let i=0;i<seconds*60&&!predicate();i++)f.step();assert.ok(predicate(),'scheduled state reached');}
function allMoney(f){const life=f.lives.initialize(f.state);return Object.values(life.markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,s)=>n+s.credits,0);}
function allGoods(f){const result=Array(9).fill(0),add=(good,tons)=>{if(Number.isInteger(good))result[good]+=Number(tons)||0;};for(const stock of Object.values(f.state.solEconomy.ports))stock.forEach((tons,g)=>add(g,tons));for(const market of Object.values(f.lives.initialize(f.state).markets))if(market.system!==1)market.stock.forEach((tons,g)=>add(g,tons));for(const ship of f.state.solEconomy.freighters)add(ship.good,ship.tons);for(const ship of f.state.civilianTraffic.ships){if(ship.cargo)add(ship.cargo.good,ship.cargo.tons);add(0,ship.oreHold);}return result;}
function assertReservations(f){const life=f.lives.initialize(f.state);for(const m of Object.values(life.markets)){assert.ok(m.fundsReserved>=0&&m.fundsReserved<=m.credits,`${m.id} treasury escrow`);for(let g=0;g<9;g++){assert.ok(m.reserved[g]>=0&&m.reserved[g]<=m.stock[g],`${m.id} stock escrow ${g}`);assert.ok(m.incoming[g]>=0,`${m.id} incoming ${g}`);}}}

test('simultaneous delivery contracts reserve unique source stock, fixed destination money and incoming demand',async()=>{
 const f=await fixture({full:false,economic:false}),{ship,state,lives}=f;
 const ships=[ship,...[90,91].map(id=>Object.assign(plain(ship),{id,task:null,nextActionAt:9999}))];state.civilianTraffic.ships=ships;lives.initialize(state);
 const source=lives.market(state,1,3),destination=lives.market(state,2);source.stock[5]=12;destination.stock[5]=0;destination.target[5]=12;destination.credits=264;
 const options={fromSystem:1,fromPort:3,toSystem:2,good:5,tons:8},one=lives.startDelivery(state,ships[0].id,options),two=lives.startDelivery(state,ships[1].id,options),three=lives.startDelivery(state,ships[2].id,options);
 assert.equal(one.tons,8);assert.equal(two.tons,4);assert.equal(three.ok,false);assert.equal(source.reserved[5],12);assert.equal(destination.incoming[5],12);assert.equal(destination.fundsReserved,264);assert.equal(lives.availableFunds(destination),0);assert.equal(lives.demand(destination,5),0);
 const total=allMoney(f);destination.target[5]=0;
 until(f,()=>ships[0].deliveries===1&&ships[1].deliveries===1);assert.equal(ships[0].task.payment,176);assert.equal(ships[1].task.payment,88);assert.equal(destination.stock[5],12);assert.equal(allMoney(f),total);assert.equal(source.stock[5],0);assert.equal(destination.incoming[5],0);assert.equal(destination.fundsReserved,0);assertReservations(f);
});

test('loading consumes only stock escrow; interruption and reload release destination escrow once',async()=>{
 const f=await fixture({full:false,economic:false}),source=f.lives.market(f.state,1,3),destination=f.lives.market(f.state,2);
 f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:8});
 assert.equal(source.reserved[5],8);assert.equal(destination.fundsReserved,176);
 const restored=await fixture({saved:plain(f.state),economic:false});assert.equal(restored.lives.market(restored.state,1,3).reserved[5],8);assert.equal(restored.lives.market(restored.state,2).fundsReserved,176);
 until(restored,()=>restored.ship.cargo);assert.equal(restored.lives.market(restored.state,1,3).reserved[5],0);assert.equal(restored.lives.market(restored.state,2).fundsReserved,176);
 const total=allMoney(restored);restored.lives.interrupt(restored.state,restored.ship,'disabled');restored.lives.interrupt(restored.state,restored.ship,'disabled');
 assert.equal(restored.ship.cargo.tons,8);assert.equal(restored.lives.market(restored.state,2).incoming[5],0);assert.equal(restored.lives.market(restored.state,2).fundsReserved,0);assert.equal(allMoney(restored),total);
 restored.lives.interrupt(restored.state,restored.ship,'destroyed');restored.lives.interrupt(restored.state,restored.ship,'destroyed');assert.equal(restored.lives.initialize(restored.state).strandedCargo.length,1);assert.equal(restored.lives.initialize(restored.state).strandedCargo[0].cargo.tons,8);assertReservations(restored);
});

test('unfunded legacy cargo has a saved recovery deadline, idles and reroutes to a real funded buyer',async()=>{
 const initial=await fixture({full:false,economic:false}),s=initial.ship;
 for(const id of [1,2,4]){const m=initial.lives.market(initial.state,id,id===1?3:0);m.credits=0;m.stock[5]=m.target[5];}
 for(const port of [1,4,5]){const m=initial.lives.market(initial.state,1,port);m.credits=0;m.stock[5]=m.target[5];}
 Object.assign(s,{system:2,port:0,x:-60,y:150,phase:'docked',nextActionAt:0,cargo:{good:5,tons:4,owner:s.id,fromSystem:1,fromPort:3,toSystem:2,toPort:0,purchasedFor:64},task:{id:'civilian:2:legacy',status:'active',kind:'freight',phase:'waiting-payment',origin:{system:1,port:3},destination:{system:2,port:0},requirements:{good:5,tons:4},createdAt:0}});
 initial.lives.initialize(initial.state).reservations={};initial.state.system=47;
 const f=await fixture({saved:plain(initial.state),economic:false});until(f,()=>f.ship.task.recovery?.attempts>0,2);
 const deadline=f.ship.task.recovery.deadlineAt,id=f.ship.id;for(let i=0;i<60*60;i++)f.step();
 const restored=await fixture({saved:plain(f.state),economic:false});assert.equal(restored.ship.task.recovery.deadlineAt,deadline);assert.equal(restored.ship.cargo.tons,4);
 until(restored,()=>restored.ship.task.phase==='payment-idle',130);assert.equal(restored.ship.task.status,'blocked');assert.match(restored.ship.task.failureReason,/cargo remains aboard/);assert.equal(restored.ship.id,id);assert.equal(restored.ship.cargo.tons,4);
 const buyer=restored.lives.market(restored.state,4);buyer.credits=1000;buyer.stock[5]=0;const before=buyer.stock[5],position={x:restored.ship.x,y:restored.ship.y};
 until(restored,()=>restored.ship.journey,130);assert.equal(restored.ship.journey.origin,2);assert.equal(restored.ship.journey.destination,4);assert.equal(restored.ship.system,2);assert.equal(restored.ship.x,position.x);assert.equal(restored.ship.y,position.y);assert.equal(restored.ship.cargo.tons,4);
 until(restored,()=>restored.ship.deliveries===1);assert.equal(restored.ship.system,4);assert.equal(buyer.stock[5],before+4);assert.equal(restored.ship.cargo,null);assert.ok(restored.ship.recentEvents.some(e=>e.kind==='docked'));assertReservations(restored);
});

test('connected household consumption and specialty production are explicit saved sources and sinks',async()=>{
 const f=await fixture({full:false,economic:false}),life=f.lives.initialize(f.state);life.config.economyEnabled=true;
 for(const id of life.config.connectedSystems)f.lives.market(f.state,id,id===1?3:0);
 f.ship.nextActionAt=1e8;f.ship.lifeScheduleToken++;const m=Object.values(life.markets),stockBefore=m.reduce((n,x)=>n+x.stock.reduce((a,b)=>a+b,0),0),money=allMoney(f);
 f.window.nativeSimulation.advance(f.state,120);f.lives.advance(f.state,120);
 const produced=life.economicLedger.produced.reduce((a,b)=>a+b,0),consumed=life.economicLedger.consumed.reduce((a,b)=>a+b,0),stockAfter=m.reduce((n,x)=>n+x.stock.reduce((a,b)=>a+b,0),0);
 assert.equal(stockAfter,stockBefore+produced-consumed);assert.equal(allMoney(f),money+life.economicLedger.householdSpending);assert.equal(life.economicLedger.cycles,1);assert.ok(produced>0&&consumed>0);
 const restored=await fixture({saved:plain(f.state),economic:false});restored.lives.initialize(restored.state).config.economyEnabled=true;restored.lives.advance(restored.state,1/60);assert.equal(restored.lives.initialize(restored.state).economicLedger.cycles,1);
});

test('full saved population sustains useful work for 30 minutes at the normal simulation step',async()=>{
 const f=await fixture(),series=[summary(f)],started=performance.now(),initialMoney=allMoney(f),initialGoods=allGoods(f);
 assert.equal(f.state.civilianTraffic.ships.length,159);assert.equal(f.state.solEconomy.freighters.length,9);assert.equal(f.window.nativeSolAsteroids.placements.length,262);
 for(let i=0;i<108000;i++){f.step();if((i+1)%18000===0){assertReservations(f);series.push(summary(f));}}
 const end=series.at(-1),previous=series.at(-2);assert.ok(end.completedDeliveries>1000);assert.ok(end.completedDeliveries-previous.completedDeliveries>50);assert.ok(end.working>=20);assert.ok(end.waitingPayment<10);assert.equal(end.metrics.backlog,0);
 assert.equal(allMoney(f),initialMoney+end.economy.initialMarketCredits+end.economy.householdSpending,'Only recorded one-time market allocations and household purchases add money');
 const flows=f.state.solEconomy.flows,mined=f.state.civilianTraffic.ships.reduce((n,s)=>n+(s.mined||0),0),lost=end.economy.lost;
 const expectedGoods=initialGoods.map((n,g)=>n+end.economy.initialMarketGoods[g]+end.economy.produced[g]-end.economy.consumed[g]+flows.produced[g]-flows.consumed[g]-flows.lost[g]+(g===0?mined:0)-lost[g]);assert.deepEqual(allGoods(f),expectedGoods,'All goods changes have production, recipe, consumption, mining or explicit loss records');
 for(const ship of f.state.civilianTraffic.ships)if(ship.task?.phase==='waiting-payment'){assert.ok(Number.isFinite(ship.task.recovery?.deadlineAt));assert.ok(ship.task.recovery.deadlineAt>=f.window.nativeSimulation.seconds(f.state)-1/60);}
 const report={step:1/60,seconds:1800,wallSeconds:(performance.now()-started)/1000,initialPopulation:{civilians:159,tugs:9,asteroids:262},money:{initial:initialMoney,final:allMoney(f),oneTimeMarketAllocations:end.economy.initialMarketCredits,householdSpending:end.economy.householdSpending,unaccounted:allMoney(f)-initialMoney-end.economy.initialMarketCredits-end.economy.householdSpending},goods:{initial:initialGoods,final:allGoods(f),solFlows:flows,npcMinedOre:mined,npcLostCargo:lost,unaccounted:allGoods(f).map((n,g)=>n-expectedGoods[g])},series};const output=path.join(__dirname,'../test-results/economy-regression-after.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
});

test('commercial survivors resume through the task owner without duplicating their paid cargo',async()=>{
 const f=await fixture({full:false,economic:false});f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});until(f,()=>f.ship.cargo);
 // Encounter tests enter combat locally; keep the already-paid hold and clear the
 // travel representation just as the tactical controller does before engagement.
 f.ship.journey=null;f.ship.phase='fighting';const cargo=plain(f.ship.cargo),money=allMoney(f),sourceStock=f.lives.market(f.state,1,3).stock[5];
 assert.equal(f.lives.resumeWork(f.state,f.ship),true);assert.equal(f.ship.task.status,'failed');until(f,()=>f.ship.task.status==='active');
 assert.deepEqual(plain(f.ship.cargo),cargo);assert.equal(f.lives.market(f.state,1,3).stock[5],sourceStock);assert.equal(allMoney(f),money);assert.ok(f.lives.initialize(f.state).reservations[f.ship.task.id].destinationReserved);
 f.lives.interrupt(f.state,f.ship,'disabled');assert.equal(f.lives.resumeWork(f.state,f.ship),false);assert.equal(f.ship.phase,'disabled');assert.equal(f.ship.cargo.tons,4);
});

test('full-population legacy unpaid deliveries recover after an explicit treasury depletion shock',async()=>{
 const initial=await fixture(),life=initial.lives.initialize(initial.state),ids=[...initial.state.civilianTraffic.ships.map(s=>s.id)];
 // Construct the old arrival-time-price save representation. The two carried
 // tons were actually withdrawn and purchased before the treasury shock.
 for(const ship of initial.state.civilianTraffic.ships){const origin={system:ship.system,port:ship.system===1?ship.port:0},source=initial.lives.market(initial.state,origin.system,origin.port),destination={system:[1,2,4][ship.id%3],port:ship.id%3===0?3:0};
  assert.ok(source.stock[5]>=2);source.stock[5]-=2;ship.credits-=32;source.credits+=32;
  Object.assign(ship,{cargo:{good:5,tons:2,owner:ship.id,fromSystem:origin.system,fromPort:origin.port,toSystem:destination.system,toPort:destination.port,purchasedFor:32},system:destination.system,port:destination.port,x:180,y:-130,phase:'docked',journey:null,localLeg:null,nextActionAt:0,task:{id:`civilian:${ship.id}:unpaid`,kind:'freight',status:'active',phase:'waiting-payment',origin,destination,requirements:{good:5,tons:2},createdAt:0}});
  initial.lives.market(initial.state,ship.homeBase.system,ship.homeBase.port);
 }
 for(const port of [1,3,4,5])initial.lives.market(initial.state,1,port);
 for(const m of Object.values(life.markets))m.credits=0;
 life.reservations={};initial.state.system=47;
 const f=await fixture({saved:plain(initial.state)}),series=[summary(f)];
 for(let i=0;i<36000;i++){f.step();if((i+1)%7200===0){assertReservations(f);series.push(summary(f));}}
 const end=series.at(-1);assert.equal(series[0].waitingPayment,159);assert.ok(end.waitingPayment<10);assert.ok(end.completedDeliveries>50);assert.ok(end.economy.householdSpending>0);assert.deepEqual(f.state.civilianTraffic.ships.map(s=>s.id),ids);
 for(const ship of f.state.civilianTraffic.ships)if(ship.task?.phase==='waiting-payment')assert.ok(ship.task.recovery.deadlineAt>=f.window.nativeSimulation.seconds(f.state)-1/60);
 const output=path.join(__dirname,'../test-results/economy-legacy-recovery.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({seconds:600,step:1/60,treasuryShock:'All purchasing treasuries externally depleted in the initial fixture after real legacy loading',series},null,2));
});

test('legacy unfunded pickup contracts cancel without consuming any source stock or money',async()=>{
 const initial=await fixture({full:false,economic:false}),source=initial.lives.market(initial.state,1,3),destination=initial.lives.market(initial.state,2);initial.lives.startDelivery(initial.state,initial.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});
 const saved=plain(initial.state),reservation=saved.civilianTraffic.life.reservations[initial.ship.task.id],stock=source.stock[5],money=allMoney(initial);delete reservation.version;delete reservation.destinationReserved;delete reservation.destination;delete reservation.payment;saved.civilianTraffic.life.markets['2:0'].credits=0;
 const restored=await fixture({saved,economic:false});assert.equal(restored.ship.task.status,'failed');assert.match(restored.ship.task.failureReason,/cancelled before loading/);assert.equal(restored.lives.market(restored.state,1,3).stock[5],stock);assert.equal(restored.lives.market(restored.state,1,3).reserved[5],0);assert.equal(restored.ship.cargo,null);assert.equal(allMoney(restored),money-destination.credits);assertReservations(restored);
});

test('scheduler and market catch-up budgets are shared across animation substeps',async()=>{
 const f=await fixture({economic:false}),life=f.lives.initialize(f.state);life.config.eventBudget=4;life.config.economyEnabled=true;
 f.window.nativeSimulation.advance(f.state,1e6);f.window.nativeSimulationFrame.begin(f.state);
 for(let i=0;i<15;i++){f.window.nativeSimulationFrame.step(f.state);f.lives.advance(f.state,1/60);}
 const frame=f.window.nativeSimulationFrame.snapshot(f.state);assert.equal(frame.steps,15);assert.ok(frame.counters.civilianEvents<=4);assert.ok(frame.counters.civilianHeapPops<=16);assert.equal(frame.counters.civilianEconomy,life.config.economyBudget);assert.ok(f.lives.metrics(f.state).backlog>0);assert.ok(life.nextEconomyAt<f.window.nativeSimulation.seconds(f.state));f.window.nativeSimulationFrame.end(f.state);
});

test('civilian escrow and provisional company freight share Sol incoming demand across restore',async()=>{
 const f=await fixture({full:false,economic:false}),m=f.lives.market(f.state,1,3);m.stock[5]=0;m.target[5]=20;
 for(const tug of f.state.solEconomy.freighters)tug.assignment=null;
 const tug=f.state.solEconomy.freighters[0];tug.assignment={from:5,to:3,good:5,tons:12};tug.phase='travel';f.ship.system=2;f.ship.port=0;
 assert.equal(f.lives.demand(m,5),8);const result=f.lives.startDelivery(f.state,f.ship.id,{fromSystem:2,toSystem:1,toPort:3,good:5,tons:16});assert.equal(result.tons,8);assert.equal(f.lives.demand(m,5),0);assert.equal(f.state.solEconomy.incomingReserved[3],m.incoming);
 const restored=await fixture({saved:plain(f.state),economic:false}),destination=restored.lives.market(restored.state,1,3);assert.equal(restored.state.solEconomy.incomingReserved[3],destination.incoming);assert.equal(restored.lives.demand(destination,5),0);
 restored.lives.interrupt(restored.state,restored.ship,'cancelled');assert.equal(restored.state.solEconomy.incomingReserved[3][5],0);assert.equal(restored.lives.demand(destination,5),8);restored.state.solEconomy.freighters[0].phase='disabled';assert.equal(restored.lives.demand(destination,5),20);
});

test('restored invalid commercial legs release escrow and never load or award cargo',async()=>{
 const first=await fixture({full:false,economic:false});first.ship.x=800;first.ship.y=800;first.lives.startDelivery(first.state,first.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});assert.equal(first.ship.task.phase,'pickup-flight');
 const stock=first.lives.market(first.state,1,3).stock[5],saved=plain(first.state);saved.civilianTraffic.ships[0].localLeg.goal.x=null;
 const f=await fixture({saved,economic:false});assert.equal(f.ship.task.status,'failed');assert.equal(f.ship.task.failureReason,'invalid route');assert.equal(f.ship.cargo,null);assert.equal(f.lives.market(f.state,1,3).stock[5],stock);assert.equal(f.lives.market(f.state,1,3).reserved[5],0);assert.equal(f.lives.market(f.state,2).fundsReserved,0);assert.ok(Number.isFinite(f.ship.nextActionAt));
});

test('legacy zero-distance saved civilian arrival advances once with finite movement and no immediate-work loop',async()=>{
 const first=await fixture({full:false,economic:false});first.ship.x=800;first.ship.y=800;first.lives.startDelivery(first.state,first.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});
 const stock=first.lives.market(first.state,1,3).stock[5],saved=plain(first.state),s=saved.civilianTraffic.ships[0],goal={...s.localLeg.goal};Object.assign(s,{x:goal.x,y:goal.y,nextActionAt:null});Object.assign(s.localLeg,{version:1,start:goal,goal,duration:null,distance:0,peakSpeed:0});
 const f=await fixture({saved,economic:false});until(f,()=>f.ship.cargo,5);assert.equal(f.ship.cargo.tons,4);assert.equal(f.lives.market(f.state,1,3).stock[5],stock-4);assert.ok([f.ship.x,f.ship.y,f.ship.heading,f.ship.speed,f.ship.vx,f.ship.vy,f.ship.nextActionAt].every(Number.isFinite));assert.ok(f.lives.metrics(f.state).scheduledEvents<10);assert.equal(f.lives.metrics(f.state).backlog,0);
});

test('reload restores funded escrows before legacy cargo regardless of ship array order',async()=>{
 const f=await fixture({full:false,economic:false}),destination=f.lives.market(f.state,2);destination.credits=176;
 assert.equal(f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:8}).ok,true);
 const early=Object.assign(plain(f.ship),{id:1,system:2,port:0,phase:'docked',localLeg:null,journey:null,nextActionAt:0,cargo:{good:5,tons:4,owner:1,fromSystem:1,fromPort:3,toSystem:2,toPort:0,purchasedFor:64},task:{id:'civilian:1:legacy',kind:'freight',status:'active',phase:'waiting-payment',origin:{system:1,port:3},destination:{system:2,port:0},requirements:{good:5,tons:4}}});
 const saved=plain(f.state);saved.civilianTraffic.ships.unshift(early);const restored=await fixture({saved,economic:false}),m=restored.lives.market(restored.state,2),funded=restored.state.civilianTraffic.ships.find(s=>s.id===2);
 assert.equal(m.fundsReserved,176);assert.equal(m.incoming[5],8);assert.equal(restored.lives.initialize(restored.state).reservations[early.task.id],undefined);assert.equal(restored.state.civilianTraffic.ships[0].cargo.tons,4);
 until(restored,()=>funded.deliveries===1);assert.equal(funded.task.payment,176);assert.equal(m.credits,0);assertReservations(restored);
});

test('repeated contract cancellation and reload never recreate a market allocation or payment',async()=>{
 const f=await fixture({full:false,economic:false}),source=f.lives.market(f.state,1,3),destination=f.lives.market(f.state,2),before={money:allMoney(f),stock:source.stock[5],allocations:f.lives.initialize(f.state).economicLedger.initialMarketCredits,markets:Object.keys(f.lives.initialize(f.state).markets).length};
 for(let i=0;i<10;i++){assert.ok(f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4}).ok);f.lives.interrupt(f.state,f.ship,'cancelled');}
 const restored=await fixture({saved:plain(f.state),economic:false});assert.equal(allMoney(restored),before.money);assert.equal(restored.lives.market(restored.state,1,3).stock[5],before.stock);assert.equal(restored.lives.initialize(restored.state).economicLedger.initialMarketCredits,before.allocations);assert.equal(Object.keys(restored.lives.initialize(restored.state).markets).length,before.markets);assert.equal(restored.lives.market(restored.state,2).fundsReserved,0);assert.equal(restored.lives.market(restored.state,2).incoming[5],0);assert.equal(destination.credits,25000);
});
