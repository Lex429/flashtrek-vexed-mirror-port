const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
function until(f,predicate,seconds=500){for(let i=0;i<seconds*4&&!predicate();i++)f.step(.25);assert.ok(predicate(),'repair deadline reached');}
async function small(saved){const f=await fixture({full:false,economic:false,repairs:true,saved});f.repairs=f.window.nativeShipRepairs;
 if(!saved){for(const e of f.state.civilianTraffic.ships){e.nextActionAt=null;e.lifeScheduleToken++;e.cargo=null;}f.state.solEconomy.freighters=[];f.state.system=47;}
 return f;}
function disable(f,e,hull=10){f.lives.interrupt(f.state,e,'disabled');e.hull=hull;e.shields=0;}
function money(f){return Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0);}
function supplies(f){return Object.values(f.state.solEconomy.ports).reduce((n,a)=>n+a[7],0)+Object.values(f.lives.initialize(f.state).markets).filter(m=>m.system!==1).reduce((n,m)=>n+m.stock[7],0)+[...f.state.civilianTraffic.ships,...f.state.solEconomy.freighters].reduce((n,e)=>n+(e.repairDeuranium||0)+(e.cargo?.good===7?e.cargo.tons:0)+(e.good===7?e.tons:0),0);}

test('versioned installed bays preserve existing identities and never seed replacement medical crews on reload',async()=>{
 const f=await small(),ids=f.state.civilianTraffic.ships.map(e=>e.id),medics=f.state.civilianTraffic.ships.filter(e=>e.shipType===58);
 assert.equal(medics.length,3);assert.equal(f.state.shipRepairs.ledger.medicalCapital,45000);assert.equal(f.ship.repairBay.slots.length,2);
 for(const e of medics)assert.equal(e.repairBay.slots.length,6);
 medics[0].hull=0;medics[0].phase='destroyed';
 const g=await small(copy(f.state));assert.deepEqual(g.state.civilianTraffic.ships.map(e=>e.id),ids);assert.equal(g.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,3);assert.equal(g.state.shipRepairs.ledger.medicalCapital,45000);
 g.step();assert.equal(g.state.civilianTraffic.ships.find(e=>e.id===medics[0].id).hull,0);
});

test('docked supply purchases conserve money and unreserved stock without replacing owned freight',async()=>{
 const f=await small(),e=f.state.civilianTraffic.ships.find(e=>e.shipType===58);e.system=1;e.port=1;
 const berth=f.window.nativePortDocking.request(f.state,e,1,1);Object.assign(e,{x:berth.x,y:berth.y});
 const m=f.lives.market(f.state,1,1),cargo={good:5,tons:6,owner:e.id};e.cargo=cargo;m.stock[7]=80;m.reserved[7]=70;
 const before=money(f),wallet=e.credits;assert.equal(f.repairs.restock(f.state,e),10);assert.equal(e.repairDeuranium,10);assert.equal(m.stock[7],70);assert.equal(e.credits,wallet-550);assert.equal(e.cargo,cargo);assert.equal(money(f),before);
 assert.equal(f.repairs.restock(f.state,e),0);assert.equal(m.reserved[7],70);
 assert.equal(f.lives.exchange(f.state,m,e,{good:0,tons:1,payment:1,buy:true,repairSupplies:true,capacity:99}).ok,false);
});

test('self repair consumes exactly one ton per five hull across flight, pause, reload and detail changes',async()=>{
 let f=await small();disable(f,f.ship,10);f.ship.repairDeuranium=20;
 until(f,()=>f.state.shipRepairs.missions.some(m=>m.restoredHull>6));
 const id=f.ship.id,hull=f.ship.hull,saved=copy(f.state),spent=f.state.shipRepairs.ledger.consumed;
 f.window.nativePause.active=true;f.repairs.advance(f.state,100);assert.equal(f.ship.hull,hull);assert.equal(f.state.shipRepairs.ledger.consumed,spent);
 f=await small(saved);f.state.system=1;until(f,()=>f.ship.phase!=='disabled');
 assert.equal(f.ship.id,id);near(f.ship.hull,100,'restored hull');near(f.state.shipRepairs.ledger.consumed,18,'spent');near(f.ship.repairDeuranium,2,'reserve');assert.equal(f.state.shipRepairs.calls.length,0);
 assert.equal(f.ship.repairBay.slots.filter(d=>d.phase==='stowed').length,2);assert.equal(f.state.shipRepairs.missions[0].status,'completed');
});

