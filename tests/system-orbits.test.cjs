const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),game=path.join(root,'html-games/broken-mirror-port');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'tools/system-orbits.json'),'utf8'));
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/system-completion-v1.json'),'utf8'));
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){const window={},context=vm.createContext({window});for(const file of ['world-data.js','system-catalog-data.js','system-catalog.js'])vm.runInContext(fs.readFileSync(path.join(game,file),'utf8'),context);return window;}

test('all 490 visible bodies and their padded extents fit inside their own physical-system ellipse',()=>{
 const w=fixture(),c=w.nativeSystemCatalog;let count=0;
 for(const record of c.records){
  const bounds=c.boundary(record.id);assert.ok(bounds.rx>0&&bounds.ry>0);assert.equal(c.boundary(record.id),bounds);
  for(const b of c.bodies(record.id).filter(b=>!b.occludedBy)){
   const r=(b.size||100)/2+1100;
   for(const dx of [-r,r])for(const dy of [-r,r])assert.ok(((b.x-220+dx-bounds.x)/bounds.rx)**2+((b.y+75+dy-bounds.y)/bounds.ry)**2<=1+1e-12,`${record.name}: ${b.name} escapes`);
   count++;
  }
 }
 assert.equal(count,490);assert.equal(c.boundary(30),c.boundary(31));
});

test('each major planet has an existing parent star, qualified orbital evidence, and ordered radial geometry',()=>{
 const w=fixture(),c=w.nativeSystemCatalog;let modeled=0,measured=0;
 for(const record of c.records){
  assert.equal(record.orbitalLayout.version,manifest.version);
  for(const b of record.bodies.filter(b=>b.orbit)){
   const star=record.bodies.find(s=>s.id===b.orbit.primaryId);assert.equal(star.kind,'star');assert.equal(b.starId,star.id);
   assert.ok(b.orbit.semiMajorAxisAU>0);assert.equal(b.orbit.phaseEvidence,'illustrative');
   for(const ref of b.orbit.sources)assert.ok(w.VexedMirrorSystemData.sourceRefs[ref],ref);
   if(b.orbit.distanceEvidence==='astronomy')measured++;else{assert.equal(b.orbit.distanceEvidence,'scientific_model');modeled++;}
  }
  const byStar=new Map();
  for(const b of record.bodies.filter(b=>b.orbit)){const group=byStar.get(b.starId)||[];group.push(b);byStar.set(b.starId,group);}
  for(const [id,group] of byStar){const star=record.bodies.find(b=>b.id===id),distance=b=>Math.hypot(b.x-star.x,b.y-star.y);group.sort((a,b)=>a.orbit.order-b.orbit.order);
   for(let i=1;i<group.length;i++)if(group[i].orbit.order>group[i-1].orbit.order)assert.ok(distance(group[i])>distance(group[i-1]),`${record.name}: ${group[i].name} inside lower ordinal`);
  }
 }
 assert.equal(measured,16);assert.ok(modeled>200);
});

test('Sol and Kepler-174 retain measured orbital distances; unknown distances are never presented as canon',()=>{
 const w=fixture(),c=w.nativeSystemCatalog;
 for(const b of c.bodies(1).filter(b=>b.orbit))assert.equal(b.orbit.semiMajorAxisAU,manifest.solarAxesAU[b.id]);
 for(const b of c.bodies(60).filter(b=>b.orbit))assert.equal(b.orbit.semiMajorAxisAU,manifest.keplerAxesAU[b.id]);
 const q=c.bodies(38).find(b=>b.id===0);assert.equal(q.orbit.orderEvidence,'authored');assert.match(c.orbitDescription(q,38),/Scientific estimate/);
 assert.equal(c.bodies(14).find(b=>b.id===0).orbit.orderEvidence,'licensed_reference');
 assert.equal(c.bodies(47).find(b=>b.id===0).orbit.orderEvidence,'authored');
 for(const b of c.bodies(4).filter(b=>b.orbit))assert.ok(b.orbit.semiMajorAxisAU<2.4);
 for(const b of c.bodies(25).filter(b=>b.kind==='moon'))assert.equal(b.orbitalRelationship.parentId,b.parentId);
});

test('only the five explicit uninhabited survey planets move, preserving all homeworlds, moons and services',()=>{
 const w=fixture(),c=w.nativeSystemCatalog,moved=[];
 for(const record of c.records)for(const b of record.bodies)if(b.previousLayoutPosition){moved.push(`${record.id}:${b.id}`);assert.equal(b.port,false);assert.equal(b.legacyWorldId,undefined);}
 assert.deepEqual(moved,['82:100','82:101','82:102','84:100','84:101']);
 for(const old of baseline){const record=c.get(old.id);for(const b of old.bodies){const current=record.bodies.find(n=>n.id===b.id);
  if(current.previousLayoutPosition)assert.deepEqual(plain(current.previousLayoutPosition),{x:b.x,y:b.y});else{assert.equal(current.x,b.x);assert.equal(current.y,b.y);}
 }}
});

test('old parked saves follow relocated worlds once, with holdings and relative clearance retained',()=>{
 const w=fixture(),c=w.nativeSystemCatalog;
 for(const system of [82,84])for(const b of c.bodies(system).filter(b=>b.previousLayoutPosition)){
  const old=b.previousLayoutPosition;
  const s={system,localBodySystem:system,localSystemVersion:2,localBody:b.id,localNavTarget:b.id,x:old.x-620,y:old.y+75,previousX:old.x-620,previousY:old.y+75,landed:false,latinum:2468,cargo:{ore:17},minedAsteroids:[8200001],shipEquipment:{owned:'keep'},localContracts:[{id:7,escrow:99}]};
  const holdings=plain(s);c.initialize(s);assert.equal(s.x,b.x-620);assert.equal(s.y,b.y+75);assert.equal(s.previousX,s.x);assert.equal(s.previousY,s.y);
  for(const key of ['latinum','cargo','minedAsteroids','shipEquipment','localContracts','localBody','localNavTarget'])assert.deepEqual(plain(s[key]),holdings[key]);
  const migrated=plain(s);c.initialize(s);assert.deepEqual(plain(s),migrated);c.initialize(migrated);assert.deepEqual(plain(s),migrated);
 }
});

test('old cruises retain their in-flight pose and retarget the moved destination once; free flight stays fixed',()=>{
 const w=fixture(),c=w.nativeSystemCatalog,b=c.bodies(82).find(b=>b.id===102),old=b.previousLayoutPosition;
 const s={system:82,localBodySystem:82,localSystemVersion:2,localBody:0,localNavTarget:b.id,x:321,y:-42,localCruise:{from:0,to:b.id,stopX:old.x-620,stopY:old.y+75,startedAt:1234,speed:700},latinum:2468};
 c.initialize(s);assert.equal(s.x,321);assert.equal(s.y,-42);assert.equal(s.localCruise.stopX,b.x-620);assert.equal(s.localCruise.stopY,b.y+75);assert.equal(s.localCruise.startedAt,1234);assert.equal(s.latinum,2468);
 const once=plain(s);c.initialize(s);assert.deepEqual(plain(s),once);
 const free={system:82,localBodySystem:82,localSystemVersion:2,localBody:b.id,x:20000,y:-20000};c.initialize(free);assert.equal(free.x,20000);assert.equal(free.y,-20000);
});
