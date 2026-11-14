const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function interactive(f){
 let tick=0;f.context.performance={now:()=>++tick*.6};f.lives.interactive(f.state);
 const m=f.window.nativeShipMotion;
 f.window.nativeShipMotion={...m,navigationObstacles(state,system,from,goal){return [{x:(from.x+goal.x)/2,y:(from.y+goal.y)/2,radius:40},...Array.from({length:80},(_,i)=>({x:30000+i*100,y:30000,radius:20}))];}};
}
function step(f){const frame=f.window.nativeSimulationFrame;frame.begin(f.state);f.window.nativeSimulation.advance(f.state,1/60);frame.step(f.state);f.lives.advance(f.state,1/60);frame.end(f.state);}

test('interactive blocked delivery searches yield, survive Continue and retain the original funded contract',async()=>{
 let f=await fixture({full:false,economic:false});interactive(f);Object.assign(f.ship,{x:-1000,y:-1000});
 f.window.nativeSimulationFrame.begin(f.state);
 const result=f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});f.window.nativeSimulationFrame.end(f.state);
 assert.equal(result.ok,true);assert.ok(f.ship.navigationRequest);const task=f.ship.task.id,reservation=plain(f.lives.initialize(f.state).reservations[task]),pose={x:f.ship.x,y:f.ship.y};
 step(f);assert.ok(f.ship.navigationRequest,'Search exhausted in its first bounded action');assert.deepEqual({x:f.ship.x,y:f.ship.y},pose);
 f=await fixture({saved:plain(f.state),economic:false});interactive(f);
 assert.equal(f.ship.task.id,task);assert.deepEqual(plain(f.lives.initialize(f.state).reservations[task]),reservation);
 for(let i=0;i<2000&&f.ship.navigationRequest;i++)step(f);
 assert.equal(f.ship.navigationRequest,undefined);assert.ok(f.ship.localLeg?.valid!==false&&f.ship.localLeg);assert.equal(f.ship.task.id,task);assert.deepEqual({x:f.ship.x,y:f.ship.y},pose);
 f.lives.interrupt(f.state,f.ship,'cancel test');assert.equal(f.ship.navigationRequest,undefined);assert.equal(f.lives.initialize(f.state).reservations[task],undefined);
});

test('a saved parking search completes even when its commercial job is already complete',async()=>{
 let f=await fixture({full:false,economic:false});const e=f.ship,o=f.window.nativeManualFlight.anchor(e.system);
 Object.assign(e,{x:-1000,y:-1000,nextActionAt:0,phase:'holding',dockingMove:{resumeAt:50},task:{id:'completed-job',kind:'freight',phase:'completed',status:'completed'},navigationRequest:{version:1,taskId:'completed-job',phase:'parking',retainOnFailure:false,goal:{x:o.x+500,y:o.y+500},requestedAt:0}});
 f=await fixture({saved:plain(f.state),economic:false});interactive(f);
 for(let i=0;i<2000&&f.ship.navigationRequest;i++)step(f);
 assert.equal(f.ship.navigationRequest,undefined);assert.ok(f.ship.localLeg);assert.equal(f.ship.task.status,'completed');assert.equal(f.ship.task.phase,'completed');
});

test('rebuilding ship membership retains the live route-search budget and the funded delivery',async()=>{
 const f=await fixture({full:false,economic:false});interactive(f);Object.assign(f.ship,{x:-1000,y:-1000});
 // System entry and explicit geometry invalidation rebuild the same live index.
 f.window.nativeShipSystems.invalidate(f.state);
 f.window.nativeSimulationFrame.begin(f.state);
 const result=f.lives.startDelivery(f.state,f.ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});
 f.window.nativeSimulationFrame.end(f.state);
 assert.equal(result.ok,true);assert.ok(f.ship.navigationRequest,'A cache rebuild disabled cooperative routing and ran the whole search at once');
 const task=f.ship.task.id,reservation=plain(f.lives.initialize(f.state).reservations[task]);
 step(f);assert.ok(f.ship.navigationRequest,'The live search no longer yields after rebuilding membership');
 assert.equal(f.ship.task.id,task);assert.deepEqual(plain(f.lives.initialize(f.state).reservations[task]),reservation);
});

test('offline calendar scheduling retains the count budget regardless of measured CPU cost',async()=>{
 let f=await fixture({full:false,economic:false});const saved=plain(f.state),template=saved.civilianTraffic.ships[0];
 saved.system=47;saved.x=saved.y=1e6;saved.civilianTraffic.ships=Array.from({length:8},(_,i)=>({...plain(template),id:90+i,nextActionAt:0,task:null,phase:'docked'}));
 f=await fixture({saved,economic:false});let tick=0;f.context.performance={now:()=>++tick*1000};
 f.window.nativeSimulation.advance(f.state,1/60);f.lives.advance(f.state,1/60);
 assert.ok(f.lives.metrics(f.state).scheduledEvents>=8,'Wall-clock cost throttled offline calendar work');
});
