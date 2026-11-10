const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.join(__dirname,'../html-games/broken-mirror-port');
const copy=value=>JSON.parse(JSON.stringify(value));
const route={fromSystem:1,fromPort:5,toSystem:47,toPort:0,good:8};
function visit(f,system,port){Object.assign(f.state,{system,localBody:port,localBodySystem:system,localSystemVersion:2,localCruise:null,arrivalApproach:null});}
async function setup(standing=0,saved){
 const f=await fixture({saved,full:false,economic:false,corridors:true,regional:true});
 for(const file of ['cargo-permits.js','player-contracts.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context);
 f.permits=f.window.nativeCargoPermits;
 if(!saved){
  Object.assign(f.state,{shipType:60,latinum:20000,day:1,captain:'Paperwork Captain',shipName:'ISS Manifest',localContracts:[],solFreightHold:{},minerals:{},deuranium:0,antimatter:0});
  f.state.localPrestige={1:100,47:standing};visit(f,1,5);
 }
 f.source=f.lives.market(f.state,1,5);f.destination=f.lives.market(f.state,47,0);
 if(!saved)for(const m of [f.source,f.destination]){m.stock.fill(0);m.reserved.fill(0);m.incoming.fill(0);m.target.fill(300);m.fundsReserved=0;m.credits=1000000;}
 if(!saved)for(const good of [0,5,6,8])f.source.stock[good]=100;
 return f;
}
const status=(f,good=8)=>f.permits.evaluate(f.state,{toSystem:47,toPort:0,good});
const snapshot=f=>JSON.stringify({money:f.state.latinum,documents:f.state.cargoPermits,jobs:f.state.localContracts,stock:f.source.stock,
 credits:f.destination.credits,incoming:f.destination.incoming,funds:f.destination.fundsReserved,fees:f.lives.initialize(f.state).economicLedger.playerPermitFees});

test('allied and owned ports grant automatic freight clearance without creating paperwork',async()=>{
 const f=await setup(100);assert.equal(status(f).allowed,true);assert.equal(status(f).required,false);
 const job=f.lives.loadPlayerFreight(f.state,{...route,tons:10}).job;
 assert.equal(job.authorization.kind,'allied');assert.equal(f.permits.documents(f.state).length,0);assert.equal(f.state.latinum,20000);
 f.state.localPrestige[47]=-100;f.state.planetGovts||={};f.state.planetGovts[47]=16;
 assert.equal(status(f).allowed,true);assert.equal(status(f).required,false);
});

test('neutral civilian freight is open while regulated goods require a paid permit',async()=>{
 const f=await setup(0);
 for(const good of [0,1,4,5,6])assert.equal(status(f,good).allowed,true);
 for(const good of [2,3,7,8])assert.equal(status(f,good).allowed,false);
 const before=snapshot(f);assert.equal(f.lives.loadPlayerFreight(f.state,{...route,tons:10}).ok,false);assert.equal(snapshot(f),before);
 const bank=f.destination.credits,money=f.state.latinum;let writes=0;
 const issued=f.lives.buyPlayerFreightPermit(f.state,route,()=>{writes++;return {ok:true};});
 assert.equal(issued.ok,true);assert.equal(issued.document.fee,200);assert.equal(issued.document.holder.captain,'Paperwork Captain');
 assert.equal(f.state.latinum,money-200);assert.equal(f.destination.credits,bank+200);assert.equal(f.state.latinum+f.destination.credits,money+bank);
 assert.equal(f.permits.documents(f.state).length,1);assert.equal(status(f).label,'Valid pass aboard');assert.equal(writes,1);
 assert.equal(f.lives.buyPlayerFreightPermit(f.state,route).ok,true);assert.equal(f.state.latinum,money-200);assert.equal(f.permits.documents(f.state).length,1);
});

test('hostile freight needs a passage pass and a neutral permit cannot substitute for it',async()=>{
 const f=await setup(0);f.lives.buyPlayerFreightPermit(f.state,route);f.state.localPrestige[47]=-20;
 assert.equal(f.permits.recordStatus(f.state,f.permits.documents(f.state)[0]),'Additional clearance required');
 assert.equal(status(f).allowed,false);assert.equal(status(f).fee,600);
 const issued=f.lives.buyPlayerFreightPermit(f.state,route);assert.equal(issued.document.kind,'passage');
 const loaded=f.lives.loadPlayerFreight(f.state,{...route,tons:10});assert.equal(loaded.ok,true,loaded.error);
 assert.equal(loaded.job.authorization.permitId,issued.document.id);
 const assigned=f.permits.documents(f.state).find(doc=>doc.id===issued.document.id);
 assert.equal(assigned.status,'assigned');assert.equal(assigned.usesRemaining,0);
 assert.equal(f.permits.recordStatus(f.state,assigned),'Assigned to shipment');
 const before=snapshot(f);assert.equal(f.lives.loadPlayerFreight(f.state,{...route,tons:1}).ok,false);assert.equal(snapshot(f),before);
});

test('wrong port, insufficient funds and failed loads do not charge or consume documents',async()=>{
 const f=await setup(-10);f.state.latinum=599;let before=snapshot(f);
 assert.equal(f.lives.buyPlayerFreightPermit(f.state,route).ok,false);assert.equal(snapshot(f),before);
 f.state.latinum=20000;visit(f,1,3);before=snapshot(f);
 assert.equal(f.lives.buyPlayerFreightPermit(f.state,route).ok,false);assert.equal(snapshot(f),before);
 visit(f,1,5);const issued=f.lives.buyPlayerFreightPermit(f.state,route);assert.equal(issued.ok,true);
 f.source.stock[8]=0;before=snapshot(f);assert.equal(f.lives.loadPlayerFreight(f.state,{...route,tons:1}).ok,false);assert.equal(snapshot(f),before);
 assert.equal(f.permits.documents(f.state)[0].status,'valid');
});

test('failed or throwing save verification rolls back the fee and the new document together',async()=>{
 const f=await setup(0),before=snapshot(f);
 assert.equal(f.lives.buyPlayerFreightPermit(f.state,route,()=>({ok:false,error:'Storage unavailable'})).ok,false);
 assert.equal(snapshot(f),before);
 assert.equal(f.lives.buyPlayerFreightPermit(f.state,route,()=>{throw Error('Storage unavailable');}).ok,false);
 assert.equal(snapshot(f),before);
 assert.equal(f.lives.buyPlayerFreightPermit(f.state,route,()=>({ok:true})).document.reference,'TRD-00001');
});

test('assigned permits survive repeated reload and complete after government and standing change',async()=>{
 let f=await setup(-10);const pass=f.lives.buyPlayerFreightPermit(f.state,route).document;
 const job=copy(f.lives.loadPlayerFreight(f.state,{...route,tons:10}).job);
 f.state.localPrestige[47]=-100;f.state.planetGovts||={};f.state.planetGovts[47]=2;f.state.day=999;
 for(let i=0;i<3;i++){f=await setup(0,copy(f.state));assert.deepEqual(copy(f.state.localContracts[0]),job);assert.equal(f.permits.documents(f.state)[0].status,'assigned');}
 assert.equal(status(f).allowed,false);const money=f.state.latinum;visit(f,47,0);
 assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,true);assert.equal(f.state.latinum,money+job.pay);
 const document=f.permits.documents(f.state).find(doc=>doc.id===pass.id);assert.equal(document.status,'completed');assert.equal(document.completedDay,999);
 const after=snapshot(f);assert.equal(f.lives.deliverPlayerFreight(f.state,job.id).ok,false);assert.equal(snapshot(f),after);
});

test('employers issue a real free one-shipment relief document for food and medicine in hostile space',async()=>{
 const f=await setup(-50);assert.equal(status(f,5).status,'employer');assert.equal(status(f,6).status,'employer');
 const loaded=f.lives.loadPlayerFreight(f.state,{...route,good:5,tons:7});assert.equal(loaded.ok,true,loaded.error);
 const document=f.permits.documents(f.state)[0];assert.equal(document.source,'employer');assert.equal(document.fee,0);
 assert.equal(document.status,'assigned');assert.equal(document.jobId,loaded.job.id);assert.equal(f.state.latinum,20000);
 visit(f,47,0);assert.equal(f.lives.deliverPlayerFreight(f.state,loaded.job.id).ok,true);assert.equal(f.permits.documents(f.state)[0].status,'completed');
});

test('local Sol regulated freight uses the same permit records and never loads without clearance',async()=>{
 const f=await setup(0);f.state.localPrestige[1]=0;
 assert.equal(f.window.nativeSolEconomy.contract(f.state,5,3,5).ok,false);
 const issued=f.lives.buyPlayerFreightPermit(f.state,{fromSystem:1,fromPort:5,toSystem:1,toPort:3,good:8});assert.equal(issued.ok,true,issued.error);
 assert.equal(f.window.nativeSolEconomy.contract(f.state,5,3,5).ok,true);
 const job=f.state.localContracts[0];assert.equal(job.authorization.permitId,issued.document.id);
 f.state.localPrestige[1]=-100;visit(f,1,3);assert.equal(f.window.nativeSolEconomy.deliver(f.state,job.id).ok,true);
 assert.equal(f.permits.documents(f.state)[0].status,'completed');
});

test('already accepted historical cargo remains deliverable without new paperwork',async()=>{
 let f=await setup(100),job=f.lives.loadPlayerFreight(f.state,{...route,tons:5}).job;delete job.authorization;
 f.state.localPrestige[47]=-100;const accepted=copy(job);f=await setup(0,copy(f.state));visit(f,47,0);
 assert.equal(f.lives.deliverPlayerFreight(f.state,accepted.id).ok,true);assert.equal(f.permits.documents(f.state).length,0);
});
