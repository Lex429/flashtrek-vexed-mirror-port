const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const policy=fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/player-contracts.js'),'utf8');
const permits=fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/cargo-permits.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
function loadPolicy(f){vm.runInContext(permits,f.context);vm.runInContext(policy,f.context);return f.window.nativePlayerContracts;}
function visit(f,system,port){Object.assign(f.state,{system,localBody:port,localBodySystem:system,localSystemVersion:2,localCruise:null,arrivalApproach:null});}
async function setup(saved){
 const f=await fixture({saved,full:false,economic:false,corridors:true,regional:true});f.policy=loadPolicy(f);
 if(!saved){
  Object.assign(f.state,{shipType:60,latinum:100000,localContracts:[],solFreightHold:{},minerals:{},deuranium:0,dilithium:0,food:0,antimatter:0});visit(f,1,5);
  f.state.localPrestige=Object.fromEntries(f.window.VexedMirrorWorld.systems.map(system=>[system.id,100]));
  f.policy.offers(f.state,1,5); // Allocate eligible markets before conservation measurements.
  f.source=f.lives.market(f.state,1,5);f.destination=f.lives.market(f.state,47,0);
  for(const m of [f.source,f.destination]){m.stock.fill(0);m.reserved.fill(0);m.incoming.fill(0);m.fundsReserved=0;m.credits=100000;m.target.fill(60);}
  f.source.stock[8]=100;
 }
 return f;
}
const options={fromSystem:1,fromPort:5,toSystem:47,toPort:0,good:8};
const balances=f=>JSON.stringify({money:f.state.latinum,jobs:f.state.localContracts,source:f.lives.market(f.state,1,5),destination:f.lives.market(f.state,47,0),reservations:f.lives.initialize(f.state).reservations});

test('quadrant offers use populated catalog planets, include Bajor and permit return cargo to Sol planets',async()=>{
 const f=await setup(),offers=f.policy.offers(f.state,1,5),bajor=offers.find(o=>o.toSystem===47);
 assert.ok(bajor);assert.equal(bajor.name,'Bajor');assert.equal(bajor.systemName,'Bajoran');assert.equal(bajor.good,8);
 assert.ok(offers.length>20);assert.ok(offers.every(o=>!f.window.nativeSystemCatalog.sameSystem(1,o.toSystem)));
 assert.equal(f.policy.commonOre(47),'Tritanium');
 visit(f,47,0);f.destination.stock[2]=100;
 for(const port of f.window.nativeSolEconomy.ports){const m=f.lives.market(f.state,1,port);m.stock[2]=0;m.incoming[2]=0;m.target[2]=60;m.credits=100000;m.fundsReserved=0;}
 const returns=f.policy.offers(f.state,47,0);
 assert.ok(returns.some(o=>o.toSystem===1&&o.to===3));assert.ok(returns.some(o=>o.toSystem===1&&o.to===5));
});

test('loading withdraws real stock, reserves fixed payment and demand, and shares the complete hold',async()=>{
 const f=await setup(),capacity=f.window.nativeShipDefinitions.forEntity(f.state).cargo;
 f.state.solFreightHold[0]=capacity-7;
 const quote=f.lives.playerFreightQuote(f.state,options);assert.equal(quote.maxLoad,7);
 const before=f.state.latinum+f.source.credits+f.destination.credits;
 const result=f.lives.loadPlayerFreight(f.state,{...options,tons:quote.maxLoad});assert.equal(result.ok,true,result.error);
 const job=result.job;assert.equal(job.kind,'interstellar');assert.equal(job.toSystem,47);assert.equal(job.to,0);
 assert.equal(f.source.stock[8],93);assert.equal(f.destination.stock[8],0);assert.equal(f.destination.incoming[8],7);
 assert.equal(f.destination.fundsReserved,job.pay);assert.equal(f.state.latinum,100000);
 assert.equal(f.window.nativeShipEquipment.cargoUsed(f.state),capacity);
 assert.equal(f.state.latinum+f.source.credits+f.destination.credits,before);
 assert.equal(f.source.stock[8]+f.destination.stock[8]+job.tons,100);
 assert.equal(f.window.nativeSolEconomy.deliver(f.state,job.id).ok,false);
});

