const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8');
function fixture(){
 let time=1000,blocked=false,images=0,reads=0;const canvases=[],draws=[],filters=[],procedural=[];
 const context=()=>new Proxy({canvas:{width:800,height:600},getTransform:()=>({a:1,b:0,c:0,d:1}),drawImage(...a){draws.push(a);},arc(){procedural.push('arc');},createRadialGradient(){procedural.push('gradient');return {addColorStop(){}};},createLinearGradient:()=>({addColorStop(){}}),getImageData(){reads++;return {data:new Uint8ClampedArray(24*24*4).fill(255)};}},{get:(t,k)=>k in t?t[k]:()=>{},set(t,k,v){if(k==='filter')filters.push(v);t[k]=v;return true;}});
 const document={createElement(){const c={width:0,height:0,getContext:context};canvases.push(c);return c;}};
 const art={src:'ore.png',complete:true,naturalWidth:2048,naturalHeight:2048};
 const rocks=new Map(),window={nativeSimulation:{now:()=>time,blocked:()=>blocked},nativeCombatShots:{reset(){},weaponVisual(){}},nativeSolAsteroids:{find:(id,system)=>{const r=rocks.get(Number(id));return system===undefined||r?.system===system?r:null;},image:()=>{images++;return art;}}};
 for(const file of ['effect-visibility.js','ore-sprite-cache.js','asteroid-combat.js'])vm.runInNewContext(source(file),{window,document,console});
 const state={system:1,asteroidOreDrops:{},minedAsteroids:[]},ctx=context();
 const rock=(id,x,y,system=1)=>{const r={slotId:id,x,y,system,size:40,oreImage:'ore.png'};rocks.set(id,r);state.minedAsteroids.push(id);state.asteroidOreDrops[id]=15;return r;};
 const paint=(options={})=>window.nativeAsteroidCombat.paint(ctx,{state,ship:{x:0,y:0},cx:400,cy:300,zoom:1,w:800,h:600,...options});
 return {window,state,ctx,rock,paint,art,canvases,draws,filters,procedural,setTime:t=>time=t,setBlocked:b=>blocked=b,metrics:()=>({images,reads})};
}
test('offscreen ore, shields and transports request no artwork, pixels or drawing; paint never changes rewards',()=>{
 const f=fixture(),r=f.rock(1,9000,8000);f.rock(2,0,0,2);f.window.nativeAsteroidCombat.collectField(r,[0,1,2,3]);
 const before=JSON.stringify(f.state);f.paint();assert.equal(JSON.stringify(f.state),before);
 assert.deepEqual(f.metrics(),{images:0,reads:0});assert.equal(f.draws.length,0);assert.equal(f.canvases.length,0);
 assert.equal(f.procedural.length,0,'offscreen shields do not build gradients or draw arcs');
 f.setTime(4000);f.window.nativeAsteroidCombat.advance(f.state,.1);
 f.paint({ship:{x:9000,y:8000}});assert.equal(f.metrics().reads,0,'expired offscreen transports do not reappear when camera returns');
 assert.ok(f.draws.length>0,'uncollected ore remains visible and available');
 assert.equal(f.procedural.filter(k=>k==='gradient').length,1,'only the remaining ore shield is drawn, not an expired collection shield');
});
test('ore halo culling includes viewport edges and projects zoom before deciding visibility',()=>{
 const f=fixture();f.rock(1,-430,0);f.paint();assert.ok(f.draws.length>0,'glow overlapping left edge is retained');
 f.draws.length=0;f.paint({zoom:2});assert.equal(f.draws.length,0,'same world point is outside the zoomed view');
 f.paint({zoom:.5});assert.ok(f.draws.length>0);
});
test('warm ore sprites reuse filtered small rasters; display scale and treatment select distinct entries',()=>{
 const f=fixture(),cache=f.window.nativeOreSpriteCache,args={x:0,y:0,size:9,glow:12};
 assert.ok(cache.draw(f.ctx,f.art,args));const first=cache.snapshot();assert.equal(first.counters.builds,1);
 const count=f.canvases.length;cache.draw(f.ctx,f.art,args);assert.equal(f.canvases.length,count);assert.equal(cache.snapshot().counters.hits,1);
 assert.ok(f.canvases.every(c=>c.width<256&&c.height<256),'large source artwork is downsampled before filtering');
 f.ctx.getTransform=()=>({a:2,b:0,c:0,d:2});cache.draw(f.ctx,f.art,args);cache.draw(f.ctx,f.art,{...args,treated:false});assert.equal(cache.snapshot().counters.builds,3);
});
test('ore sprite cache stays bounded under artwork, zoom and collection-glow churn',()=>{
 const f=fixture(),cache=f.window.nativeOreSpriteCache;
 for(let i=0;i<500;i++)cache.draw(f.ctx,{...f.art,src:i+'.png'},{x:0,y:0,size:10+i%180,glow:i%20,treated:i%2===0});
 const s=cache.snapshot();assert.ok(s.counters.evictions>0);assert.ok(s.entries<=s.limits.entries);assert.ok(s.bytes<=s.limits.bytes);cache.reset();assert.equal(cache.snapshot().bytes,0);
});
