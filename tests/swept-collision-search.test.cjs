const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.resolve(__dirname,'..');
async function setup(){
  const f=await fixture({regional:true,access:true,full:false,economic:false}),w=f.window,s=f.state;
  Object.assign(s,{system:43,x:0,y:0,previousX:0,previousY:0,angle:0,vx:0,vy:0,speed:0});
  s.solEconomy.freighters=[];s.civilianTraffic.ships=[];
  w.nativePlayerCombat={visualImpact(){}};
  for(const file of ['html-games/flashtrek-broken-mirror/debris-impacts.js','html-games/broken-mirror-port/explosion-impacts.js','html-games/broken-mirror-port/asteroid-motion.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),f.context,{filename:file});
  w.nativeAsteroidMotion.ensure(s);
  return f;
}
function npc(s,id,x,y,values={}){const ship={id,system:43,shipType:7,phase:'cruise',x,y,previousX:x,previousY:y,heading:0,vx:0,vy:0,hull:100,shields:100,...values};s.civilianTraffic.ships.push(ship);return ship;}
function distant(s,count=1000){for(let i=0;i<count;i++)npc(s,1000+i,10000+i*40,10000);}

test('ordinary beam fire and resolution do not assemble a full scene or replay damage after restore',async()=>{
  const {window:w,state:s}=await setup();distant(s);npc(s,2,-200,0);
  const frame=w.nativeSimulationFrame.begin(s),source=w.nativeShipSystems.resolve(s,'player'),target=w.nativeShipSystems.resolve(s,2);
  let applications=0;w.nativeShipSystems.register('civilian',{collect:()=>s.civilianTraffic.ships.map(entity=>w.nativeShipDefinitions.describe(s,entity,{category:'civilian'})),hit:()=>{applications++;return {ok:true};}});
  const shot=w.nativeCombatShots.fireFor({state:s,shooter:source,target});assert.equal(shot.ok,true);
  w.nativeSimulation.advance(s,.08);w.nativeCombatShots.advance(s,.08);
  assert.equal(applications,1);assert.equal(frame.counters.sceneCollections||0,0);
  const saved=JSON.parse(JSON.stringify(s));w.nativeCombatShots.restore(saved);w.nativeSimulation.advance(saved,.01);w.nativeCombatShots.advance(saved,.01);
  assert.equal(applications,1);assert.ok(frame.counters.beamCandidates<8,JSON.stringify(frame.counters));
});

test('a short shot exact-tests nearby geometry instead of every distant ship and asteroid',async()=>{
  const {window:w,state:s}=await setup();distant(s);const target=npc(s,2,200,0),frame=w.nativeSimulationFrame.begin(s);
  const scene=w.nativeShipSystems.scene(s),d=w.nativeShipSystems.resolve(s,target.id),source=w.nativeShipSystems.resolve(s,'player');
  const hit=w.nativeWeaponRules.firstContact({x:0,y:0},{x:240,y:0},source,d,scene,d.radii,d.dimensions);
  assert.equal(hit.target.id,2);assert.ok(frame.counters.projectileCandidates<8,JSON.stringify(frame.counters));
  assert.ok(scene.bystanders.length>1000,'the population remains present');
});

test('projectile launch eligibility retains the existing clearance around a very small blocker',async()=>{
  const {window:w,state:s}=await setup();npc(s,2,200,0);
  w.nativeShipSystems.register('tiny',{collect:()=>[{id:'tiny-blocker',system:43,x:80,y:9,radius:1}],hit:()=>({ok:true})});
  w.nativeSimulationFrame.begin(s);const source=w.nativeShipSystems.resolve(s,'player'),target=w.nativeShipSystems.resolve(s,2),scene=w.nativeShipSystems.collisionScene(s);
  const spec=w.nativeWeaponRules.weaponSpec({name:'Disruptor',damage:1,recharge:2},'disruptor');
  assert.equal(w.nativeWeaponRules.firingStatus(source,target,spec,'disruptor',scene).reason,'blocked');
});

test('swept searches retain fast intervening ships whose final positions lie outside the firing line',async()=>{
  const {window:w,state:s}=await setup();distant(s);
  npc(s,2,50,1000,{previousY:-1000,vy:2000});w.nativeSimulationFrame.begin(s);
  const hit=w.nativeWeaponRules.firstContact({x:0,y:0},{x:100,y:0},{id:'player'},null,w.nativeShipSystems.scene(s));
  assert.equal(hit.target.id,2);assert.ok(hit.t>0&&hit.t<1);
  assert.ok(w.nativeSimulationFrame.snapshot(s).counters.projectileCandidates<5);
});

test('conservative ship bounds retain long rotating hulls and instantaneous beams use the current pose',async()=>{
  const {window:w,state:s}=await setup();
  const ship=npc(s,2,80,50,{dimensions:{width:20,height:180},heading:Math.PI/2});w.nativeSimulationFrame.begin(s);
  let scene=w.nativeShipSystems.scene(s),candidate=w.nativeShipSystems.resolve(s,2);
  assert.ok(scene.querySwept({x:0,y:0},{x:160,y:0},0,{instant:true}).bystanders.some(t=>t.id===2),'broad phase covers every orientation using maximum shared radii');
  assert.equal(w.nativeWeaponRules.firstContact({x:0,y:0},{x:160,y:0},{id:'player'},candidate,scene,candidate.radii,candidate.dimensions,0,{instant:true}).target.id,2);
  Object.assign(ship,{heading:0});w.nativeShipSystems.refreshShip(s,ship,'civilian');scene=w.nativeShipSystems.scene(s);candidate=w.nativeShipSystems.resolve(s,2);
  const hit=w.nativeWeaponRules.firstContact({x:0,y:0},{x:160,y:0},{id:'player'},candidate,scene,candidate.radii,candidate.dimensions,0,{instant:true});
  assert.equal(hit,null,'rotation updates the exact current surface without retaining the prior hit');
});

test('the asteroid spatial owner retains crossing and forecast rocks across multiple grid cells',async()=>{
  const {window:w}=await setup(),rocks=w.nativeSolAsteroids,rock=rocks.forSystem(43)[0],bounds={minX:0,minY:-2,maxX:100,maxY:2};
  rocks.relocate(rock,{x:50,y:2200,previousX:50,previousY:-2200,angle:0,vy:4400});
  assert.ok(rocks.queryBounds(43,bounds,{swept:true}).includes(rock));
  assert.ok(!rocks.queryBounds(43,bounds,{swept:false}).includes(rock));
  rocks.relocate(rock,{x:50,y:2200,previousX:50,previousY:2200,angle:0,vy:-4400});
  assert.ok(rocks.queryBounds(43,bounds,{swept:false,predictSeconds:.6}).includes(rock));
  rocks.relocate(rock,{x:50,y:2200,previousX:50,previousY:2200,angle:0,vy:0});
  assert.ok(!rocks.queryBounds(43,bounds,{swept:true}).includes(rock));
});

test('public asteroid field insertion and removal reconcile the shared spatial index without ghost objects',async()=>{
  const {window:w,state:s}=await setup(),owner=w.nativeSolAsteroids,field=owner.forSystem(43),bounds={minX:0,minY:-2,maxX:160,maxY:2};
  const rock={...field[0],slotId:4399991,system:43,x:80,y:0,previousX:80,previousY:0,vx:0,vy:0,size:35};
  field.push(rock);
  assert.ok(owner.queryBounds(43,bounds).includes(rock),'same public array insertion is indexed lazily');
  assert.strictEqual(owner.find(rock.slotId,43),rock);assert.ok(owner.nearby(43,rock,1).includes(rock));
  const contact=w.nativeWeaponRules.firstContact({x:0,y:0},{x:160,y:0},{id:'player'},null,w.nativeShipSystems.collisionScene(s),undefined,undefined,0,{instant:true});
  assert.equal(contact.target.rockId,rock.slotId,'an inserted rock physically intercepts the firing line');
  field.splice(field.indexOf(rock),1);
  assert.equal(owner.find(rock.slotId,43),null);assert.ok(!owner.queryBounds(43,bounds).includes(rock));
  owner.relocate(rock,{x:80,y:1000,previousX:80,previousY:-1000,vy:2000,angle:0});
  assert.ok(!owner.queryBounds(43,bounds).includes(rock),'cleanup cannot reinsert a removed moving object');
  assert.ok(!owner.nearby(43,rock,1).includes(rock));
});

test('explicit shared invalidation reconciles same-length asteroid replacement and direct geometry edits',async()=>{
  const {window:w,state:s}=await setup(),owner=w.nativeSolAsteroids,field=owner.forSystem(43),original=field[0],bounds={minX:0,minY:-2,maxX:160,maxY:2};
  const replacement={...original,x:80,y:0,previousX:80,previousY:0,vx:0,vy:0,size:35};
  field[0]=replacement;w.nativeShipSystems.invalidate(s,43);
  assert.strictEqual(owner.find(original.slotId,43),replacement);assert.ok(owner.queryBounds(43,bounds).includes(replacement));
  owner.relocate(original,{x:80,y:0,previousX:80,previousY:0,angle:0});
  assert.ok(!owner.queryBounds(43,bounds).includes(original),'a replaced reference cannot re-enter the index');
  Object.assign(replacement,{x:80,y:1000,previousY:-1000,vy:2000,size:70});w.nativeShipSystems.invalidate(s,43);
  assert.ok(owner.queryBounds(43,bounds,{swept:true}).includes(replacement),'reconciliation retains real swept motion');
  assert.ok(!owner.queryBounds(43,bounds,{swept:false}).includes(replacement),'current geometry is no longer on the line');
  const changedId={...replacement,slotId:4399992,x:100,y:0,previousX:100,previousY:0,vy:0};
  field[0]=changedId;w.nativeShipSystems.invalidate(s,43);
  assert.equal(owner.find(original.slotId,43),null);assert.strictEqual(owner.find(changedId.slotId,43),changedId);
  assert.ok(owner.queryBounds(43,bounds).includes(changedId));
});

test('known ship membership changes rebuild ship views without invalidating unchanged asteroid indexes',async()=>{
  const {window:w,state:s}=await setup(),owner=w.nativeSolAsteroids;
  w.nativeSimulationFrame.begin(s);w.nativeShipSystems.scene(s);
  const builds=owner.metrics().indexBuilds,ship=npc(s,2,80,0);
  w.nativeShipSystems.refreshShip(s,ship,'civilian');
  const nearby=w.nativeShipSystems.query(s,{system:43,minX:0,minY:-20,maxX:160,maxY:20});
  assert.ok(nearby.bystanders.some(target=>target.id===2));
  assert.equal(owner.metrics().indexBuilds,builds,'ship-only cache fallback retains the valid asteroid index');
  w.nativeShipSystems.invalidateShips(s,43);
  assert.ok(w.nativeShipSystems.query(s,{system:43,minX:0,minY:-20,maxX:160,maxY:20}).bystanders.some(target=>target.id===2));
  assert.equal(owner.metrics().indexBuilds,builds,'known docking/drone membership changes retain the asteroid index');
});

test('legacy Sol fields reconcile edits without regional geology and ignore unknown empty systems',async()=>{
  const {window:w,state:s}=await fixture({regional:false,full:false,economic:false}),owner=w.nativeSolAsteroids,field=owner.forSystem(1),bounds={minX:99900,minY:99900,maxX:100100,maxY:100100};
  assert.strictEqual(field,owner.placements);
  const rock={...field[0],slotId:99991,system:1,x:100000,y:100000,previousX:100000,previousY:100000,size:35};
  field.push(rock);assert.ok(owner.queryBounds(1,bounds).includes(rock));assert.strictEqual(owner.find(rock.slotId,1),rock);
  const replacement={...rock,slotId:99992};field[field.indexOf(rock)]=replacement;w.nativeShipSystems.invalidate(s,1);
  assert.strictEqual(owner.find(replacement.slotId,1),replacement);assert.equal(owner.find(rock.slotId,1),null);
  field.splice(field.indexOf(replacement),1);assert.ok(!owner.nearby(1,replacement,1).includes(replacement));
  const builds=owner.metrics().indexBuilds;owner.forSystem(9999);owner.forSystem(9999);assert.equal(owner.metrics().indexBuilds,builds,'unknown systems do not repeatedly index fresh empty arrays');
});

test('switching saves clears old rock velocity and spin, then restores the saved motion exactly',async()=>{
  const {window:w,state:s}=await setup(),rock=w.nativeSolAsteroids.forSystem(43)[0],anchor={x:rock.x,y:rock.y,angle:rock.angle},clean=JSON.parse(JSON.stringify(s)),saved=JSON.parse(JSON.stringify(s));
  const pose={system:43,x:50,y:2200,angle:.3,vx:0,vy:-4400,spin:.7,at:w.nativeSimulation.seconds(s)};
  saved.asteroidMotion.rocks[rock.slotId]=pose;
  w.nativeAsteroidMotion.ensure(saved);assert.equal(rock.vy,-4400);assert.equal(rock.spin,.7);
  w.nativeAsteroidMotion.ensure(clean);
  assert.equal(rock.x,anchor.x);assert.equal(rock.y,anchor.y);assert.equal(rock.angle,anchor.angle);
  assert.equal(rock.vx,0);assert.equal(rock.vy,0);assert.equal(rock.spin,0);
  assert.equal(rock.previousX,anchor.x);assert.equal(rock.previousY,anchor.y);
  w.nativeAsteroidMotion.ensure(saved);
  for(const key of ['x','y','angle','vx','vy','spin'])assert.equal(rock[key],pose[key],key);
  assert.ok(w.nativeSolAsteroids.queryBounds(43,{minX:0,minY:-2,maxX:100,maxY:2},{swept:false,predictSeconds:.6}).includes(rock),'saved authoritative velocity is used in forecast bounds');
});

test('stationary spinning rocks refresh debris bodies without overwriting retained angle snapshots',async()=>{
  const {window:w,state:s}=await setup(),rock=w.nativeSolAsteroids.forSystem(43)[0],saved=JSON.parse(JSON.stringify(s));
  saved.asteroidMotion.rocks[rock.slotId]={system:43,x:120,y:0,angle:.3,vx:0,vy:0,spin:.7,at:w.nativeSimulation.seconds(s)};
  w.nativeAsteroidMotion.ensure(saved);
  const target={entity:rock,slotId:rock.slotId},piece={x:180,y:0,size:4,vx:240,vy:0,dt:.1},from={x:60,y:0},bodies=[],contact=w.nativeShipMotion.debrisContact;
  w.nativeShipMotion.debrisContact=(fragment,previous,body,type)=>{bodies.push(body);return contact(fragment,previous,body,type);};
  assert.ok(w.nativeAsteroidMotion.debrisContact(saved,piece,from,target,'asteroid'));
  w.nativeSimulation.advance(saved,.1);w.nativeAsteroidMotion.advance(saved,.1);
  const expected=w.nativeShipMotion.wrap(.3+w.nativeShipMotion.settleVelocity(.7,0,.1,2,.0001).x),result=w.nativeAsteroidMotion.debrisContact(saved,piece,from,target,'asteroid');
  assert.ok(result);assert.equal(bodies[0].angle,.3);assert.ok(Math.abs(bodies[1].angle-expected)<1e-12);
  assert.notStrictEqual(bodies[1],bodies[0],'a changed orientation creates a fresh immutable physical snapshot');
  w.nativeAsteroidMotion.debrisContact(saved,piece,from,target,'asteroid');assert.strictEqual(bodies[2],bodies[1],'unchanged physical data is still reused');
  w.nativeAsteroidMotion.resolveDebris(saved,piece,target,'asteroid',result);
  assert.ok(Math.abs(saved.asteroidMotion.rocks[rock.slotId].angle-expected)<1e-12,'contact resolution retains the current authoritative angle');
});

test('reused environmental rock adapters follow current position and size',async()=>{
  const {window:w,state:s}=await setup(),rock=w.nativeSolAsteroids.forSystem(43)[0],observed=[];
  rock.size=40;w.nativeSolAsteroids.relocate(rock,{x:120,y:0,angle:0});
  const motion=w.nativeAsteroidMotion;
  w.nativeAsteroidMotion={...motion,debrisContact:(state,piece,from,target,type)=>{if(type==='asteroid'&&target.slotId===rock.slotId)observed.push({target,x:target.x,y:target.y,radius:target.radius});return null;}};
  const piece={x:180,y:0,size:4,vx:240,vy:0,system:43};
  w.nativeEnvironmentalImpacts.debris(s,piece,60,0,{dt:.5});
  rock.size=70;w.nativeSolAsteroids.relocate(rock,{x:130,y:0,angle:.4});
  w.nativeEnvironmentalImpacts.debris(s,piece,60,0,{dt:.5});
  assert.equal(observed.length,2);assert.strictEqual(observed[0].target,observed[1].target,'the adapter is reused');
  assert.equal(observed[0].x,120);assert.equal(observed[0].radius,18);assert.equal(observed[1].x,130);assert.equal(observed[1].radius,31.5);
});

test('projectile awareness narrows before prediction and still sees a blocker entering the forecast path',async()=>{
  const {window:w,state:s}=await setup();distant(s);npc(s,2,300,0);npc(s,3,150,150,{vy:-340});
  const frame=w.nativeSimulationFrame.begin(s),scene=w.nativeShipSystems.scene(s),target=w.nativeShipSystems.resolve(s,2),event={x:0,y:0,vx:340,vy:0,radius:1.4,age:0,ttl:2,sourceId:'player'};
  assert.equal(w.nativeWeaponRules.projectileThreat(event,target,scene,1),null,'crossing ship intercepts before the threatened target');
  assert.ok(frame.counters.projectileCandidates<8,JSON.stringify(frame.counters));
});

test('debris spatial narrowing preserves rebound, knockback and exactly-once quarter-health damage',async()=>{
  const {window:w,state:s}=await setup();distant(s);const rock=w.nativeSolAsteroids.forSystem(43)[0];
  w.nativeSolAsteroids.relocate(rock,{x:120,y:0,angle:0});rock.maxHull=20;
  const frame=w.nativeSimulationFrame.begin(s),piece={x:180,y:0,size:4,vx:240,vy:0,system:43};
  w.nativeEnvironmentalImpacts.debris(s,piece,60,0,{dt:.5,sourceKey:'ship:civilian:999'});
  assert.ok(piece.vx<0,'actual fragment reflects');assert.ok(rock.vx>0,'rock receives momentum');assert.equal(s.asteroidDamage[rock.slotId],5);
  assert.ok(frame.counters.debrisCandidates<6,JSON.stringify(frame.counters));
  Object.assign(piece,{x:rock.x+60,y:rock.y,vx:240,vy:0});w.nativeEnvironmentalImpacts.debris(s,piece,rock.x-60,rock.y,{dt:.5,sourceKey:'ship:civilian:999'});
  assert.equal(s.asteroidDamage[rock.slotId],5,'one fragment never charges the same rock twice');
  assert.equal(s.asteroidOreDrops?.[rock.slotId],undefined);assert.equal(s.destroyedAsteroids.length,0);
});

test('a fragment first sampled outside its parent rebounds on its first return through that parent',async()=>{
  const {window:w,state:s}=await setup(),rock=w.nativeSolAsteroids.forSystem(43)[0];
  rock.maxHull=20;w.nativeSolAsteroids.relocate(rock,{x:120,y:0,angle:0});
  const piece={x:210,y:0,size:4,vx:60,vy:0,system:43},sourceKey='asteroid:'+rock.slotId;
  w.nativeEnvironmentalImpacts.debris(s,piece,180,0,{dt:.5,sourceKey});
  assert.equal(s.asteroidDamage?.[rock.slotId],undefined);assert.equal(piece.vx,60);
  piece.x=30;piece.vx=-360;
  w.nativeEnvironmentalImpacts.debris(s,piece,210,0,{dt:.5,sourceKey});
  assert.ok(piece.vx>0,'the first return is a physical reflection');assert.equal(s.asteroidDamage[rock.slotId],5);
});

test('ship-asteroid sweeps cover the full physical path beyond the former 1000-unit query cap',async()=>{
  const {window:w,state:s}=await setup(),rock=w.nativeSolAsteroids.forSystem(43)[0];
  w.nativeSolAsteroids.relocate(rock,{x:0,y:0,angle:0});
  Object.assign(s,{x:1500,previousX:-1500,y:0,previousY:0,vx:3000,vy:0,speed:3000});
  w.nativeSimulationFrame.begin(s);w.nativeAsteroidMotion.collide(s,1);
  assert.ok(w.nativeAsteroidMotion.snapshot().contacts.some(contact=>contact.rockId===rock.slotId));
  assert.ok(rock.vx>0);assert.equal(s.hull,100);assert.ok(!s.destroyedAsteroids.includes(rock.slotId));
});

test('current-grid expansion does not rescan a thousand distant movers for every local query',async()=>{
  const {window:w}=await fixture({regional:true,access:true,full:false,economic:false}),owner=w.nativeSolAsteroids,field=owner.forSystem(43),template=field[0];
  for(let i=0;i<1000;i++)field.push({...template,slotId:4395000+i,system:43,x:100000+i*1200,y:100000,previousX:99999+i*1200,previousY:100000,vx:1,vy:0,size:40});
  const nearby={...template,slotId:4399990,system:43,x:50,y:0,previousX:50,previousY:0,vx:0,vy:0,size:40};field.push(nearby);
  owner.forSystem(43);owner.prepareStep();const before=owner.metrics(),bounds={minX:0,minY:-2,maxX:100,maxY:2};
  assert.ok(before.summaryVisits>=1000);
  for(let i=0;i<100;i++)assert.ok(owner.queryBounds(43,bounds,{swept:true}).includes(nearby));
  const after=owner.metrics();assert.equal(after.broadphaseQueries-before.broadphaseQueries,100);
  assert.ok(after.broadphaseVisits-before.broadphaseVisits<=500,JSON.stringify({before,after}));
  assert.equal(after.summaryVisits,before.summaryVisits,'local queries do not enumerate the moving subset');
});

test('motion summaries grow after manual relocations and preserve crossing and forecast contacts',async()=>{
  const {window:w}=await fixture({regional:true,access:true,full:false,economic:false}),owner=w.nativeSolAsteroids,rock=owner.forSystem(43)[0],bounds={minX:0,minY:-2,maxX:100,maxY:2};
  owner.prepareStep();owner.relocate(rock,{x:50,y:4000,previousX:50,previousY:-4000,vx:0,vy:8000,angle:0});
  assert.ok(owner.queryBounds(43,bounds,{swept:true}).includes(rock),'a contact/relocation can enlarge the sweep after preparation');
  assert.ok(!owner.queryBounds(43,bounds,{swept:false}).includes(rock));
  owner.relocate(rock,{x:50,y:4000,previousX:50,previousY:4000,vx:0,vy:-8000,angle:0});owner.prepareStep();
  assert.ok(owner.queryBounds(43,bounds,{swept:false,predictSeconds:.6}).includes(rock));
  owner.relocate(rock,{x:50,y:4000,previousX:50,previousY:4000,vx:0,vy:0,angle:0});owner.prepareStep();
  assert.ok(!owner.queryBounds(43,bounds,{swept:true,predictSeconds:.6}).includes(rock));
});
