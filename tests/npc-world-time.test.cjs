const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const port=path.join(__dirname,'../html-games/broken-mirror-port');
const load=(context,files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(port,file),'utf8'),context,{filename:file}));
const plain=value=>JSON.parse(JSON.stringify(value));

function freight(saved){
  let artwork=0;
  const document={hidden:false},window={nativePause:{active:false},nativeShipInventory:{active:false},
    vexedSolFlight:{shipPosition:state=>({x:state.x,y:state.y})},vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:30,height:60})},
    nativeCombatShots:{contact:(target,from)=>({local:{x:0,y:0},world:{x:target.x,y:target.y},from})},
    nativeShipEffects:{prepare(){artwork++;},hit(){}}};
  const context=vm.createContext({window,document,console});
  load(context,['world-data.js','simulation-clock.js','ship-motion.js','ship-definitions.js','ship-damage.js','faction-standing.js','sol-economy.js']);
  const state=saved||{system:1,x:0,y:0,localPrestige:{}};
  window.nativeSimulation.ensure(state);const economy=window.nativeSolEconomy.initialize(state);
  if(!saved){
    economy.freighters=[economy.freighters[0]];economy.clock=-1e8;
    Object.assign(economy.freighters[0],{phase:'loading',port:3,from:3,to:5,x:0,y:0,tons:0,good:5,assignment:{from:3,to:5,good:5,tons:10},handlingTons:10,dwell:1,lifeEventAt:null,lifeLeg:null});
  }
  const step=dt=>{window.nativeSimulation.advance(state,dt);window.nativeSolEconomy.advance(state,dt);};
  return {window,document,context,state,economy,ship:economy.freighters[0],step,artwork:()=>artwork};
}

test('existing Sol tug identity, loaded stock and scheduled route survive JSON restoration',()=>{
  const a=freight();a.step(2);assert.equal(a.ship.tons,10);assert.equal(a.economy.ports[3][5],170);
  a.step(12);const saved=plain(a.state),b=freight(saved);
  assert.equal(b.ship.identity,a.ship.identity);assert.deepEqual(plain(b.ship.task),plain(a.ship.task));
  for(let i=0;i<1000&&!a.ship.deliveries;i++){a.step(.1);b.step(.1);}
  assert.ok(a.ship.deliveries>=1);assert.equal(b.ship.deliveries,a.ship.deliveries);
  assert.deepEqual(plain(a.economy.ports),plain(b.economy.ports));
  assert.ok(a.ship.recentEvents.some(event=>event.kind==='delivered'));
});

test('Sol detail promotion preserves the route, pose, task and economic outcome',()=>{
  const a=freight(),b=freight(plain(a.state));b.state.system=14;
  for(let i=0;i<500;i++){a.step(.2);b.step(.2);if(i===40||i===120)b.state.system=b.state.system===1?14:1;}
  assert.deepEqual(plain(a.economy.ports),plain(b.economy.ports));
  assert.equal(a.ship.identity,b.ship.identity);assert.equal(a.ship.deliveries,b.ship.deliveries);
  const left=a.window.nativeSolEconomy.lifeDescriptors(a.state)[0],right=b.window.nativeSolEconomy.lifeDescriptors(b.state)[0];
  assert.ok(Math.hypot(left.x-right.x,left.y-right.y)<1e-7);
  assert.deepEqual(plain(left.task),plain(right.task));
});

test('distant Sol freight needs no artwork and huge advances retain bounded event debt',()=>{
  const {state,economy,step,artwork}=freight();state.system=14;step(1e7);
  assert.equal(artwork(),0);assert.ok(economy.lifeMetrics.scheduledEvents<=96);
  assert.ok(economy.lifeMetrics.deferred>0);assert.ok(Number.isFinite(economy.freighters[0].x));
  assert.ok(economy.freighters[0].recentEvents.length<=16);
});

