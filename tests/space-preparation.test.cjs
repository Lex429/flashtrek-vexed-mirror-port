const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const canvases=[];
 const context=()=>new Proxy({},{get(target,key){if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});return target[key]||(()=>{});},set(target,key,value){target[key]=value;return true;}});
 const window={},document={createElement(){const canvas={width:0,height:0,getContext:context};canvases.push(canvas);return canvas;}};
 const scope=vm.createContext({window,document,requestAnimationFrame:callback=>setImmediate(()=>callback(performance.now()))});
 for(const file of ['flight-reference-data.js','vexed-space-model.js','vexed-space.js'])vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),scope);
 return {space:window.vexedSpace,canvases,ctx:context()};
}
const view={w:600,h:450,playerX:0,playerY:0,cameraX:0,cameraY:0};
test('preparing a destination sky preserves the displayed system and adopts its exact seeded textures on entry',async()=>{
 const {space,canvases,ctx}=fixture(),origin=JSON.stringify(space.state),ready=await space.prepareSystem(9);
 assert.equal(space.state.system,1);assert.equal(JSON.stringify(space.state),origin);
 assert.equal(ready.system,9);assert.ok(ready.textures>16);
 const allocated=canvases.length;space.enterSystem(9,true);space.render(ctx,view);
 assert.equal(canvases.length,allocated,'The first actual destination draw rebuilt prepared star textures');
 const cold=space.create(9);assert.equal(JSON.stringify(space.state),JSON.stringify(cold.state));
 const after=JSON.stringify(space.state);space.enterSystem(9);assert.equal(JSON.stringify(space.state),after);
});
test('aborted and superseded preparations never activate a sky or replace a newer destination',async()=>{
 const {space,canvases,ctx}=fixture(),controller=new AbortController();
 const cancelled=space.prepareSystem(4,{signal:controller.signal});controller.abort();await assert.rejects(cancelled,/cancelled/);
 assert.equal(space.state.system,1);
 const old=space.prepareSystem(4),latest=space.prepareSystem(5);
 const [first,last]=await Promise.allSettled([old,latest]);assert.equal(first.status,'rejected');assert.equal(last.status,'fulfilled');
 assert.equal(space.state.system,1);const allocated=canvases.length;space.enterSystem(5,true);space.render(ctx,view);
 assert.equal(canvases.length,allocated);assert.equal(space.state.system,5);
 const next=new AbortController();await space.prepareSystem(9,{signal:next.signal});next.abort();
 space.enterSystem(9,true);space.render(ctx,view);assert.ok(canvases.length>allocated,'An aborted prepared scene was adopted');
});
