const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(policy=true){
 const window={},context=vm.createContext({window,console,performance,fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('html-games/flashtrek-broken-mirror/showcase-assets/asteroids.json','utf8'))})});
 const load=f=>vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+f,'utf8'),context,{filename:f});
 for(const f of ['world-data.js','system-catalog-data.js',...(policy?['badlands-region.js']:[]),'system-catalog.js','manual-flight.js','regional-minerals.js','travel-corridors.js','regional-starfield.js','stellar-background.js','nebula-gas.js','procedural-nebulae.js'])load(f);
 window.nativeSystemHub={sol:window.nativeSystemCatalog.bodies(1)};load('sol-asteroids.js');load('sol-flight.js');return {window,load};
}
const plain=o=>JSON.parse(JSON.stringify(o));
test('Badlands is a large region with no rendered object, sun, port or invented replacement body',()=>{
 const {window:w}=fixture(),b=w.nativeSystemCatalog.boundary(73);
 assert.deepEqual(plain(b),{x:0,y:0,rx:64000,ry:48000});
 const bodies=w.nativeSystemCatalog.bodies(73);assert.equal(bodies.length,1);assert.equal(bodies[0].id,0);assert.equal(bodies[0].render,false);assert.equal(bodies[0].port,false);
 assert.equal(w.vexedSolFlight.visibleBodies({system:73},{w:1280,h:850,cx:640,cy:425,zoom:1}).length,0);
 assert.equal(w.nativeStellarBackground.sources(73).length,0);
 assert.equal(w.nativeRegionalStarfield.sampleAt(w.nativeBadlands.centre.x,w.nativeBadlands.centre.y).density,0);
});
test('warp arrives just inside the actual boundary from every incoming direction and activates that same map region',()=>{
 const {window:w}=fixture(),b=w.nativeBadlands.boundary,a=w.nativeManualFlight.anchor(73);
 for(let angle=0;angle<Math.PI*2;angle+=.17){const p=w.nativeBadlands.arrival(angle),q=Math.hypot(p.x/b.rx,p.y/b.ry);assert.ok(q>.995&&q<1);assert.equal(w.nativeManualFlight.regionAtPoint({devMode:true},{x:a.x+p.x,y:a.y+p.y}).system,73);assert.ok(Math.cos(angle)*p.x+Math.sin(angle)*p.y<0);}
});
test('surrounding system envelopes leave a broad clear fringe; Sol and local geology retain their coordinates and identities',async()=>{
 const {window:w}=fixture(),{window:old}=fixture(false);await Promise.all([w.nativeSolAsteroids.ready,old.nativeSolAsteroids.ready]);
 assert.deepEqual(plain(w.nativeManualFlight.chartPosition(1)),plain(old.nativeManualFlight.chartPosition(1)));
 for(const id of [1,47,50,84])assert.deepEqual(plain(w.nativeSolAsteroids.forSystem(id)),plain(old.nativeSolAsteroids.forSystem(id)));
 for(const r of w.nativeManualFlight.boundaries().filter(r=>r.id!==73)){
  const a=w.nativeManualFlight.anchor(73),q=Math.hypot((r.x-a.x)/(64000+r.rx),(r.y-a.y)/(48000+r.ry));assert.ok(q>1.1,'region encroaches: '+r.id+' '+q);
 }
 const c=w.nativeBadlands.centre;for(const id of [10,21,22,41,47,48,49,50,58,84]){const before=old.nativeManualFlight.chartPosition(id),after=w.nativeManualFlight.chartPosition(id);assert.ok(Math.hypot(after.x-c.x,after.y-c.y)>Math.hypot(before.x-c.x,before.y-c.y),id);}
});
test('Badlands has no local deposits or corridor/drift rocks anywhere inside its physical ellipse',async()=>{
 const {window:w}=fixture();await w.nativeSolAsteroids.ready;assert.equal(w.nativeSolAsteroids.forSystem(73).length,0);assert.equal(w.nativeRegionalMinerals.profile(73).count,0);
 const a=w.nativeManualFlight.anchor(73);
 for(let y=-45000;y<=45000;y+=5000)for(let x=-60000;x<=60000;x+=5000){
  if(Math.hypot(x/64000,y/48000)>.96)continue;
  const box={minX:a.x+x-500,minY:a.y+y-500,maxX:a.x+x+500,maxY:a.y+y+500};
  const rocks=w.nativeTravelCorridors.query(box).flatMap(s=>w.nativeTravelCorridors.rockIds(s)).map(id=>w.nativeTravelCorridors.rockInfo(id)).filter(Boolean);
  assert.ok(rocks.every(r=>!w.nativeBadlands.containsGlobal(r.globalX,r.globalY)),`${x},${y}`);
  assert.equal(w.nativeSolAsteroids.queryBounds(73,{minX:x-500,minY:y-500,maxX:x+500,maxY:y+500}).length,0);
 }
});
test('real interactive fog tiles cover the complete interior and continue outside the map boundary, including old gaps and tile corners',()=>{
 const {window:w}=fixture(),api=w.nativeParallaxNebulae,gas=w.nativeNebulaGas;
 for(let y=-48000;y<=48000;y+=1150)for(let x=-64000;x<=64000;x+=1550){
  if(Math.hypot(x/64000,y/48000)>1.005)continue;
  const view={w:1280,h:850,zoom:1,playerX:x,playerY:y,cameraX:x,cameraY:y},tiles=api.volumes(73,view,300).filter(v=>v.continuous);
  for(const [dx,dy] of [[0,0],[-640,-425],[640,-425],[-640,425],[640,425]])assert.ok(tiles.some(t=>Math.abs(x+dx-t.origin.x)<=1000+1e-8&&Math.abs(y+dy-t.origin.y)<=700+1e-8),`fog gap ${x+dx},${y+dy}`);
 }
 assert.ok(gas.densityAt(30,50,20,3,53,.28,true).density>.1);
 assert.ok(api.volumes(73,{w:1200,h:800,playerX:65000,playerY:0,cameraX:65000,cameraY:0},300).some(t=>t.continuous));
});
test('outflows spawn much more often than ordinary storms, travel outward, repeat and expire without gameplay randomness',()=>{
 const {window:w}=fixture(),api=w.nativeParallaxNebulae,c=w.nativeBadlands.centre;
 assert.ok(api.weather.plumeInterval<api.weather.period/20);
 for(let n=0;n<20;n++){
  const born=n*18,a=api.plume(n,born+30),b=api.plume(n,born+150);assert.deepEqual(plain(a),plain(api.plume(n,born+30)));
  const d=p=>Math.hypot((p.x-c.x)/64,(p.y-c.y)/48);assert.ok(d(b)>d(a));assert.ok(d(b)>1);assert.equal(api.plume(n,born+216),null);
 }
 let physical=false;
 for(let n=0;n<40;n++){
  const at=n*18+160,p=api.plume(n,at);if(api.coverage(api.places[0],p)>.02||api.coverage(p,p)<.05)continue;
  const x=(p.x-c.x)*1000,y=(p.y-c.y)*1000,cores=api.volumes(73,{w:1280,h:850,playerX:x,playerY:y,cameraX:x,cameraY:y},at);
  physical=cores.some(v=>v.placeId===p.id);if(physical)break;
 }
 assert.ok(physical,'outer outflows must contain actual interactive material');
});
test('old funded routes migrate once, preserving cargo, escrow, IDs, progress and deadlines through save/reload',()=>{
 const {window:w}=fixture(),a=w.nativeBadlands.previousChart(47),b=w.nativeBadlands.previousChart(50),earth=w.nativeManualFlight.chartPosition(1);
 const from={x:(a.x-earth.x)*1000+20,y:(a.y-earth.y)*1000+30},to={x:(b.x-earth.x)*1000+40,y:(b.y-earth.y)*1000+50};
 const j={origin:47,destination:50,galaxyFrom:from,galaxyTo:to,waypoints:[from,{x:(from.x+to.x)/2,y:(from.y+to.y)/2},to],duration:50,departedAt:100,arrivalAt:150,progress:.4};
 const state={system:73,localBody:900,localNavTarget:900,landed:true,latinum:1444,localContracts:[{id:8,fee:100,amount:30}],civilianTraffic:{ships:[{id:17,journey:j,cargo:{good:2,amount:30},task:{escrow:500,unitBuy:18,unitSell:37}}]}};
 const cargo=plain(state.civilianTraffic.ships[0].cargo),task=plain(state.civilianTraffic.ships[0].task);w.nativeBadlands.reconcile(state);
 assert.deepEqual(plain(state.civilianTraffic.ships[0].cargo),cargo);assert.deepEqual(plain(state.civilianTraffic.ships[0].task),task);
 assert.equal(j.arrivalAt,150);assert.equal(j.progress,.4);assert.equal(j.duration,50);assert.equal(state.latinum,1444);assert.equal(state.localBody,0);assert.equal(state.landed,false);
 const end=w.nativeManualFlight.anchor(50);assert.equal(j.galaxyTo.x,end.x+40);assert.equal(j.galaxyTo.y,end.y+50);
 const saved=JSON.stringify(state);w.nativeBadlands.reconcile(state);assert.equal(JSON.stringify(state),saved);const restored=JSON.parse(saved);w.nativeBadlands.reconcile(restored);assert.equal(JSON.stringify(restored),saved);
});
test('resuming a pre-revision pending warp moves to the edge without spending fuel, money or days again',()=>{
 const {window:w}=fixture(),state={system:73,x:0,y:0,angle:.4,localBody:900,localNavTarget:900,day:36,antimatter:181,latinum:88,pendingTransit:{version:1,report:{systemId:73,destinationBodyId:900,courseAngle:.4+Math.PI/2,fuelUsed:3,elapsedDays:6}},arrivalApproach:{x:0,y:0}};
 w.nativeBadlands.reconcile(state);assert.ok(Math.hypot(state.x/64000,state.y/48000)>.995);assert.equal(state.pendingTransit.report.destinationBodyId,0);
 assert.equal(state.antimatter,181);assert.equal(state.day,36);assert.equal(state.latinum,88);assert.equal(state.arrivalApproach,undefined);
 const save=JSON.stringify(state);w.nativeBadlands.reconcile(state);assert.equal(JSON.stringify(state),save);
});
test('stars disappear well before the wisps, with a clear starless buffer and a gradual approach in every direction',()=>{
 const {window:w}=fixture(),c=w.nativeBadlands.centre,api=w.nativeParallaxNebulae;
 for(let angle=0;angle<Math.PI*2;angle+=.19){
  let previous=1;
  for(let radius=2.8;radius>=.95;radius-=.01){
   const p={x:c.x+Math.cos(angle)*64*radius,y:c.y+Math.sin(angle)*48*radius},a=w.nativeBadlands.approach(p.x,p.y);
   assert.ok(a.stars<=previous+1e-12);previous=a.stars;
   if(a.distance<1.62)assert.equal(w.nativeRegionalStarfield.sampleAt(p.x,p.y).density,0);
   if(a.distance>1.50&&a.distance<1.60){assert.equal(a.stars,0);assert.equal(api.sample(73,{playerX:(p.x-c.x)*1000,playerY:(p.y-c.y)*1000},450).density,0);}
   if(radius<=1)assert.equal(a.plasma,1);
  }
 }
 for(let angle=0;angle<Math.PI*2;angle+=.3){
  const x=Math.cos(angle)*64*1.6,y=Math.sin(angle)*48*1.6;
  const eps=.00001,a=w.nativeBadlands.approach(c.x+x,c.y+y),b=w.nativeBadlands.approach(c.x+x+eps,c.y+y+eps);
  assert.ok(Math.abs(a.stars-b.stars)<.00001);assert.ok(Math.abs(a.plasma-b.plasma)<.00001);
 }
});
test('outer clouds are smaller, sparser and varied in color while the approved orange interior stays dense',()=>{
 const {window:w}=fixture(),api=w.nativeParallaxNebulae,c=w.nativeBadlands.centre,styles=new Set();
 for(let n=0;n<20;n++){const p=api.plume(n,n*18+120);styles.add(p.style);assert.ok(p.rx<15&&p.ry<11&&p.opacity<.5);}
 assert.ok(styles.size>=4);assert.ok(!styles.has(api.places[0].style));
 assert.equal(api.sample(73,{playerX:0,playerY:0},450).density,.85);
 let old=0,now=0;
 for(let angle=0;angle<Math.PI*2;angle+=.13)for(let radius=1.05;radius<1.48;radius+=.025){
  const p={x:c.x+Math.cos(angle)*64*radius,y:c.y+Math.sin(angle)*48*radius},distance=Math.hypot((p.x-c.x)/94,(p.y-c.y)/74),s=Math.max(0,Math.min(1,(1-distance)/.38));old+=s*s*(3-2*s);
  now+=api.coverage(api.places[0],p);
 }
 assert.ok(now<old*.5,`outside plasma should be substantially thinner (${now}/${old})`);
});
test('the full envelopes of neighboring solar systems keep their normal starfields and suns',()=>{
 const {window:w}=fixture(),earth=w.nativeManualFlight.chartPosition(1),centre=w.nativeManualFlight.anchor(73);
 const neighbors=w.nativeManualFlight.boundaries().filter(r=>r.id!==73&&Math.hypot((r.x-centre.x)/64000,(r.y-centre.y)/48000)<2.5);
 assert.ok(neighbors.length>=15);
 for(const r of neighbors){
  const origin=w.nativeManualFlight.anchor(r.id);
  for(let angle=0;angle<Math.PI*2;angle+=.08){
   const x=r.x+Math.cos(angle)*r.rx,y=r.y+Math.sin(angle)*r.ry,chart={x:earth.x+x/1000,y:earth.y+y/1000};
   const v={w:1200,h:800,playerX:x-origin.x,playerY:y-origin.y,cameraX:x-origin.x,cameraY:y-origin.y};
   assert.equal(w.nativeBadlands.approach(chart.x,chart.y).stars,1,`${r.id} border ${angle}`);
   assert.equal(w.nativeRegionalStarfield.sampleAt(chart.x,chart.y).skyFade,1);
   const suns=w.nativeStellarBackground.project(r.id,v);assert.equal(suns.length,w.nativeStellarBackground.sources(r.id).length);
   for(const sun of suns)assert.equal(sun.intensity,sun.primary?1:.72);
  }
 }
 assert.equal(w.nativeRegionalStarfield.sample(58).density,3.9,'Vega must recover its ordinary blue starfield');
 assert.equal(w.nativeRegionalStarfield.sample(47).skyFade,1,'Bajor must recover its ordinary sky');
});
test('the short approach fits between neighboring systems and the Badlands, with no distant starless zone',()=>{
 const {window:w}=fixture(),c=w.nativeBadlands.centre;
 for(let a=0;a<Math.PI*2;a+=.05){
  const at=q=>w.nativeBadlands.approach(c.x+Math.cos(a)*64*q,c.y+Math.sin(a)*48*q);
  assert.equal(at(1.40).stars,1);assert.equal(at(1.10).stars,0);
  assert.equal(at(1).plasma,1);assert.equal(at(.9).stars,0);
 }
});
test('continuous fog uses one world color and opacity field instead of per-chunk shading',()=>{
 const {window:w}=fixture(),c=w.nativeBadlands.centre,tint=[.72,.40,.20];
 const inside=w.nativeBadlands.optics(c.x,c.y,tint);assert.equal(inside.opacity,1);assert.equal(inside.r,tint[0]);assert.equal(inside.b,tint[2]);
 for(let a=0;a<Math.PI*2;a+=.23){
  const r=1+.12*w.nativeBadlands.fringeWidth(a),x=c.x+Math.cos(a)*64*r,y=c.y+Math.sin(a)*48*r,o=w.nativeBadlands.optics(x,y,tint),near=w.nativeBadlands.optics(x+.00001,y+.00001,tint);
  assert.ok(Math.max(o.g,o.b)>o.r*1.15,'outer fog must visibly use cool colors');
  assert.ok(Math.abs(o.opacity-near.opacity)<.0001&&Math.abs(o.r-near.r)<.0001);
 }
 const v={w:1200,h:800,playerX:65000,playerY:700,cameraX:65000,cameraY:700},cores=w.nativeParallaxNebulae.volumes(73,v,160).filter(r=>r.continuous);
 assert.ok(cores.length>=4);for(const core of cores){assert.equal(core.profile.opacity,.85);assert.equal(core.seed,cores[0].seed);assert.equal(core.badlandsOptics.x+core.origin.x,0);assert.equal(core.feather,64);}
});
test('the next material section is prepared before its owned rectangle enters the viewport',()=>{
 const {window:w}=fixture(),api=w.nativeParallaxNebulae,v={w:1200,h:800,playerX:300,playerY:0,cameraX:300,cameraY:0};
 const cores=api.volumes(73,v,160),ahead=cores.find(c=>c.continuous&&c.ix===1&&c.iy===0);
 assert.ok(ahead);assert.ok(ahead.origin.x-ahead.patch.width/2>v.cameraX+v.w/2);
 const next=api.volumes(73,{...v,playerX:600,cameraX:600},160).find(c=>c.id===ahead.id);assert.ok(next);assert.equal(next.seed,ahead.seed);
});
