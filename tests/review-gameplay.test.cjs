const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:sharedFixture}=require('./npc-economy-fixture.cjs');
const fixture=options=>sharedFixture({...options,...(process.env.REVIEW_GAMEPLAY_REVISION?{revision:process.env.REVIEW_GAMEPLAY_REVISION}:{})});
const copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);

async function refinery({reserve=199.625,tons=4,raw=true,payment,secondPayment,secondDelay=.01}={}){
 const f=await fixture({full:false,economic:false,regional:true,repairs:true}),s=f.state,w=f.window;
 const e=s.civilianTraffic.ships.find(ship=>ship.shipType===58);
 for(const ship of s.civilianTraffic.ships){f.lives.interrupt(s,ship,'isolated refinery regression');ship.nextActionAt=null;ship.lifeScheduleToken++;}
 const second=secondPayment===undefined?null:s.civilianTraffic.ships.filter(ship=>ship.shipType===58&&ship!==e)[0];
 s.civilianTraffic.ships=second?[e,second]:[e];s.solEconomy.freighters=[];s.system=47;
 Object.assign(e,{system:1,port:3,phase:'docked',hull:w.nativeShipDefinitions.get(58).hull,repairDeuranium:reserve,repairProvisioning:false,credits:1200,dockingVersion:1});
 const b=w.nativePortDocking.request(s,e,1,3);Object.assign(e,{x:b.x,y:b.y});
 const at=w.nativeSimulation.seconds(s),job=e.task={id:`civilian:${e.id}:refinery`,kind:'mining',phase:'unloading',status:'active',createdAt:at,
  origin:{system:1,port:3},destination:{system:1,port:3},requirements:{good:7,tons,medicalSupply:true}};
 e.cargo={good:7,tons,raw,oreType:'deuranium',owner:e.id,fromSystem:1,fromPort:3,toSystem:1,toPort:3};
 delete e.localLeg;delete e.dockingMove;delete e.dockIntent;delete e.needsDockRecovery;delete e.combatInterruption;
 e.nextActionAt=at;e.lifeScheduleToken++;
 const m=f.lives.market(s,1,3);m.stock[7]=0;m.credits=12000;
 if(payment!==undefined){
  m.credits=Math.max(m.credits,payment);
  s.civilianTraffic.life.reservations[job.id]={version:2,owner:e.id,system:1,port:3,good:7,tons,sourceReserved:false,destination:{system:1,port:3},destinationReserved:true,payment,unitPrice:payment/tons};
  job.agreement={version:1,payment,unitSellPrice:payment/tons,acceptedAt:at};
 }
 if(second){
  const secondTons=secondPayment/75;
  Object.assign(second,{system:1,port:3,phase:'docked',repairDeuranium:200,repairProvisioning:false,credits:0,dockingVersion:1});
  const berth=w.nativePortDocking.request(s,second,1,3);Object.assign(second,{x:berth.x,y:berth.y});
  second.task={id:`civilian:${second.id}:fractional-escrow`,kind:'freight',phase:'unloading',status:'active',createdAt:at,origin:{system:1,port:3},destination:{system:1,port:3},requirements:{good:7,tons:secondTons},agreement:{version:1,payment:secondPayment,unitSellPrice:75,acceptedAt:at}};
  second.cargo={good:7,tons:secondTons,raw:false,oreType:'deuranium',owner:second.id,fromSystem:1,fromPort:3,toSystem:1,toPort:3};
  delete second.localLeg;delete second.dockingMove;delete second.dockIntent;delete second.needsDockRecovery;delete second.combatInterruption;
  second.nextActionAt=at+secondDelay;second.lifeScheduleToken++;
  s.civilianTraffic.life.reservations[second.task.id]={version:2,owner:second.id,system:1,port:3,good:7,tons:secondTons,sourceReserved:false,destination:{system:1,port:3},destinationReserved:true,payment:secondPayment,unitPrice:75};
  m.credits=payment+secondPayment;
 }
 // Market initialization may inspect the deliberately not-yet-installed legacy
 // agreement. The serialized fixture starts only after its funded job is whole.
 job.phase='unloading';job.status='active';delete job.recovery;e.nextActionAt=at;e.lifeScheduleToken++;
 // Restoration rebuilds the real event heap and existing funded escrow.
 const g=await fixture({saved:copy(s),full:false,economic:false,regional:true,repairs:true});
 return {...g,medic:g.state.civilianTraffic.ships[0],market:g.lives.market(g.state,1,3),jobId:job.id};
}