test('the last recovered Dot leaves same-clock cached physical views without changing owned equipment or cargo',async()=>{
 const f=await small(),w=f.window,s=f.state,repairs=f.repairs,systems=w.nativeShipSystems,frames=w.nativeSimulationFrame;
 Object.assign(s,{system:47,x:0,y:0,angle:0,speed:0,vx:0,vy:0,phase:'disabled',hull:w.nativeShipDefinitions.forEntity(s).hull-1,shields:0,deuranium:5,latinum:500,solFreightHold:{5:2}});
 const equipment=w.nativeShipEquipment.ensure(s),dot=equipment.instances[equipment.slots.repairDrone[0]];
 dot.hull=17;dot.readyAt=123;const reference=repairs.ref('player',s),mission=repairs.launch(s,reference,reference);assert.ok(mission);
 for(let i=0;i<2000&&dot.phase!=='returning';i++){w.nativeSimulation.advance(s,.05);repairs.advance(s,.05);}
 assert.equal(dot.phase,'returning');assert.equal(mission.status,'active');assert.ok(dot.localLeg);
 const finish=dot.localLeg.startedAt+dot.localLeg.duration,delta=finish-w.nativeSimulation.seconds(s);
 assert.ok(delta>0);w.nativeSimulation.advance(s,delta);s.shipRepairs.nextPollAt=finish+100;
 const owned=()=>copy({ids:Object.keys(equipment.instances),slots:equipment.slots,locker:equipment.locker,condition:dot.hull,readyAt:dot.readyAt,cargo:s.solFreightHold,money:s.latinum,material:s.deuranium});
 const before=owned();frames.begin(s);frames.step(s);
 const cached=systems.collectShips(s,47),descriptor=cached.find(target=>target.id===dot.id);assert.ok(descriptor);
 const region={system:47,minX:descriptor.x-5,minY:descriptor.y-5,maxX:descriptor.x+5,maxY:descriptor.y+5,categories:['repair-drone']};
 assert.ok(systems.query(s,region).bystanders.some(target=>target.id===dot.id));
 const at=w.nativeSimulation.seconds(s);repairs.advance(s,.05);
 assert.equal(w.nativeSimulation.seconds(s),at,'repair completion does not advance the shared clock');
 assert.equal(dot.phase,'stowed');assert.equal(mission.status,'completed');assert.equal(repairs.drones(s,47).length,0);
 assert.deepEqual(owned(),before,'recovering equipment cannot change identities, condition, charge, cargo or balances');
 assert.ok(!systems.collectShips(s,47).some(target=>target.id===dot.id),'a returned Dot immediately leaves the cached physical fleet');
 assert.ok(!systems.query(s,region).bystanders.some(target=>target.id===dot.id),'stowed equipment cannot intercept a shot or participate in contacts');
 frames.end(s);
});

test('exhausted self repair hails once, stays disabled and retains its cargo after reload',async()=>{
 let f=await small();disable(f,f.ship,10);f.ship.repairDeuranium=2;f.ship.cargo={good:5,tons:4,owner:f.ship.id};
 until(f,()=>f.state.shipRepairs.calls.length===1);near(f.ship.hull,20,'partial hull');near(f.state.shipRepairs.ledger.consumed,2,'spent');assert.equal(f.ship.phase,'disabled');
 f=await small(copy(f.state));for(let i=0;i<200;i++)f.step(.25);
 assert.equal(f.state.shipRepairs.calls.length,1);assert.equal(f.ship.cargo.tons,4);near(f.ship.hull,20,'saved partial hull');assert.equal(f.state.civilianTraffic.hails.filter(h=>h.text.startsWith('Distress')).length,1);
});

