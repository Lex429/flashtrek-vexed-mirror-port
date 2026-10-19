const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
function until(f,predicate,seconds=1800){for(let i=0;i<seconds*4&&!predicate();i++)f.step(.25);assert.ok(predicate(),'scheduled operation did not complete');}
function tick(f,seconds){for(let i=0;i<seconds*4;i++)f.step(.25);}
function cash(f){return Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.credits,0)+f.state.civilianTraffic.ships.reduce((n,e)=>n+e.credits,0)+(f.state.latinum||0);}
function reserves(f){return Object.values(f.lives.initialize(f.state).markets).reduce((n,m)=>n+m.stock[7],0)+f.state.civilianTraffic.ships.reduce((n,e)=>n+(e.repairDeuranium||0)+(e.cargo?.good===7?e.cargo.tons:0),0);}
async function medical(saved){
 const f=await fixture({saved,regional:true,access:true,repairs:true,full:false,economic:false}),s=f.state;
 f.medic=s.civilianTraffic.ships.find(e=>e.shipType===58);f.casualty=s.civilianTraffic.ships.find(e=>e.shipType!==58);
 if(!saved){
   for(const e of s.civilianTraffic.ships){f.lives.interrupt(s,e,'isolated existing crew');e.nextActionAt=null;e.lifeScheduleToken++;e.cargo=null;e.repairDeuranium=0;}
   s.civilianTraffic.ships=[f.casualty,f.medic];s.solEconomy.freighters=[];s.system=47;
   for(const m of Object.values(f.lives.initialize(s).markets))m.stock[7]=0;
   const e=f.medic;Object.assign(e,{system:1,port:3,operatingBase:1,stationSystem:1,x:0,y:0,credits:0,phase:'docked',regionalResident:false});
   const berth=f.window.nativePortDocking.request(s,e,1,3);Object.assign(e,{x:berth.x,y:berth.y});f.lives.refreshLocation(s,e);
 }
 return f;
}

test('new deuranium deposits append stable IDs without altering any historical asteroid',async()=>{
 const f=await fixture({regional:true,full:false,economic:false}),w=f.window,old=[],ids=[];
 for(const s of w.VexedMirrorWorld.systems){
   const field=w.nativeSolAsteroids.forSystem(s.id),deuranium=field.filter(r=>r.oreType==='deuranium');
   assert.equal(deuranium.length,w.nativeRegionalMinerals.profile(s.id).deposits.deuranium);
   for(const r of deuranium){assert.ok(r.slotId%100000>=90000);assert.equal(w.nativeSolAsteroids.find(r.slotId),r);ids.push(r.slotId);}
   for(const r of field.filter(r=>r.oreType!=='deuranium'))old.push([r.slotId,r.x,r.y,r.oreType,r.file,r.angle,r.size]);
 }
 assert.equal(new Set(ids).size,ids.length);assert.equal(old.length,10462);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(old)).digest('hex'),'c86672db817b412d808b2b6106eba32f61ec53c005a9e13e3c3f644ad773548c');
 f.state.minedAsteroids=[ids[0],0,4300000];f.state.destroyedAsteroids=[ids[1]];
 const g=await fixture({saved:copy(f.state),regional:true,full:false,economic:false});assert.deepEqual(g.state.minedAsteroids,[ids[0],0,4300000]);assert.deepEqual(g.state.destroyedAsteroids,[ids[1]]);
 assert.equal(g.window.nativeSolAsteroids.find(ids[0]).oreType,'deuranium');assert.equal(w.nativeSolAsteroids.metrics().images,0);
});

