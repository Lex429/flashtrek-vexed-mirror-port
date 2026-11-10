const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('html-games/broken-mirror-port/system-streaming.js','utf8');

function setup(tick=0,{abort}={}){
 let clock=0,frames=0,tasks=0;const prepared={repairs:0,lives:0},state={system:9,seconds:123.125,debt:.0275,cargo:3.75};
 const window={
  nativeSolEconomy:{initialize(){}},
  nativeShipRepairs:{*prepare(){for(let i=0;i<6000;i++){prepared.repairs++;yield;}}},
  nativeNpcLives:{*prepare(){for(let i=0;i<6000;i++){prepared.lives++;yield;}}},
  vexedSpace:{async prepareSystem(){}},vexedSolFlight:{shipPosition:()=>({x:0,y:0})},vexedRebirthWarp:{arrival:()=>({cameraX:0,cameraY:0})},
  nativeSystemCatalog:{bodies:()=>[]},nativeSolAsteroids:{queryBounds:()=>[]},nativeShipSystems:{query:()=>({bystanders:[]})}
 };
 vm.runInNewContext(source,{window,performance:{now:()=>clock+=tick},requestAnimationFrame(fn){frames++;queueMicrotask(fn);},setTimeout(fn){tasks++;abort?.();queueMicrotask(fn);}});
 return {state,prepared,api:window.nativeSystemStreaming,counts:()=>({frames,tasks})};
}

test('arrival restores the complete fleet without one display-frame delay per small record batch',async()=>{
 const f=setup(),before=JSON.stringify(f.state),result=await f.api.prepareArrival(f.state);
 assert.deepEqual(f.prepared,{repairs:6000,lives:6000});assert.equal(result.system,9);assert.equal(result.objects,0);assert.equal(JSON.stringify(f.state),before);
 assert.ok(f.counts().frames<10,'Owner records introduced an artificial frame-count floor');assert.equal(f.counts().tasks,0);
});

test('expensive arrival restoration yields bounded tasks and cancellation retains the live clock and cargo',async()=>{
 const f=setup(.25),before=JSON.stringify(f.state);await f.api.prepareArrival(f.state);
 assert.ok(f.counts().tasks>100);assert.ok(f.counts().frames<10);assert.deepEqual(f.prepared,{repairs:6000,lives:6000});assert.equal(JSON.stringify(f.state),before);
 const controller=new AbortController(),cancelled=setup(.25,{abort:()=>controller.abort()});
 await assert.rejects(cancelled.api.prepareArrival(cancelled.state,{signal:controller.signal}),/cancelled/);
 assert.ok(cancelled.prepared.repairs<6000);assert.equal(cancelled.prepared.lives,0);assert.equal(JSON.stringify(cancelled.state),before);
});
