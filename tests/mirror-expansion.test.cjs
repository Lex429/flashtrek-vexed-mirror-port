const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.join(__dirname,'../html-games/broken-mirror-port');
function fixture(){const window={vexedSolFlight:{bodyPosition:b=>({x:b.x-220,y:b.y+75})}},context=vm.createContext({window});for(const file of ['world-data.js','system-catalog-data.js','system-catalog.js','mars-shipyard.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);return window;}
test('new destinations preserve region, debris and counterpart distinctions and do not seed a competing fleet',()=>{
 const w=fixture(),c=w.nativeSystemCatalog;
 for(const id of [64,66,67,73,74,76])assert.equal(c.bodies(id)[0].kind,'region');
 assert.equal(c.bodies(59)[0].kind,'debris_field');assert.equal(c.bodies(59)[0].port,false);
 for(const id of [69,71,78,79,80,81,82,83,84,85,86,87,88,89])assert.equal(c.bodies(id)[0].evidence,'mirror_adaptation');
 assert.equal(c.bodies(84)[0].name,'Beta III');assert.equal(c.get(84).name,'C-111');
 assert.equal(c.bodies(60).filter(b=>b.kind!=='star').length,3);
 const kepler=c.bodies(60),d=kepler.find(b=>b.id===0),b=kepler.find(b=>b.id===100),cc=kepler.find(b=>b.id===101),star=kepler.find(b=>b.kind==='star'),distance=body=>Math.hypot(body.x-star.x,body.y-star.y);
 assert.equal(d.astronomy.planetType,'Neptune-like');assert.equal(d.astronomy.orbitalPeriodDays,247.4);
 assert.equal(b.astronomy.orbitalRadiusAU,.1);assert.equal(cc.astronomy.orbitalPeriodDays,44);
 assert.ok(distance(b)<distance(cc)&&distance(cc)<distance(d));
 assert.ok(w.VexedMirrorWorld.systems.filter(s=>s.id>=54).every(s=>s.trafficSeedCount===0));
 assert.ok(c.bodies(47)[0].description.includes('Dahkur'));
});
test('registered yards use catalog body positions, remain individually selectable and reject unrelated systems',()=>{
 const w=fixture(),yards=w.nativeMarsShipyard;assert.equal(yards.definitions.length,5);
 for(const y of yards.definitions){const s={system:y.system},b=w.nativeSystemCatalog.bodies(y.system).find(b=>b.id===y.bodyId),p=yards.position(s);assert.equal(p.x,b.x-220+y.offsetX);assert.equal(p.y,b.y+75+y.offsetY);assert.equal(yards.definitionFor(s).id,y.id);}
 assert.equal(yards.position({system:56}),null);
 assert.equal(yards.position({system:999}),null);
});
test('stellar assets are assigned by supported types and unknowns remain explicitly interpreted',()=>{
 const w=fixture(),star=id=>w.nativeSystemCatalog.bodies(id).find(b=>b.kind==='star');
 assert.equal(star(1).name,'Sol');assert.match(star(1).art,/star-g.webp$/);
 assert.equal(star(55).name,'Epsilon Indi A');assert.match(star(55).art,/star-k.webp$/);
 assert.match(star(58).art,/star-a.webp$/);assert.match(star(60).art,/star-k.webp$/);
 assert.match(star(43).spectralClass,/game interpretation/);
 assert.match(w.nativeSystemCatalog.bodies(12).find(b=>b.name==='40 Eridani B').art,/star-white-dwarf.webp$/);
});
test('Halka retains its pre-expansion rocks, mineral entitlements and depletion identities',async()=>{
 const f=await require('./npc-economy-fixture.cjs').fixture({regional:true,full:false,economic:false});
 assert.equal(createHash('sha256').update(JSON.stringify(f.window.nativeSolAsteroids.forSystem(53))).digest('hex'),'d9457b70765eef26a8465cfa725e1c3120e5a6b18ed25b1440942fb08cbe5ded');
});
