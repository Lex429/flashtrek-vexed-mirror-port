const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'html-games/flashtrek-broken-mirror/showcase-assets/asteroids.json'),'utf8'));

async function scenario({ready=true,visible=true,chips=false}={}){
 const f=await fixture({regional:true,access:true,economic:false,full:false}),w=f.window,s=f.state;
 let loaded=ready,requests=0,allocations=0,draws=0,randomCalls=0,seed=17317;const images=[],traces=[];
 const context=()=>new Proxy({canvas:{width:800,height:600},drawImage(){draws++;},createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
 f.context.document.createElement=()=>{allocations++;return {width:0,height:0,getContext:context};};
 f.context.Image=class {constructor(){images.push(this);}set src(value){requests++;this.source=value;const art=catalog.find(a=>value.endsWith(a.file));this.width=art?.width||512;this.height=art?.height||512;this.complete=loaded;this.naturalWidth=loaded?this.width:0;this.naturalHeight=loaded?this.height:0;}get src(){return this.source;}};
 for(const file of ['html-games/broken-mirror-port/effect-visibility.js','html-games/flashtrek-broken-mirror/debris-impacts.js','html-games/broken-mirror-port/explosion-impacts.js','html-games/broken-mirror-port/asteroid-motion.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context,{filename:file});
 Object.assign(s,{system:43,x:1e6,y:1e6,vx:0,vy:0,speed:0});s.civilianTraffic.ships=[];s.solEconomy.freighters=[];
 const rocks=w.nativeSolAsteroids.forSystem(43),rock=rocks[0],retained=rocks.slice(0,9);
 Object.assign(rock,{x:0,y:0,size:40,maxHull:100,guaranteedOre:true});
 for(let i=1;i<retained.length;i++){const angle=(i-1)*Math.PI/4;Object.assign(retained[i],{x:Math.cos(angle)*34,y:Math.sin(angle)*34,size:40,maxHull:100});}
 s.minedAsteroids=rocks.slice(9).map(r=>r.slotId);s.destroyedAsteroids=[];s.asteroidDamage={};s.asteroidOreDrops={};
 w.nativeSolAsteroids.invalidateIndex();w.nativeShipSystems.invalidate(s);
 const impacts=w.nativeEnvironmentalImpacts;
 w.nativeEnvironmentalImpacts={...impacts,debris(state,piece,x,y,options){impacts.debris(state,piece,x,y,options);traces.push({x:piece.x,y:piece.y,vx:piece.vx,vy:piece.vy,size:piece.size,spin:piece.spin});}};
 f.context.__physicalRandom=()=>{randomCalls++;seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};vm.runInContext('Math.random=__physicalRandom',f.context);
 if(ready)w.nativeSolAsteroids.image(rock.file);
 const before={requests,allocations,randomCalls};
 if(chips)w.nativeAsteroidCombat.hit(s,rock.slotId,25);else w.nativeAsteroidCombat.destroy(s,rock);
 const emitted={...w.nativeAsteroidCombat.metrics(),requests:requests-before.requests,allocations:allocations-before.allocations,randomCalls};
 const ctx=context(),paint=()=>w.nativeAsteroidCombat.paint(ctx,{state:s,ship:visible?{x:0,y:0}:{x:90000,y:90000},cx:400,cy:300,zoom:1,w:800,h:600});
 const paintAtEvent=()=>{const state=JSON.stringify(s),rng=randomCalls,contacts=traces.length;paint();paint();assert.equal(JSON.stringify(s),state,'painting cannot settle cargo, damage or destruction');assert.equal(randomCalls,rng,'painting never consumes physical randomness');assert.equal(traces.length,contacts,'painting never dispatches contacts');};
 paintAtEvent();
 const progress=[];
 for(let i=0;i<120;i++){
  if(i===60){loaded=true;for(const art of images){art.complete=true;art.naturalWidth=art.width;art.naturalHeight=art.height;}}
  w.nativeSimulation.advance(s,1/60);impacts.advance(s,1/60);w.nativeAsteroidCombat.advance(s,1/60);
  paintAtEvent();progress.push(copy({damage:s.asteroidDamage,destroyed:s.destroyedAsteroids,ore:s.asteroidOreDrops}));
 }
 return {emitted,requests,allocations,draws,randomCalls,traces,progress,damage:copy(s.asteroidDamage),ore:copy(s.asteroidOreDrops),ids:retained.map(r=>r.slotId)};
}

test('cold, warm and offscreen asteroid explosions have identical real trajectories, rebound damage, material and RNG schedules',async()=>{
 const warm=await scenario(),cold=await scenario({ready:false}),offscreen=await scenario({ready:false,visible:false});
 for(const result of [warm,cold,offscreen]){
  assert.equal(result.emitted.pieces,22);assert.equal(result.emitted.requests,0,'physical emission does not request artwork');assert.equal(result.emitted.allocations,0,'physical emission does not allocate texture canvases');
  assert.ok(result.traces.length>0);assert.ok(result.ids.slice(1).some(id=>result.damage[id]>0),'real environmental fragments damage an intervening asteroid');
  assert.deepEqual(result.traces,warm.traces);assert.deepEqual(result.progress,warm.progress);assert.equal(result.randomCalls,warm.randomCalls);assert.equal(result.ore[result.ids[0]],1,'one funded material entitlement remains exactly once');
 }
 assert.ok(warm.draws>0);assert.ok(cold.draws>0,'a cold physical fragment gains its original-art texture after loading');assert.equal(offscreen.requests,0);assert.equal(offscreen.allocations,0);assert.equal(offscreen.draws,0);
});

test('damage chips keep the same physical effect before artwork loads and never grant ore',async()=>{
 const warm=await scenario({chips:true}),cold=await scenario({chips:true,ready:false}),offscreen=await scenario({chips:true,ready:false,visible:false});
 for(const result of [warm,cold,offscreen]){assert.equal(result.emitted.pieces,3);assert.equal(result.emitted.requests,0);assert.equal(result.emitted.allocations,0);assert.deepEqual(result.traces,warm.traces);assert.deepEqual(result.progress,warm.progress);assert.equal(result.randomCalls,warm.randomCalls);assert.deepEqual(result.ore,{});}
 assert.equal(offscreen.requests,0);assert.equal(offscreen.allocations,0);
});

test('legacy Sol, extension and regional placements retain exact catalogue source dimensions without loading images',async()=>{
 const {window:w}=await fixture({regional:true,access:true,economic:false,full:false});
 for(const system of [1,43])for(const rock of w.nativeSolAsteroids.forSystem(system)){
  const entry=catalog.find(a=>a.id===rock.id);assert.ok(entry);assert.equal(rock.width,entry.width);assert.equal(rock.height,entry.height);assert.deepEqual(copy(w.nativeSolAsteroids.artworkDimensions(rock)),{width:entry.width,height:entry.height});
 }
 assert.equal(w.nativeSolAsteroids.metrics().images,0);
});