test('one Olympic claims a hail, physically travels through the saved scheduler and repairs with six dots',async()=>{
 let f=await small();disable(f,f.ship,10);const targetId=f.ship.id,medics=f.state.civilianTraffic.ships.filter(e=>e.shipType===58);
 for(const e of medics){e.system=2;e.x=100;e.y=0;e.repairDeuranium=100;}const cargo={good:5,tons:4,owner:medics[0].id};medics[0].cargo=cargo;
 f.step(.25);let c=f.state.shipRepairs.calls[0];assert.equal(c.status,'claimed');const responder=f.state.civilianTraffic.ships.find(e=>f.repairs.key(f.repairs.ref('civilian',e))===c.claim),id=responder.id;
 assert.equal(responder.system,2);assert.equal(responder.phase,'warp');assert.equal(responder.task.phase,'rescue-transit');assert.equal(medics.filter(e=>e.task?.kind==='medical').length,1);
 const before=copy(responder.journey);f=await small(copy(f.state));let e=f.lives.find(f.state,id);assert.equal(e.journey.arrivalAt,before.arrivalAt);
 until(f,()=>f.state.shipRepairs.missions.some(m=>m.target.id===targetId&&m.restoredHull>3));
 const m=f.state.shipRepairs.missions.find(m=>m.target.id===targetId);assert.equal(m.drones.length,6);assert.equal(e.system,1);assert.ok(e.lastJourney.arrivedAt>=before.arrivalAt);assert.equal(e.cargo.tons,4);
 const ledger=f.state.shipRepairs.ledger.consumed;f=await small(copy(f.state));assert.equal(f.state.shipRepairs.ledger.consumed,ledger);
 until(f,()=>f.ship.phase!=='disabled');near(f.ship.hull,100,'medical hull');near(f.state.shipRepairs.ledger.consumed,18,'medical material');near(f.lives.find(f.state,id).repairDeuranium,82,'medical reserve');
 assert.equal(f.state.shipRepairs.calls[0].status,'completed');assert.equal(f.state.shipRepairs.missions.length,1);assert.equal(f.lives.find(f.state,id).cargo.tons,4);
});

test('destroying a casualty or responder cancels repair without resurrection, refunds or duplicate claims',async()=>{
 const f=await small();disable(f,f.ship);const e=f.state.civilianTraffic.ships.find(e=>e.shipType===58);e.system=1;e.repairDeuranium=100;
 until(f,()=>f.state.shipRepairs.missions.some(m=>m.restoredHull>1));const before=f.state.shipRepairs.ledger.consumed;
 f.ship.hull=0;f.ship.phase='destroyed';for(let i=0;i<80;i++)f.step(.25);
 assert.equal(f.ship.hull,0);near(f.state.shipRepairs.ledger.consumed,before,'no repair of wreck');assert.equal(f.state.shipRepairs.calls[0].status,'lost');
 const g=await small();disable(g,g.ship);const med=g.state.civilianTraffic.ships.find(e=>e.shipType===58);med.system=1;med.repairDeuranium=100;
 until(g,()=>g.state.shipRepairs.missions.length);med.hull=0;med.phase='destroyed';for(let i=0;i<20;i++)g.step(.25);
 assert.equal(g.state.shipRepairs.calls[0].status,'queued');assert.equal(g.state.shipRepairs.calls[0].claim,null);assert.equal(med.repairDeuranium,0);assert.equal(med.repairBay.slots.filter(d=>d.hull>0).length,0);
});

test('live Dot targets use common damage and destroyed equipment stays destroyed on reload',async()=>{
 const f=await small();disable(f,f.ship);f.ship.repairDeuranium=20;f.step(.25);
 const d=f.window.nativeShipSystems.collect(f.state,1).find(d=>d.category==='repair-drone');assert.ok(d);
 const source={id:'player',system:1},result=f.window.nativeShipSystems.applyHit(f.state,{target:d,from:{x:d.x-50,y:d.y},point:{x:d.x,y:d.y}},{damage:50,kind:'beam'},source);
 assert.equal(result.destroyed,true);assert.equal(f.ship.repairBay.slots.find(e=>e.id===d.id).hull,0);
 const g=await small(copy(f.state));g.step(.25);assert.equal(g.ship.repairBay.slots.find(e=>e.id===d.id).phase,'destroyed');
 assert.equal(g.window.nativeShipSystems.collect(g.state,1).filter(e=>e.id===d.id).length,0);
});