test('Haul Max is capped by unreserved stock, destination demand and purchasing funds',async()=>{
 const f=await setup(),rate=f.lives.playerFreightQuote(f.state,options).rate;
 f.source.reserved[8]=96;assert.equal(f.lives.playerFreightQuote(f.state,options).maxLoad,4);
 f.source.reserved[8]=0;f.destination.incoming[8]=57;assert.equal(f.lives.playerFreightQuote(f.state,options).maxLoad,3);
 f.destination.incoming[8]=0;f.destination.fundsReserved=f.destination.credits-rate*2;assert.equal(f.lives.playerFreightQuote(f.state,options).maxLoad,2);
 for(const tons of [0,-1,1.5,3]){const before=balances(f);assert.equal(f.lives.loadPlayerFreight(f.state,{...options,tons}).ok,false);assert.equal(balances(f),before);}
});

test('only the correct system and planet can collect; treasury and cargo settle exactly once',async()=>{
 const f=await setup(),loaded=f.lives.loadPlayerFreight(f.state,{...options,tons:10}),job=loaded.job;
 const beforeMoney=f.state.latinum+f.destination.credits;
 for(const [system,port]of [[1,3],[2,0],[47,1]]){visit(f,system,port);const before=balances(f);assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,false);assert.equal(balances(f),before);}
 visit(f,47,0);f.state.localCruise={to:0};assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,false);f.state.localCruise=null;
 // Ordinary retail cannot consume this contract's escrow.
 f.state.solFreightHold[8]=1;
 assert.equal(f.lives.exchange(f.state,f.destination,f.state,{good:8,tons:1,payment:f.destination.credits,buy:false,player:true}).ok,false);
 const partial=balances(f);
 assert.equal(f.lives.exchange(f.state,f.destination,f.state,{good:8,tons:9,payment:job.pay,buy:false,player:true,reservationId:job.reservationId,shipment:job}).ok,false);
 assert.equal(balances(f),partial);
 const result=f.lives.deliverPlayerFreight(f.state,job.id);assert.equal(result.ok,true,result.error);
 assert.equal(f.state.latinum,100000+job.pay);assert.equal(f.state.latinum+f.destination.credits,beforeMoney);
 assert.equal(f.destination.stock[8],10);assert.equal(f.destination.incoming[8],0);assert.equal(f.destination.fundsReserved,0);
 assert.equal(f.state.localContracts.length,0);const after=balances(f);
 assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,false);assert.equal(balances(f),after);
});

test('warps and repeated save reloads retain the agreed cargo, price and one payment reservation',async()=>{
 let f=await setup(),job=copy(f.lives.loadPlayerFreight(f.state,{...options,tons:10}).job);
 visit(f,2,0);
 for(let i=0;i<3;i++){
  f=await setup(copy(f.state));const m=f.lives.market(f.state,47,0);
  assert.deepEqual(copy(f.state.localContracts[0]),job);assert.equal(m.incoming[8],10);assert.equal(m.fundsReserved,job.pay);
  assert.equal(f.lives.market(f.state,1,5).stock[8],90);assert.equal(f.state.latinum,100000);
 }
 visit(f,47,0);const bank=f.lives.market(f.state,47,0).credits;
 assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,true);
 f=await setup(copy(f.state));assert.equal(f.state.latinum,100000+job.pay);
 assert.equal(f.lives.market(f.state,47,0).credits,bank-job.pay);assert.equal(f.lives.market(f.state,47,0).fundsReserved,0);
 assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,false);
});

test('local and interstellar shipments share the two-contract limit and legacy contracts retain their identity',async()=>{
 const f=await setup(),legacy={id:5000,from:5,to:3,good:8,tons:5,pay:150};f.state.localContracts.push(legacy);
 const result=f.lives.loadPlayerFreight(f.state,{...options,tons:10});assert.equal(result.ok,true);
 const before=balances(f);assert.equal(f.lives.loadPlayerFreight(f.state,{...options,tons:1}).ok,false);assert.equal(balances(f),before);
 assert.equal(f.window.nativeSolEconomy.contract(f.state,5,4,1).ok,false);
 visit(f,47,0);assert.equal(f.lives.deliverPlayerFreight(f.state,result.job.id).ok,true);
 assert.deepEqual(copy(f.state.localContracts),[legacy]);assert.equal(f.policy.address(legacy).name,'Earth');
});

