const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function defence(saved){
 const f=await fixture({full:false,economic:false,regional:true,access:true,corridors:true,saved}),w=f.window,s=f.state;
 if(!saved){
  Object.assign(s,{x:4000,y:2000,hull:100,shields:100,landed:false,localPrestige:{1:0,2:20}});
  const template=copy(f.ship),ships=[];
  for(const [id,x,role,government] of [[101,4200,'patrol',1],[102,4300,'patrol',1],[103,4400,'freight',1],[104,4500,'freight',2],[105,8000,'patrol',1]]){
   const ship={...copy(template),id,name:'Defence test '+id,shipType:47,role,ownerGovernmentId:government,system:1,stationSystem:1,operatingBase:1,x,y:2000,heading:Math.PI,speed:0,hull:100,shields:100,cargo:null,nextActionAt:10000};
   for(const key of ['localLeg','journey','dockingMove','dockIntent','disputeId','retaliationId','combatAI','shipEquipment','weaponLoadout','factionResponse','combatInterruption'])delete ship[key];
   ship.task={id:'defence-job:'+id,kind:'reposition',status:'active',phase:'idle',origin:{system:1,port:3},destination:{system:1,port:3},requirements:{},createdAt:0,progress:0};
   w.nativeShipMotion.stop(ship);ships.push(ship);
  }
  s.civilianTraffic.ships=ships;w.nativeNpcLives.invalidateMembership(s);w.nativeShipSystems.invalidateShips(s);w.nativeNpcLives.initialize(s).config.detailedRadius=1000;w.nativeManualFlight.initializeRegion(s);
 }
 return {...f,w,s,ships:s.civilianTraffic.ships,policy:w.nativeFactionDefence};
}

test('civilian/faction role follows saved duty and allegiance rather than the hull artwork',async()=>{
 const {ships,policy,w}=await defence();assert.equal(ships[0].shipType,ships[2].shipType);
 assert.equal(policy.role(ships[0]),'faction');assert.equal(policy.role(ships[2]),'civilian');
 assert.equal(policy.role({...ships[0],npcRole:'civilian'}),'civilian');assert.equal(policy.role({...ships[2],npcRole:'faction'}),'faction');
 const military=w.nativeCivilianCombatAI.profile(ships[0]);assert.equal(military.survivalFirst,false);assert.equal(military.protectCargo,false);
 assert.equal(policy.allegiance(ships[0]),1);assert.equal(policy.allegiance(ships[3]),2);
});

test('same-faction accidental NPC hits damage shields without creating a feud or changing an existing enemy lock',async()=>{
 const f=await defence(),[a,b,,foreign]=f.ships,before=a.shields;
 f.w.nativeCivilianTraffic.hit(f.s,a.id,2,{source:'ai',sourceId:b.id});assert.ok(a.shields<before);
 assert.equal(a.retaliationId,undefined);assert.equal(f.s.factionDefence,undefined);
 f.w.nativeCivilianTraffic.hit(f.s,a.id,2,{source:'ai',sourceId:foreign.id});assert.equal(a.retaliationTargetId,foreign.id);
 f.w.nativeCivilianTraffic.hit(f.s,a.id,2,{source:'ai',sourceId:b.id});assert.equal(a.retaliationTargetId,foreign.id);
 assert.equal(f.s.localPrestige[1],0,'NPC attacks cannot penalize the player');
});

test('shared weapon contacts retain allied allegiance after their shooter leaves the target registry',async()=>{
 const f=await defence(),[a,b]=f.ships,w=f.w,s=f.s,before=a.shields;
 w.nativeWeaponLoadout.refit(s,[1],{holder:b});
 const fired=w.nativeCombatShots.fireFor({state:s,shooter:w.nativeShipDefinitions.describe(s,b,{category:'civilian'}),target:w.nativeShipSystems.resolve(s,a.id),selection:{slot:0}});
 assert.ok(fired.ok,fired.error);assert.equal(fired.event.sourceGovernmentId,1);
 b.hull=0;b.phase='destroyed';w.nativeShipSystems.refreshShip(s,b,'civilian');
 for(let i=0;i<12;i++)f.step();assert.ok(a.shields<before);assert.equal(fired.event.hitTargetId,a.id);
 assert.equal(a.retaliationId,undefined);assert.equal(s.factionDefence,undefined,'A launched allied shot cannot become a foreign-faction alert when the shooter disappears');
});

