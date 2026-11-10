const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='html-games/broken-mirror-port/';
function fixture(){
 const window={},context=vm.createContext({window,performance,console,document:{hidden:false}});
 const load=file=>vm.runInContext(fs.readFileSync(root+file,'utf8'),context,{filename:file});
 for(const file of ['world-data.js','system-catalog-data.js','system-catalog.js','simulation-clock.js','simulation-frame.js','population-simulation.js'])load(file);
 window.nativeSystemHub={sol:window.nativeSystemCatalog.bodies(1)};
 const movement={maxSpeed:300,acceleration:150,braking:150,turnRate:1.5,vectorFlight:true};
 window.nativeShipDefinitions={registered:()=>[],forEntity:()=>({movement,speedOrOtherStationValue:60,warpSpeedMultiplier:1,antimatterUseOrPopulationEffect:2}),dimensions:()=>({width:30,height:60})};
 for(const file of ['sol-flight.js','manual-flight.js','native-navigation.js','player-combat-controls.js','ship-motion.js','player-cruise.js','travel-events.js'])load(file);
 const state=window.nativeNavigation.initialize({system:1,shipType:7,localBody:3,x:0,y:0,angle:0,speed:0,hull:100,shields:100,day:1,faction:0,antimatter:10000,latinum:1000,nav:100,stocks:{},discovered:[1,2,30,31]});
 window.nativeManualFlight.initializeRegion(state);window.nativeSimulation.ensure(state);window.nativeSimulationFrame.schedule(state);
 let travelled,cruised,cancelled=0;
 window.nativeNavigation.attach({getGame:()=>state,isBusy:()=>false,travel(journey){travelled=journey;return {ok:true};},cruise(id,selection){cruised=selection;return window.nativePlayerCruise.start(state,selection);},cancelCruise(){cancelled++;state.localCruise=null;return {ok:true};}});
 return {w:window,state,movement,get travelled(){return travelled;},get cruised(){return cruised;},get cancelled(){return cancelled;}};
}
test('inside a solar system every visible planet and star uses cruise regardless of its distance or saved body',()=>{
 const f=fixture(),{w,state:s}=f;
 for(const body of w.nativeSystemCatalog.bodies(1).filter(b=>b.kind!=='belt'&&!b.occludedBy)){
  const q=w.nativeNavigation.destination(s,{system:1,body:body.id});assert.equal(q.inSystem,true);assert.equal(q.canWarp,false);assert.equal(q.canCruise,q.distance>q.clearance+5,body.name);
 }
 const far=w.nativeNavigation.call('state',{system:1,body:14}).selected;assert.ok(far.manualDistance>2500);assert.equal(far.canTravel,false);assert.ok(far.canCruise);
 assert.ok(w.nativeNavigation.call('cruise',6).ok,'The existing asteroid belt remains a cruise destination');
});

