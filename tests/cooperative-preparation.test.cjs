const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs'),copy=value=>JSON.parse(JSON.stringify(value));
const options={full:true,population:true,regional:true,access:true,corridors:true,repairs:true};
async function drain(steps,check=()=>{}){let count=0,result;do{result=steps.next();if(!result.done){check();if(++count%64===0)await new Promise(setImmediate);}}while(!result.done);return count;}
test('cooperative fleet restoration retains the complete saved graph, funded delivery, repair bays and physical debt',async()=>{
 const f=await fixture(options),w=f.window,s=f.state,l=w.nativeNpcLives;
 const crew=s.civilianTraffic.ships.find(e=>e.shipType!==58&&!e.journey&&!e.cargo&&!['disabled','destroyed'].includes(e.phase));
 l.interrupt(s,crew,'Preparation regression');w.nativePortDocking.release(s,crew);delete crew.journey;delete crew.dockingMove;
 Object.assign(crew,{system:1,port:3,x:250,y:-60,phase:'docked',credits:100000,cargo:null});l.refreshLocation(s,crew);
 const source=l.market(s,1,3),buyer=l.market(s,4,0);source.stock[5]=50;buyer.stock[5]=0;buyer.target[5]=100;buyer.credits=100000;
 const delivery=l.startDelivery(s,crew.id,{fromSystem:1,fromPort:3,toSystem:4,toPort:0,good:5,tons:3});assert.equal(delivery.ok,true,JSON.stringify(delivery));
 w.nativeSimulationFrame.schedule(s).pendingSeconds=.0275;
 const baseline=copy(s),direct=copy(s),cooperative=copy(s),at=w.nativeSimulation.seconds(s);
 w.nativeSolEconomy.initialize(direct);w.nativeShipRepairs.initialize(direct);l.initialize(direct);
 w.nativeSolEconomy.initialize(cooperative);
 const invariant=()=>{assert.equal(w.nativeSimulation.seconds(cooperative),at);assert.equal(cooperative.shipSimulation.schedule.pendingSeconds,.0275);assert.equal(cooperative.civilianTraffic.ships.length,baseline.civilianTraffic.ships.length);};
 const repairSteps=await drain(w.nativeShipRepairs.prepare(cooperative),invariant),lifeSteps=await drain(l.prepare(cooperative),invariant);
 assert.ok(repairSteps>2000&&lifeSteps>4000,'Fleet restoration did not yield its individual records');
 assert.deepEqual(copy(cooperative),copy(direct));
 const reservation=cooperative.civilianTraffic.life.reservations[delivery.taskId];assert.equal(reservation.payment,baseline.civilianTraffic.life.reservations[delivery.taskId].payment);
 assert.equal(cooperative.shipRepairs.ledger.medicalCapital,baseline.shipRepairs.ledger.medicalCapital);
 assert.deepEqual(copy(s),baseline,'Preparing the future graph mutated the live origin');
});
test('interrupted preparation resumes its existing work, and synchronous activation finishes a pending life restore',async()=>{
 const f=await fixture(options),w=f.window,expected=copy(f.state),s=copy(f.state);
 w.nativeSolEconomy.initialize(expected);w.nativeShipRepairs.initialize(expected);w.nativeNpcLives.initialize(expected);
 w.nativeSolEconomy.initialize(s);const repair=w.nativeShipRepairs.prepare(s);for(let i=0;i<41;i++)repair.next();
 await drain(w.nativeShipRepairs.prepare(s));
 const life=w.nativeNpcLives.prepare(s);for(let i=0;i<61;i++)life.next();assert.equal(w.nativeNpcLives.prepare(s),life);
 w.nativeNpcLives.initialize(s);assert.equal(w.nativeNpcLives.ready(s),true);assert.deepEqual(copy(s),copy(expected));
 assert.deepEqual(s.civilianTraffic.ships.map(e=>e.id),expected.civilianTraffic.ships.map(e=>e.id));
});
