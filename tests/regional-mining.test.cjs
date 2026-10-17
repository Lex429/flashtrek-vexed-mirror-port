const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
function tick(f,seconds,dt=.25){for(let i=0;i<Math.ceil(seconds/dt);i++)f.step(dt);}
function money(f){return Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,s)=>n+s.credits,0)+(f.state.latinum||0);}

test('regional belts preserve the exact old Sol slots and generate stable unique IDs in every system',async()=>{
 const f=await fixture({regional:true}),rocks=f.window.nativeSolAsteroids,geo=f.window.nativeRegionalMinerals;
 const hash=crypto.createHash('sha256').update(JSON.stringify(rocks.placements.map(r=>[r.slotId,r.x,r.y,r.oreType,r.file,r.angle,r.size]))).digest('hex');
 assert.equal(hash,'e6e059e6925343acaa9e65493b732234832c93606b4111901ef34013f251f822','dcff370 Sol geometry and ore rewards');
 assert.equal(rocks.placements.length,262);assert.equal(rocks.metrics().builtSystems,0);
 const ids=new Set();
 for(const system of f.window.VexedMirrorWorld.systems){
  const field=rocks.forSystem(system.id),counts={};assert.ok(field.length>=144);assert.equal(rocks.forSystem(system.id),field);assert.equal(rocks.belts(system.id).length,2);
  for(const rock of field){assert.equal(rock.system,system.id);assert.ok(!ids.has(rock.slotId));ids.add(rock.slotId);assert.equal(rocks.find(rock.slotId),rock);counts[rock.oreType]=(counts[rock.oreType]||0)+1;}
  for(const type of ['trellium','tritanium','dilithium','gallicite'])assert.ok(counts[type]>0,`${system.name}: ${type}`);
  const p=geo.profile(system.id),main=Object.entries(p.weights).filter(([,n])=>n>=30).map(([ore])=>ore);
  if(main.length===1)assert.ok(counts[main[0]]/field.length>.5,`${system.name} main ore remains abundant`);
  if(system.id!==1)for(const rock of field)assert.ok(Math.hypot(rock.x+220,rock.y-75)>850);
 }
 assert.equal(rocks.metrics().images,0,'Distant geometry never requests artwork');
 assert.equal(geo.profile(43).key,'klingon');assert.equal(geo.profile(12).key,'vulcan');assert.equal(geo.profile(50).key,'cardassian');assert.equal(geo.profile(31).key,'romulan');assert.equal(geo.profile(14).key,'ferengi');assert.equal(geo.profile(34).key,'frontier');
 const frontier=rocks.forSystem(34).filter(r=>r.oreType==='benamite').length/rocks.forSystem(34).length;
 assert.ok(frontier>.02&&frontier<.05);assert.ok(rocks.nearby(43,{x:0,y:0},100).length===0);
});

test('remote player mining pauses, reloads midway and consumes one global ore entitlement',async()=>{
 let f=await fixture({regional:true,full:false,economic:false});const rock=f.window.nativeSolAsteroids.forSystem(43)[0];
 Object.assign(f.state,{system:43,shipType:7,x:rock.x-100,y:rock.y,miningTool:true});f.ship.phase='disabled';f.ship.nextActionAt=null;
 f.window.nativeAsteroidCombat.select(rock);assert.equal(f.window.nativeAsteroidCombat.mine(f.state,{x:f.state.x,y:f.state.y}).ok,true);
 tick(f,3,1/60);const midway=copy(f.state);f=await fixture({regional:true,saved:midway,economic:false});
 const clock=f.window.nativeSimulation.seconds(f.state);f.window.nativePause.active=true;tick(f,10);assert.equal(f.window.nativeSimulation.seconds(f.state),clock);f.window.nativePause.active=false;
 tick(f,6,1/60);assert.ok(f.state.minedAsteroids.includes(rock.slotId));assert.equal(f.state.asteroidOreDrops[rock.slotId],15);
 assert.equal(f.window.nativeAsteroidCombat.completeMining(f.state,rock.slotId).ok,false);assert.equal(f.state.minedAsteroids.filter(id=>id===rock.slotId).length,1);
 assert.ok(!f.state.minedAsteroids.includes(0));const restored=await fixture({regional:true,saved:copy(f.state),economic:false});assert.equal(restored.state.asteroidOreDrops[rock.slotId],15);
});

test('regional migration retains original tasks, cargo, poses, balances and depletion',async()=>{
 const original=s=>({id:s.id,x:s.x,y:s.y,cargo:s.cargo,credits:s.credits,task:s.task&&{id:s.task.id,status:s.task.status,phase:s.task.phase,origin:s.task.origin,destination:s.task.destination,requirements:s.task.requirements}});
 const old=await fixture();tick(old,30);const saved=copy(old.state),before=copy(saved.civilianTraffic.ships.map(original));
 saved.minedAsteroids=[0,35,100];const f=await fixture({regional:true,saved});
 assert.deepEqual(copy(f.state.civilianTraffic.ships.map(original)),before);
 assert.deepEqual(f.state.minedAsteroids,[0,35,100]);assert.equal(f.state.civilianTraffic.ships.length,159);assert.equal(f.lives.initialize(f.state).config.connectedSystems.length,52);
 assert.equal(f.lives.initialize(f.state).regionalVersion,1);assert.equal(new Set(f.state.civilianTraffic.ships.filter(s=>s.regionalResident).map(s=>s.operatingBase)).size,52);
});