test('player aggression, including aligned-player collateral hits, alerts all defenders and charges local reputation once per shot',async()=>{
 const f=await defence(),[a,b,civilian]=f.ships;f.s.ownerGovernmentId=1;
 const shot={source:'player',sourceId:'player',sourceGovernmentId:1,weaponEventId:17};
 const hit=f.w.nativeCivilianTraffic.hit(f.s,a.id,1,shot);assert.equal(hit.reputation.amount,5);
 f.w.nativeCivilianTraffic.hit(f.s,b.id,1,shot);assert.equal(f.s.localPrestige[1],-5);assert.equal(f.s.localPrestige[2],20);
 f.step();assert.equal(a.retaliationTargetId,'player');assert.equal(b.retaliationTargetId,'player');assert.equal(civilian.retaliationId,undefined);
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{...shot,weaponEventId:18});assert.equal(f.s.localPrestige[1],-10);
 const loaded=await defence(copy(f.s));loaded.w.nativeCivilianTraffic.hit(loaded.s,a.id,1,shot);assert.equal(loaded.s.localPrestige[1],-10,'Continue must retain per-shot crime accounting');
});

test('hostile reputation triggers defence at the real system boundary and never uses the navigation selection',async()=>{
 const f=await defence(),a=f.ships[0],row=f.w.nativeManualFlight.boundaries().find(row=>row.id===1);f.s.localPrestige[1]=-1;f.s.manualTargetSystem=2;
 Object.assign(f.s,{x:row.x+row.rx+2,y:row.y});assert.equal(f.policy.target(f.s,a),null,'Outside the system there is no entry aggression');
 Object.assign(f.s,{x:row.x+row.rx-2,y:row.y});assert.equal(f.policy.target(f.s,a)?.id,'player');
 Object.assign(f.s,{x:4000,y:2000});f.w.nativeManualFlight.initializeRegion(f.s);f.step();
 assert.equal(a.retaliationTargetId,'player');assert.equal(f.ships[2].retaliationId,undefined);
});

test('a different faction accidental hit alerts defenders against that NPC, without making allies fight each other',async()=>{
 const f=await defence(),[a,b,,foreign]=f.ships;
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'ai',sourceId:foreign.id});f.step();
 assert.equal(a.retaliationTargetId,foreign.id);assert.equal(b.retaliationTargetId,foreign.id);assert.equal(f.s.localPrestige[1],0);
 const before=b.shields;f.w.nativeCivilianTraffic.hit(f.s,b.id,1,{source:'ai',sourceId:a.id,sourceGovernmentId:1});assert.ok(b.shields<before);assert.equal(b.retaliationTargetId,foreign.id);
 assert.equal(f.policy.friendly(f.s,a,{source:'ai',sourceId:99999,sourceGovernmentId:1}),true,'Launched shots retain their original allegiance after their shooter leaves');
});

test('defence follows the actual local government for every faction, with individual self-defence outside its territory',async()=>{
 const f=await defence(),[a,b]=f.ships;f.s.planetGovts={1:2};a.ownerGovernmentId=b.ownerGovernmentId=2;f.s.localPrestige[1]=-1;
 assert.equal(f.policy.target(f.s,a)?.id,'player');f.step();assert.equal(b.retaliationTargetId,'player');
 f.s.planetGovts[1]=3;f.step();assert.equal(f.policy.target(f.s,a),null);assert.equal(a.retaliationId,undefined);
 const standing=f.s.localPrestige[1];f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'player',sourceId:'player',weaponEventId:81});
 assert.equal(f.s.localPrestige[1],standing,'A foreign visiting ship cannot levy a local government penalty');assert.equal(a.retaliationTargetId,'player');
});

