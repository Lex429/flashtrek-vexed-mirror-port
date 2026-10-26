const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const root=path.join(__dirname,'../html-games/broken-mirror-port');
function fixture(){
 const window={};const context=vm.createContext({window});
 const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 for(const file of ['world-data.js','system-catalog-data.js','system-catalog.js'])load(file);
 window.nativeSystemHub={sol:window.nativeSystemCatalog.bodies(1)};
 window.vexedFlightAssets={loadLocalBody:async()=>null,localBody:()=>null,loadImage:async()=>null};
 load('sol-flight.js');load('manual-flight.js');
 const state={system:31,x:0,y:0,localBody:3,latinum:1700,discovered:[31],planetPopulations:Object.fromEntries(window.VexedMirrorWorld.systems.map(s=>[s.id,s.populationBillions])),planetPopulationCounts:Object.fromEntries(window.VexedMirrorWorld.systems.map(s=>[s.id,s.populationBillions*1e9]))};
 return {window,load,state,catalog:window.nativeSystemCatalog};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('all original and appended destinations belong to one physical catalog without deleting an original world',()=>{
 const {window,catalog}=fixture();assert.equal(catalog.records.length,90);
 const legacy=catalog.records.flatMap(s=>s.legacyIds).sort((a,b)=>a-b);
 assert.deepEqual(plain(legacy),Array.from({length:91},(_,i)=>i+1));
 for(const system of window.VexedMirrorWorld.systems){
  const bodies=catalog.bodies(system.id),home=bodies.find(b=>b.id===catalog.homeId(system.id));
  assert.equal(home.legacyWorldId,system.id);assert.ok(bodies.length>=2);
  assert.equal(new Set(bodies.map(b=>b.id)).size,bodies.length);
  assert.ok(bodies.some(b=>b.kind==='star'));
  for(const b of bodies){assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));if(b.parentId!==undefined)assert.ok(bodies.some(p=>p.id===b.parentId));if(b.evidence==='authored')assert.equal(b.port,false);}
 }
});
test('Sol retains its twelve original IDs, positions and services while adding the other recognized dwarf planets',()=>{
 const {catalog}=fixture();const b=catalog.bodies(1);
 const names=['Sol','Mercury','Venus','Earth','Moon','Mars','Asteroid Belt','Jupiter','Saturn','Uranus','Neptune','Pluto'];
 assert.deepEqual(plain(b.slice(0,12).map(n=>n.name)),names);
 assert.deepEqual(plain(b.slice(0,12).map(n=>[n.x,n.y])),[[-6000,-1000],[-4100,1100],[-2300,-1500],[0,0],[1400,-250],[4800,1800],[8000,-1400],[11800,2700],[15300,-2700],[19000,3300],[23200,-4400],[27400,4200]]);
 assert.equal(b.filter(n=>['planet','gas_giant','ice_giant'].includes(n.kind)).length,8);
 assert.deepEqual(plain(b.filter(n=>n.kind==='ice_giant').map(n=>n.name)),['Uranus','Neptune']);
 assert.deepEqual(plain(b.filter(n=>n.port).map(n=>n.id)),[1,2,3,4,5,7,8,9,10]);
 assert.deepEqual(plain(b.filter(n=>n.kind==='dwarf_planet').map(n=>n.name)),['Pluto','Ceres','Haumea','Makemake','Eris']);
});
test('known physical relationships are explicit, with alternate designations and unsupported cross-system worlds excluded',()=>{
 const {catalog}=fixture();
 const andoria=catalog.bodies(25),moon=andoria.find(b=>b.legacyWorldId===25);
 assert.equal(moon.kind,'moon');assert.equal(andoria.find(b=>b.id===moon.parentId).kind,'gas_giant');
 const q=catalog.bodies(38);assert.equal(q.find(b=>b.name==='Praxis').parentId,0);
 const bajor=catalog.bodies(47),viii=bajor.find(b=>b.name==='Bajor VIII');
 assert.equal(bajor.find(b=>b.name==='Bajor VIII-b').parentId,viii.id);
 assert.equal(bajor.find(b=>b.name==='Derna').parentId,0);
 const all=catalog.records.flatMap(r=>r.bodies.map(b=>b.name));
 for(const name of ['Delta Vega','Vandros IV','Rigel Kentaurus','Qo noS III designation','Bajor XI','Tholia as second planet'])assert.ok(!all.includes(name),name);
 assert.equal(catalog.bodies(50).filter(b=>b.legacyWorldId===50).length,1);
});
test('old non-Sol saves reconcile their stale Sol body ID and preserve money, populations and discovery',()=>{
 const {state,catalog}=fixture(),before=plain(state);
 state.localNavTarget=3;
 catalog.initialize(state);assert.equal(state.localBody,0);assert.equal(state.localBodySystem,31);assert.equal(state.localNavTarget,0);
 assert.deepEqual(plain(state.planetPopulationCounts),before.planetPopulationCounts);
 assert.equal(state.latinum,before.latinum);assert.deepEqual(plain(state.discovered),before.discovered);
 state.system=30;catalog.initialize(state);assert.equal(state.localBody,1);
 const reloaded=plain(state);catalog.initialize(reloaded);assert.equal(reloaded.localBody,1);
});
test('existing world settlement changes still enable ports without creating settlements on authored neighbors',()=>{
 const {catalog,state}=fixture();state.system=5;catalog.initialize(state);
 assert.equal(catalog.current(state).port,false);
 state.planetPopulationCounts[5]=1000000;state.planetPopulations[5]=.001;
 assert.equal(catalog.current(state).port,true);
 assert.ok(catalog.nodes(state).filter(b=>b.evidence==='authored').every(b=>!b.port));
 state.system=1;delete state.localBodySystem;state.localBody=4;state.localNavTarget=9;
 catalog.initialize(state);assert.equal(state.localBody,4);assert.equal(state.localNavTarget,9);
});
test('Cardassian orbital numbering and the co-orbital Vulcan companions retain sensible illustrative ordering',()=>{
 const {catalog}=fixture();const bodies=catalog.bodies(50),star=bodies.find(b=>b.kind==='star');
 const distances=['Cardassia I','Cardassia Prime','Cardassia III','Cardassia IV','Cardassia V'].map(name=>{const b=bodies.find(b=>b.name===name);return Math.hypot(b.x-star.x,b.y-star.y);});
 for(let i=1;i<distances.length;i++)assert.ok(distances[i]>distances[i-1]);
 const vulcan=catalog.bodies(12),primary=vulcan.find(b=>b.id===900),radius=name=>{const b=vulcan.find(b=>b.name===name);return Math.hypot(b.x-primary.x,b.y-primary.y);};
 assert.ok(Math.abs(radius('Vulcan')-radius("T'Khut"))/radius('Vulcan')<.01);
});
test('Dyson preserves its population on the inhabited Sphere and keeps its enclosed primary occluded',()=>{
 const {catalog,state,window}=fixture();state.system=51;catalog.initialize(state);
 const current=catalog.current(state);assert.equal(current.name,'The Sphere');assert.equal(current.legacyWorldId,51);
 assert.equal(current.population,state.planetPopulationCounts[51]);
 assert.equal(catalog.nodes(state).find(b=>b.name==='Dyson').port,false);
 const visible=window.vexedSolFlight.visibleBodies(state,{zoom:1,w:2000,h:1200,cx:1000,cy:600});
 assert.ok(visible.some(v=>v.body.name==='The Sphere'));
 assert.ok(!visible.some(v=>v.body.id===900));
 const exposed=catalog.nodes(state).find(b=>b.id===901);
 if(exposed){assert.equal(exposed.name,'Dyson A');assert.equal(exposed.occludedBy,undefined);}
});
test('Romulus to Remus and back preserves the exact galaxy pose and each historical market/population key through reload',()=>{
 const {window,state,catalog}=fixture();catalog.initialize(state);
 const remus=catalog.bodies(31).find(b=>b.legacyWorldId===30);
 state.x=remus.x-380;state.y=remus.y+75;
 const pose={x:state.x,y:state.y},before=window.nativeManualFlight.position(state);
 catalog.arrive(state,remus,pose);assert.equal(state.system,30);assert.equal(state.localBody,1);
 let after=window.nativeManualFlight.position(state);
 assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1e-8);
 assert.equal(catalog.current(state).population,state.planetPopulationCounts[30]);
 const copy=plain(state);catalog.initialize(copy);
 const romulus=catalog.bodies(30).find(b=>b.legacyWorldId===31);
 copy.x=romulus.x-400;copy.y=romulus.y+75;
 const returnPose=window.nativeManualFlight.position(copy);
 catalog.arrive(copy,romulus,{x:copy.x,y:copy.y});after=window.nativeManualFlight.position(copy);
 assert.equal(copy.system,31);assert.equal(copy.localBody,0);
 assert.ok(Math.hypot(after.x-returnPose.x,after.y-returnPose.y)<1e-8);
 assert.equal(copy.latinum,1700);assert.equal(catalog.current(copy).population,copy.planetPopulationCounts[31]);
});
test('new local destinations use shared flight coordinates and selecting/arriving never creates resources',()=>{
 const {window,catalog,state}=fixture();state.system=12;catalog.initialize(state);
 const planet=catalog.bodies(12).find(b=>b.name==="T'Khut"),p=window.vexedSolFlight.bodyPosition(planet);
 state.x=p.x-80;state.y=p.y;state.landed=false;
 const before=plain([state.latinum,state.planetPopulationCounts]);
 const arrived=window.vexedSolFlight.nearestArrival(state);assert.equal(arrived.id,planet.id);
 assert.deepEqual(plain([state.x,state.y]),[p.x-80,p.y]);
 assert.deepEqual(plain([state.latinum,state.planetPopulationCounts]),before);
 assert.equal(catalog.current(state).port,false);
 window.vexedSolFlight.setTarget(planet.id,12);assert.equal(window.vexedSolFlight.targetId,planet.id);
});
test('navigation exposes one Romulus system and local cruise uses its current legacy-world catalog',()=>{
 const {window,catalog,state,load}=fixture();
 window.nativePopulation={initialize(s){s.planetPopulationCounts ||= {};}};
 window.nativeShipDefinitions={registered:()=>[],forEntity:()=>({speedOrOtherStationValue:95,antimatterUseOrPopulationEffect:2})};
 state.shipType=7;state.faction=0;state.antimatter=100;state.nav=100;
 load('native-navigation.js');const nav=window.nativeNavigation;nav.initialize(state);
 let selected;nav.attach({getGame:()=>state,isBusy:()=>false,cruise(id){selected=id;return {ok:true};}});
 const snapshot=nav.call('state',31);assert.equal(snapshot.current,31);assert.equal(snapshot.total,90);
 assert.equal(snapshot.nodes.filter(n=>n.id===30).length,0);assert.equal(snapshot.nodes.filter(n=>n.id===31).length,1);
 assert.equal(snapshot.selected.localPopulations[1],state.planetPopulationCounts[30]);
 assert.ok(nav.call('cruise',1).ok);assert.equal(selected,1);
 state.system=30;catalog.initialize(state);assert.equal(nav.call('state',31).current,31);
 assert.equal(nav.call('state',31).selected.canTravel,false);
 assert.equal(nav.call('cruise',0).ok,true);assert.equal(selected,0);
 assert.equal(nav.call('cruise',999).ok,false);
});
test('surveys stay explicit and the original-neighbor list plus reviewed overlays never add automatic filler',()=>{
 const {catalog}=fixture();const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/system-neighborhoods.json'),'utf8')).systems;
 const overlays=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/mirror-expansion.json'),'utf8')).overlays;
 const completion=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/system-completion.json'),'utf8'));
 const original=b=>b.evidence==='authored'&&!b.completionVersion;
 const authored=catalog.records.filter(r=>r.id<=52).flatMap(r=>r.bodies.filter(original).map(b=>({host:r.id,...b})));
 assert.equal(authored.length,21);
 assert.equal(authored.filter(b=>b.kind==='gas_giant').length,3);
 assert.equal(authored.filter(b=>b.kind==='ice_giant').length,1);
 for(const record of catalog.records.filter(r=>r.id<=52)){
  assert.deepEqual(plain(record.bodies.filter(original).map(b=>b.id)),[...(plan[record.id]||[]),...(overlays[record.id]?.bodies||[])].filter(b=>b.evidence===undefined||b.evidence==='authored').map(b=>b.id));
  assert.ok(record.bodies.every(b=>!b.name.endsWith(' outer giant')&&!b.name.endsWith(' inner world')&&!b.name.endsWith(' outer moon')));
 }
 for(const id of [2,4,10,11,15,16,18,24,25,27,31,38,47,50])assert.equal(catalog.bodies(id).filter(original).length,0);
 for(const id of [2,4,8,27,32,33,34,52])if(!completion.releasedSystems.includes(id))assert.equal(catalog.bodies(id).filter(b=>['planet','gas_giant','ice_giant','moon'].includes(b.kind)).length,1);
 assert.equal(catalog.bodies(11).find(b=>b.legacyWorldId===11).name,'Rigel');
 assert.equal(catalog.bodies(25).filter(b=>b.kind==='moon').length,1);
 for(const b of authored){assert.ok(b.id>=100);assert.equal(b.port,false);assert.equal(b.population,0);assert.equal(catalog.evidenceLabel(b),'Original game addition');}
});
test('version-1 saves at removed filler worlds keep poses and all holdings while invalid navigation is retired',()=>{
 const {catalog,state}=fixture();
 Object.assign(state,{system:14,localSystemVersion:1,localBodySystem:14,localBody:3,localNavTarget:2,x:5500,y:3200,landed:true,speed:260,vx:80,vy:30,localCruise:{from:3,to:2,stopX:4500,stopY:2200},minerals:{iron:7},equipment:{id:'owned-engine'},localContracts:[{id:9,tons:40,pay:800}]});
 const before=plain({x:state.x,y:state.y,latinum:state.latinum,minerals:state.minerals,equipment:state.equipment,localContracts:state.localContracts,population:state.planetPopulationCounts});
 catalog.initialize(state);
 assert.equal(state.localSystemVersion,2);assert.equal(state.localBody,0);assert.equal(state.localNavTarget,0);assert.equal(state.localCruise,null);assert.equal(state.landed,false);assert.equal(state.speed,0);
 assert.deepEqual(plain({x:state.x,y:state.y,latinum:state.latinum,minerals:state.minerals,equipment:state.equipment,localContracts:state.localContracts,population:state.planetPopulationCounts}),before);
 const again=plain(state);catalog.initialize(again);assert.deepEqual(plain(again),plain(state));
});
test('version-1 saves keep supported bodies, active courses and target selections through the revision',()=>{
 const {catalog,state}=fixture();
 Object.assign(state,{system:12,localSystemVersion:1,localBodySystem:12,localBody:1,localNavTarget:3,localCruise:{from:1,to:3,stopX:5500,stopY:2000},x:900,y:-700});
 const before=plain(state.localCruise);catalog.initialize(state);
 assert.equal(state.localSystemVersion,2);assert.equal(state.localBody,1);assert.equal(state.localNavTarget,3);assert.deepEqual(plain(state.localCruise),before);assert.equal(state.x,900);assert.equal(state.y,-700);
 state.system=30;state.localBodySystem=30;state.localSystemVersion=1;state.localBody=1;state.localNavTarget=0;state.localCruise=null;
 catalog.initialize(state);assert.equal(state.localBody,1);assert.equal(state.localNavTarget,0);assert.equal(catalog.current(state).name,'Remus');
});

