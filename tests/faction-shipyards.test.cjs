const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const read=name=>fs.readFileSync(`html-games/broken-mirror-port/${name}.js`,'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const options={full:false,economic:false,regional:true,access:true,corridors:true,factions:true,orion:true,shipyards:true};
async function setup(){
 const f=await fixture(options),w=f.window;
 const node=()=>({hidden:true,setAttribute(){},append(){},addEventListener(){},querySelector(){return null;}});
 f.context.document.createElement=node;f.context.document.querySelector=node;w.addEventListener=()=>{};
 f.context.Image=class {};
 const fetch=f.context.fetch;f.context.fetch=async url=>String(url).includes('earth-shipyard-docking-profiles')?{ok:true,json:async()=>JSON.parse(fs.readFileSync('html-games/flashtrek-broken-mirror/earth-shipyard-docking-profiles.json','utf8'))}:fetch(url);
 for(const name of ['mars-shipyard','shipyard-refits','equipment-panel','shipyard-services'])vm.runInContext(read(name),f.context);
 assert.equal(await w.nativeShipyardServices.ready,true);return f;
}
test('each territorial faction receives a physical yard without changing legacy stations, fleets or markets',async()=>{
 const f=await setup(),w=f.window,world=w.VexedMirrorWorld,old=vm.runInNewContext(read('world-data')+';window.VexedMirrorWorld.shipyards',{window:{}});
 assert.equal(world.shipyards.length,17);assert.deepEqual(plain(world.shipyards.slice(0,5)),plain(old));
 const owners=new Set(world.systems.filter(s=>s.governmentId>0).map(s=>s.governmentId));
 const covered=new Set(world.shipyards.map(y=>world.systems.find(s=>s.id===y.system).governmentId));
 assert.deepEqual([...covered].sort((a,b)=>a-b),[...owners].sort((a,b)=>a-b));assert.equal(covered.size,16);
 const before=JSON.stringify(f.state),data=JSON.stringify(world);
 vm.runInContext(read('faction-shipyards'),f.context);
 assert.equal(JSON.stringify(world),data,'loading registration again duplicates no station');assert.equal(JSON.stringify(f.state),before,'no crew, funded job or market is touched');
 for(const y of w.nativeFactionShipyards.definitions){
  assert.ok(w.nativeSystemCatalog.bodies(y.system).some(b=>b.id===y.bodyId),y.name);
  assert.equal(y.artworkId,280);assert.equal(y.size,220);
 }
 assert.equal(w.nativeCivilianAccess.inhabited(f.state,34),false);assert.equal(w.nativeCivilianAccess.inhabited(f.state,52),false);
});
test('all new yards and every playable hull have planet/rock-clear service approaches',async()=>{
 const f=await setup(),w=f.window;
 let plans=0;
 for(const y of w.nativeFactionShipyards.definitions.slice(5)){
  const c=w.nativeFactionShipyards.position({system:y.system}),motion=w.nativeShipMotion;
  const frame=motion.navigationObstacles(f.state,y.system,c,c,y.size);
  assert.ok(motion.clearSegment(c,c,frame,y.size*Math.SQRT2/2+10),`Station frame obstructed: ${y.name}`);
  for(const hull of w.VexedMirrorWorld.ships){
   const holder={system:y.system,shipType:hull.id},p=w.nativeShipyardServices.plan(holder),d=w.nativeShipDefinitions.dimensions(holder);
   const padding=Math.max(d.width,d.height)/2+8,obstacles=motion.navigationObstacles(f.state,y.system,p.entry,p,padding);
   assert.ok(motion.clearSegment(p.entry,p,obstacles,padding),`Berth approach obstructed: ${y.name}/${hull.name}`);
   if(p.external)assert.ok(p.collar.noseX>p.collar.x);
   plans++;
  }
 }
 assert.equal(plans,w.VexedMirrorWorld.ships.length*12);
});
test('Romulus and Remus resolve one physical yard in their own coordinates and reject false remote docking',async()=>{
 const {window:w}=await setup(),registry=w.nativeFactionShipyards,r=w.nativeShipyardRefits;
 const romulus={system:31},remus={system:30};assert.equal(registry.definitionFor(romulus),registry.definitionFor(remus));
 const a=registry.position(romulus),b=registry.position(remus),offset=w.nativeSystemCatalog.bodies(31).find(body=>body.id===w.nativeSystemCatalog.homeId(30));
 assert.equal(a.x,b.x+offset.x);assert.equal(a.y,b.y+offset.y);
 const station=registry.definitionFor(romulus).id;
 for(const system of [30,31])assert.equal(r.docked({system,shipyardDock:{station,phase:'docked'}}),true);
 assert.equal(r.docked({system:2,shipyardDock:{station,phase:'docked'}}),false);
 assert.equal(r.docked({system:31,shipyardDock:{station,phase:'approach'}}),false);
 assert.equal(registry.definitionFor({system:32}),null);assert.equal(registry.position({system:32}),null);
});
test('every yard uses the same atomic refit owner and rollback after a failed save',async()=>{
 const {window:w,state:s}=await setup(),r=w.nativeShipyardRefits;
 for(const yard of w.nativeFactionShipyards.definitions){
  Object.assign(s,{system:yard.system,shipType:7,latinum:1000000,dilithium:1000,minerals:{tritanium:1000,trellium:1000,deuranium:1000},shipyardDock:{station:yard.id,phase:'docked'}});
  delete s.shipRefit;w.nativeShipEquipment.ensure(s);
  const before=plain(s),quote=r.quote(s,'hull');
  assert.equal(r.upgrade(s,'hull',()=>({ok:false,error:'Quota exceeded'})).ok,false);assert.deepEqual(plain(s),before,yard.name);
  assert.equal(r.upgrade(s,'hull',()=>({ok:true})).ok,true,yard.name);
  assert.equal(s.latinum,1000000-quote.price);assert.equal(r.level(plain(s),'hull'),1);
 }
});
test('distant stations remain culled before requesting the two shared lighting textures',async()=>{
 const f=await setup(),w=f.window;let images=0;f.context.Image=class {constructor(){images++;}};
 const state={system:2},c=w.nativeMarsShipyard.position(state),ctx={};
 assert.equal(w.nativeMarsShipyard.paint(ctx,{state,ship:{x:c.x+10000,y:c.y},w:1280,h:850,cx:640,cy:425,zoom:1}),false);
 assert.equal(images,0);assert.equal(w.nativeMarsShipyard.snapshot().requested,false);
 assert.equal(w.nativeMarsShipyard.definitions,w.nativeFactionShipyards.definitions);
});