test('saved collision spin turns the hull while hands-off coasting preserves world momentum',async()=>{
 const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion,profile=m.profiles.manual({speedOrOtherStationValue:35,turn:12});
 let ship={x:0,y:0,heading:0,speed:120,vx:120,vy:0,motionSpin:{version:1,mode:'free',velocity:.8}};
 for(let i=0;i<360;i++){
  m.step(ship,{},profile,1/60);
  if(i===29)ship=copy(ship); // The saved free impulse survives a midway reload.
 }
 near(ship.x,720);near(ship.y,0);near(ship.vx,120);near(ship.vy,0);near(ship.speed,120);
 assert.ok(ship.heading>.39&&ship.heading<.41,'The legitimate angular impulse must still turn the hull');
 assert.equal(ship.motionSpin,undefined,'A damped impact must finish rather than become a steering command');
 const heading=ship.heading;for(let i=0;i<120;i++)m.step(ship,{},profile,1/60);near(ship.heading,heading);
 m.step(ship,{turn:1},profile,.2);assert.ok(ship.heading>heading+.5);assert.ok(ship.vy>50,'Intentional steering must remain effective');
});

test('pure braking reduces the existing course rather than steering along a collision-rotated nose',async()=>{
 const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion,profile=m.profiles.manual({speedOrOtherStationValue:35,turn:12});
 const ship={x:0,y:0,heading:Math.PI/2,speed:120,vx:120,vy:0,motionSpin:{version:1,mode:'free',velocity:.3}};
 m.step(ship,{brake:true},profile,.1);assert.ok(ship.vx>0&&ship.vx<120);near(ship.vy,0);near(ship.y,0);
 for(let i=0;i<120;i++)m.step(ship,{brake:true},profile,1/60);near(ship.speed,0);near(ship.vy,0);
});

test('an Olympic refines to its target and unloads fractional surplus once with conserved material and cash',async()=>{
 const f=await refinery(),e=f.medic,m=f.market,before={material:m.stock[7]+e.repairDeuranium+e.cargo.tons,cash:m.credits+e.credits};
 f.step(.25);
 assert.equal(e.cargo,null);assert.equal(e.repairDeuranium,200);assert.equal(e.deliveries,1);
 near(m.stock[7],3.625);near(m.stock[7]+e.repairDeuranium,before.material);near(m.credits+e.credits,before.cash);
 near(e.credits-1200,3.625*75);assert.equal(e.task.deliveredAt,0);assert.equal(e.task.transactionId,`unload:${f.jobId}`);
 assert.equal(f.lives.initialize(f.state).reservations[f.jobId],undefined);near(m.fundsReserved,0);near(m.incoming[7],0);
 const restored=await fixture({saved:copy(f.state),full:false,economic:false,regional:true,repairs:true});
 const again=restored.state.civilianTraffic.ships[0],market=restored.lives.market(restored.state,1,3),cash=again.credits+market.credits,stock=market.stock[7];
 restored.step(.25);assert.equal(again.deliveries,1);assert.equal(market.stock[7],stock);near(again.credits+market.credits,cash);
});

test('a saved fractional delivery retains its exact funded price through reload and failed settlement',async()=>{
 let f=await refinery({reserve:200,tons:2.375,raw:false,payment:123.4375}),e=f.medic,m=f.market;
 near(m.fundsReserved,123.4375);near(m.incoming[7],2.375);const before=copy({cargo:e.cargo,credits:e.credits,stock:m.stock,treasury:m.credits});
 const unavailable=f.lives.exchange(f.state,m,e,{good:7,tons:2.375,payment:123.4375,buy:false,reservationId:'wrong-contract'});
 assert.equal(unavailable.ok,false);assert.deepEqual(copy({cargo:e.cargo,credits:e.credits,stock:m.stock,treasury:m.credits}),before);
 f=await fixture({saved:copy(f.state),full:false,economic:false,regional:true,repairs:true});e=f.state.civilianTraffic.ships[0];m=f.lives.market(f.state,1,3);f.step(.25);
 assert.equal(e.cargo,null);near(e.credits-before.credits,123.4375);near(before.treasury-m.credits,123.4375);near(m.stock[7],2.375);near(m.fundsReserved,0);
});

