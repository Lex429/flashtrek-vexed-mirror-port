const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
const setup=options=>fixture({full:false,economic:false,regional:true,access:true,population:true,corridors:true,traffic:true,...options});
const lane=f=>f.window.nativeTravelCorridors.lanes().find(l=>l.from===1&&l.to===2);
function observe(f,p,system=1){const a=f.window.nativeManualFlight.anchor(system);Object.assign(f.state,{system,x:p.x-a.x,y:p.y-a.y,landed:false});}
function until(f,predicate,seconds=120){for(let i=0;i<seconds*60&&!predicate();i++)f.step();assert.ok(predicate(),'Timed out at '+f.window.nativeSimulation.seconds(f.state));}
test('Sol–Orion fields are stable, lazy, shared across coordinate frames and keep original rocks intact',async()=>{
 const f=await setup(),w=f.window,paths=w.nativeTravelCorridors,rocks=w.nativeSolAsteroids,before=copy(rocks.placements),route=lane(f);
 assert.ok(route.sites.length>=6);const initial=rocks.metrics().corridorRocks;paths.lanes();paths.sites(1);assert.equal(rocks.metrics().corridorRocks,initial,'reading places does not build rock geometry');
 const site=route.sites[3],ids=paths.rockIds(site),a=rocks.find(ids[0],1),b=rocks.find(ids[0],2),origin=paths.anchor(2);
 near(a.x,b.x+origin.x);near(a.y,b.y+origin.y);assert.equal(a.slotId,b.slotId);assert.equal(a.file,b.file);
 const found=rocks.queryBounds(1,{minX:site.x-600,minY:site.y-600,maxX:site.x+600,maxY:site.y+600});assert.ok(ids.every(id=>found.some(r=>r.slotId===id)));
 assert.ok(rocks.metrics().corridorRocks-initial<=36,'a local query must not instantiate the galaxy');assert.deepEqual(copy(rocks.placements),before);
 const restored=await setup({saved:copy(f.state)});assert.deepEqual(copy(restored.window.nativeSolAsteroids.find(ids[5],1)),copy(rocks.find(ids[5],1)));
});
test('moved corridor rocks use one global pose through either system and actual save/reload',async()=>{
 const f=await setup({physics:true}),w=f.window,site=lane(f).sites[3],id=w.nativeTravelCorridors.rockIds(site)[1],rock=w.nativeSolAsteroids.find(id,1),before={x:rock.x,y:rock.y};
 w.nativeSolAsteroids.relocate(rock,{x:rock.x+42,y:rock.y-19,angle:rock.angle,vx:0,vy:0});
 const other=w.nativeSolAsteroids.find(id,2),a=w.nativeManualFlight.anchor(2);near(other.x+a.x,before.x+42);near(other.y+a.y,before.y-19);
 f.state.asteroidMotion.rocks[id]={system:2,x:other.x,y:other.y,angle:other.angle,vx:0,vy:0,spin:0,at:w.nativeSimulation.seconds(f.state)};
 const reload=await setup({saved:copy(f.state),physics:true}),r=reload.window.nativeSolAsteroids.find(id,1);near(r.x,before.x+42);near(r.y,before.y-19);
});
test('a funded journey promotes without a position jump, remains targetable and resumes its paid delivery after reload',async()=>{
 const f=await setup(),{state:s,ship:e,lives:l,window:w}=f,source=l.market(s,1,3),buyer=l.market(s,2,0);source.stock[5]=40;buyer.stock[5]=0;buyer.target[5]=100;buyer.credits=10000;
 assert.equal(l.startDelivery(s,e.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4}).ok,true);until(f,()=>!!e.journey,60);
 assert.ok(e.journey.waypoints.length>3,'new funded trips share the prospect beacons');
 const j=copy(e.journey),at=j.departedAt+j.duration*.5;w.nativeSimulation.advance(s,at-w.nativeSimulation.seconds(s));const point=l.galaxyPosition(s,e);observe(f,point);
 const cargo=copy(e.cargo),escrow=copy(l.initialize(s).reservations[e.task.id]),credits=e.credits,task=e.task.id;
 w.nativeSimulationFrame.begin(s);l.advance(s,1/60);w.nativeSimulationFrame.end(s);
 assert.ok(e.travelResume&&!e.journey);const current=l.galaxyPosition(s,e);near(current.x,point.x);near(current.y,point.y);assert.equal(e.phase,'cruise');assert.equal(w.nativeShipDetail.isDetailed(s,e),true);
 assert.equal(w.nativeShipSystems.resolve(s,e.id,1).entity,e);assert.deepEqual(copy(e.cargo),cargo);assert.deepEqual(copy(l.initialize(s).reservations[task]),escrow);assert.equal(e.credits,credits);
 const hit=w.nativeCivilianTraffic.hit(s,e.id,1,{source:'player',sourceId:'player',from:{x:e.x-200,y:e.y},kind:'beam'});assert.equal(hit.ok,true);assert.ok(e.retaliationId,'promoted traffic uses ordinary defensive combat');assert.ok(e.combatInterruption&&e.travelResume);
 const saved=copy(s),reload=await setup({saved}),r=reload.lives.find(reload.state,e.id);assert.ok(r.travelResume);near(reload.lives.galaxyPosition(reload.state,r).x,current.x);
 observe(reload,{x:4000000,y:4000000});until(reload,()=>r.journey&&!r.travelResume,2);assert.equal(r.task.id,task);assert.deepEqual(copy(r.cargo),cargo);
 until(reload,()=>r.deliveries===1,180);assert.equal(r.task.id,task);assert.equal(r.task.deliveredTons,4);assert.equal(r.cargo,null);assert.equal(reload.lives.market(reload.state,2,0).fundsReserved,0);
 for(let i=0;i<60;i++)reload.step();assert.equal(r.deliveries,1);
});
test('local conversations run with persistent lives and cannot spend committed cargo or escrow',async()=>{
 const f=await setup(),{state:s,ship:a,window:w,lives:l}=f,p=lane(f).sites[2];observe(f,p);
 l.interrupt(s,a,'social fixture');Object.assign(a,{x:s.x,y:s.y,system:1,phase:'holding',nextActionAt:999999,cargo:{good:5,tons:3},task:{id:'reserved',kind:'freight',status:'active',phase:'loading',origin:{system:1,port:3},destination:{system:2,port:0},requirements:{good:5,tons:3}}});
 const b={...copy(a),id:9001,name:'Passing freighter',x:a.x+120,task:{...copy(a.task),id:'reserved-b'}};s.civilianTraffic.ships.push(b);l.initialize(s);
 s.civilianTraffic.life.social={version:1,nextAt:0,cursor:0,conversations:0,disputes:0,seed:1};const before=copy([a.cargo,b.cargo,a.credits,b.credits,l.initialize(s).reservations]);
 l.social(s);assert.equal(s.civilianTraffic.life.social.conversations,1);assert.ok(s.civilianTraffic.hails.length>=2);assert.match(a.talkingText,/prices/);assert.deepEqual(copy([a.cargo,b.cargo,a.credits,b.credits,l.initialize(s).reservations]),before);
 l.social(s);assert.equal(s.civilianTraffic.life.social.conversations,1,'same clock does not repeat an exchange');
});
test('existing miners reserve corridor ore, keep a partial cut through reload and collect it exactly once',async()=>{
 const f=await setup(),{state:s,ship:e,window:w,lives:l}=f;e.regionalResident=true;e.nextActionAt=0;l.invalidateMembership(s);l.initialize(s);
 until(f,()=>!!e.task?.requirements.corridorSite,2);const id=e.task.requirements.rockId,job=e.task.id;
 assert.ok(id>=1_000_000_000);assert.equal(l.initialize(s).reservations['rock:'+id].owner,e.id);
 until(f,()=>e.phase==='mining',360);const at=w.nativeSimulation.seconds(s),deadline=e.nextActionAt,rock=w.nativeSolAsteroids.find(id,e.system);observe(f,{x:rock.x,y:rock.y});
 observe(f,{x:rock.x,y:rock.y},2);for(let i=0;i<60;i++)f.step();assert.equal(e.phase,'mining');assert.ok(!s.minedAsteroids.includes(id));assert.equal(e.system,2,'nearby miners share the observer coordinate frame');
 const projected=w.nativeSolAsteroids.find(id,2);assert.ok(Math.hypot(e.x-projected.x,e.y-projected.y)<400);assert.equal(w.nativeShipSystems.resolve(s,e.id,2).entity,e);
 const reload=await setup({saved:copy(s)}),r=reload.ship;assert.equal(r.task.id,job);near(r.nextActionAt,deadline);assert.equal(r.phase,'mining');
 until(reload,()=>r.task.minedAt!==undefined,45);assert.equal(r.mined,4);assert.equal(reload.state.asteroidOreDrops[id],0);assert.ok(reload.state.minedAsteroids.includes(id));assert.equal(reload.lives.initialize(reload.state).reservations['rock:'+id],undefined);
 for(let i=0;i<120;i++)reload.step();assert.equal(r.mined,4);assert.equal(reload.state.minedAsteroids.filter(x=>x===id).length,1);assert.ok(reload.window.nativeSimulation.seconds(reload.state)>at);
});
test('corridor asteroid contacts use the common impulse owner and retain their displaced pose across frames',async()=>{
 const f=await setup({physics:true}),{state:s,window:w}=f,site=lane(f).sites[3],id=w.nativeTravelCorridors.rockIds(site)[5],rock=w.nativeSolAsteroids.find(id,1);
 Object.assign(s,{system:1,x:rock.x+8,y:rock.y,previousX:rock.x-180,previousY:rock.y,angle:0,vx:380,vy:0,speed:380,hull:1000,shields:1000});w.nativeShipSystems.refreshShip(s,s,'player');
 w.nativeAsteroidMotion.collide(s,.5);assert.ok(w.nativeAsteroidMotion.snapshot().contacts.some(c=>c.rockId===id));assert.ok(s.asteroidMotion.rocks[id]);
 const global=w.nativeSolAsteroids.find(id,1),other=w.nativeSolAsteroids.find(id,2),origin=w.nativeManualFlight.anchor(2);near(global.x,other.x+origin.x);near(global.y,other.y+origin.y);
 // A second physical impact uses another coordinate view of the SAME body.
 // Its saved owner and the next drift step must not acquire a system-sized jump.
 w.nativeSimulation.advance(s,1/60);w.nativeAsteroidMotion.advance(s,1/60);
 const projected=w.nativeSolAsteroids.find(id,2),before={x:projected.x,y:projected.y};
 Object.assign(s,{system:2,x:projected.x+8,y:projected.y,previousX:projected.x-180,previousY:projected.y,angle:0,vx:380,vy:0,speed:380});w.nativeShipSystems.refreshShip(s,s,'player');
 w.nativeAsteroidMotion.collide(s,.5);assert.equal(s.asteroidMotion.rocks[id].system,1);
 w.nativeSimulation.advance(s,1/60);w.nativeAsteroidMotion.advance(s,1/60);
 const after=w.nativeSolAsteroids.find(id,2);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1000,'a second-view impact jumped between system origins');
 const canonical=w.nativeSolAsteroids.find(id,1);near(canonical.x,after.x+origin.x);near(s.asteroidMotion.rocks[id].x,canonical.x);
 const saved=copy(s),r=await setup({saved,physics:true});near(r.window.nativeSolAsteroids.find(id,2).x,after.x);
});
test('evicted coordinate views cannot collide with the same persistent asteroid',async()=>{
 const f=await setup({physics:true}),{state:s,window:w}=f,site=lane(f).sites[3],id=w.nativeTravelCorridors.rockIds(site)[5],rock=w.nativeSolAsteroids.find(id,1);
 observe(f,{x:rock.x,y:rock.y});
 Object.assign(s,{x:rock.x+8,y:rock.y,previousX:rock.x-180,previousY:rock.y,angle:0,vx:380,vy:0,speed:380});w.nativeShipSystems.refreshShip(s,s,'player');
 w.nativeAsteroidMotion.collide(s,.5);assert.ok(s.asteroidMotion.rocks[id]);
 const before={x:rock.x,y:rock.y};
 // Other working crews build more than eight frames, evicting the observer's
 // cached view while the physical owner still retains its original reference.
 for(let frame=2;frame<=12;frame++)w.nativeSolAsteroids.find(id,frame);
 const replacement=w.nativeSolAsteroids.find(id,1);assert.notEqual(replacement,rock);assert.equal(replacement.slotId,rock.slotId);
 for(let i=0;i<120;i++){w.nativeSimulation.advance(s,1/60);w.nativeAsteroidMotion.advance(s,1/60);}
 assert.ok(w.nativeAsteroidMotion.snapshot().rockContacts.every(c=>c.a!==c.b),'One rock collided with its own evicted view');
 const after=w.nativeSolAsteroids.find(id,1);assert.ok(after.x>=before.x-1,'A forward-moving isolated rock jumped backwards');
 assert.equal(w.nativeShipMotion.asteroidPairContact({...after},{...after},1/60),null,'The shared solver also rejects matching persistent identities');
 const reload=await setup({saved:copy(s),physics:true});near(reload.window.nativeSolAsteroids.find(id,1).x,after.x);
});

