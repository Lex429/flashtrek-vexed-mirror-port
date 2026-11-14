const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value)),root=path.join(__dirname,'../html-games');
async function model(){
 const f=await fixture({full:false,economic:false,regional:true}),w=f.window;
 w.createShowcaseEffects=()=>({snapshot(){},draw(){}});
 for(const file of ['broken-mirror-port/ship-scale-settings.js','broken-mirror-port/flight-reference-data.js','flashtrek-broken-mirror/starter-effects.js',
   'flashtrek-broken-mirror/earth-profiles.js','flashtrek-broken-mirror/federation-profiles.js','flashtrek-broken-mirror/new-ship-profiles.js',
   'flashtrek-broken-mirror/earth-effects.js','flashtrek-broken-mirror/constitution-showcase-lights.js',
   'flashtrek-broken-mirror/constitution-damage.js','broken-mirror-port/constitution-ships.js','broken-mirror-port/federation-ships.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context,{filename:file});
 return f;
}

test('the finished Federation roster has four real damage frames and excludes all unfinished tug variants',async()=>{
 const {window:w}=await model(),catalog=JSON.parse(fs.readFileSync(path.join(root,'flashtrek-broken-mirror/showcase-assets/catalog.json'),'utf8'));
 assert.equal(w.nativeFederationShips.ids.length,45);
 for(const id of w.nativeFederationShips.ids){
  assert.ok(w.VexedMirrorWorld.ships.some(ship=>ship.id===id));
  const row=catalog.ships.find(ship=>ship.id===id);assert.equal(new Set(row.frames).size,4);
  for(const frame of row.frames)assert.ok(frame&&fs.existsSync(path.join(root,'flashtrek-broken-mirror/showcase-assets',frame)));
  assert.notEqual(w.starterShips.get(id)?.animationReady,false);
 }
 for(const id of [414,415,417,418,419,420,421,422,423,424,425]){
  assert.equal(w.nativeFederationShips.isAnimated(id),false);assert.ok(!w.VexedMirrorWorld.ships.some(ship=>ship.id===id));
 }
});

test('every newly animated Federation entry retains its source PNGs and class balance while using its atlas scale',async()=>{
 const {window:w}=await model(),manifest=JSON.parse(fs.readFileSync(path.join(root,'flashtrek-broken-mirror/showcase-assets/new-ship-art/federation-import.json'),'utf8'));
 const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
 assert.equal(w.nativeFederationShips.additions.length,13);assert.equal(manifest.ships.length,13);
 for(const [id,name,template] of w.nativeFederationShips.additions){
  const definition=w.nativeShipDefinitions.get(id),base=w.nativeShipDefinitions.get(template),profile=w.starterShips.get(id),row=manifest.ships.find(s=>s.id===id);
  assert.equal(definition.name,name);assert.ok(profile?.effects&&profile.animationReady);
  for(const key of ['hull','shields','cargo','price','massClass'])assert.equal(definition[key],base[key],id+'/'+key);
  assert.equal(w.nativeShipDefinitions.dimensions({shipType:id}).height,w.nativeShipScaleSettings.gameplayShips[id].dimensions.height);
  assert.deepEqual(plain(definition.defaultWeapons),plain(base.defaultWeapons));
  for(const [file,sha] of Object.entries(row.frames))assert.equal(hash(fs.readFileSync(path.join(root,'flashtrek-broken-mirror/showcase-assets',file))),sha,'Original artwork changed: '+file);
 }
});

test('Mars offers use the finished roster without changing other ports, prices or named Dev hulls',async()=>{
 const {window:w}=await model(),old=[6,12,17,10],before=plain(old),offered=w.nativeFederationShips.offers({system:1},5,old);
 assert.deepEqual(old,before);assert.equal(new Set(offered).size,offered.length);assert.ok(offered.includes(416)&&offered.includes(38));
 assert.ok(!offered.includes(426)&&!offered.includes(427)&&!offered.includes(414));
 for(const id of old)assert.ok(offered.includes(id));
 assert.equal(w.nativeFederationShips.offers({system:2},5,old),old);
 assert.equal(w.nativeFederationShips.offers({system:1},3,old),old);
 assert.equal(w.nativeShipDefinitions.get(38).price,105000);
});

test('new Federation starter hulls receive owned photon torpedoes without refilling saved or transferred fittings',async()=>{
 const {window:w,state:s}=await model(),api=w.nativeShipEquipment;
 for(const type of [6,7,436,437]){
  const definition=w.nativeShipDefinitions.get(type),catalog=w.VexedMirrorWorld.ships.find(ship=>ship.id===type);
  const player={shipType:type,hull:definition.hull,shields:definition.shields,weapons:catalog.defaultWeapons.map(id=>id||null)};
  const eq=api.ensure(player),models=eq.slots.weapon.map(id=>eq.instances[id]?.modelId??null);
  assert.deepEqual(plain(models),[1,15,null],definition.name);assert.equal(w.nativeShipEquipment.model(models[1]).name,'Photon Torpedo');
  const npc={id:900+type,shipType:type,hull:definition.hull,shields:definition.shields};
  assert.deepEqual(plain(api.ensure(s,npc).slots.weapon.map(id=>npc.shipEquipment.instances[id]?.modelId??null)),[1,15,null]);
  const torpedo=eq.slots.weapon[1];eq.instances[torpedo].readyAt=12.5;
  assert.equal(api.move(player,{category:'weapon',fromType:'slot',fromIndex:1,toType:'locker',toIndex:eq.locker.length}).ok,true);
  const saved=plain(player),owned=Object.keys(saved.shipEquipment.instances).sort();api.ensure(saved);
  assert.equal(saved.shipEquipment.slots.weapon[1],null);assert.equal(saved.shipEquipment.instances[torpedo].readyAt,12.5);
  assert.equal(api.changeHull(saved,type===6?7:6).ok,true);assert.deepEqual(Object.keys(saved.shipEquipment.instances).sort(),owned);
  assert.equal(saved.shipEquipment.slots.weapon[1],null,'Buying a starter hull reissued its default torpedo');
 }
 const old={shipType:6,weapons:[1,null,null],hull:100,shields:100};api.ensure(old);
 assert.equal(Object.values(old.shipEquipment.instances).some(item=>item.modelId===15),false,'An old fitting was silently changed');
});

test('the armored tug uses shared hull ownership, motion, thrusters, equipment and exact damage thresholds',async()=>{
 const {window:w,state:s,ship:e}=await model(),api=w.nativeShipEquipment,held=Object.keys(api.ensure(s).instances).sort();
 assert.equal(api.changeHull(s,416).ok,true);assert.deepEqual(Object.keys(s.shipEquipment.instances).sort(),held);
 Object.assign(e,{shipType:416,system:s.system});api.ensure(s,e);
 const a=w.nativeShipDefinitions.forEntity(s),b=w.nativeShipDefinitions.forEntity(s,e,{category:'civilian'});
 for(const key of ['hull','shields','cargo','dimensions','movement','thrusters','slots'])assert.deepEqual(plain(a[key]),plain(b[key]),key);
 assert.ok(a.hull>w.nativeShipDefinitions.get(10).hull);assert.equal(a.dimensions.height,w.nativeShipDefinitions.dimensions({shipType:10}).height);
 assert.equal(w.nativeShipThrusters.quote(s).level,0);
 const profile=w.starterShips.get(416);assert.equal(profile.lights.length,50);assert.equal(profile.damage.length,4);assert.ok(profile.breakAnchors.length>0&&profile.destruction.sites.length>0);
 const descriptor=w.nativeShipDefinitions.describe(s);
 for(const [fraction,stage]of [[1,0],[.7,1],[.4,2],[.1,3]]){s.hull=a.hull*fraction;assert.equal(w.nativeShipDefinitions.stage(descriptor),stage);}
 const before={x:s.x,y:s.y};w.nativeShipSystems.move(s,s,'player',{throttle:1},a.movement,.5);
 assert.ok(Math.hypot(s.x-before.x,s.y-before.y)>0,'Real movement remains in the shared owner');
});
