const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.join(__dirname,'..'),game=path.join(root,'html-games/broken-mirror-port');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/system-layout-v1.json'),'utf8'));
const layout=JSON.parse(fs.readFileSync(path.join(root,'tools/system-layout.json'),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
function catalogFixture(){const window={};const context=vm.createContext({window});const load=file=>vm.runInContext(fs.readFileSync(path.join(game,file),'utf8'),context);for(const f of ['world-data.js','system-catalog-data.js','system-catalog.js'])load(f);window.nativeSystemHub={sol:window.nativeSystemCatalog.bodies(1)};window.vexedSolFlight={shipPosition:s=>({x:s.x,y:s.y})};load('manual-flight.js');return {window,load};}
test('all original destinations and Halka remain fixed while exactly the latest 38 receive the reviewed layout',()=>{
 const {window:w}=catalogFixture();let moved=0;
 for(const s of w.VexedMirrorWorld.systems){const old=baseline.positions[s.id];if(s.id<=53)assert.deepEqual(plain(s.mapPosition),old,s.name);else{const p=layout.positions.find(p=>p.id===s.id);assert.deepEqual(plain(s.mapPosition),{x:p.x,y:p.y});assert.notDeepEqual(plain(s.mapPosition),old);moved++;}}
 assert.equal(moved,38);assert.equal(w.VexedMirrorWorld.chartLayoutVersion,2);
 const points=w.VexedMirrorWorld.systems.filter(s=>s.id!==30).map(s=>({id:s.id,p:w.nativeManualFlight.chartPosition(s.id)}));
 for(const a of points.filter(s=>s.id>=54))for(const b of points.filter(s=>s.id!==a.id))assert.ok(Math.hypot(a.p.x-b.p.x,a.p.y-b.p.y)>=24,`${a.id} crowded by ${b.id}`);
});
test('source-supported regional relationships survive the blended projection without inventing exact coordinates',()=>{
 const {window:w}=catalogFixture(),p=id=>w.nativeManualFlight.chartPosition(id),d=(a,b)=>Math.hypot(p(a).x-p(b).x,p(a).y-p(b).y);
 for(const [a,b,max] of [[54,18,60],[90,14,60],[91,14,60],[73,47,65],[73,50,65],[77,38,50],[86,77,60],[87,12,80],[87,25,80],[55,1,100],[58,1,100],[71,1,100],[82,1,100]])assert.ok(d(a,b)<max,`${a} must remain in ${b}'s neighborhood`);
 assert.ok(d(79,47)>200,'The Gamma colony cannot appear adjacent to Bajor');assert.ok(d(79,83)>400,'Gamma Trianguli sector is not the Gamma Quadrant');
 assert.ok(layout.positions.every(p=>p.rationale&&p.evidence&&p.sourceRefs.every(ref=>layout.sources[ref])));
});
test('all 91 asteroid fields retain their exact pre-layout positions, rewards, identities and depletion keys',async()=>{
 const f=await fixture({regional:true,full:false,economic:false});
 for(const s of f.window.VexedMirrorWorld.systems){const hash=createHash('sha256').update(JSON.stringify(f.window.nativeSolAsteroids.forSystem(s.id).map(r=>r.slotId<262?(({width,height,...rock})=>rock)(r):r))).digest('hex');assert.equal(hash,baseline.fieldHashes[s.id],s.name);}
 assert.equal(f.window.nativeSolAsteroids.metrics().images,0);
 assert.notDeepEqual(plain(f.window.nativeRegionalMinerals.position(55)),plain(f.window.nativeRegionalMinerals.geologyPosition(55)));
});
test('old local navigation selections and holdings survive layout initialization and new quotes use the moved anchors',()=>{
 const {window:w,load}=catalogFixture();w.nativePopulation={initialize(s){s.planetPopulationCounts=Object.fromEntries(Object.entries(s.planetPopulations).map(([id,n])=>[id,n*1e9]));}};w.nativeShipDefinitions={registered:()=>[],forEntity:()=>({speedOrOtherStationValue:95,antimatterUseOrPopulationEffect:2,warpSpeedMultiplier:1})};load('native-navigation.js');
 const s={system:54,shipType:7,faction:0,devMode:false,x:123,y:-80,localBody:100,localNavTarget:101,localBodySystem:54,localSystemVersion:2,discovered:[1,54,55],latinum:777,antimatter:100,nav:100,shipEquipment:{owned:'keep'},minedAsteroids:[5400001],planetPopulations:{54:0}};
 const before=plain(s);w.nativeNavigation.initialize(s);for(const k of ['system','x','y','localBody','localNavTarget','latinum','antimatter','shipEquipment','minedAsteroids'])assert.deepEqual(plain(s[k]),before[k],k);
 w.nativeNavigation.attach({getGame:()=>s,isBusy:()=>false});const quote=w.nativeNavigation.call('state',55).selected,a=w.nativeManualFlight.chartPosition(54),b=w.nativeManualFlight.chartPosition(55),days=Math.floor((Math.abs(a.x-b.x)+Math.abs(a.y-b.y))/5);
 assert.equal(quote.travelDays,days);assert.equal(quote.fuel,Math.floor(days/2/3));assert.ok(quote.canTravel);assert.ok(Number.isFinite(w.nativeManualFlight.guidance(s,55).distance));
});
test('a paid old-layout delivery rebases chart endpoints once while retaining cargo, escrow, progress, deadlines and exactly-once payment',async()=>{
 const f=await fixture({regional:true,full:false,economic:false}),{state:s,ship,lives,window:w}=f;
 // Recreate the old chart through the same shared owners before taking a save.
 for(const system of w.VexedMirrorWorld.systems)if(system.id>=54)system.mapPosition=plain(baseline.positions[system.id]);
 const source=lives.market(s,1,3),destination=lives.market(s,55);source.stock[5]=20;destination.stock[5]=0;destination.target[5]=50;destination.credits=10000;
 const order=lives.startDelivery(s,ship.id,{fromSystem:1,fromPort:3,toSystem:55,good:5,tons:4});assert.ok(order.ok);
 for(let i=0;i<18000&&!ship.journey;i++)f.step();assert.ok(ship.journey,'The delivery must physically load and launch');
 for(let i=0;i<30;i++)f.step();
 const saved=plain(s);delete saved.civilianTraffic.life.chartLayoutVersion;
 const old=plain(saved.civilianTraffic.ships[0]),treasury=destination.credits,funds=destination.fundsReserved,payment=old.task.agreement.payment;
 const restored=await fixture({saved,regional:true,economic:false}),r=restored.ship,j=r.journey;
 assert.ok(j);for(const key of ['departedAt','duration','arrivalAt','progress','from','to','route','elapsedDays'])assert.deepEqual(plain(j[key]),old.journey[key],key);
 assert.deepEqual(plain(r.cargo),old.cargo);assert.equal(r.credits,old.credits);assert.equal(r.nextActionAt,old.nextActionAt);assert.deepEqual(plain(r.task.agreement),old.task.agreement);
 const anchor=restored.window.nativeManualFlight.anchor(55);assert.deepEqual(plain(j.galaxyTo),{x:anchor.x+j.to.x,y:anchor.y+j.to.y});assert.notDeepEqual(plain(j.galaxyTo),old.journey.galaxyTo);
 assert.equal(restored.lives.market(restored.state,55).fundsReserved,funds);
 const once=JSON.stringify(j);restored.lives.initialize(restored.state);assert.equal(JSON.stringify(r.journey),once,'Reconciliation must be idempotent');
 for(let i=0;i<36000&&!r.deliveries;i++)restored.step();assert.equal(r.deliveries,1);assert.equal(restored.lives.market(restored.state,55).credits,treasury-payment);assert.equal(restored.lives.market(restored.state,55).fundsReserved,0);assert.equal(restored.lives.market(restored.state,55).stock[5],4);
});