test('distant defenders approach through saved motion, retain funded work, and resume after contact ends',async()=>{
 const f=await defence(),far=f.ships.at(-1),origin={x:far.x,y:far.y};
 const delivery=f.w.nativeNpcLives.startDelivery(f.s,far.id,{fromSystem:1,fromPort:3,toSystem:2,toPort:0,good:5,tons:2});assert.ok(delivery.ok,delivery.error);
 const job=copy(far.task),escrow=copy(f.s.civilianTraffic.life.reservations),equipment=copy(f.w.nativeShipEquipment.ensure(f.s,far));
 f.s.localPrestige[1]=-1;f.step();assert.ok(far.factionResponse);assert.ok(far.localLeg);assert.ok(far.combatInterruption);
 assert.equal(far.retaliationId,undefined,'Distant defenders cannot run tactical physics');assert.equal(far.task.id,job.id);
 for(let i=0;i<180;i++)f.step();assert.ok(Math.hypot(far.x-origin.x,far.y-origin.y)>1,'Analytical response must actually move');
 assert.deepEqual(copy(far.shipEquipment),equipment);assert.deepEqual(copy(f.s.civilianTraffic.life.reservations),escrow);assert.deepEqual(copy(far.task.requirements),job.requirements);
 const saved=copy(f.s),restored=await defence(saved),same=restored.ships.at(-1);
 assert.equal(same.factionResponse.targetId,'player');Object.assign(restored.s,{x:1000000,y:1000000});
 for(let i=0;i<240;i++)restored.step();assert.equal(same.factionResponse,undefined);assert.equal(same.combatInterruption,undefined);assert.equal(same.task.id,job.id);
});

test('pause blocks new defence orders and environmental damage cannot create player crimes',async()=>{
 const f=await defence(),a=f.ships[0];f.s.localPrestige[1]=-1;f.w.nativePause.active=true;
 for(let i=0;i<30;i++)f.step();assert.equal(a.retaliationId,undefined);assert.equal(f.ships.at(-1).factionResponse,undefined);
 f.w.nativePause.active=false;f.s.localPrestige[1]=0;f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'asteroid',physicalContact:true});
 assert.equal(f.s.localPrestige[1],0);assert.equal(f.s.factionDefence,undefined);
 assert.equal(a.retaliationId,undefined,'Environmental impacts cannot fabricate a player attacker');
});

test('an idle legacy guard without a current job can respond and return to ordinary duty',async()=>{
 const f=await defence(),ship=f.ships.at(-1);delete ship.task;f.s.localPrestige[1]=-1;
 f.step();assert.ok(ship.factionResponse);assert.ok(ship.localLeg);assert.equal(ship.task.requirements.factionResponse,true);
 Object.assign(f.s,{x:1000000,y:1000000});for(let i=0;i<240;i++)f.step();assert.equal(ship.factionResponse,undefined);
});

test('reputation recovery ends entry-only defence orders without clearing a recent real aggression alert',async()=>{
 const f=await defence(),a=f.ships[0];f.s.localPrestige[1]=-1;f.step();assert.equal(a.retaliationTargetId,'player');
 f.s.localPrestige[1]=20;f.step();assert.equal(a.retaliationId,undefined);
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'player',sourceId:'player',weaponEventId:35});f.s.localPrestige[1]=20;f.step();assert.equal(a.retaliationTargetId,'player');
 f.w.nativeSimulation.advance(f.s,121);f.w.nativeCivilianTraffic.advance(f.s,1/60);assert.equal(a.retaliationTargetId,'player','A committed hunt remains active until the target escapes');
 Object.assign(f.s,{x:1000000,y:1000000});f.step();assert.equal(a.retaliationId,undefined);
 f.w.nativeSimulation.advance(f.s,121);Object.assign(f.s,{x:4000,y:2000});f.w.nativeManualFlight.initializeRegion(f.s);f.step();
 assert.equal(a.retaliationId,undefined,'After escape, an expired incident cannot restart a pursuit against neutral standing');
});