test('player ore refines into the existing deuranium balance or sells into good 7 with conserved credits',async()=>{
 const f=await fixture({regional:true,full:false,economic:false}),s=f.state;
 Object.assign(s,{system:43,latinum:200,deuranium:11,minerals:{deuranium:6}});const m=f.lives.market(s,43,0),stock=m.stock[7],ore=m.stock[0],before=cash(f);
 assert.ok(f.lives.refineDeuranium(s,0,2).ok);assert.equal(s.minerals.deuranium,4);assert.equal(s.deuranium,13);assert.equal(cash(f),before);
 assert.ok(f.lives.sellMineral(s,'deuranium',0,3).ok);assert.equal(s.minerals.deuranium,1);assert.equal(m.stock[7],stock+3);assert.equal(m.stock[0],ore);assert.equal(cash(f),before);
 m.fundsReserved=m.credits;let snapshot=JSON.stringify(s);assert.equal(f.lives.sellMineral(s,'deuranium',0,1).ok,false);assert.equal(JSON.stringify(s),snapshot);
 assert.ok(f.lives.refineDeuranium(s,0,1).ok);snapshot=JSON.stringify(s);assert.equal(f.lives.refineDeuranium(s,0,1).ok,false);assert.equal(JSON.stringify(s),snapshot);
 const g=await fixture({saved:copy(s),regional:true,economic:false});assert.equal(g.state.deuranium,14);assert.equal(g.state.minerals.deuranium,0);
});

test('ordinary miners skip deuranium without a funded buyer and still work another useful ore claim',async()=>{
 const f=await fixture({regional:true,full:false,economic:false}),s=f.state,e=f.ship;
 const field=f.window.nativeSolAsteroids.forSystem(1),deuranium=field.find(r=>r.oreType==='deuranium'),other=field.find(r=>!r.demo&&r.oreType==='trellium');
 s.minedAsteroids=field.filter(r=>r!==deuranium&&r!==other).map(r=>r.slotId);s.system=47;
 for(const m of Object.values(f.lives.initialize(s).markets)){m.stock[7]=9999;m.stock[0]=0;}
 Object.assign(e,{role:'mining',regionalResident:true,system:1,operatingBase:1,x:deuranium.x,y:deuranium.y});
 f.lives.resumeWork(s,e,'choose a funded mineral claim');until(f,()=>e.task?.kind==='mining'&&e.task.status==='active');
 assert.equal(e.task.requirements.rockId,other.slotId);assert.equal(e.task.requirements.oreType,'trellium');
});

test('mining produces saved real damage, respects pause and cancellation, and grants ore once',async()=>{
 let f=await fixture({regional:true,full:false,economic:false});const w=f.window,rock=w.nativeSolAsteroids.forSystem(43).find(r=>r.oreType==='deuranium');
 Object.assign(f.state,{system:43,x:rock.x-100,y:rock.y,miningTool:true});f.ship.nextActionAt=null;f.ship.lifeScheduleToken++;
 w.nativeAsteroidCombat.select(rock);assert.ok(w.nativeAsteroidCombat.mine(f.state,f.state).ok);tick(f,2);
 assert.ok(f.state.asteroidDamage[rock.slotId]>=rock.maxHull*.25-1e-7);const damage=f.state.asteroidDamage[rock.slotId];
 w.nativePause.active=true;tick(f,3);assert.equal(f.state.asteroidDamage[rock.slotId],damage);w.nativePause.active=false;
 f.state.x=rock.x-1000;f.step(.25);assert.equal(f.state.miningOperation,undefined);assert.equal(f.state.asteroidDamage[rock.slotId],damage);
 f=await fixture({saved:copy(f.state),regional:true,economic:false});const a=f.window.nativeAsteroidCombat;
 Object.assign(f.state,{x:rock.x-100,y:rock.y});a.select(f.window.nativeSolAsteroids.find(rock.slotId));assert.ok(a.mine(f.state,f.state).ok);tick(f,8);
 assert.equal(f.state.asteroidOreDrops[rock.slotId],15);assert.equal(f.state.minedAsteroids.filter(id=>id===rock.slotId).length,1);assert.equal(a.completeMining(f.state,rock.slotId).ok,false);
 assert.equal(f.state.asteroidDamage[rock.slotId],rock.maxHull*.75);
 const other=f.window.nativeSolAsteroids.forSystem(43).find(r=>r.oreType==='deuranium'&&r.slotId!==rock.slotId);other.guaranteedOre=true;
 f.context.Image=class{complete=false;naturalWidth=0;};
 assert.ok(a.weaponHit(f.state,other.slotId,100).destroyed);assert.equal(f.state.asteroidOreDrops[other.slotId],undefined,'weapon destruction cannot mint mining supplies');
});

