const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function model(){const window={};vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/rebirth-warp.js','utf8'),{window});return window.vexedRebirthWarp;}

test('an existing controlled traveller completes departure and arrival without being frozen by tactical eligibility',async()=>{
 let f=await tacticalFixture();let {state,window:w}=f,ship=f.ships[0];
 w.nativeNpcLives.interrupt(state,ship,'Existing scripted traveller');
 Object.assign(ship,{scriptedDemo:'mining',phase:'warp',destinationSystem:2,timer:3,warpDuration:3,
   warpVisual:{kind:'departure',elapsedMs:0,angle:Math.PI/2}});
 w.nativeNpcLives.refreshLocation(state,ship);
 state.x=ship.x;state.y=ship.y;
 assert.equal(w.nativeShipDetail.isDetailed(state,ship),false,'Warping ships must remain outside tactical contacts');
 for(let i=0;i<24;i++)f.step();
 assert.ok(ship.warpVisual.elapsedMs>390,'A visible departing ship cannot remain a frozen, untargetable hull');
 const elapsed=ship.warpVisual.elapsedMs;
 w.nativePause.active=true;for(let i=0;i<20;i++)f.step();
 assert.equal(ship.warpVisual.elapsedMs,elapsed,'Pause freezes the travel effect');w.nativePause.active=false;
 f=await tacticalFixture({state:plain(state)});({state,window:w}=f);ship=f.ships[0];
 // Distant travel is a timed transition, not physical steering in a sleeping chunk.
 state.x=-1000000;state.y=-1000000;
 for(let i=0;i<72;i++)f.step();
 assert.equal(ship.warpVisual,undefined,'The departure flash expires even when its observer leaves');
 for(let i=0;i<96;i++)f.step();
 assert.equal(ship.system,2);assert.equal(ship.phase,'arriving');
 for(let i=0;i<43;i++)f.step();
 assert.equal(ship.phase,'docked');assert.equal(ship.warpVisual,undefined);
 assert.equal(ship.destinationSystem,null);assert.equal(ship.legs,1);
 state.system=2;state.x=ship.x+40;state.y=ship.y;
 const target=w.nativeShipSystems.resolve(state,ship.id);
 assert.equal(target?.entity,ship,'The arrival becomes an ordinary physical target again');
 w.nativeCivilianTraffic.select(ship.id);assert.equal(w.nativeCivilianTraffic.target(state),ship);
});

test('observer departures share the player acceleration, disappearance, light and duration at any world position',()=>{
 const warp=model();assert.equal(warp.departureMs,1100);
 for(const angle of [0,.7,Math.PI/2,Math.PI,4.5])for(const elapsed of [0,200,500,638,800,1099,1100]){
  const player=warp.departure(elapsed,angle),observer=warp.worldEffect('departure',elapsed,angle,8765,-4321);
  assert.ok(Math.abs(observer.shipX-(8765+player.shipX-300))<1e-8);assert.ok(Math.abs(observer.shipY-(-4321+player.shipY-225))<1e-8);
  for(const key of ['alpha','squeezeX','speed','nacelleCharge'])assert.equal(observer[key],player[key]);
  if(player.flash){assert.equal(observer.flash.x,observer.shipX);assert.equal(observer.flash.y,observer.shipY);assert.equal(observer.flash.alpha,player.flash.alpha);}
 }
});

test('saved journeys derive a single departure from their original route bearing without replaying it',()=>{
 const warp=model(),j={departedAt:12,galaxyFrom:{x:4000,y:5000},galaxyTo:{x:10000,y:5000},waypoints:[{x:4000,y:5000},{x:4000,y:9000},{x:10000,y:5000}]},before=JSON.stringify(j);
 const effect=warp.journeyDeparture(j,12.8,{x:3500,y:4500});
 assert.equal(effect.alpha,0);assert.ok(Math.abs(effect.angle-Math.PI)<1e-8);assert.ok(effect.flash.y>500);assert.equal(effect.flash.x,500);
 assert.equal(warp.journeyDeparture(j,11),null);assert.equal(warp.journeyDeparture(j,14),null);assert.equal(JSON.stringify(j),before);
});

test('presentation transit queries retain a fast ship flash while ordinary queries keep its true travelling pose',async()=>{
 const {state,window:w}=await tacticalFixture(),l=w.nativeNpcLives,ship=state.civilianTraffic.ships[0],a=w.nativeManualFlight.anchor(1),at=w.nativeSimulation.seconds(state);
 Object.assign(ship,{phase:'warp',system:1,x:0,y:0,journey:{version:1,origin:1,destination:4,departedAt:at,duration:8,arrivalAt:at+8,galaxyFrom:{x:a.x,y:a.y},galaxyTo:{x:a.x+100000,y:a.y},from:{x:0,y:0},to:{x:0,y:0}}});l.refreshLocation(state,ship);w.nativeSimulation.advance(state,.8);
 const e=w.vexedRebirthWarp.journeyDeparture(ship.journey,w.nativeSimulation.seconds(state)),box={minX:e.shipX-2,minY:e.shipY-2,maxX:e.shipX+2,maxY:e.shipY+2},before=JSON.stringify(state);
 assert.equal(l.queryTransits(state,box).includes(ship),false);
 assert.equal(l.queryTransits(state,box,{presentation:true}).includes(ship),true);assert.equal(JSON.stringify(state),before);
 assert.ok(l.galaxyPosition(state,ship).x>a.x+9000);
});

test('NPC flashes survive hidden hulls, follow camera and zoom, and drawing preserves jobs and cargo',async()=>{
 const {state,window:w}=await tacticalFixture(),l=w.nativeNpcLives,ship=state.civilianTraffic.ships[0],a=w.nativeManualFlight.anchor(1),at=w.nativeSimulation.seconds(state),painted=[],flashes=[];
 Object.assign(ship,{phase:'warp',system:1,x:10,y:20,journey:{version:1,origin:1,destination:4,departedAt:at,duration:8,arrivalAt:at+8,galaxyFrom:{x:a.x+10,y:a.y+20},galaxyTo:{x:a.x+100000,y:a.y+20},from:{x:10,y:20},to:{x:0,y:0}}});l.refreshLocation(state,ship);w.nativeSimulation.advance(state,.8);
 w.nativeShipSystems={...w.nativeShipSystems,query:()=>({bystanders:[]})};w.nativeShipEffects={...w.nativeShipEffects,paintShip(_,d,v){painted.push(v);}};w.vexedFlightAssets.drawWarpFlash=(_,f)=>flashes.push(f);
 const e=w.vexedRebirthWarp.journeyDeparture(ship.journey,w.nativeSimulation.seconds(state),a),before=JSON.stringify(state),view={state,ship:{x:30,y:-40},cx:300,cy:225,w:600,h:450,zoom:1.5};
 w.nativeCivilianTraffic.paint({},view);assert.equal(painted.length,0);assert.equal(flashes.length,1);
 assert.equal(flashes[0].x,300+(e.flash.x-30)*1.5);assert.equal(flashes[0].y,225+(e.flash.y+40)*1.5);assert.equal(flashes[0].radius,e.flash.radius*1.5);assert.equal(JSON.stringify(state),before);
 // A completed departure must not reappear in the same launch view, even
 // when a slow analytical route would still pass through a wide viewport.
 w.nativeSimulation.advance(state,.4);w.nativeCivilianTraffic.paint({},{...view,w:20000,h:20000});assert.equal(painted.length,0);
 // Later observers elsewhere on the route still see the existing traveller.
 w.nativeSimulation.advance(state,2);const p=l.galaxyPosition(state,ship);w.nativeCivilianTraffic.paint({},{...view,ship:{x:p.x-a.x,y:p.y-a.y},zoom:1});assert.equal(painted.length,1);
});

test('a legacy warp light remains visible across coordinate frames without rebasing the ship',async()=>{
 const {state,window:w}=await tacticalFixture(),ship=state.civilianTraffic.ships[0],origin=w.nativeManualFlight.anchor(state.system),source=w.nativeManualFlight.anchor(2),flashes=[];
 Object.assign(ship,{system:2,x:origin.x-source.x+40,y:origin.y-source.y+20,phase:'warp',warpVisual:{kind:'departure',elapsedMs:800,angle:Math.PI/2}});delete ship.journey;w.nativeNpcLives.refreshLocation(state,ship);
 w.nativeShipSystems={...w.nativeShipSystems,query:()=>({bystanders:[]})};w.vexedFlightAssets.drawWarpFlash=(_,f)=>flashes.push(f);
 const before=JSON.stringify(state),effect=w.vexedRebirthWarp.worldEffect('departure',800,Math.PI/2,40,20);
 w.nativeCivilianTraffic.paint({},{state,ship:{x:0,y:0},cx:300,cy:225,w:600,h:450,zoom:1});
 assert.equal(flashes.length,1);assert.equal(flashes[0].x,300+effect.flash.x);assert.equal(flashes[0].y,225+effect.flash.y);assert.equal(JSON.stringify(state),before);
});