test('nearby mining disagreements use ordinary weapons and preserve real claims and cargo',async()=>{
 const f=await setup(),{state:s,ship:a,window:w,lives:l}=f,site=lane(f).sites[3];observe(f,site);l.interrupt(s,a,'claim fixture');
 Object.assign(a,{system:1,x:s.x,y:s.y,phase:'mining',nextActionAt:999999,cargo:null,crewTraits:{version:1,caution:.3,aggression:.9}});
 a.task={id:'claim-a',kind:'mining',phase:'mining',status:'active',origin:{system:1,port:3},destination:{system:1,port:1},requirements:{corridorSite:site.id,rockId:w.nativeTravelCorridors.rockIds(site)[2],capacity:150}};
 a.miningRockSlot=a.task.requirements.rockId;
 const b={...copy(a),id:9001,name:'Another prospector',phase:'holding',x:a.x+160,task:{...copy(a.task),id:'claim-b',requirements:{...copy(a.task.requirements),rockId:w.nativeTravelCorridors.rockIds(site)[3]}}};
 s.civilianTraffic.ships.push(b);l.initialize(s);const life=l.initialize(s);life.reservations['rock:'+a.miningRockSlot]={owner:a.id,taskId:a.task.id};life.reservations['rock:'+b.task.requirements.rockId]={owner:b.id,taskId:b.task.id};
 life.social={version:1,nextAt:0,cursor:0,conversations:0,disputes:0,seed:2000};const claims=copy(life.reservations);l.social(s);
 assert.equal(s.civilianTraffic.disputes.length,1);const dispute=s.civilianTraffic.disputes[0];assert.match(dispute.reason,/mining claim/);assert.deepEqual(copy(life.reservations),claims);
 until(f,()=>dispute.volleys>0,12);assert.ok(s.weaponCombat.events.length>0,'dispute launches through the shared weapon owner');assert.equal(a.cargo,null);assert.equal(b.cargo,null);assert.deepEqual(copy(life.reservations),claims);
});
test('blocked local navigation leaves an actual funded warp journey and its escrow unchanged',async()=>{
 const f=await setup(),{state:s,ship:e,lives:l,window:w}=f;const buyer=l.market(s,2,0);buyer.stock[5]=0;buyer.target[5]=100;buyer.credits=10000;
 assert.equal(l.startDelivery(s,e.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4}).ok,true);until(f,()=>!!e.journey,60);
 const at=e.journey.departedAt+e.journey.duration*.5;w.nativeSimulation.advance(s,at-w.nativeSimulation.seconds(s));observe(f,l.galaxyPosition(s,e));
 const before=copy({journey:e.journey,task:e.task,cargo:e.cargo,credits:e.credits,escrow:l.initialize(s).reservations,deadline:e.nextActionAt}),motion=w.nativeShipMotion;
 w.nativeShipMotion={...motion,obstaclePoints:()=>null};try{assert.equal(l.promoteJourney(s,e,at),false);}finally{w.nativeShipMotion=motion;}
 assert.deepEqual(copy({journey:e.journey,task:e.task,cargo:e.cargo,credits:e.credits,escrow:l.initialize(s).reservations,deadline:e.nextActionAt}),before);assert.equal(e.travelResume,undefined);
});