test('interstellar distance uses the actual planet positions in continuous flight units',async()=>{
 const f=await setup(),catalog=f.window.nativeSystemCatalog,flight=f.window.nativeManualFlight;
 const source=catalog.bodies(1).find(body=>body.id===5),destination=catalog.bodies(47).find(body=>body.id===0);
 const origin=flight.anchor(1),target=flight.anchor(47);
 const expected=Math.hypot(target.x+destination.x-origin.x-source.x,target.y+destination.y-origin.y-source.y);
 const quote=f.lives.playerFreightQuote(f.state,options);
 assert.equal(quote.distance,expected);assert.equal(f.policy.distance(47,0,1,5),expected);
 assert.notEqual(f.policy.distance(1,3,47,0),quote.distance,'Earth and Mars are different pickup points');
 assert.equal(quote.rate,Math.ceil(f.window.nativeSolEconomy.freightRate(8,expected)));
 const local=f.window.nativeSolEconomy.snapshot(f.state,5).lanes.find(lane=>lane.to===3);
 assert.equal(local.rate,27.5+Math.hypot(4800,1800)/400,'Existing Mars to Earth pricing is preserved');
});

test('equal cargo loads earn progressively more on nearby, medium and distant routes',async()=>{
 const f=await setup(),quotes=f.policy.destinations(f.state).filter(port=>!f.window.nativeSystemCatalog.sameSystem(1,port.system))
  .map(port=>({port,...f.lives.playerFreightQuote(f.state,{...options,toSystem:port.system,toPort:port.port})})).filter(q=>q.ok).sort((a,b)=>a.distance-b.distance);
 assert.ok(quotes.length>20);
 for(let i=1;i<quotes.length;i++)assert.ok(quotes[i].rate>=quotes[i-1].rate,'Distance never reduces the per-ton rate for the same good');
 const near=quotes[0],middle=quotes[Math.floor(quotes.length/2)],far=quotes.at(-1);
 assert.ok(near.rate<middle.rate&&middle.rate<far.rate);
 assert.ok(far.rate*10>middle.rate*10&&middle.rate*10>near.rate*10);
 assert.ok(far.rate>near.rate*2,'Cross-quadrant distance has a substantial effect');
});

test('accepted new prices remain locked when the route chart changes and across reload',async()=>{
 let f=await setup(),job=copy(f.lives.loadPlayerFreight(f.state,{...options,tons:10}).job);
 assert.equal(job.pricingVersion,2);assert.equal(job.pay,job.rate*job.tons);assert.ok(job.distance>0);
 const original=f.window.nativeManualFlight.anchor;
 f.window.nativeManualFlight.anchor=id=>{const point=original(id);return Number(id)===47?{x:point.x+1000000,y:point.y}:point;};
 assert.ok(f.lives.playerFreightQuote(f.state,options).rate>job.rate);
 assert.deepEqual(copy(f.state.localContracts[0]),job);
 f=await setup(copy(f.state));visit(f,47,0);
 assert.deepEqual(copy(f.state.localContracts[0]),job);
 assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,true);assert.equal(f.state.latinum,100000+job.pay);
});

test('older interstellar jobs retain their original funded payout after the pricing update',async()=>{
 let f=await setup(),job=f.lives.loadPlayerFreight(f.state,{...options,tons:10}).job;
 job.pay=350;delete job.rate;delete job.distance;delete job.pricingVersion;
 const reservation=f.lives.initialize(f.state).reservations[job.reservationId];reservation.payment=350;reservation.unitPrice=35;
 f.destination.fundsReserved=350;const accepted=copy(job);
 f=await setup(copy(f.state));assert.deepEqual(copy(f.state.localContracts[0]),accepted);
 assert.ok(f.lives.playerFreightQuote(f.state,options).rate*10>accepted.pay);
 assert.equal(f.lives.market(f.state,47,0).fundsReserved,350);
 visit(f,47,0);assert.equal(f.lives.deliverPlayerFreight(f.state,accepted.id).ok,true);assert.equal(f.state.latinum,100350);
});