test('the final funded fractional escrow settles after earlier payments leave subtraction residues',async()=>{
 for(const firstPayment of [.4,12000]){
 let f=await refinery({reserve:200,tons:firstPayment/75,raw:false,payment:firstPayment,secondPayment:.3,secondDelay:1}),ships=f.state.civilianTraffic.ships,m=f.market;
 const beforeCash=m.credits+ships.reduce((n,e)=>n+e.credits,0),beforeTons=m.stock[7]+ships.reduce((n,e)=>n+e.cargo.tons,0);
 assert.equal(m.credits,firstPayment+.3);assert.equal(m.fundsReserved,firstPayment+.3);
 assert.ok((firstPayment+.3)-firstPayment<.3,'The fixture must exercise actual nonbinary subtraction, not an exactly represented eighth');
 const agreements=ships.map(e=>copy(e.task.agreement));f.step(.25);
 assert.equal(ships[0].deliveries,1);assert.ok(ships[1].cargo);assert.ok(m.credits>0&&m.credits<.3);
 const remainder=m.credits;
 f=await fixture({saved:copy(f.state),full:false,economic:false,regional:true,repairs:true});ships=f.state.civilianTraffic.ships;m=f.lives.market(f.state,1,3);
 assert.equal(m.credits,remainder);assert.equal(m.fundsReserved,.3);assert.deepEqual(copy(ships[1].task.agreement),agreements[1]);
 f.step(.75);
 for(let i=0;i<ships.length;i++){
  assert.equal(ships[i].cargo,null,`Funded remainder after the ${firstPayment}-credit payment must settle`);assert.equal(ships[i].deliveries,1);assert.equal(ships[i].task.status,'completed');
  assert.deepEqual(copy(ships[i].task.agreement),agreements[i],'The accepted price cannot change to make the transfer pass');
 }
 near(m.credits+ships.reduce((n,e)=>n+e.credits,0),beforeCash,1e-12);near(m.stock[7],beforeTons,1e-14);
 assert.equal(m.credits,0);assert.equal(m.fundsReserved,0);near(m.incoming[7],0,1e-14);
 assert.equal(ships[1].credits,.3);assert.equal(ships[0].credits,1200+firstPayment);
 const restored=await fixture({saved:copy(f.state),full:false,economic:false,regional:true,repairs:true});
 assert.ok(restored.state.civilianTraffic.ships.every(e=>e.cargo===null&&e.deliveries===1));
 assert.equal(restored.lives.market(restored.state,1,3).credits,0);
 }
});

test('funded escrow never waives whole-credit or materially sized fractional deficits at large balances',async()=>{
 for(const [payment,balance] of [[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER-1],[2**50+.5,2**50+.25],[.3,0],[1e-12,0],[1e-12,5e-13],[.3,.3-1e-6]]){
  const f=await refinery({reserve:200,tons:1,raw:false,payment}),e=f.medic,m=f.market;
  const reservation=f.lives.initialize(f.state).reservations[e.task.id];
  assert.ok(reservation,'The saved funded contract must survive initialization');
  assert.equal(reservation.owner,e.id);assert.equal(reservation.tons,1);assert.equal(reservation.payment,payment);assert.equal(reservation.destinationReserved,true);
  assert.equal(m.fundsReserved,payment);assert.ok(m.credits>=payment,'The fixture starts with the contract genuinely funded before treasury depletion');
  m.credits=balance;const before=JSON.stringify({e,m,reservations:f.lives.initialize(f.state).reservations});
  const result=f.lives.exchange(f.state,m,e,{good:7,tons:1,payment,buy:false,reservationId:e.task.id});
  assert.equal(result.ok,false,`Treasury ${balance} cannot fund payment ${payment}`);
  assert.equal(JSON.stringify({e,m,reservations:f.lives.initialize(f.state).reservations}),before,'Failed admission must preserve cargo, cash and escrow');
 }
 const f=await refinery({reserve:200,tons:1,raw:false,payment:.3}),e=f.medic,m=f.market;
 m.credits=.3-1e-12;
 for(const options of [{payment:.3-1e-13,reservationId:e.task.id},{payment:.3,reservationId:undefined}]){
  const before=JSON.stringify({e,m,reservations:f.lives.initialize(f.state).reservations});
  assert.equal(f.lives.exchange(f.state,m,e,{good:7,tons:1,buy:false,...options}).ok,false,'Wrong-price or unreserved sales cannot use funded dust tolerance');
  assert.equal(JSON.stringify({e,m,reservations:f.lives.initialize(f.state).reservations}),before);
 }
});