test('Andor uses the production name while canonical unnamed bodies expose their game survey names honestly',()=>{
 const {catalog,state}=fixture();const before=plain(state),andoria=catalog.bodies(25),moon=andoria.find(b=>b.legacyWorldId===25),giant=andoria.find(b=>b.id===moon.parentId);
 assert.equal(giant.name,'Andor');assert.equal(giant.evidence,'production_reference');assert.match(catalog.evidenceLabel(giant),/Production\/reference/);
 assert.deepEqual(plain([giant.x,giant.y]),[-1500,-900]);
 for(const id of [12,31,47])for(const b of catalog.bodies(id).filter(b=>b.nameEvidence==='authored')){
  assert.match(catalog.evidenceLabel(b),/Game survey name/);assert.match(b.description,/game|Vexed Mirror/i);assert.equal(b.port,false);
 }
 assert.equal(catalog.bodies(1).find(b=>b.name==='Haumea').art,'assets/system-planets/haumea-v2.webp');
 assert.deepEqual(plain(state),before,'Reviewing new names cannot change a save or grant resources');
});

test('Halka is appended as a reachable inhabited system, preserving all original IDs and identifying the three authored neighbors',()=>{
 const {window,catalog,state,load}=fixture(),world=window.VexedMirrorWorld.systems.find(s=>s.id===53),bodies=catalog.bodies(53);
 assert.equal(world.name,'Halka');assert.ok(world.charted&&Number.isFinite(world.mapPosition.x));assert.equal(world.strength,0);
 assert.match(world.populationEvidence,/Game estimate/);assert.match(world.description,/Mirror, Mirror/);assert.match(world.description,/refuses/);
 assert.deepEqual(plain(world.planetShopItemIds),[]);assert.deepEqual(plain(world.weaponShopItemIds),[]);
 assert.deepEqual(plain(bodies.map(b=>b.name)),['Halkan homeworld','Serevan','Tharn','Lethan','Halka A']);
 assert.equal(bodies[0].evidence,'screen');assert.equal(bodies[0].legacyWorldId,53);assert.equal(bodies[2].parentId,0);
 assert.equal(bodies.filter(b=>b.evidence==='authored').length,3);assert.ok(bodies.filter(b=>b.evidence==='authored').every(b=>!b.port));
 window.nativePopulation={initialize(s){s.planetPopulationCounts||={};}};
 window.nativeShipDefinitions={registered:()=>[],forEntity:()=>({speedOrOtherStationValue:95,antimatterUseOrPopulationEffect:2})};
 Object.assign(state,{system:1,shipType:7,faction:0,antimatter:100,nav:100,discovered:[1,53],devMode:false});
 const oldPopulations=plain(state.planetPopulations);delete state.planetPopulations[53];
 load('native-navigation.js');window.nativeNavigation.initialize(state);
 window.nativeNavigation.attach({getGame:()=>state,isBusy:()=>false});
 const nav=window.nativeNavigation.call('state',53);assert.ok(nav.nodes.some(n=>n.id===53&&n.name==='Halka'));assert.ok(nav.selected.canTravel);
 for(let id=1;id<=52;id++)assert.equal(state.planetPopulations[id],oldPopulations[id]);
 assert.equal(state.planetPopulations[53],world.populationBillions);
 state.system=53;catalog.initialize(state);assert.equal(catalog.current(state).name,'Halkan homeworld');assert.ok(catalog.current(state).population>0);
 const reloaded=plain(state);catalog.initialize(reloaded);assert.equal(catalog.current(reloaded).legacyWorldId,53);
});