test('sustained contacts from the same shot do not repeatedly rescan system-wide defence orders',async()=>{
 const f=await defence(),a=f.ships[0],shot={source:'player',sourceId:'player',weaponEventId:40};
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,shot);assert.equal(f.policy.ordersDue(f.s),true);const revision=f.s.factionDefence.revision;
 f.w.nativeSimulation.advance(f.s,.01);f.w.nativeCivilianTraffic.hit(f.s,a.id,1,shot);
 assert.equal(f.s.factionDefence.revision,revision);assert.equal(f.policy.ordersDue(f.s),false);
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'ai',sourceId:f.ships[3].id});assert.equal(f.policy.ordersDue(f.s),true,'A changed aggressor refreshes shared orders immediately');
});

test('a cooperatively prepared defence route keeps its half-second pursuit recheck deadline',async()=>{
 const f=await defence(),ship=f.ships.at(-1),motion=f.w.nativeShipMotion;
 const bodies=[{x:6000,y:2000,radius:120},...Array.from({length:12},(_,i)=>({x:100000+i*500,y:100000,radius:50}))];
 f.w.nativeShipMotion={...motion,navigationObstacles:()=>bodies};f.w.nativeNpcLives.interactive(f.s,true);f.s.localPrestige[1]=-1;
 f.w.nativeSimulationFrame.begin(f.s);f.w.nativeNpcLives.respondToThreat(f.s,ship,f.policy.target(f.s,ship));f.w.nativeSimulationFrame.end(f.s);
 assert.ok(ship.navigationRequest,'The route must use the existing cooperative obstacle search');
 for(let i=0;i<600&&!ship.localLeg;i++){f.w.nativeSimulationFrame.begin(f.s);f.step();f.w.nativeSimulationFrame.end(f.s);}
 assert.ok(ship.localLeg,'The real obstacle search must complete');assert.ok(ship.localLeg.duration>2);
 assert.ok(ship.nextActionAt<=f.w.nativeSimulation.seconds(f.s)+.501,'Completing navigation must not defer pursuit updates to the end of a long route');
});

test('an approaching defender hands its current sampled pose to live combat without a sleep/wake jump',async()=>{
 const f=await defence(),ship=f.ships.at(-1);f.s.localPrestige[1]=-1;f.step();let previous=f.w.nativeNpcLives.pose(f.s,ship);
 for(let i=0;i<1800&&!ship.retaliationId;i++){previous=f.w.nativeNpcLives.pose(f.s,ship);f.step();}
 assert.ok(ship.retaliationId,'The defender must enter real tactical combat when it reaches the active region');
 assert.equal(ship.factionResponse,undefined);assert.equal(ship.localLeg,undefined);
 assert.ok(Math.hypot(ship.x-previous.x,ship.y-previous.y)<20,'Promotion must sample the current route before deleting it');
 assert.equal(f.w.nativeShipSystems.resolve(f.s,ship.id)?.entity,ship,'The approaching hull remains a real collision/targeting actor');
});

