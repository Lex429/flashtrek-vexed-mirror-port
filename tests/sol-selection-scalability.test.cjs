const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../html-games/broken-mirror-port'),plain=value=>JSON.parse(JSON.stringify(value));
// Reference the previous synchronous scoring policy through the real dispatcher
// and saved-event owner, rather than exporting a second production controller.
const legacySelection=`function legacyBestJob(economy,ship,localOnly=false){
 let best=null;
 for(const from of localOnly?[ship.port]:ports)for(const to of ports)for(let good=0;good<goods.length;good++){
  const surplus=availableStock(economy,from,good)-targetStock[from][good];
  const shortage=targetStock[to][good]-stock(economy,to,good)-inbound(economy,to,good,ship);
  const tons=Math.floor(Math.min(Math.max(0,tugStats().cargo-qty(ship.repairDeuranium)),surplus,shortage));
  if(from===to||tons<10)continue;
  const urgency=Math.min(2,shortage/Math.max(20,targetStock[to][good]));
  let score=tons*(1+urgency)*Math.sqrt(basePrices[good]/24)/(1+distance(from,to)/16000);
  const approach=from===ship.port?1:1+distance(ship.port,from)/12000;
  const variety=to===ship.lastDestination?.to&&good===ship.lastDestination.good ? .68:1;
  score=score/approach*variety;
  const job={from,to,good,tons,score};if(!best||job.score>best.score)best=job;
 }
 return best;
}`;

function load(saved,reference=false){
 const window={nativePause:{active:false},nativeShipInventory:{active:false},vexedSolFlight:{shipPosition:s=>({x:s.x,y:s.y})},
  vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:30,height:60})},nativeCombatShots:{contact:()=>null},nativeShipEffects:{prepare(){},hit(){}}},
  context=vm.createContext({window,document:{hidden:false},console});
 for(const file of ['world-data.js','simulation-clock.js','ship-motion.js','ship-definitions.js','ship-damage.js','faction-standing.js','port-docking.js','sol-economy.js']){
  let source=fs.readFileSync(path.join(root,file),'utf8');
  if(reference&&file==='sol-economy.js'){
   const marker='const commitments=inboundCommitments(economy,ship),job=bestJob(economy,ship,true,commitments)||bestJob(economy,ship,false,commitments);';
   assert.equal(source.split(marker).length,2,'reference must replace exactly the actual dispatch selection');
   source=source.replace('function dispatch(economy,ship) {',legacySelection+'\n  function dispatch(economy,ship) {').replace(marker,'const job=legacyBestJob(economy,ship,true)||legacyBestJob(economy,ship);');
  }
  vm.runInContext(source,context,{filename:file});
 }
 const state=saved||{system:14,x:0,y:0,localPrestige:{}};window.nativeSimulation.ensure(state);const economy=window.nativeSolEconomy.initialize(state);
 const step=(dt=.25)=>{window.nativeSimulation.advance(state,dt);window.nativeSolEconomy.advance(state,dt);};
 return {window,state,economy,step};
}

function savedFleet(count,mode='global'){
 const {state,economy}=load(),template=plain(economy.freighters[0]);economy.clock=-1e8;economy.lifeClock=0;state.shipSimulation.seconds=0;
 for(const port of Object.keys(economy.ports))economy.ports[port]=Array(9).fill(0);
 if(mode!=='none')economy.ports[mode==='local'?3:1][0]=10000;
 economy.stockReserved={1:[.75],3:[.75]};economy.incomingReserved={4:[12.75],2:[0,7.9]};
 economy.freighters=Array.from({length:count},(_,id)=>({...plain(template),id,identity:'tug:'+id,name:'Selection crew '+id,shipType:10,lifeVersion:1,
  port:3,from:3,to:3,phase:'waiting',speed:0,vx:0,vy:0,lifeLeg:null,lifeEventAt:id?1e9:.01,dwell:.01,path:[],routeIndex:0,
  task:{id:'owned-job:'+id,kind:'idle',status:'active',phase:'waiting'},assignment:id?{from:1,to:2,good:1,tons:id%4+.875}:null,
  tons:id?(id%7)*.125:0,good:id?1:null,repairDeuranium:2.875,recentEvents:[],deliveries:0}));
 for(const id of [1,2])if(economy.freighters[id])Object.assign(economy.freighters[id],{phase:id===1?'disabled':'destroyed',assignment:{from:1,to:4,good:0,tons:1e8}});
 const variants=[{to:4,good:0,tons:10.875},{to:'4',good:0,tons:1e8},{to:4,good:'0',tons:1e8},{to:4,good:0,tons:-9.75},{to:4,good:0,tons:'3.9'},{to:4,good:0,tons:null}];
 variants.forEach((assignment,index)=>{if(economy.freighters[index+3])economy.freighters[index+3].assignment={from:1,...assignment};});
 return plain(state);
}

function metered(saved,reference=false){
 const f=load(plain(saved),reference);let assignmentReads=0;
 for(const ship of f.economy.freighters){let value=ship.assignment;Object.defineProperty(ship,'assignment',{enumerable:true,configurable:true,get(){assignmentReads++;return value;},set(next){value=next;}});}
 return {...f,reads:()=>assignmentReads};
}