test('repair interruption releases trade escrow once while retaining already owned cargo',async()=>{
 const f=await small(),e=f.state.civilianTraffic.ships.find(e=>e.shipType===58);e.system=1;e.port=3;e.repairDeuranium=100;
 const m=f.lives.market(f.state,1,3),buyer=f.lives.market(f.state,2);m.stock[5]=100;buyer.stock[5]=0;
 const result=f.lives.startDelivery(f.state,e.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});assert.equal(result.ok,true);const job=e.task.id;assert.ok(f.lives.initialize(f.state).reservations[job]);
 disable(f,f.ship);f.step(.25);assert.equal(e.task.kind,'medical');assert.equal(f.lives.initialize(f.state).reservations[job],undefined);assert.equal(m.reserved[5],0);assert.equal(buyer.fundsReserved,0);
});

test('calendar catch-up and small frames integrate the same simultaneous welders',async()=>{
 const first=await small();disable(first,first.ship);first.ship.repairDeuranium=20;first.step(.25);const save=copy(first.state);
 const a=await small(copy(save)),b=await small(copy(save));for(let i=0;i<160;i++)a.step(.25);b.window.nativeSimulation.advance(b.state,40);b.repairs.advance(b.state,40);
 near(a.ship.hull,b.ship.hull,'catch-up hull');near(a.state.shipRepairs.ledger.consumed,b.state.shipRepairs.ledger.consumed,'catch-up material');assert.notEqual(a.ship.phase,'disabled');assert.notEqual(b.ship.phase,'disabled');assert.equal(b.ship.repairBay.slots.filter(d=>d.phase==='stowed').length,2);
});

test('player damage disables at a quarter hull and common weapons stay offline until recovery',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),f=await small();
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/player-combat.js'),'utf8'),f.context);
 Object.assign(f.state,{system:1,hull:50,shields:0,phase:'flight',deuranium:20,x:500,y:500});
 const hit=f.window.nativePlayerCombat.hit(f.state,40,{from:{x:400,y:500}});assert.equal(hit.disabled,true);assert.equal(f.state.phase,'disabled');
 const fired=f.window.nativeCombatShots.fireFor({state:f.state,shooter:f.window.nativeShipDefinitions.describe(f.state),target:f.window.nativeShipDefinitions.describe(f.state,f.ship,{category:'civilian'})});
 assert.equal(fired.ok,false);assert.match(fired.error,/disabled/);until(f,()=>f.state.phase==='flight');near(f.state.hull,50,'player hull');near(f.state.deuranium,12,'player reserves');
});

test('staggered medical launches and recovery use shared traffic and physical hull clearance',async()=>{
 const f=await fixture({full:false,economic:false,repairs:true,traffic:true});const w=f.window,s=f.state,medic=s.civilianTraffic.ships.find(e=>e.shipType===58);
 w.nativePlayerCombat={visualImpact:(s,e)=>w.nativeShipEffects.visualImpact(s,w.nativeShipDefinitions.describe(s),e)};
 s.solEconomy.freighters=[];s.system=1;s.x=70000;s.y=70000;
 for(const e of s.civilianTraffic.ships){e.nextActionAt=null;e.lifeScheduleToken++;e.repairDeuranium=0;}
 Object.assign(f.ship,{x:2500,y:2500});Object.assign(medic,{system:1,x:3300,y:2500,repairDeuranium:100});disable(f,f.ship);
 let steps=0;while(f.ship.phase==='disabled'&&steps++<9000)f.step(1/60);
 assert.notEqual(f.ship.phase,'disabled');near(f.ship.hull,100,'physical rescue hull');assert.ok(steps<9000);
 const launched=s.shipRepairs.missions.find(m=>m.carrier.id===medic.id);assert.equal(launched.drones.length,6);assert.equal(launched.status,'completed');
 assert.equal(medic.repairBay.slots.filter(d=>d.phase==='stowed').length,6);assert.ok(Number.isFinite(medic.x)&&Number.isFinite(medic.y));
});

