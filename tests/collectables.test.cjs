const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../html-games/broken-mirror-port');
function fixture(extra={}){
 const data=new Map(),window={localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}};
 const context=vm.createContext({window,document:{hidden:false},console,performance,URL,TextEncoder,TextDecoder,setTimeout,clearTimeout});
 const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 for(const file of ['save-codec.js','save-storage.js','simulation-clock.js','ship-motion.js','world-data.js','system-catalog-data.js','system-catalog.js'])load(file);
 window.nativeSystemHub={sol:window.nativeSystemCatalog.bodies(1)};window.vexedFlightAssets={};
 for(const file of ['sol-flight.js','manual-flight.js','collectable-sites.js','collectables.js','collectable-motion.js'])load(file);
 const api=window.nativeCollectables,state={devMode:true,system:1,localBody:3,x:-220,y:75,hull:100,day:8,latinum:500,minerals:{iron:12},localContracts:[{id:81,tons:5}],shipEquipment:{instances:{}},...extra};
 const approach=(id,frame=api.get(id).site.system)=>{state.system=frame;state.localBody=3;const item=api.available(state).find(i=>i.id===id),offset=frame===1?window.vexedSolFlight.shipPosition({...state,x:0,y:0}):{x:0,y:0};state.x=item.x-offset.x;state.y=item.y-offset.y;return item;};
 return {api,state,approach,window,motion:window.nativeCollectableMotion,storage:window.nativeSaveStorage};
}
test('sixteen artifacts have fixed galactic sites in ordinary and Dev play, with all real spacecraft far from Sol',()=>{
 const {api,state:s}=fixture(),before=JSON.stringify(s),items=api.available(s);
 assert.equal(items.length,16);assert.equal(new Set(items.map(item=>item.id)).size,16);
 for(const item of items){assert.ok(fs.existsSync(path.join(root,item.icon)));assert.notEqual(item.site.system,1);assert.ok(item.site.recovery.length>100);if(item.site.realWorld)assert.ok(Math.hypot(item.gx,item.gy)>=100000,item.id);}
 assert.equal(JSON.stringify(s),before);
 for(const devMode of [false,true])for(const faction of [0,1,2,3,4,5,6,7])for(const system of [1,2,31]){
  const other=api.available({...s,devMode,faction,system});assert.deepEqual(Array.from(other,i=>[i.id,i.gx,i.gy]),Array.from(items,i=>[i.id,i.gx,i.gy]));
 }
});
test('transport commits once through verified mode-separated storage and survives the real codec',()=>{
 const {api,storage,state:s,approach}=fixture(),normal={system:1,latinum:23};assert.equal(storage.write(normal).ok,true);
 const first=approach(api.catalog[0].id),before=JSON.stringify(s);
 assert.equal(api.collect(s,first.id).ok,true);assert.equal(api.collect(s,first.id).ok,false);assert.equal(s.collectables.length,1);
 assert.equal(api.available(s).length,15);const saved=storage.read('dev');assert.equal(saved.collectables[0].id,first.id);assert.equal(api.available(saved).length,15);
 assert.equal(storage.read('normal').latinum,23);delete s.collectables;assert.equal(JSON.stringify(s),before);
});
test('failed and throwing saves leave both the pickup and any legacy manifest intact',()=>{
 for(const withManifest of [false,true])for(const throws of [false,true]){
  const {api,state:s,approach}=fixture();approach(api.catalog[0].id);if(withManifest)s.collectables=[{id:'legacy',name:'Old artifact'}];
  const before=JSON.stringify(s),previous=s.collectables,id=api.available(s)[0].id;
  const result=api.collect(s,id,{save:()=>{if(throws)throw Error('Storage denied');return {ok:false,error:'Quota exceeded'};}});
  assert.equal(result.ok,false);assert.equal(JSON.stringify(s),before);assert.equal(s.collectables,previous);assert.equal(api.available(s).length,16);
 }
});
test('distant, docked, destroyed and unknown-location transport requests cannot grant artifacts',()=>{
 const {api,state:s,approach}=fixture(),id=api.catalog[0].id;approach(id);
 for(const extra of [{x:s.x+99999},{landed:true},{hull:0},{system:999}]){
  const state={...s,...extra},before=JSON.stringify(state);let saves=0;
  assert.equal(api.collect(state,id,{save:()=>{saves++;return {ok:true};}}).ok,false);assert.equal(saves,0);assert.equal(JSON.stringify(state),before);
 }
 assert.equal(api.collect(s,'missing',{save:()=>({ok:true})}).ok,false);
});
test('all sixteen recoveries retain legacy items, do not alter cargo, and remain absent after reload',()=>{
 const {api,storage,state:s,approach}=fixture();s.collectables=[{id:'old-keepsake',name:'Old keepsake'}];
 for(const item of api.catalog){approach(item.id);const before=JSON.stringify({...s,collectables:null});assert.equal(api.collect(s,item.id).ok,true,item.id);assert.equal(JSON.stringify({...s,collectables:null}),before);}
 const saved=storage.read('dev');assert.equal(saved.collectables.length,17);assert.equal(api.available(saved).length,0);assert.equal(saved.collectables[0].name,'Old keepsake');
 assert.ok(saved.collectables.slice(1).every(i=>Number.isFinite(i.collectedAt.galaxy.x)));
});
test('a completed original seven-item save keeps its slots and unlocks only the nine new artifacts',()=>{
 const {api,storage,state:s}=fixture(),oldIds=['earth-roadster','earth-vanguard-1','earth-voyager','earth-lageos-1','earth-pioneer-10','earth-pioneer-11','earth-snoopy'];
 assert.deepEqual(Array.from(api.catalog.slice(0,7),item=>item.id),oldIds);
 s.collectables=api.catalog.slice(0,7).map(item=>({id:item.id,name:item.name,icon:item.icon,description:item.description}));
 const before=JSON.stringify(s.collectables);assert.equal(storage.write(s).ok,true);const restored=storage.read('dev');
 assert.equal(JSON.stringify(restored.collectables),before);assert.equal(api.available(restored).length,9);assert.ok(api.available(restored).every(item=>!oldIds.includes(item.id)));
});

