const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.join(__dirname,'../html-games/broken-mirror-port'),copy=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function setup(ids=['earth-roadster']){
 const f=await fixture({full:false,economic:false,physics:true}),w=f.window,s=f.state;
 for(const name of ['system-catalog-data.js','system-catalog.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),f.context,{filename:name});
 w.nativeSystemHub.sol=w.nativeSystemCatalog.bodies(1);
 for(const name of ['sol-flight.js','collectable-sites.js','collectables.js','collectable-motion.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),f.context,{filename:name});
 s.devMode=false;s.civilianTraffic.ships=[];s.solEconomy.freighters=[];s.minedAsteroids=w.nativeSolAsteroids.placements.map(r=>r.slotId);
 s.collectables=w.nativeCollectables.catalog.filter(i=>!ids.includes(i.id)).map(i=>({id:i.id}));
 w.nativeCollectableMotion.initialize(s);
 for(const p of Object.values(s.collectableMotion.items))Object.assign(p,{x:0,y:0,heading:-Math.PI/2,vx:0,vy:0,angularVelocity:0,at:0});
 Object.assign(s,{x:-100,y:0,angle:0,speed:200,vx:200,vy:0,previousX:-100,previousY:0,dimensions:{width:20,height:20}});
 w.nativeShipSystems.invalidate(s);
 return {...f,w,s,m:w.nativeCollectableMotion};
}
function tick(f,dt=1/60,{player=true}={}){
 const {w,s,m}=f;w.nativeSimulation.advance(s,dt);m.advance(s,dt);
 if(player)w.nativeShipSystems.move(s,s,'player',{coast:true},{maxSpeed:Infinity,damping:0,turnRate:0},dt);
 m.collide(s,dt);
}

test('real contact dispatch conserves momentum and pushes a light pickup more than a heavy wreck',async()=>{
 const speeds=[];
 for(const id of ['earth-roadster','earth-conestoga']){
  const f=await setup([id]),{w,s,m}=f,item=w.nativeCollectables.get(id),mass=w.nativeShipMotion.shipMass(w.nativeShipDefinitions.describe(s));
  const before=copy({hull:s.hull,shields:s.shields,items:s.collectables});tick(f,1);
  const pose=s.collectableMotion.items[id];assert.ok(pose.vx>0);assert.ok(s.vx<200);
  near(mass*s.vx+item.mass*pose.vx,mass*200);near(mass*s.vy+item.mass*pose.vy,0);
  assert.deepEqual(copy({hull:s.hull,shields:s.shields,items:s.collectables}),before);
  assert.equal(m.snapshot(s).contacts.length,1);assert.equal(m.snapshot(s).contacts[0].category,'player');speeds.push(pose.vx);
 }
 assert.ok(speeds[0]>speeds[1]*3,speeds);
});

test('glancing hits change spin direction with impact side and faster hits transfer more motion',async()=>{
 const results=[];
 for(const [offset,speed] of [[4,100],[-4,100],[4,250]]){
  const f=await setup(),{s}=f;Object.assign(s,{y:offset,previousY:offset,vx:speed,speed});tick(f,2);
  const p=s.collectableMotion.items['earth-roadster'];assert.ok(Math.abs(p.angularVelocity)>.01,p.angularVelocity);results.push(copy(p));
 }
 assert.ok(results[0].angularVelocity*results[1].angularVelocity<0);near(results[0].angularVelocity,-results[1].angularVelocity);
 assert.ok(Math.abs(results[2].angularVelocity)>Math.abs(results[0].angularVelocity)*2);
});

test('fast swept rams cannot tunnel through a pickup, which settles at its new location and remains stopped',async()=>{
 const f=await setup(),{s,w,m}=f;Object.assign(s,{x:-1000,previousX:-1000,vx:2000,speed:2000});tick(f,1);
 assert.equal(m.snapshot(s).contacts.length,1);const p=s.collectableMotion.items['earth-roadster'],before=copy(p);
 // Move clear so the artifact can slow naturally without another impact.
 s.x=-100000;s.previousX=s.x;s.speed=s.vx=s.vy=0;w.nativeShipSystems.refreshShip(s,s,'player',1);
 w.nativeSimulation.advance(s,30);m.advance(s,30);assert.equal(p.vx,0);assert.equal(p.vy,0);assert.equal(p.angularVelocity,0);
 assert.ok(p.x>before.x&&p.x-before.x<before.vx*5);const stopped={x:p.x,y:p.y,heading:p.heading};
 w.nativeSimulation.advance(s,60);m.advance(s,60);assert.deepEqual({x:p.x,y:p.y,heading:p.heading},stopped);
 const saved=copy(s),restored=await setup();Object.assign(restored.s,saved);
 assert.deepEqual(copy(w.nativeCollectables.available(s)),copy(restored.w.nativeCollectables.available(restored.s)));
 w.nativePause.active=true;const paused=JSON.stringify(s);m.advance(s,3);m.collide(s,3);assert.equal(JSON.stringify(s),paused);
});

test('mid-slowdown reload, small steps and an unattended sample reach the same finite resting pose',async()=>{
 const f=await setup(),{s,w,m}=f;s.y=4;s.previousY=4;tick(f,1);
 const p=s.collectableMotion.items['earth-roadster'],first=copy(p);assert.equal(p.settling,true);
 s.x=-100000;s.previousX=s.x;w.nativeShipMotion.stop(s);w.nativeShipSystems.refreshShip(s,s,'player',1);
 w.nativeSimulation.advance(s,1.5);m.advance(s,1.5);
 assert.ok(Math.hypot(p.vx,p.vy)<Math.hypot(first.vx,first.vy));assert.ok(Math.abs(p.angularVelocity)<Math.abs(first.angularVelocity));
 const saved=copy(s),g=await setup();Object.assign(g.s,saved);
 const before=JSON.stringify(s);w.nativeCollectables.available(s);assert.equal(JSON.stringify(s),before);
 for(let i=0;i<120;i++){w.nativeSimulation.advance(s,.25);m.advance(s,.25);}
 g.w.nativeSimulation.advance(g.s,30);g.m.advance(g.s,30);
 const other=g.s.collectableMotion.items['earth-roadster'];near(p.x,other.x);near(p.y,other.y);near(p.heading,other.heading);
 assert.equal(p.vx,0);assert.equal(p.vy,0);assert.equal(p.angularVelocity,0);assert.equal(other.vx,0);assert.equal(other.angularVelocity,0);
});

test('a stopped artifact can be pushed again and settles again without resetting to its spawn',async()=>{
 const f=await setup(),{s,w,m}=f,p=s.collectableMotion.items['earth-roadster'];p.settling=true;tick(f,1);assert.ok(p.vx>0);
 s.x=-100000;s.previousX=s.x;w.nativeShipMotion.stop(s);w.nativeSimulation.advance(s,30);m.advance(s,30);assert.equal(p.vx,0);
 const atRest=p.x;Object.assign(s,{x:p.x-100,y:p.y+3,previousX:p.x-100,previousY:p.y+3,vx:200,vy:0,speed:200,angle:0});w.nativeShipSystems.invalidate(s);
 tick(f,1);assert.ok(p.vx>0);assert.ok(p.x>atRest);assert.equal(p.settling,true);
});

test('NPC hulls physically deflect artifacts through the same registry as the player',async()=>{
 const f=await setup(),{w,s,m}=f;const npc={id:9,shipType:7,system:1,phase:'waiting',x:100,y:3,previousX:-100,previousY:3,heading:0,vx:200,vy:0,speed:200,hull:100,shields:0,dimensions:{width:20,height:20}};
 s.x=1000;s.previousX=1000;s.speed=s.vx=0;s.civilianTraffic.ships=[npc];w.nativeShipSystems.invalidate(s);
 w.nativeSimulation.advance(s,1);m.advance(s,1);m.collide(s,1);
 assert.equal(m.snapshot(s).contacts[0].category,'civilian');assert.ok(s.collectableMotion.items['earth-roadster'].vx>0);assert.ok(npc.vx<200);
 assert.ok(Math.abs(s.collectableMotion.items['earth-roadster'].angularVelocity)>.01);assert.equal(npc.hull,100);
});

test('a surviving disabled player hull still physically contacts a moving artifact',async()=>{
 const f=await setup(),{s,w,m}=f;s.phase='disabled';s.hull=10;s.x=0;s.previousX=0;s.speed=s.vx=0;
 const p=s.collectableMotion.items['earth-roadster'];Object.assign(p,{x:-100,vx:200});
 w.nativeShipSystems.invalidate(s);tick(f,1,{player:false});
 assert.ok(m.snapshot(s).contacts.some(c=>c.category==='player'));assert.ok(s.vx>0);assert.ok(p.vx<200);assert.equal(s.hull,10);
});

test('pickup pairs exchange impulses, and asteroid contact persists in the existing rock owner',async()=>{
 const f=await setup(['earth-roadster','earth-vanguard-1']),{w,s,m}=f;
 s.x=1000;s.previousX=s.x;s.speed=s.vx=0;
 Object.assign(s.collectableMotion.items['earth-roadster'],{x:-30,vx:60});Object.assign(s.collectableMotion.items['earth-vanguard-1'],{x:30,vx:-60});
 tick(f,.5,{player:false});assert.ok(m.snapshot(s).contacts.some(c=>c.category==='collectable'));
 near(s.collectableMotion.items['earth-roadster'].vx+s.collectableMotion.items['earth-vanguard-1'].vx,0);
 assert.ok(s.collectableMotion.items['earth-roadster'].vx<0);
 const g=await setup(),rock=g.w.nativeSolAsteroids.placements[0],p=g.s.collectableMotion.items['earth-roadster'];
 g.s.minedAsteroids=g.s.minedAsteroids.filter(id=>id!==rock.slotId);g.w.nativeShipSystems.invalidate(g.s);
 Object.assign(g.s,{x:rock.x+1000,y:rock.y,previousX:rock.x+1000,vx:0,speed:0});Object.assign(p,{x:rock.x-100,y:rock.y,vx:200});
 tick(g,1,{player:false});assert.ok(g.m.snapshot(g.s).contacts.some(c=>c.category==='asteroid'));
 const moved=g.s.asteroidMotion.rocks[rock.slotId];assert.ok(moved&&moved.vx>0);assert.ok(p.vx<200);
});

test('legacy Earth exhibits relocate only unowned items while retaining the exact saved manifest',async()=>{
 for(const version of [1,2]){
  const {w,s,m}=await setup();s.shipSimulation.seconds=987.5;s.collectableMotion.version=version;
  const manifest=JSON.stringify(s.collectables),before=JSON.stringify(s);w.nativeCollectables.available(s);assert.equal(JSON.stringify(s),before);
  m.initialize(s);assert.equal(s.collectableMotion.version,3);assert.equal(s.collectableMotion.layout,1);assert.equal(JSON.stringify(s.collectables),manifest);
  const p=s.collectableMotion.items['earth-roadster'],seed=w.nativeCollectables.spawn('earth-roadster');near(p.x,seed.x);near(p.y,seed.y);assert.ok(Math.hypot(p.x,p.y)>100000);
  assert.equal(w.nativeCollectables.available(s).length,1);const migrated=JSON.stringify(s);m.initialize(s);assert.equal(JSON.stringify(s),migrated);
 }
});

test('normal galactic saves retain displaced poses and settling across coordinate frames and reload',async()=>{
 const {s,w,m}=await setup(),record=s.collectableMotion.items['earth-roadster'];
 Object.assign(record,{x:182000.125,y:-90100.25,vx:4,vy:3,angularVelocity:.6,settling:true});
 const saved=copy(s);s.system=31;const origin=w.nativeManualFlight.anchor(31),item=w.nativeCollectables.available(s)[0];
 near(item.gx,record.x);near(item.gy,record.y);near(item.x,record.x-origin.x);near(item.y,record.y-origin.y);
 m.initialize(s);assert.deepEqual(copy(record),saved.collectableMotion.items['earth-roadster']);
 const restored=await setup();Object.assign(restored.s,saved);restored.m.initialize(restored.s);assert.deepEqual(copy(restored.s.collectableMotion),saved.collectableMotion);
 w.nativeSimulation.advance(s,30);m.advance(s,30);assert.equal(record.vx,0);assert.equal(record.vy,0);assert.equal(record.angularVelocity,0);
});

test('distant relics do not query remote collision geometry from the observer frame',async()=>{
 const {s,w,m}=await setup(),record=s.collectableMotion.items['earth-roadster'];Object.assign(record,w.nativeCollectables.spawn('earth-roadster'));
 const systems=w.nativeShipSystems;let queries=0;w.nativeShipSystems={...systems,query(...args){queries++;return systems.query(...args);}};
 w.nativeSimulation.advance(s,1/60);m.advance(s,1/60);m.collide(s,1/60);assert.equal(queries,0);
});

test('contacts in another system store global impulses without shifting a relic on observer rebase',async()=>{
 const f=await setup(),{s,w,m}=f;s.system=14;s.localBody=0;
 const origin=w.nativeManualFlight.anchor(14),p=s.collectableMotion.items['earth-roadster'];Object.assign(p,{x:origin.x,y:origin.y});
 Object.assign(s,{x:-100,y:0,previousX:-100,previousY:0,vx:200,vy:0,speed:200});
 s.minedAsteroids.push(...w.nativeSolAsteroids.forSystem(14).map(r=>r.slotId));w.nativeShipSystems.invalidate(s);tick(f,1);
 assert.ok(p.x>origin.x);assert.ok(p.vx>0);assert.equal(m.snapshot(s).contacts[0].category,'player');
 const before={x:p.x,y:p.y};w.nativeManualFlight.enter(s,w.VexedMirrorWorld.systems.find(system=>system.id===31));
 const view=w.nativeCollectables.available(s)[0];near(view.gx,before.x);near(view.gy,before.y);near(view.x,before.x-w.nativeManualFlight.anchor(31).x);
});