test('funded local refining transfers money and converts only owned typed minerals to industrial ore',async()=>{
 const f=await fixture({regional:true,full:false,economic:false}),s=f.state;Object.assign(s,{system:43,latinum:2000,minerals:{dilithium:99,trellium:7,benamite:2},dilithium:5});
 const m=f.lives.market(s,43,0),before=money(f),stock=m.stock[0],quote=f.lives.mineralQuote(s,'trellium',0,3);
 assert.ok(f.lives.sellMineral(s,'trellium',0,3).ok);assert.equal(s.minerals.trellium,4);assert.equal(m.stock[0],stock+3);assert.equal(money(f),before);assert.equal(s.latinum,2000+quote.total);
 assert.ok(f.lives.sellMineral(s,'dilithium',0,2).ok);assert.equal(s.dilithium,3);assert.equal(s.minerals.dilithium,99,'Legacy dilithium resource remains authoritative');
 const saved=copy(s),restored=await fixture({regional:true,saved,economic:false});assert.equal(restored.state.latinum,saved.latinum);assert.equal(restored.lives.market(restored.state,43,0).credits,m.credits);
 m.fundsReserved=m.credits;const snapshot=JSON.stringify(s);assert.equal(f.lives.sellMineral(s,'benamite',0,1).ok,false);assert.equal(JSON.stringify(s),snapshot,'Cannot spend another contract escrow');
});

test('mineral engineering consumes named ore, conserves credits and uses shared effective ship/weapon statistics',async()=>{
 const f=await fixture({regional:true,full:false,economic:false}),s=f.state;Object.assign(s,{shipType:7,latinum:50000,dilithium:100,minerals:{trellium:100,tritanium:100,gallicite:100,benamite:40}});
 const m=f.lives.market(s,1,3),before=money(f),base=f.window.nativeShipDefinitions.forEntity(s);
 for(const kind of ['shield','hull','engine','weapons','drive'])assert.ok(f.lives.upgradeMinerals(s,kind,3).ok);
 const effective=f.window.nativeShipDefinitions.forEntity(s);assert.equal(effective.hull,Math.round(base.hull*1.1));assert.equal(effective.shields,Math.round(base.shields*1.1));assert.equal(effective.speedOrOtherStationValue,base.speedOrOtherStationValue*1.08);assert.equal(effective.warpSpeedMultiplier,1.15);
 assert.equal(money(f),before);const weapon={name:'Test',damage:100,recharge:13};assert.equal(f.window.nativeWeaponRules.weaponSpec(weapon,'beam',{damageMultiplier:effective.weaponDamageMultiplier}).damage,108);assert.equal(weapon.damage,100);
 assert.equal(s.minerals.benamite,36);assert.equal(f.lives.initialize(s).economicLedger.technologyMineralsConsumed.benamite,4);
 const snapshot=JSON.stringify(s);s.minerals.benamite=0;const unfunded=JSON.stringify(s);assert.equal(f.lives.upgradeMinerals(s,'drive',3).ok,false);assert.equal(JSON.stringify(s),unfunded);assert.ok(snapshot.length);
 s.shipType=18;assert.equal(f.window.nativeRegionalMinerals.level(s,'shield'),0,'A different hull does not inherit upgrades');
});

test('thirty minutes of regional work retains the fleet and spreads local mining across the galaxy',async()=>{
 const f=await fixture({regional:true}),initial=money(f),ledger=f.lives.initialize(f.state).economicLedger,allocated=ledger.initialMarketCredits,households=ledger.householdSpending;
 tick(f,1800);const ships=f.state.civilianTraffic.ships,miners=ships.filter(s=>s.mined>0),l=f.lives.initialize(f.state).economicLedger;
 assert.equal(ships.length,159);assert.ok(new Set(ships.map(s=>s.system)).size>=40);assert.ok(new Set(miners.map(s=>s.operatingBase)).size>=40);assert.ok(ships.reduce((n,s)=>n+(s.deliveries||0),0)>500);assert.equal(f.lives.metrics(f.state).backlog,0);
 assert.equal(money(f),initial+l.initialMarketCredits-allocated+l.householdSpending-households);
 for(const m of Object.values(l===ledger?f.lives.initialize(f.state).markets:{})){assert.ok(m.fundsReserved<=m.credits);for(let good=0;good<9;good++)assert.ok(m.reserved[good]<=m.stock[good]);}
 assert.equal(f.window.nativeSolAsteroids.metrics().images,0,'Distant miners never prepare asteroid artwork');
});