test('system awareness keeps a bounded response team and leaves other guards on their saved duties',async()=>{
 const f=await defence(),template=copy(f.ships[0]);f.s.hull=f.s.shields=100000;
 for(let i=0;i<18;i++)f.ships.push({...copy(template),id:200+i,name:'Reserve '+i,x:4150+(i%4)*120,y:1650+Math.floor(i/4)*140,task:{...copy(template.task),id:'reserve-job:'+i}});
 f.w.nativeNpcLives.invalidateMembership(f.s);f.w.nativeShipSystems.invalidateShips(f.s);
 const before=f.ships.map(ship=>({id:ship.id,job:ship.task.id,x:ship.x,y:ship.y}));f.s.localPrestige[1]=-1;
 for(let i=0;i<120;i++)f.step();
 const engaged=f.ships.filter(ship=>ship.retaliationId||ship.factionResponse);
 assert.equal(engaged.length,f.policy.responseLimit);assert.equal(f.ships.filter(ship=>ship.factionResponse).length,0,'Available local crews do not recruit distant reinforcements');
 assert.ok(f.ships.filter(ship=>f.policy.isFaction(ship)).every(ship=>f.policy.hostileToPlayer(f.s,ship)),'All guards still recognize the hostile player');
 for(const ship of f.ships.filter(ship=>!engaged.includes(ship))){const old=before.find(row=>row.id===ship.id);assert.equal(ship.task.id,old.job);assert.equal(ship.combatInterruption,undefined);assert.equal(ship.x,old.x);assert.equal(ship.y,old.y);}
 const loaded=await defence(copy(f.s));loaded.step();assert.equal(loaded.ships.length,before.length);assert.ok(loaded.ships.filter(ship=>ship.retaliationId||ship.factionResponse).length<=f.policy.responseLimit);
});

test('Continue releases old mass-rally routes while retaining real jobs and limits distant dispatch',async()=>{
 const f=await defence(),template=copy(f.ships.at(-1));f.ships[0].npcRole=f.ships[1].npcRole='civilian';f.s.localPrestige[1]=-1;
 for(let i=0;i<8;i++)f.ships.push({...copy(template),id:300+i,name:'Distant reserve '+i,x:8100+i*100,task:{...copy(template.task),id:'distant-job:'+i}});
 f.w.nativeNpcLives.invalidateMembership(f.s);f.w.nativeShipSystems.invalidateShips(f.s);
 for(const ship of f.ships.filter(ship=>f.policy.isFaction(ship)))f.w.nativeNpcLives.respondToThreat(f.s,ship,f.policy.target(f.s,ship));
 const jobs=f.ships.map(ship=>ship.task.id),loaded=await defence(copy(f.s));loaded.step();
 assert.equal(loaded.ships.filter(ship=>ship.factionResponse).length,f.policy.reinforcementLimit);
 assert.deepEqual(loaded.ships.map(ship=>ship.task.id),jobs);assert.equal(loaded.ships.length,f.ships.length);
 assert.ok(loaded.ships.filter(ship=>!ship.factionResponse).every(ship=>!ship.combatInterruption));
 Object.assign(loaded.s,{x:1000000,y:1000000});loaded.step();assert.equal(loaded.ships.filter(ship=>ship.factionResponse).length,0,'Leaving the actual system cancels reserve orders promptly');
});

test('real faction weapons keep a critical player target and destroy the remaining hull',async()=>{
 const f=await defence(),w=f.w,s=f.s,a=f.ships[0];
 require('node:vm').runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../html-games/broken-mirror-port/player-combat.js'),'utf8'),f.context,{filename:'player-combat.js'});
 w.nativeCombatShots.onPlayerHit=(state,damage,impact)=>w.nativePlayerCombat.hit(state,damage,impact);
 for(const ship of f.ships.slice(1))ship.npcRole='civilian';
 w.nativeWeaponLoadout.refit(s,[1],{holder:a});Object.assign(s,{hull:26,shields:0,phase:'flight'});s.localPrestige[1]=-1;
 let critical=false,criticalHits=0,previousHull=s.hull;
 for(let i=0;i<3600&&s.hull>0;i++){
  f.step();
  if(s.phase==='disabled'){
   critical=true;assert.ok(w.nativeShipDetail.isDetailed(s,s));assert.ok(w.nativeShipSystems.resolve(s,'player'));assert.equal(f.policy.target(s,a)?.id,'player');
   if(s.hull<previousHull)criticalHits++;
  }
  previousHull=s.hull;
 }
 assert.equal(critical,true,'Combat must actually pass through the shared critical hull threshold');assert.ok(criticalHits>0);
 assert.equal(s.hull,0,'Normal weapons must finish the kill without a nonlethal hull floor');assert.equal(s.phase,'destroyed');
 const hits=s.weaponCombat.events.filter(event=>event.sourceId===a.id&&event.hitTargetId==='player');assert.ok(hits.length>0,'Damage must come from real shared weapon contacts');
});

