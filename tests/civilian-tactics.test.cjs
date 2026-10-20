const test=require('node:test');
const assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function fit(f,ship,kind){
  const weapon=f.window.VexedMirrorWeapons.find(w=>w.damage>0&&f.window.nativeCombatShots.weaponVisual(w).kind===kind);
  assert.ok(weapon,kind);delete ship.shipEquipment;delete ship.weaponLoadout;ship.weapons=[weapon.id];
  f.window.nativeWeaponLoadout.ensure(f.state,ship,[weapon.id]);return weapon;
}
async function tactical(){
  const f=await tacticalFixture(),[ship,target]=f.ships;
  Object.assign(ship,{x:1000,y:0,heading:0,vx:0,vy:0,hull:100,shields:100});
  Object.assign(target,{x:1300,y:0,heading:Math.PI,vx:0,vy:0,hull:100,shields:100});
  fit(f,ship,'beam');fit(f,target,'disruptor');
  f.window.nativeCivilianCombatAI.begin(ship,'defender',0);
  f.scene={state:f.state,clock:0,hull:100,shields:100,rocks:[],bodies:[],bystanders:[]};f.ship=ship;f.target=target;return f;
}
const decide=(f,at)=>f.window.nativeCivilianCombatAI.decide(f.ship,f.target,{a:f.ship.id,b:f.target.id,pending:[],anchor:{x:1000,y:0}}, {...f.scene,clock:at});
function liveShot(f){
  const fired=f.window.nativeCombatShots.fireFor({state:f.state,shooter:f.window.nativeShipDefinitions.describe(f.state,f.target,{category:'civilian'}),target:f.window.nativeShipDefinitions.describe(f.state,f.ship,{category:'civilian'})});
  assert.equal(fired.ok,true,fired.error);Object.assign(fired.event,{x:1200,y:0,vx:-340,vy:0,launchedAt:-.2});return fired.event;
}
test('AI observes actual shared stray projectiles, waits for its saved reaction, and never trusts obsolete pending lists',async()=>{
  let f=await tactical();const event=liveShot(f);event.targetId='other-lock';
  decide(f,0);assert.notEqual(f.ship.combatAI.mode,'dodge');assert.equal(f.ship.combatAI.observedThreats[0]?.id,event.id);
  decide(f,.12);assert.notEqual(f.ship.combatAI.mode,'dodge');
  const saved=plain(f.state);f=await tacticalFixture({state:saved});f.ship=f.ships[0];f.target=f.ships[1];f.scene={state:f.state,hull:100,shields:100};
  decide(f,.25);assert.equal(f.ship.combatAI.mode,'dodge');assert.equal(f.ship.combatAI.threatId,event.id);
  assert.equal(f.state.weaponCombat.events.length,1);assert.equal(f.state.weaponCombat.events[0].resolved,false);
  f.state.weaponCombat.events[0].cancelled=true;decide(f,.26);assert.notEqual(f.ship.combatAI.mode,'dodge','Cancelled shots cannot keep a cached evasive maneuver alive');
  f=await tactical();f.window.nativeCivilianCombatAI.decide(f.ship,f.target,{b:f.target.id,pending:[{projectile:true,x:1200,y:0,vx:-340,vy:0,age:.2,targetId:f.ship.id}]},{...f.scene,clock:10});
  assert.notEqual(f.ship.combatAI.mode,'dodge');
});
test('ordinary civilian jobs notice a real incoming projectile and resume without firing at a stray shooter',async()=>{
  const f=await tactical(),event=liveShot(f);f.ship.nextActionAt=10000;f.target.nextActionAt=10000;
  // Existing scheduler ownership stays in place; the awareness pass only detours it.
  let reacted=false;for(let i=0;i<35&&!reacted;i++){f.step(1/60);reacted=!!f.ship.projectileEvade;}
  assert.ok(reacted,'idle civilian perceived the live shared shot');assert.equal(f.ship.combatAI.mode,'dodge');assert.equal(f.state.civilianTraffic.retaliations.length,0);
  event.alive=false;event.cancelled=true;for(let i=0;i<90;i++)f.step(1/60);
  assert.equal(f.ship.projectileEvade,undefined);assert.notEqual(f.ship.phase,'fighting');assert.equal(f.state.civilianTraffic.retaliations.length,0);
});
test('unchanged healthy combat has no timer-driven reversals; meaningful damage commits to escape',async()=>{
  const f=await tactical();const sides=[];
  for(let t=0;t<=40;t+=.1){decide(f,t);sides.push(f.ship.combatAI.side);}
  assert.equal(new Set(sides).size,1);assert.equal(f.ship.combatAI.disengaging,undefined);
  f.ship.hull=35;f.ship.combatAI.lastHitAt=40;decide(f,40);assert.equal(f.ship.combatAI.mode,'disengage');
  const goal=plain(f.ship.combatAI.escapeGoal);for(let t=40.1;t<65;t+=.1)decide(f,t);
  assert.equal(f.ship.combatAI.mode,'disengage');assert.deepEqual(plain(f.ship.combatAI.escapeGoal),goal);
  assert.ok(Math.cos(decide(f,65).heading)<0,'escape route leads away from attacker despite former combat anchor');
});
test('a pursued civilian extends escape legs beyond the original waypoint and keeps the commitment after reload',async()=>{
  let f=await tactical();Object.assign(f.ship,{x:1000,y:0,heading:0,hull:35});Object.assign(f.target,{x:700,y:0});
  decide(f,0);const original=f.ship.combatAI.escapeGoal.x,traits=plain(f.ship.crewTraits),equipment=plain(f.ship.shipEquipment);
  assert.ok(original>f.ship.x,'initial physical escape leg leads away from pursuer');
  for(let i=1;i<=100;i++){
    f.ship.x=1000+i*50;f.target.x=f.ship.x-300;
    const command=decide(f,i*.5);assert.ok(Math.cos(command.heading)>.3,'pursuer must not turn the ship back at an escape waypoint');
    assert.equal(f.ship.combatAI.disengaging,true);assert.equal(f.ship.combatAI.escaped,false);
    if(i===40){const state=plain(f.state);f=await tacticalFixture({state});f.ship=f.ships[0];f.target=f.ships[1];f.scene={state:f.state,hull:100,shields:100};}
  }
  assert.ok(f.ship.x>original+1600);assert.ok(f.ship.combatAI.escapeLegs>=2,'continued pursuit causes further physical escape legs');
  assert.deepEqual(plain(f.ship.crewTraits),traits);assert.deepEqual(plain(f.ship.shipEquipment),equipment);
});

