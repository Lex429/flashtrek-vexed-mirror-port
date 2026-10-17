const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
function motion(){const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-motion.js'),'utf8'),{window});return window.nativeShipMotion;}
const plain=value=>JSON.parse(JSON.stringify(value)),finite=ship=>['x','y','heading','speed','vx','vy'].every(key=>Number.isFinite(ship[key]));

test('identical and tiny scheduled movement safely completes across every movement profile and JSON reload',()=>{
 const m=motion();for(const profile of [m.profiles.tug(),m.profiles.civilian({speedOrOtherStationValue:40})])for(const delta of [0,1e-12,1e-7,1e-5]){
  const original={x:10,y:20,heading:.7,speed:45},leg=m.planLeg(original,{x:10+delta,y:20},profile,12);
  assert.equal(leg.valid,true);assert.ok(Number.isFinite(leg.duration)&&leg.duration>=0);
  const ship=plain(original),saved=plain(leg);assert.equal(m.sampleLeg(ship,saved,12+saved.duration+1).arrived,true);assert.ok(finite(ship));assert.equal(ship.x,10+delta);assert.equal(ship.speed,0);
  for(let i=0;i<10;i++)assert.equal(m.sampleLeg(ship,saved,100+i).arrived,true);assert.ok(finite(ship));
 }
});

test('legacy zero-distance NaN legs restore safely; malformed coordinates and movement commands are rejected without mutation',()=>{
 const m=motion(),ship={x:10,y:20,heading:.7,speed:0},legacy={version:1,start:{x:10,y:20},goal:{x:10,y:20},startedAt:4,distance:0,duration:NaN,heading:.7};
 assert.equal(m.sampleLeg(ship,plain(legacy),4).arrived,true);assert.ok(finite(ship));
 for(const goal of [{x:NaN,y:0},{x:0,y:Infinity},{x:Number.MAX_VALUE,y:Number.MAX_VALUE}]){
  const entity={x:-Number.MAX_VALUE,y:0,heading:0,speed:0},before={...entity};
  const leg=m.planLeg(entity,goal,{},0);assert.equal(leg.valid,false);assert.equal(m.sampleLeg(entity,leg,1).invalid,true);assert.deepEqual(entity,before);
 }
 const before={...ship};assert.equal(m.sampleLeg(ship,{...legacy,goal:{x:12,y:20}},5).invalid,true);assert.deepEqual(ship,before);
 assert.equal(m.planLeg(ship,{x:0,y:0},{},Infinity).valid,false);
 const positive=m.planLeg(ship,{x:100,y:20},{},0);positive.startedAt=null;assert.equal(m.sampleLeg(ship,positive,100).invalid,true);assert.deepEqual(ship,before);
});

test('tug scheduled routes skip repeated waypoints in bounded batches and unload once after reload at arrival',async()=>{
 const f=await fixture({full:false,economic:false}),{state,window:w}=f,tug=state.solEconomy.freighters[0];state.solEconomy.freighters=[tug];
 Object.assign(tug,{phase:'travel',to:3,port:3,x:50,y:60,heading:.7,speed:0,tons:4,good:5,routeIndex:0,path:Array.from({length:200},()=>({x:50,y:60})),lifeLeg:null,lifeEventAt:null});
 const before=state.solEconomy.ports[3][5],deliveries=tug.deliveries||0;
 w.nativeSimulationFrame.begin(state);w.nativeSolEconomy.advance(state,1/60);const metrics=w.nativeSimulationFrame.snapshot(state);w.nativeSimulationFrame.end(state);
 assert.ok((metrics.counters.solEvents||0)<=96);assert.ok(Number.isFinite(tug.lifeEventAt));assert.ok(finite(tug));
 const restored=await fixture({saved:plain(state),full:false,economic:false}),copy=restored.state.solEconomy.freighters[0];
 for(let i=0;i<1200&&(copy.deliveries||0)===deliveries;i++){restored.window.nativeSimulation.advance(restored.state,1/60);restored.window.nativeSolEconomy.advance(restored.state,1/60);}
 assert.equal(copy.deliveries,deliveries+1);assert.equal(restored.state.solEconomy.ports[3][5],before+4);assert.ok(finite(copy));
});

test('invalid tug scheduled movement retains cargo and retries a valid route instead of unloading',async()=>{
 const f=await fixture({full:false,economic:false}),tug=f.state.solEconomy.freighters[0];f.state.solEconomy.freighters=[tug];
 Object.assign(tug,{phase:'travel',to:3,tons:6,good:5,path:[{x:NaN,y:0}],routeIndex:0,lifeLeg:null,lifeEventAt:null});
 const stock=f.state.solEconomy.ports[3][5];f.window.nativeSolEconomy.advance(f.state,1/60);
 assert.equal(tug.phase,'waiting-route');assert.equal(tug.tons,6);assert.equal(f.state.solEconomy.ports[3][5],stock);assert.ok(tug.lifeEventAt>=30);assert.match(tug.task.failureReason,/cargo remains/);
});
