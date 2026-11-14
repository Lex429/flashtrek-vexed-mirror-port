const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../html-games'),plain=value=>JSON.parse(JSON.stringify(value));
function model(scaled=true){
 const w={console,document:{createElement(){throw Error('Definition sizing must not prepare pixels');}}};w.window=w;vm.createContext(w);
 const scripts=[...['cthia-effects','olympic-effects','tug-effects','constitution-tug-effects','starter-effects','earth-profiles',
  'federation-profiles','new-ship-profiles','orion-profiles','klingon-profiles','romulan-profiles','vulcan-profiles',
  'cardassian-profiles','ferengi-dominion-profiles','independent-profiles','earth-effects','constitution-showcase-lights',
  'constitution-damage','bioship-effects','lifeform-effects'].map(name=>'flashtrek-broken-mirror/'+name+'.js'),
  ...['world-data','orion-world','flight-reference-data','ship-motion',...(scaled?['ship-scale-settings']:[]),
   'ship-definitions','constitution-ships','federation-ships','orion-ships','prometheus-artwork','prometheus-definitions','ship-scale-data'].map(name=>'broken-mirror-port/'+name+'.js')];
 for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),w,{filename:file});
 w.vexedSolFlight={shipPosition:s=>({x:s.x||0,y:s.y||0})};
 return w;
}

test('the atlas keeps full reference lengths while gameplay uses compact, undistorted hulls',()=>{
 const w=model(),settings=w.nativeShipScaleSettings,rows=w.nativeShipScale.roster();
 assert.equal(Object.keys(settings.ships).length,33);
 for(const row of rows){
  const entry=settings.ships[row.id],definition=w.nativeShipDefinitions.get(row.id);
  if(!row.reference){assert.equal(entry,undefined);continue;}
  assert.ok(entry,row.id);assert.equal(entry.meters,row.reference.meters);
  const visible=entry.dimensions.height*entry.bounds.height/entry.artwork.height;
  assert.ok(Math.abs(visible-row.reference.meters*settings.unitsPerMeter)<1e-9,row.id);
  const visibleWidth=entry.dimensions.width*entry.bounds.width/entry.artwork.width;
  assert.ok(Math.abs(visibleWidth-visible*entry.bounds.width/entry.bounds.height)<1e-9,row.id+' undistorted hull');
  assert.deepEqual(plain(w.nativeShipDefinitions.presentation(row.id)),plain(definition.dimensions));
  assert.deepEqual(plain(definition.dimensions),plain(settings.gameplayShips[row.id].dimensions));
  assert.ok(Object.isFrozen(entry)&&Object.isFrozen(entry.dimensions)&&Object.isFrozen(entry.physical));
 }
 assert.equal(w.nativeShipDefinitions.get(7).dimensions.height,11.7);
});

test('resizing preserves the roster, every hull statistic, equipment, mass, inertia and flight profile',()=>{
 const before=model(false),after=model(),ids=before.nativeShipDefinitions.registered().map(d=>d.id);
 assert.deepEqual(Array.from(after.nativeShipDefinitions.registered(),d=>d.id),Array.from(ids));
 for(const id of ids){
  const old=before.nativeShipDefinitions.get(id),current=after.nativeShipDefinitions.get(id);
  for(const key of ['hull','shields','cargo','price','slots','startingEquipment','npcStartingEquipment','npcPolicy',
   'capabilities','thrusters','mass','inertia']){
   if(['mass','inertia'].includes(key))assert.ok(Math.abs(current[key]-old[key])<1e-10*Math.max(1,Math.abs(old[key])),id+'/'+key);
   else if(key==='thrusters')for(const field of Object.keys(old[key]))assert.ok(Math.abs(current[key][field]-old[key][field])<1e-10*Math.max(1,Math.abs(old[key][field])),id+'/'+key+'/'+field+' '+current[key][field]+' vs '+old[key][field]);
   else assert.deepEqual(plain(current[key]),plain(old[key]),id+'/'+key);
  }
  if(!after.nativeShipScaleSettings.gameplayShips[id])assert.deepEqual(plain(current.dimensions),plain(old.dimensions),id+' unconfigured size');
 }
});

test('all roles use the same corrected hulls and scaled attachment boundaries after save and reload',()=>{
 const w=model(),api=w.nativeShipDefinitions;
 for(const id of Object.keys(w.nativeShipScaleSettings.gameplayShips).map(Number)){
  const state={system:1},entity={id:1000+id,shipType:id,x:20,y:30,hull:100,shields:100,angle:.2,heading:.2};
  const restored=plain(entity),player=api.describe(state,entity,{category:'player'});
  for(const category of ['player','civilian','tug']){
   const descriptor=api.describe(state,restored,{category});
   assert.deepEqual(plain(descriptor.dimensions),plain(player.dimensions),id+'/'+category);
   assert.deepEqual(plain(descriptor.hullRadii),plain(player.hullRadii),id+'/'+category+' hull');
   assert.deepEqual(plain(descriptor.radii),plain(player.radii),id+'/'+category+' shields');
   assert.deepEqual(plain(descriptor.definition.emitters),plain(player.definition.emitters),id+'/'+category+' mounts');
  }
 }
});

test('compact fleet frames respect the configured maximum while Danube and tiny craft stay unchanged',()=>{
 const w=model(),settings=w.nativeShipScaleSettings;
 for(const [id,row] of Object.entries(settings.gameplayShips)){
  const d=w.nativeShipDefinitions.get(Number(id)).dimensions,before=row.baseDimensions;
  assert.ok(d.height<=settings.gameplay.maxFrameHeight+1e-9,id+' maximum frame height');
  assert.ok(d.width<=before.width+1e-9&&d.height<=before.height+1e-9,id+' never enlarged');
  assert.ok(Math.abs(d.width/d.height-before.width/before.height)<1e-9,id+' hull proportions');
  if(Number(id)===7||before.height<=settings.gameplay.anchorFrameHeight)assert.deepEqual(plain(d),plain(before));
  else assert.ok(d.height<before.height,id+' reduced');
 }
 assert.equal(w.nativeShipDefinitions.get(7).dimensions.height,11.7);
});

test('every production entry point and the startup/travel worker load the shared scale data',()=>{
 for(const file of ['index.html','ship-scale.html','effect-lab-scene.html']){
  const text=fs.readFileSync(path.join(root,'broken-mirror-port',file),'utf8');
  assert.ok(text.indexOf('ship-scale-settings.js')>=0,file);
  assert.ok(text.indexOf('ship-scale-settings.js')<text.indexOf('ship-definitions.js'),file);
 }
 const worker=fs.readFileSync(path.join(root,'broken-mirror-port/world-bootstrap-worker.js'),'utf8');
 assert.ok(worker.indexOf('ship-scale-settings.js')<worker.indexOf('ship-definitions.js'));
});