test('ordinary civilian retaliation still breaks off when the player becomes disabled',async()=>{
 const f=await defence(),a=f.ships[0];a.npcRole='civilian';
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'player',sourceId:'player'});assert.equal(a.retaliationTargetId,'player');
 Object.assign(f.s,{hull:9,shields:0,phase:'disabled'});f.step();assert.equal(a.retaliationId,undefined);
 assert.ok(f.w.nativeShipSystems.resolve(f.s,'player'),'Civilian ceasefire cannot remove the critical physical hull');
});

test('military retaliation attempts a real shot on the first simulation step',async()=>{
 const f=await defence(),a=f.ships[0];f.s.localPrestige[1]=-1;f.step();
 assert.ok(f.s.weaponCombat.events.some(event=>event.sourceId===a.id&&event.targetId==='player'&&event.launchedAt===f.w.nativeSimulation.seconds(f.s)),'A ready in-range defender must not wait through the civilian response delay');
});

test('a military crew without a usable weapon leaves pursuit slots for armed defenders',async()=>{
 const f=await defence(),a=f.ships[0];f.w.nativeWeaponLoadout.refit(f.s,[],{holder:a});f.s.localPrestige[1]=-1;f.step();
 assert.equal(a.retaliationId,undefined);assert.equal(a.factionResponse,undefined);assert.ok(!f.s.factionDefence.orders.some(order=>order.shipId===a.id));
 assert.equal(f.ships[1].retaliationTargetId,'player');
});

test('the committed response team hunts across detail boundaries and Continue without drafting closer reserves',async()=>{
 const f=await defence(),w=f.w,s=f.s,third=f.ships.at(-1);third.x=4500;s.localPrestige[1]=-1;s.hull=10000;
 const reserve={...copy(third),id:106,name:'Reserve on duty',x:6500,task:{...copy(third.task),id:'reserve-duty:106'}};f.ships.push(reserve);w.nativeNpcLives.invalidateMembership(s);w.nativeShipSystems.invalidateShips(s);
 f.step();const team=copy(s.factionDefence.orders.map(order=>order.shipId).sort());assert.equal(team.length,3);assert.ok(s.factionDefence.orders.every(order=>order.engaged));
 Object.assign(s,{x:12500,vx:100,vy:0});w.nativeManualFlight.initializeRegion(s);
 assert.equal(w.nativeManualFlight.currentRegion(s).system,1);
 for(let i=0;i<35;i++)f.step();
 assert.deepEqual(copy(s.factionDefence.orders.map(order=>order.shipId).sort()),team);assert.equal(reserve.retaliationId,undefined);assert.equal(reserve.factionResponse,undefined);
 assert.equal(f.ships.filter(ship=>ship.factionResponse).length,3,'Already engaged pursuers must all keep approaching after a chunk transition');
 const loaded=await defence(copy(s));loaded.step();
 assert.deepEqual(copy(loaded.s.factionDefence.orders.map(order=>order.shipId).sort()),team);
 for(const id of team){const ship=loaded.w.nativeNpcLives.find(loaded.s,id);assert.equal(ship.factionResponse.targetId,'player');assert.ok(ship.nextActionAt<=loaded.w.nativeSimulation.seconds(loaded.s)+.501);}
 Object.assign(loaded.s,{x:1000000,y:1000000});loaded.step();assert.equal(loaded.s.factionDefence.orders.length,0,'Real escape from the jurisdiction still ends pursuit');
});