test('numerical refill dust goes into owned reserves without a stuck cargo contract or lost material',async()=>{
 const f=await refinery({reserve:196+5e-11}),e=f.medic,m=f.market,total=e.repairDeuranium+e.cargo.tons;
 f.step(.25);assert.equal(e.cargo,null);assert.equal(e.task.status,'completed');near(e.repairDeuranium,total,1e-12);assert.equal(m.stock[7],0);assert.equal(e.credits,1200);
 assert.equal(f.lives.initialize(f.state).reservations[f.jobId],undefined);
});

test('fractional settlement retains atomic validation for nonfinite or excessive quantities and payments',async()=>{
 const f=await refinery({raw:false,tons:.625}),e=f.medic,m=f.market;
 for(const invalid of [{tons:NaN},{tons:Infinity},{tons:Number.MAX_SAFE_INTEGER+1},{tons:-.1},{payment:NaN},{payment:Infinity},{payment:Number.MAX_SAFE_INTEGER+1},{payment:-.1}]){
  const before=JSON.stringify({e,m});assert.equal(f.lives.exchange(f.state,m,e,{good:7,tons:.625,payment:1.25,buy:false,...invalid}).ok,false);assert.equal(JSON.stringify({e,m}),before);
 }
 const reservation=f.lives.initialize(f.state).reservations[e.task.id];
 m.credits=reservation.payment-1e-6;
 const before=JSON.stringify({e,m});
 assert.equal(f.lives.exchange(f.state,m,e,{good:7,tons:.625,payment:reservation.payment,buy:false,reservationId:e.task.id}).ok,false,'Escrow cannot fabricate money after a real treasury depletion');
 assert.equal(JSON.stringify({e,m}),before);
});

test('repair capacity survives six-to-one-to-six hull changes and reload without duplicating owned drones',async()=>{
 const f=await fixture({full:false,economic:false,repairs:true}),w=f.window,s=f.state,api=w.nativeShipEquipment;
 assert.ok(api.changeHull(s,58).ok);let eq=api.ensure(s);
 for(let i=0;i<6;i++)if(!eq.slots.repairDrone[i])assert.ok(api.grant(s,'basic-dot',{location:'slot',slot:i}).ok);
 const ids=eq.slots.repairDrone.slice(),count=Object.keys(eq.instances).length;eq.instances[ids[5]].hull=17;eq.instances[ids[5]].readyAt=123;
 assert.equal(s.repairBay.capacity,6);assert.ok(api.changeHull(s,7).ok);assert.equal(s.repairBay.capacity,1);assert.equal(s.repairBay.slots.length,1);
 for(const id of ids.slice(1))assert.ok(eq.locker.includes(id));
 const restored=await fixture({saved:copy(s),full:false,economic:false,repairs:true}),r=restored.state,a=restored.window.nativeShipEquipment;
 assert.equal(r.repairBay.capacity,1);assert.ok(a.changeHull(r,58).ok);eq=a.ensure(r);assert.equal(r.repairBay.capacity,6);assert.equal(eq.slots.repairDrone.length,6);
 assert.equal(r.repairBay.slots.length,1,'Empty bays cannot create replacement drones');
 for(let i=1;i<6;i++){const from=eq.locker.indexOf(ids[i]);assert.ok(a.move(r,{category:'repairDrone',fromType:'locker',fromIndex:from,toType:'slot',toIndex:i}).ok);}
 assert.equal(r.repairBay.slots.length,6);assert.equal(Object.keys(eq.instances).length,count);assert.deepEqual(new Set(eq.slots.repairDrone),new Set(ids));assert.equal(eq.instances[ids[5]].hull,17);assert.equal(eq.instances[ids[5]].readyAt,123);
 const reloaded=await fixture({saved:copy(r),full:false,economic:false,repairs:true});assert.equal(reloaded.state.repairBay.capacity,6);assert.equal(reloaded.state.repairBay.slots.length,6);
});