test('disabled Sol freight retains loaded cargo and resumes its owning route after drones return',async()=>{
 const f=await fixture({full:false,repairs:true}),w=f.window,s=f.state;until(f,()=>s.solEconomy.freighters.some(e=>e.phase==='travel'&&e.tons>0));const tug=s.solEconomy.freighters.find(e=>e.phase==='travel'&&e.tons>0);assert.ok(tug);
 const tons=tug.tons,good=tug.good,to=tug.to;tug.shields=0;tug.repairDeuranium=20;
 w.nativeSolEconomy.hit(s,tug.id,40,{from:{x:tug.x-100,y:tug.y}});assert.equal(tug.phase,'disabled');assert.equal(tug.tons,tons);
 until(f,()=>tug.phase!=='disabled');assert.equal(tug.phase,'travel');assert.equal(tug.tons,tons);assert.equal(tug.good,good);assert.equal(tug.to,to);assert.ok(tug.lifeLeg);assert.ok(tug.lifeEventAt>w.nativeSimulation.seconds(s));
});

test('claimed medical rescue into an excluded system survives reload and returns without creating a market',async()=>{
 let f=await fixture({full:false,economic:false,repairs:true,regional:true,access:true});
 const target=32;Object.assign(f.state,{system:target,hull:10,phase:'disabled',deuranium:0,landed:false,x:900,y:500});
 const medic=f.state.civilianTraffic.ships.find(e=>e.shipType===58),id=medic.id;
 for(const e of f.state.civilianTraffic.ships){e.nextActionAt=null;e.lifeScheduleToken++;e.repairDeuranium=0;}medic.repairDeuranium=100;
 f.step(.25);assert.equal(medic.task.kind,'medical');until(f,()=>medic.system===target);
 f=await fixture({saved:copy(f.state),economic:false,repairs:true,regional:true,access:true});let e=f.lives.find(f.state,id);assert.equal(e.system,target);
 until(f,()=>f.state.phase!=='disabled');until(f,()=>e.task.requirements.medicalReturn);const departure=e.journey.departedAt;
 f=await fixture({saved:copy(f.state),economic:false,repairs:true,regional:true,access:true});e=f.lives.find(f.state,id);assert.equal(e.system,target);assert.equal(e.journey.departedAt,departure);
 until(f,()=>f.window.nativeCivilianAccess.inhabited(f.state,e.system));assert.equal(f.lives.initialize(f.state).markets[target+':0'],undefined);
});

test('30 minute production population retains deuranium and credits with repair sources and sinks accounted',async()=>{
 const f=await fixture({repairs:true,regional:true,access:true});f.repairs=f.window.nativeShipRepairs;
 const life=f.lives.initialize(f.state);const first=supplies(f),cash=money(f),initial=copy(life.economicLedger),flow=copy(f.state.solEconomy.flows);
 // Real existing hulls/supplies, not a second fleet. Trigger damage only after
 // paid reserves have accumulated; full scheduler and ordinary freight continue.
 let damaged=false;
 for(let i=0;i<7200;i++){
   f.step(.25);
   if(!damaged&&i>600){const e=f.state.civilianTraffic.ships.find(e=>e.shipType!==58&&e.repairDeuranium>0&&!e.journey);if(e){disable(f,e,Math.max(1,e.hull*.2));damaged=true;}}
 }
 assert.ok(damaged);const led=f.lives.initialize(f.state).economicLedger,flows=f.state.solEconomy.flows,r=f.state.shipRepairs.ledger;
 const expected=first+(led.initialMarketGoods[7]-initial.initialMarketGoods[7])+(led.produced[7]-initial.produced[7])+(flows.produced[7]-flow.produced[7])-(led.consumed[7]-initial.consumed[7])-(flows.consumed[7]-flow.consumed[7])-(led.lost[7]-initial.lost[7])-(flows.lost[7]-flow.lost[7])-r.consumed-r.lost;
 near(supplies(f),expected,'total deuranium');near(money(f),cash+(led.initialMarketCredits-initial.initialMarketCredits)+(led.householdSpending-initial.householdSpending),'total credits');
 assert.equal(f.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,3);assert.ok(r.consumed>0);
 for(const m of Object.values(life.markets)){assert.ok(m.fundsReserved>=0&&m.fundsReserved<=m.credits);for(let g=0;g<9;g++)assert.ok(m.reserved[g]>=0&&m.reserved[g]<=m.stock[g]+1e-5);}
});