test('a live military pursuit cannot time out while the player remains in combat contact',async()=>{
 const f=await defence(),a=f.ships[0];f.s.localPrestige[1]=100;f.s.hull=100000;
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'player',sourceId:'player',weaponEventId:901});assert.equal(f.s.localPrestige[1],95);
 for(let i=0;i<7260;i++)f.step();
 assert.ok(f.s.factionDefence.systems[1].aggressors[0].until>f.w.nativeSimulation.seconds(f.s));
 assert.equal(a.retaliationTargetId,'player');assert.equal(f.s.localPrestige[1],95,'Maintaining contact must not invent repeat reputation charges');
 Object.assign(f.s,{x:1000000,y:1000000});f.step();assert.equal(a.retaliationId,undefined);
});

test('an off-screen pursuit remains authorized beyond the incident timer while its target is inside the system',async()=>{
 const f=await defence(),a=f.ships[0];f.s.localPrestige[1]=100;
 f.w.nativeCivilianTraffic.hit(f.s,a.id,1,{source:'player',sourceId:'player',weaponEventId:911});f.step();
 const team=copy(f.s.factionDefence.orders.map(order=>order.shipId).sort());
 Object.assign(f.s,{x:12500,vx:100,vy:0});f.w.nativeManualFlight.initializeRegion(f.s);
 for(let i=0;i<35;i++)f.step();assert.equal(f.w.nativeManualFlight.currentRegion(f.s).system,1);assert.equal(f.w.nativeShipDetail.isDetailed(f.s,a),false);assert.ok(a.factionResponse);
 f.w.nativeSimulation.advance(f.s,121);
 assert.equal(f.policy.target(f.s,a)?.id,'player','An off-screen defender must not forget an assigned target that has not left its jurisdiction');
 const loaded=await defence(copy(f.s)),guard=loaded.w.nativeNpcLives.find(loaded.s,a.id),before=loaded.w.nativeNpcLives.pose(loaded.s,guard);
 loaded.step();assert.deepEqual(copy(loaded.s.factionDefence.orders.map(order=>order.shipId).sort()),team);
 for(let i=0;i<240;i++)loaded.step();const after=loaded.w.nativeNpcLives.pose(loaded.s,guard);
 assert.ok(after.x>before.x+1,'The retained pursuit must physically continue after expiry and Continue');assert.equal(loaded.s.localPrestige[1],95);
 Object.assign(loaded.s,{x:1000000,y:1000000});loaded.step();assert.equal(loaded.s.factionDefence.orders.length,0);
});

test('a pursuer crossing the jurisdiction line first does not abandon a player who is still inside',async()=>{
 const f=await defence(),a=f.ships[0],row=f.w.nativeManualFlight.boundaries().find(row=>row.id===1);f.s.localPrestige[1]=-1;f.step();
 let inside,outside;
 for(let i=0;i<64;i++){
  const angle=i*Math.PI/32,p=margin=>({x:row.x+Math.cos(angle)*(row.rx+margin),y:row.y+Math.sin(angle)*(row.ry+margin)});
  if(f.w.nativeManualFlight.regionAtPoint(f.s,p(60)).system!==1&&f.w.nativeManualFlight.regionAtPoint(f.s,p(-30)).system===1){inside=p(-30);outside=p(60);break;}
 }
 assert.ok(inside);Object.assign(f.s,inside);Object.assign(a,outside);f.w.nativeManualFlight.initializeRegion(f.s);f.w.nativeShipSystems.refreshShip(f.s,a,'civilian');
 assert.equal(f.w.nativeManualFlight.currentRegion(f.s).system,1);assert.notEqual(f.policy.region(f.s,a),1);
 assert.equal(f.policy.target(f.s,a)?.id,'player','Jurisdiction must follow the committed order and target, not the pursuer skimming outside the line');
 assert.equal(f.policy.hostileToPlayer(f.s,a),true);
 const loaded=await defence(copy(f.s));assert.equal(loaded.policy.target(loaded.s,loaded.ships[0])?.id,'player');
 Object.assign(loaded.s,outside);loaded.step();assert.equal(loaded.s.factionDefence.orders.length,0);
});