test('disabling loaded freight strands its stock without awarding a delivery',()=>{
  const {window,state,economy,ship,step}=freight();step(2);
  const atDestination=economy.ports[5][5];
  const result=window.nativeSolEconomy.hit(state,ship.id,ship.shields+ship.hull*.85,{source:'ai'});
  assert.equal(result.disabled,true);assert.equal(ship.phase,'disabled');assert.equal(ship.tons,10);
  step(200);assert.equal(economy.ports[5][5],atDestination);assert.equal(ship.task.status,'failed');
});

test('calendar travel advances NPC jobs and population with one shared seconds-per-day model',()=>{
  const calls=[],document={hidden:false},window={nativePause:{active:false},nativeShipInventory:{active:false},
    nativePopulation:{advanceDays:(state,days)=>calls.push(['population',days])},nativeSolEconomy:{advance:(state,dt)=>calls.push(['freight',dt])},
    nativeCivilianTraffic:{advance:(state,dt)=>calls.push(['civilian',dt])}};
  load(vm.createContext({window,document}),['simulation-clock.js','world-time.js']);
  const state={day:5};window.nativeSimulation.ensure(state);
  assert.equal(window.nativeWorldTime.advanceDays(state,3),360);assert.equal(state.day,8);assert.equal(window.nativeSimulation.seconds(state),360);
  assert.deepEqual(calls,[['population',3],['freight',360],['civilian',360]]);
  window.nativePause.active=true;assert.equal(window.nativeWorldTime.advanceDays(state,100),0);assert.equal(state.day,8);assert.equal(calls.length,3);
});

test('bulk population time handles a large interval without a per-tick catch-up loop',()=>{
  const window={};load(vm.createContext({window}),['population-simulation.js']);
  const state={day:1,populationClock:0,populationDayFraction:0,planetPopulationCounts:{1:100000},solPopulations:{}};
  window.nativePopulation.advanceSeconds(state,120000,()=>.5);
  assert.equal(state.day,1001);assert.equal(state.populationClock,0);assert.equal(state.populationDayFraction,0);
  assert.ok(Number.isSafeInteger(state.planetPopulationCounts[1]));
});

test('planning a player warp advances the copied freight world once and leaves the departure save intact',()=>{
  const {window,context,state,step}=freight();step(2);
  window.nativePopulation={advanceDays(value,days){value.populationAdvanced=(value.populationAdvanced||0)+days;}};
  load(context,['world-time.js','travel-events.js']);
  Object.assign(state,{devMode:true,day:1,shipType:7,discovered:[1],antimatter:100,nav:0,hull:100,shields:100,latinum:500,deuranium:50,planetGovts:{2:1},localPrestige:{2:100}});
  const before=plain(state),prepared=window.vexedTravelEvents.plan(state,{id:2,travelDays:1,fuel:10},()=>.9);
  assert.deepEqual(plain(state),before);
  assert.equal(prepared.next.day,2);assert.equal(prepared.next.populationAdvanced,1);
  assert.equal(window.nativeSimulation.seconds(prepared.next),122);
  assert.equal(prepared.next.solEconomy.lifeClock,122);
  assert.ok(prepared.next.solEconomy.freighters[0].deliveries>=1,'Distant freight continued during the player calendar skip');
  assert.equal(prepared.report.elapsedDays,1);assert.equal(prepared.report.originId,1);assert.equal(prepared.report.systemId,2);
});

test('registered player inspection projects the real wallet, owned freight and contract cargo',()=>{
  const {window,context,state}=freight();
  load(context,['ship-systems.js']);
  Object.assign(state,{shipType:7,hull:100,shields:100,latinum:5432,shipName:'Test Captain',government:'Player Government',solFreightHold:{0:12,5:4},localContracts:[{id:8,good:2,tons:6,to:5}]});
  const before=JSON.stringify(state),player=window.nativeShipSystems.inspectAll(state).find(ship=>ship.id==='player');
  assert.equal(player.credits,5432);assert.equal(player.faction,'Player Government');assert.equal(player.cargo.reduce((sum,lot)=>sum+lot.tons,0),22);
  assert.equal(player.cargo[2].contractId,8);assert.equal(JSON.stringify(state),before);
});