test('the first hit on an idle cautious crew records damage before choosing its shield-collapse escape',async()=>{
  const f=await fixture({full:false,economic:false}),{ship,state}=f;
  f.window.nativeShipDefinitions.register(ship.shipType,{npcPolicy:{name:'civilian',combat:{retreatHull:.1,retreatShield:.2}}});
  fit(f,ship,'beam');Object.assign(ship,{hull:100,shields:5,crewTraits:{version:1,caution:.95,aggression:.05}});
  state.x=ship.x+300;state.y=ship.y;delete ship.combatAI;
  const hit=f.window.nativeCivilianTraffic.hit(state,ship.id,5,{source:'player',sourceId:'player',from:{x:state.x,y:state.y}});
  assert.ok(hit.ok);assert.equal(ship.hull,100);assert.equal(ship.shields,0);
  assert.equal(ship.combatAI.lastHitAt,state.civilianTraffic.clock,'the triggering hit must survive combat-state initialization');
  f.window.nativeCivilianCombatAI.decide(ship,{x:state.x,y:state.y,hull:100}, {b:'player'}, {state,clock:state.civilianTraffic.clock,hull:100,shields:100});
  assert.equal(ship.combatAI.disengaging,true);assert.equal(ship.combatAI.mode,'disengage');
});
test('maneuver distance follows fitted weapon range, while crew differences survive JSON restoration',async()=>{
  const f=await tactical(),ai=f.window.nativeCivilianCombatAI,ranges={};
  for(const kind of ['disruptor','beam','torpedo']){fit(f,f.ship,kind);decide(f,0);ranges[kind]=f.ship.combatAI.desiredRange;}
  assert.ok(ranges.disruptor<ranges.beam&&ranges.beam<ranges.torpedo,JSON.stringify(ranges));
  const traits=plain(f.ship.crewTraits),restored=await tacticalFixture({state:plain(f.state)});
  assert.deepEqual(plain(restored.ships[0].crewTraits),traits);assert.notDeepEqual(plain(f.target.crewTraits),traits);
  assert.equal(ai.combatRange(f.state,f.ship).range,650);
});
test('old periodic combat records migrate once without replacing crew traits or owned equipment',async()=>{
  const f=await tactical(),traits=plain(f.ship.crewTraits),equipment=plain(f.ship.shipEquipment);
  f.ship.combatAI={role:'defender',mode:'hold-range',side:-1,until:3.5,nextEvade:4,lastHitAt:-2,shots:7};
  decide(f,0);assert.equal(f.ship.combatAI.version,2);assert.equal(f.ship.combatAI.shots,7);assert.equal(f.ship.combatAI.lastHitAt,-2);
  assert.deepEqual(plain(f.ship.crewTraits),traits);assert.deepEqual(plain(f.ship.shipEquipment),equipment);
  const ai=f.ship.combatAI;decide(f,10);assert.equal(f.ship.combatAI,ai);
});
test('a new registered cargo or medical policy supplies survival intent without ship-identity branches or bonuses',async()=>{
  const f=await tactical(),defs=f.window.nativeShipDefinitions;
  for(const policy of ['cargo','medical']){
    defs.register(9001,{name:'Policy extension',hull:100,shields:100,cargo:100,npcPolicy:policy});
    const ship={...plain(f.ship),id:9001,shipType:9001,cargo:{good:5,tons:4},repairDeuranium:30};
    f.window.nativeCivilianCombatAI.begin(ship,'defender',0);
    const command=f.window.nativeCivilianCombatAI.decide(ship,f.target,{b:f.target.id},f.scene);
    assert.equal(ship.combatAI.disengaging,true);assert.equal(command.engineFactor,undefined);assert.equal(command.turnFactor,undefined);
    assert.equal(ship.repairDeuranium,30);assert.equal(ship.cargo.tons,4);assert.equal(defs.forEntity(f.state,ship,{category:'civilian'}).movement.maxSpeed,defs.get(9001).movement?.maxSpeed??157.5);
  }
  for(const combat of [{caution:NaN},{aggression:1.1},{retreatHull:-1},{retreatShield:Infinity},{distanceFactor:0},{protectCargo:'yes'},{survivalFirst:1}])assert.throws(()=>defs.register(9001,{npcPolicy:{name:'civilian',combat}}),/Invalid combat/);
});
test('combat suspension preserves one funded agreement, escrow, cargo and recharge through reload, disable, repair and job resumption',async()=>{
  let f=await fixture({full:false,economic:false}),{ship,state,lives}=f;
  state.solEconomy.freighters=[];
  const started=lives.startDelivery(state,ship.id,{fromSystem:1,fromPort:3,toSystem:2,good:5,tons:4});assert.ok(started.ok);
  const jobId=ship.task.id,agreement=plain(ship.task.agreement),reservation=plain(lives.initialize(state).reservations[jobId]),credits=ship.credits;
  lives.suspendCombat(state,ship,'Test collision threat');ship.phase='fighting';ship.retaliationId='retaliation:'+ship.id;
  const weapon=f.window.nativeWeaponLoadout.equipped(state,ship)[0];weapon.instance.readyAt=45;
  f=await fixture({saved:plain(state),economic:false});({ship,state,lives}=f);
  assert.equal(ship.task.id,jobId);assert.equal(ship.task.status,'active');assert.deepEqual(plain(lives.initialize(state).reservations[jobId]),reservation);assert.equal(ship.credits,credits);
  f.window.nativePause.active=true;const snapshot=JSON.stringify(state);f.step(.25);assert.equal(JSON.stringify(state),snapshot);f.window.nativePause.active=false;
  lives.interrupt(state,ship,'disabled');assert.equal(ship.task.id,jobId);assert.equal(ship.task.status,'active');assert.deepEqual(plain(lives.initialize(state).reservations[jobId]),reservation);
  assert.equal(lives.resumeWork(state,ship),false);ship.hull=f.window.nativeShipDefinitions.forEntity(state,ship,{category:'civilian'}).hull;ship.phase='docked';delete ship.retaliationId;
  assert.ok(lives.resumeWork(state,ship,'Shared repair finished'));assert.equal(ship.task.id,jobId);assert.deepEqual(plain(ship.task.agreement),agreement);assert.ok(ship.localLeg);assert.equal(f.window.nativeWeaponLoadout.equipped(state,ship)[0].instance.readyAt,45);
  for(let i=0;i<24000&&ship.deliveries===0;i++)f.step();
  assert.equal(ship.deliveries,1);assert.equal(lives.initialize(state).reservations[jobId],undefined);assert.equal(ship.cargo,null);
});
test('a queued pickup resumes loading at its original port instead of routing unpaid cargo to the buyer',async()=>{
  let f=await fixture({full:false,economic:false}),{ship,state,lives}=f;
  assert.ok(lives.startDelivery(state,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good:5,tons:4}).ok);
  ship.task.phase='holding-flight';ship.dockIntent={port:3,handling:'loading'};
  lives.suspendCombat(state,ship,'Incoming projectile');ship.phase='fighting';const id=ship.task.id;
  f=await fixture({saved:plain(state),economic:false});({ship,state,lives}=f);ship.phase='docked';
  assert.ok(lives.resumeWork(state,ship));assert.equal(ship.task.id,id);assert.equal(ship.dockIntent.port,3);assert.equal(ship.dockIntent.handling,'loading');
  for(let i=0;i<12000&&!ship.cargo;i++)f.step();assert.ok(ship.cargo);assert.equal(ship.cargo.transactionId,'load:'+id);assert.equal(ship.cargo.purchasedFor,64);
});
test('a mined entitlement survives a saved combat detour and is collected exactly once after physical return',async()=>{
  let f=await fixture({full:false,economic:false}),{ship,state,lives}=f;
  ship.role='mining';lives.resumeWork(state,ship,'Resume mining work');
  for(let i=0;i<30000&&ship.task?.phase!=='collecting';i++)f.step();assert.equal(ship.task.phase,'collecting');
  const jobId=ship.task.id,rockId=ship.task.requirements.rockId,mined=ship.mined,drop=state.asteroidOreDrops[rockId],tons=[0,1,2,3].filter(i=>drop&(1<<i)).length;
  lives.suspendCombat(state,ship,'Avoid incoming fire during transport');ship.phase='fighting';
  f=await fixture({saved:plain(state),economic:false});({ship,state,lives}=f);ship.phase='docked';assert.ok(lives.resumeWork(state,ship));assert.ok(ship.localLeg);
  for(let i=0;i<12000&&ship.task.id===jobId&&ship.task.phase==='collecting';i++)f.step();
  assert.equal(ship.mined,mined+tons);assert.equal(state.minedAsteroids.filter(id=>id===rockId).length,1);assert.equal(state.asteroidOreDrops[rockId],0);assert.ok(tons>0);
  for(let i=0;i<300;i++)f.step();assert.equal(ship.mined,mined+tons);
});
test('a paid repair returns physically to an actual berth before its remaining deadline, without charging twice',async()=>{
  let f=await fixture({full:false,economic:false}),{ship,state,lives}=f;
  Object.assign(ship,{shields:0,credits:1000,nextActionAt:0});f=await fixture({saved:plain(state),economic:false});({ship,state,lives}=f);
  f.step();assert.equal(ship.task.kind,'repair');const jobId=ship.task.id,cost=ship.task.requirements.cost,treasury=lives.market(state,1,3).credits,wallet=ship.credits;
  assert.ok(cost>0);lives.suspendCombat(state,ship,'Combat evacuation during paid repair');ship.phase='fighting';
  // Arrange the survivor's physical post-combat location far from the port.
  ship.x=5000;ship.y=1000;f=await fixture({saved:plain(state),economic:false});({ship,state,lives}=f);ship.phase='docked';
  assert.ok(lives.resumeWork(state,ship));assert.equal(ship.task.id,jobId);assert.ok(ship.localLeg);assert.equal(ship.combatReturn.phase,'repairing');
  for(let i=0;i<9*60;i++)f.step();assert.equal(ship.shields,0,'paid repair cannot complete at the escape position');assert.equal(ship.task.status,'active');
  for(let i=0;i<12000&&ship.task.status==='active';i++)f.step();assert.equal(ship.task.status,'completed');assert.ok(ship.shields>0);
  const berth=f.window.nativePortDocking.inspect(state,ship);assert.ok(berth);assert.equal(ship.credits,wallet);assert.equal(lives.market(state,1,3).credits,treasury);assert.equal(ship.task.requirements.cost,cost);
});
test('loaded cargo crews and supplied medical crews escape physically, retain their jobs midway and resume work',async()=>{
  for(const policy of ['cargo','medical']){
    let f=await fixture({full:false,economic:false}),{ship,state,lives}=f;
    f.window.nativeShipDefinitions.register(ship.shipType,{npcPolicy:policy});
    state.solEconomy.freighters=[];state.system=1;
    assert.ok(lives.startDelivery(state,ship.id,{fromSystem:1,fromPort:3,toSystem:1,toPort:5,good:5,tons:4}).ok);
    for(let i=0;i<12000&&!ship.cargo;i++)f.step();assert.ok(ship.cargo,'real funded cargo loaded');
    const jobId=ship.task.id,cargo=plain(ship.cargo),escrow=plain(lives.initialize(state).reservations[jobId]);ship.repairDeuranium=50;
    state.x=ship.x+300;state.y=ship.y;state.hull=state.shields=100000;
    const origin={x:ship.x,y:ship.y};f.window.nativeCivilianTraffic.hit(state,ship.id,1,{source:'player',sourceId:'player',from:{x:state.x,y:state.y}});
    for(let i=0;i<60;i++)f.step();assert.equal(ship.combatAI.disengaging,true);assert.ok(Math.hypot(ship.x-origin.x,ship.y-origin.y)>10);
    f=await fixture({saved:plain(state),economic:false});({ship,state,lives}=f);f.window.nativeShipDefinitions.register(ship.shipType,{npcPolicy:policy});
    assert.equal(ship.task.id,jobId);assert.deepEqual(plain(ship.cargo),cargo);assert.deepEqual(plain(lives.initialize(state).reservations[jobId]),escrow);assert.equal(ship.repairDeuranium,50);
    for(let i=0;i<4800&&ship.retaliationId;i++)f.step();
    assert.equal(ship.retaliationId,undefined,policy+' achieved safe separation');assert.ok(Math.hypot(ship.x-state.x,ship.y-state.y)>820);
    assert.equal(ship.task.id,jobId);assert.equal(ship.task.status,'active');assert.ok(ship.localLeg,'physical job route rebuilt');assert.deepEqual(plain(ship.cargo),cargo);assert.equal(ship.repairDeuranium,50);
  }
});