test('physical coasting samples the saved clock without mutation, automatic reversal or reload jumps',()=>{
 const {api,motion,storage,state:s}=fixture(),anchors=api.available(s);motion.initialize(s);
 s.shipSimulation={version:1,seconds:37.25};const before=JSON.stringify(s),moving=api.available(s);
 assert.equal(JSON.stringify(s),before);assert.deepEqual(api.available(s),moving);
 for(let i=0;i<moving.length;i++){
  assert.ok(Math.hypot(moving[i].x-anchors[i].x,moving[i].y-anchors[i].y)>.1);
  assert.notEqual(moving[i].roll,anchors[i].roll);
 }
 assert.equal(storage.write(s).ok,true);assert.deepEqual(api.available(storage.read('dev')),moving);
 const rolling=api.catalog.map(item=>Math.abs(item.physics.spin));
 assert.ok(rolling[1]>rolling[13],'the small satellite tumbles more quickly than the colony ship');
 for(const seconds of [0,1,40,1000000,1000000000]){
  s.shipSimulation.seconds=seconds;
  for(const item of api.available(s)){
   const anchor=anchors[item.index];assert.ok(Number.isFinite(item.roll));
   assert.ok(Math.abs(item.x-anchor.x-item.physics.vx*seconds)<1e-6);
   assert.ok(Math.abs(item.y-anchor.y-item.physics.vy*seconds)<1e-6);
  }
 }
});

test('transporter range follows the drifting world target rather than its original anchor',()=>{
 const {api,motion,state:s}=fixture(),anchor=api.available(s)[0];motion.initialize(s);s.shipSimulation={version:1,seconds:90};
 const moving=api.available(s)[0];assert.ok(moving.x>anchor.x+5);
 s.x=anchor.x-api.range;s.y=anchor.y;let saves=0;
 const save=()=>{saves++;return {ok:true};};
 assert.equal(api.collect(s,anchor.id,{save}).ok,false);assert.equal(saves,0);
 s.x=moving.x-api.range+1;s.y=moving.y;
 assert.equal(api.collect(s,anchor.id,{save}).ok,true);assert.equal(saves,1);
});

test('ordinary-game recovery uses global range across retained system frames and saves in the normal slot',()=>{
 const {api,motion,storage,state:s,approach}=fixture({devMode:false});motion.initialize(s);
 const id=api.catalog[0].id,item=approach(id,2);assert.ok(Math.hypot(item.x,item.y)>700);
 assert.equal(api.collect(s,id).ok,true);assert.equal(storage.read('normal').collectables[0].id,id);assert.equal(storage.read('dev'),null);
 assert.equal(api.available(storage.read('normal')).some(i=>i.id===id),false);
});

test('the first six single clues are available, and each unique recovery reveals only the next clue',()=>{
 const {api,state:s}=fixture();
 for(const devMode of [false,true])for(const count of [0,1,4,6,7,10,16]){
  s.devMode=devMode;s.collectables=[...api.catalog.slice(0,count).map(i=>({id:i.id})),{id:'old-keepsake'},...(count?[{id:api.catalog[0].id}]:[])];
  const before=JSON.stringify(s),progress=api.clueProgress(s);
  assert.equal(progress.found,count);assert.equal(progress.unlocked,Math.min(16,6+count));
  for(const item of api.catalog){
   const clue=api.clues(s,item.id),available=item.index<Math.min(16,6+count);
   assert.equal(clue.available,available);assert.equal(Object.hasOwn(clue,'text'),available);assert.equal(Object.hasOwn(clue,'reference'),available);
   assert.equal(Object.hasOwn(clue,'layers'),false);
   if(available)assert.equal(clue.text,item.site.clue);
  }
  assert.equal(JSON.stringify(s),before);
 }
 assert.equal(api.clues(s,'missing'),null);
});

test('unlocked clues retain the original single rumour and existing landmark artwork without additional search bearings',()=>{
 const {api,state:s}=fixture();s.collectables=api.catalog.slice(0,10).map(i=>({id:i.id}));
 for(const item of api.catalog){
  const clue=api.clues(s,item.id);assert.equal(clue.text,item.site.clue);assert.ok(!clue.text.includes(item.name));
  assert.ok(fs.existsSync(path.resolve(root,decodeURIComponent(clue.reference.art))),clue.reference.art);
 }
});

test('failed transport keeps the next clue locked; actual finds and Continue open later clues one at a time in each save mode',()=>{
 for(const devMode of [false,true]){
  const {api,state:s,approach,storage}=fixture({devMode});
  approach(api.catalog[0].id);assert.equal(api.collect(s,api.catalog[0].id,{save:()=>({ok:false})}).ok,false);
  assert.equal(api.clues(s,api.catalog[6].id).available,false);
  for(let index=0;index<10;index++){
   const id=api.catalog[index].id;approach(id);assert.equal(api.collect(s,id).ok,true);
   const restored=storage.read(devMode?'dev':'normal'),last=6+index;
   assert.equal(api.clues(restored,api.catalog[last].id).available,true);
   if(last+1<16)assert.equal(api.clues(restored,api.catalog[last+1].id).available,false);
  }
 }
});