test('map state publishes galactic units separately from local and scaled chart positions',()=>{
 const {w,state:s}=fixture(),origin=w.nativeManualFlight.anchor(2);
 Object.assign(s,{system:2,localBody:0,x:123.25,y:-234.75});const before=JSON.stringify(s),view=w.nativeNavigation.call('state');
 assert.equal(view.galaxyShipPosition.x,origin.x+s.x);assert.equal(view.galaxyShipPosition.y,origin.y+s.y);
 assert.equal(view.localShipPosition.x,s.x);assert.equal(view.localShipPosition.y,s.y);
 assert.deepEqual(JSON.parse(JSON.stringify(view.shipPosition)),JSON.parse(JSON.stringify(w.nativeManualFlight.chartShipPosition(s))));
 assert.notEqual(view.galaxyShipPosition.x,view.shipPosition.x);assert.equal(JSON.stringify(s),before);
});
test('leaving the saved system permits a return warp to an exact body and distance alone determines time and fuel',()=>{
 const f=fixture(),{w,state:s}=f;Object.assign(s,{x:1e6,y:1e6});w.nativeManualFlight.initializeRegion(s);
 assert.equal(w.nativeManualFlight.currentRegion(s).system,null);
 const choice={system:1,body:7},q=w.nativeNavigation.call('state',choice).selected;
 assert.ok(q.canTravel);assert.equal(q.canCruise,false);assert.ok(w.nativeNavigation.call('course',choice).ok);
 assert.equal(f.travelled.bodyId,7);assert.equal(f.travelled.bodyName,'Jupiter');assert.equal(f.travelled.id,1);
 assert.equal(q.travelDays,Math.floor(q.manualDistance/5000));
 const before=JSON.stringify(s);w.nativeNavigation.call('state',{system:1,body:5});assert.equal(JSON.stringify(s),before,'Inspection is read only');
});
test('the minimum warp distance applies outside a system, with cruise for nearby bodies',()=>{
 const {w,state:s}=fixture(),original=w.nativeManualFlight.currentRegion;
 w.nativeManualFlight.currentRegion=()=>({kind:'interstellar',system:null});
 const target=w.nativeNavigation.destination(s,{system:1,body:5}),anchor=w.nativeManualFlight.anchor(1);
 for(const [distance,warp] of [[2499,false],[2500,true],[5000,true]]){
  s.x=target.point.x-anchor.x-distance;s.y=target.point.y-anchor.y;
  const q=w.nativeNavigation.destination(s,{system:1,body:5});assert.equal(q.canWarp,warp);assert.equal(q.canCruise,!warp);
 }
 w.nativeManualFlight.currentRegion=original;
});
test('Romulus and Remus remain one system while a direct Remus warp retains its historical world key',()=>{
 const f=fixture(),{w,state:s}=f;Object.assign(s,{system:31,x:0,y:0});w.nativeSystemCatalog.initialize(s);w.nativeManualFlight.initializeRegion(s);
 const local=w.nativeNavigation.destination(s,{system:31,body:1});assert.equal(local.system,30);assert.ok(local.canCruise);assert.equal(local.canWarp,false);
 Object.assign(s,{system:1,x:0,y:0,localBody:3});w.nativeSystemCatalog.initialize(s);w.nativeManualFlight.initializeRegion(s);
 assert.ok(w.nativeNavigation.call('course',{system:31,body:1}).ok);assert.equal(f.travelled.id,30);assert.equal(f.travelled.bodyId,1);
 const report=w.vexedTravelEvents.plan(s,f.travelled,()=>.99).report;assert.equal(report.systemId,30);assert.equal(report.destinationBodyId,1);assert.equal(report.destinationName,'Remus');
});
test('manual steering overrides one movement command and autopilot resumes from the detour without changing its destination',()=>{
 const {w,state:s,movement}=fixture(),controls=w.nativePlayerCombatControls.flightControls();
 assert.ok(w.nativePlayerCruise.start(s,{system:1,body:5}).ok);const route=s.localCruise;
 const tick=held=>{const intent=w.nativePlayerCruise.command(s,held,controls,1/60);w.nativeShipMotion.step(s,intent.command,movement,1/60);return intent;};
 for(let n=0;n<180;n++)tick(()=>false);const oldStop={x:route.stopX,y:route.stopY},before=s.angle;
 for(let n=0;n<90;n++){const intent=tick(code=>code==='KeyA'||code==='KeyW');assert.equal(intent.manual,true);assert.equal(intent.command.goal,undefined);assert.equal(s.localCruise,route);}
 assert.ok(Math.abs(w.nativeShipMotion.wrap(s.angle-before))>.2);assert.equal(w.nativePlayerCruise.snapshot(s).manual,true);
 const resumed=tick(()=>false);assert.equal(resumed.manual,false);assert.ok(resumed.command.goal);assert.equal(s.localCruise.to,5);assert.ok(Math.hypot(oldStop.x-route.stopX,oldStop.y-route.stopY)>1);
 let arrived=false;for(let n=0;n<10000&&!arrived;n++){const intent=w.nativePlayerCruise.command(s,()=>false,controls,1/60);arrived=w.nativeShipMotion.step(s,intent.command,movement,1/60).arrived;}
 assert.ok(arrived,'The same autopilot reaches its destination after the detour');
});
test('a quick turnaround completes before automatic steering resumes, and reload never restores held input',()=>{
 const {w,state:s,movement}=fixture(),controls=w.nativePlayerCombatControls.flightControls();w.nativePlayerCruise.start(s,{system:1,body:5});
 let intent=w.nativePlayerCruise.command(s,code=>code==='KeyQ',controls,1/60);assert.equal(intent.manual,true);
 for(let n=0;n<400&&controls.maneuvering;n++){w.nativeShipMotion.step(s,intent.command,movement,1/60);intent=w.nativePlayerCruise.command(s,()=>false,controls,1/60);}
 assert.equal(controls.maneuvering,false);assert.equal(w.nativePlayerCruise.command(s,()=>false,controls,1/60).manual,false);
 const restored=JSON.parse(JSON.stringify(s));assert.equal(restored.localCruise.to,5);assert.equal(w.nativePlayerCruise.snapshot(restored).manual,false);
 assert.ok(w.nativePlayerCruise.command(restored,()=>false,w.nativePlayerCombatControls.flightControls(),1/60).command.goal);
});
test('retargeting and cancellation use the navigation owner while legacy courses and cross-frame targets survive restore',()=>{
 const f=fixture(),{w,state:s}=f;assert.ok(w.nativeNavigation.call('cruise',5).ok);assert.ok(w.nativeNavigation.call('cruise',{system:1,body:0}).ok);assert.equal(s.localCruise.to,0);
 assert.ok(w.nativeNavigation.call('cancel-cruise').ok);assert.equal(f.cancelled,1);assert.equal(s.localCruise,null);
 s.localCruise={from:3,to:5,stopX:4500,stopY:1500};assert.ok(w.nativePlayerCruise.command(s,()=>false,w.nativePlayerCombatControls.flightControls(),1/60).command.goal);
 s.localCruise={system:31,to:1};s.system=30;w.nativeSystemCatalog.initialize(s);assert.ok(s.localCruise);assert.equal(s.localCruise.to,1);
});
test('a course keeps its physical endpoint through the authoritative system rebase',()=>{
 const {w,state:s}=fixture(),body=w.nativeSystemCatalog.bodies(4).find(b=>b.kind==='star'),anchor=w.nativeManualFlight.anchor(4);
 const point=w.vexedSolFlight.bodyPosition(body);Object.assign(s,{x:anchor.x+point.x-700,y:anchor.y+point.y-700});
 w.nativeManualFlight.initializeRegion(s);assert.equal(w.nativeManualFlight.currentRegion(s).system,4);
 assert.ok(w.nativePlayerCruise.start(s,{system:4,body:body.id}).ok);const route=s.localCruise,controls=w.nativePlayerCombatControls.flightControls();
 assert.deepEqual(JSON.parse(JSON.stringify(w.nativeNavigation.call('state').cruiseTarget)),{system:4,body:body.id});
 const before=w.nativePlayerCruise.command(s,()=>false,controls,1/60).command.goal,from=w.nativeManualFlight.anchor(s.system);
 const global={x:from.x+before.x,y:from.y+before.y},position=w.nativeManualFlight.position(s);
 assert.ok(w.nativeManualFlight.advanceRegion(s).entered);assert.equal(s.system,4);assert.equal(s.localCruise,route);
 const after=w.nativePlayerCruise.command(s,()=>false,controls,1/60).command.goal;
 assert.ok(Math.hypot(global.x-(anchor.x+after.x),global.y-(anchor.y+after.y))<1e-7);
 assert.deepEqual(JSON.parse(JSON.stringify(w.nativeManualFlight.position(s))),JSON.parse(JSON.stringify(position)));
});