for(const count of [1000,5000])test(`real ${count}-tug dispatch preserves the legacy job and complete saved outcome with linear commitment reads`,t=>{
 const saved=savedFleet(count),current=metered(saved),reference=metered(saved,true),beforePorts=JSON.stringify(saved.solEconomy.ports),beforeCargo=saved.solEconomy.freighters.slice(1).map(ship=>[ship.tons,ship.good]);
 current.step(.02);reference.step(.02);const currentReads=current.reads(),referenceReads=reference.reads();
 assert.ok(current.economy.freighters[0].assignment,'the actual due-event dispatcher chooses useful work');
 assert.equal(current.economy.freighters[0].assignment.from,1,'local failure must retain the global selection fallback');
 assert.ok(currentReads<count+30,`${currentReads} assignment reads must be bounded by one fleet traversal`);
 assert.ok(referenceReads>count*500,'the reference exercises repeated fleet reductions across both candidate searches');
 t.diagnostic(JSON.stringify({companyTugs:count,assignmentReads:currentReads,previousPolicyAssignmentReads:referenceReads}));
 assert.deepEqual(plain(current.state),plain(reference.state),'job scores, tie order, funding, identities, cargo, equipment and deadlines stay identical');
 assert.equal(JSON.stringify(current.economy.ports),beforePorts,'selection does not transfer or mint inventory');
 assert.deepEqual(current.economy.freighters.slice(1).map(ship=>[ship.tons,ship.good]),beforeCargo);
 assert.equal(current.economy.lifeMetrics.scheduledEvents,1);
});

test('local selection and no-job outcomes retain exact legacy scores, quantities and saved events',()=>{
 for(const mode of ['local','none']){
  const saved=savedFleet(24,mode),current=load(plain(saved)),reference=load(plain(saved),true);current.step(.02);reference.step(.02);
  assert.deepEqual(plain(current.state),plain(reference.state));assert.equal(current.economy.freighters[0].assignment?.from,mode==='local'?3:undefined);
 }
});

test('handling counts stop at the third relevant busy crew and preserve the original delay',()=>{
 const saved=savedFleet(1000,'local');for(let i=1;i<saved.solEconomy.freighters.length;i++)Object.assign(saved.solEconomy.freighters[i],{port:3,phase:i%2?'loading':'unloading',assignment:null});
 const f=load(saved),selected=f.economy.freighters[0];let portReads=0;
 for(const ship of f.economy.freighters.slice(1)){let port=ship.port;Object.defineProperty(ship,'port',{enumerable:true,configurable:true,get(){portReads++;return port;},set(value){port=value;}});}
 f.step(.02);const readCount=portReads,tons=selected.handlingTons,
  variation=1.5*(1+Math.sin(f.economy.clock*.73+selected.id*2.17+selected.port*.91))/2,
  expected=Math.max(2.5,1.75+tons/30+3*1.1+variation);
 assert.equal(selected.phase,'loading');assert.equal(selected.dwell,expected);assert.equal(readCount,3,'handling must stop reading the unused fleet tail after three relevant crews');
});

test('a selected freight job reloads midway and delivers owned stock exactly once',()=>{
 const first=load(savedFleet(12,'local')),ship=first.economy.freighters[0];first.step(.02);
 for(let steps=0;!ship.tons&&steps<100;steps++)first.step(.25);assert.ok(ship.tons>0);
 const saved=plain(first.state),restored=load(plain(saved)),loaded=ship.tons,to=ship.to,good=ship.good,before=first.economy.ports[to][good];
 for(let steps=0;!ship.deliveries&&steps<4000;steps++){first.step(.25);restored.step(.25);}
 assert.equal(ship.deliveries,1);assert.equal(restored.economy.freighters[0].deliveries,1);assert.equal(first.economy.ports[to][good],before+loaded);
 // Distant presentation sampling restarts after reload. Its previous-pose
 // timestamp may differ; current analytic poses and every saved transaction,
 // job, equipment item, cargo quantity and owned deadline must still agree.
 const comparable=state=>{const value=plain(state);for(const crew of value.solEconomy.freighters)for(const field of ['previousX','previousY','lifeSampleAt'])delete crew[field];return value;};
 assert.deepEqual(comparable(first.state),comparable(restored.state));
 const currentPose=first.window.nativeSolEconomy.lifeDescriptors(first.state)[0],loadedPose=restored.window.nativeSolEconomy.lifeDescriptors(restored.state)[0];
 for(const field of ['x','y','heading'])assert.equal(currentPose[field],loadedPose[field]);
 const deliveries=ship.deliveries,stock=first.economy.ports[to][good];first.window.nativePause.active=true;first.step(100);
 assert.equal(ship.deliveries,deliveries);assert.equal(first.economy.ports[to][good],stock);
 assert.equal(ship.recentEvents.filter(event=>event.kind==='delivered').length,1);
});