test('an unfunded Olympic mines, saves midway, physically docks and refines owned supplies without payment',async()=>{
 let f=await medical();const id=f.medic.id,before=cash(f),material=reserves(f);f.lives.resumeWork(f.state,f.medic,'deuranium shortage');
 until(f,()=>f.medic.task?.phase==='mining');const rockId=f.medic.task.requirements.rockId;assert.equal(f.medic.task.requirements.medicalSupply,true);
 until(f,()=>f.state.asteroidDamage?.[rockId]>0);f=await medical(copy(f.state));assert.equal(f.medic.id,id);assert.equal(f.medic.task.requirements.rockId,rockId);
 until(f,()=>f.medic.cargo?.raw);assert.equal(f.medic.cargo.good,7);assert.equal(f.medic.repairDeuranium,0);assert.equal(f.state.asteroidOreDrops[rockId],0);
 f=await medical(copy(f.state));let dockedBeforeRefining=false;
 const owner=f.window.nativePortDocking,inspect=owner.inspect;
 f.window.nativePortDocking={...owner,inspect:(...args)=>{const berth=inspect(...args);if(args[1]===f.medic&&f.medic.cargo?.raw&&berth?.kind==='berth'&&Math.hypot(f.medic.x-berth.x,f.medic.y-berth.y)<.01)dockedBeforeRefining=true;return berth;}};
 until(f,()=>f.medic.repairMined>=4);
 assert.equal(f.medic.repairDeuranium,4);assert.equal(f.medic.cargo,null);assert.equal(f.medic.credits,0);assert.equal(cash(f),before);assert.equal(reserves(f),material+4);
 assert.equal(f.lives.initialize(f.state).economicLedger.minedDeuranium,4);assert.equal(f.state.minedAsteroids.filter(id=>id===rockId).length,1);
 assert.ok(dockedBeforeRefining,'the actual carrier reached its reserved physical refinery berth before conversion');
 assert.equal(f.window.nativeSolAsteroids.metrics().images,0,'offscreen mining/refining/rescue does not load images');
});

test('medical provisioning continues past the low-water mark to 200 t, then mined supplies fund a real rescue',async()=>{
 const f=await medical(),s=f.state,e=f.medic;Object.assign(e,{repairDeuranium:196,repairProvisioning:true});f.lives.resumeWork(s,e,'finish the saved reserve refill');
 until(f,()=>e.repairDeuranium===200);tick(f,5);assert.equal(e.repairProvisioning,false);assert.notEqual(e.task.kind,'mining');
 f.lives.interrupt(s,f.casualty,'disabled');Object.assign(f.casualty,{system:1,x:2500,y:2500,hull:10,shields:0,repairDeuranium:0});
 until(f,()=>s.shipRepairs.missions.some(m=>m.carrier.id===e.id));assert.equal(e.task.kind,'medical');
 until(f,()=>f.casualty.phase!=='disabled');assert.equal(f.casualty.hull,100);assert.ok(Math.abs(e.repairDeuranium-182)<1e-7);assert.ok(Math.abs(s.shipRepairs.ledger.consumed-18)<1e-7);
 assert.equal(e.repairBay.slots.filter(d=>d.phase==='stowed').length,6);assert.equal(s.civilianTraffic.ships.length,2);
});

test('a distress response releases an Olympic mining claim without creating ore or replacing its life',async()=>{
 const f=await medical(),e=f.medic;f.lives.resumeWork(f.state,e,'shortage');until(f,()=>e.task?.phase==='mining-flight');
 const rockId=e.task.requirements.rockId;assert.ok(f.lives.initialize(f.state).reservations['rock:'+rockId]);e.repairDeuranium=20;
 f.lives.interrupt(f.state,f.casualty,'disabled');Object.assign(f.casualty,{hull:10,shields:0,repairDeuranium:0});until(f,()=>e.task.kind==='medical');
 assert.equal(f.lives.initialize(f.state).reservations['rock:'+rockId],undefined);assert.ok(!f.state.minedAsteroids.includes(rockId));assert.equal(f.state.asteroidOreDrops?.[rockId],undefined);
 const g=await medical(copy(f.state));assert.equal(g.medic.id,e.id);assert.equal(g.medic.task.kind,'medical');assert.equal(g.state.civilianTraffic.ships.length,2);
});
