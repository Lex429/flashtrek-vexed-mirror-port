const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),game=path.join(root,'html-games/broken-mirror-port');
const plan=JSON.parse(fs.readFileSync(path.join(root,'tools/system-completion.json'),'utf8'));
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/system-completion-v1.json'),'utf8'));
function fixture(){const window={},ctx=vm.createContext({window});for(const file of ['world-data.js','system-catalog-data.js','system-catalog.js'])vm.runInContext(fs.readFileSync(path.join(game,file),'utf8'),ctx);return window;}
const plain=v=>JSON.parse(JSON.stringify(v));
test('the explicit approved plan contains 40 systems and 215 planets with no invented missing moon roster',()=>{
 assert.equal(plan.systems.length,40);assert.equal(plan.systems.reduce((n,s)=>n+s.planets.length,0),215);
 assert.equal(plan.moonTarget,39);assert.equal(plan.existingMoons,11);assert.match(plan.additionalMoonDetails,/Awaiting/);
 for(const s of plan.systems){assert.equal(s.planets.filter(p=>'existingBodyId' in p).length,1);assert.equal(new Set(s.planets.map(p=>p.name)).size,s.planets.length);}
});
test('every pre-expansion body retains its identity, parent, size and services; explicit orbit repairs retain their previous pose',()=>{
 const w=fixture();for(const old of baseline){const record=w.nativeSystemCatalog.get(old.id);assert.deepEqual(plain(record.homeBodyByLegacy),old.homeBodyByLegacy);
  for(const body of old.bodies){const current=record.bodies.find(b=>b.id===body.id);assert.ok(current,`${old.id}/${body.id} removed`);for(const [key,value] of Object.entries(body)){if(key==='name'&&body.kind==='star'&&(old.id===51||old.id===11&&body.id===900))continue;if(['x','y'].includes(key)&&current.previousLayoutPosition){assert.equal(current.previousLayoutPosition[key],value,`${old.id}/${body.id} previous ${key}`);continue;}assert.deepEqual(current[key],value,`${old.id}/${body.id} ${key}`);}}
 }
});
test('released systems have the exact roster, complete final art and increasing orbital distances within each stellar group',()=>{
 const w=fixture();for(const s of plan.systems.filter(s=>plan.releasedSystems.includes(s.id))){const bodies=w.nativeSystemCatalog.get(s.id).bodies,planets=bodies.filter(b=>['planet','gas_giant','ice_giant'].includes(b.kind));assert.equal(planets.length,s.planets.length);
  const distances=new Map();for(const p of s.planets){const b=planets.find(b=>b.name===p.name),star=bodies.find(b=>b.id===p.starId);assert.ok(b&&star);assert.equal(b.id,p.existingBodyId??p.id);assert.equal(b.kind,p.kind);assert.equal(b.appearance,p.appearance);assert.equal(b.starId,p.starId);assert.equal(b.orbitOrder,p.orbitOrder);assert.match(b.art,/-sol-v2.webp$/);assert.ok(fs.existsSync(path.join(game,b.art)));
   const d=Math.hypot(b.x-star.x,b.y-star.y);assert.ok(d>(distances.get(star.id)||0),`${s.name}: ${p.name} orbit order`);distances.set(star.id,d);
   if(!('existingBodyId' in p)){assert.equal(b.population,0);assert.equal(b.port,false);assert.equal(b.evidence,'authored');}
  }
 }
});
test('unreleased systems keep their previous body census and pending artwork never becomes a live dependency',()=>{
 const w=fixture();for(const old of baseline.filter(r=>!plan.releasedSystems.includes(r.id)))assert.equal(w.nativeSystemCatalog.get(old.id).bodies.length,old.bodies.length,old.id);
 for(const r of w.nativeSystemCatalog.records)for(const b of r.bodies)assert.ok(fs.existsSync(path.join(game,decodeURIComponent(b.art))),b.art);
});
test('old saves at a home world or moon retain navigation, cargo and account values',()=>{
 const w=fixture();for(const system of plan.releasedSystems){const r=w.nativeSystemCatalog.get(system);for(const b of r.bodies.filter(b=>b.kind==='moon'||b.legacyWorldId)){
  const state={system,localBodySystem:system,localSystemVersion:2,localBody:b.id,localNavTarget:b.id,x:321,y:-42,localCruise:{to:b.id},latinum:1200,cargo:{ore:17},equipment:{owned:'engine'}};const before=plain(state);w.nativeSystemCatalog.initialize(state);assert.deepEqual(plain(state),before);
 }}
});
