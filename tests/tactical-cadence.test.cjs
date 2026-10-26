const test=require('node:test');
const assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');

test('catch-up reuses crew intent, integrates every substep and reacts immediately to damage and fitting',async()=>{
  const {window:w,state,ships}=await tacticalFixture(),[ship,target]=ships;
  Object.assign(ship,{x:1000,y:0,heading:0,vx:0,vy:0});Object.assign(target,{x:1300,y:0,heading:Math.PI,vx:0,vy:0});
  w.nativeCivilianCombatAI.begin(ship,'defender',0);w.nativeSimulationFrame.begin(state);
  const scene=()=>({state,clock:w.nativeSimulation.seconds(state),dt:1/120,hull:100,shields:100,rocks:[],bystanders:[],bodies:[]});
  for(let i=0;i<120;i++){
    w.nativeSimulationFrame.step(state);w.nativeSimulation.advance(state,1/120);
    w.nativeCivilianCombatAI.steer(ship,target,{b:target.id},scene());
  }
  const work=w.nativeSimulationFrame.snapshot(state);
  assert.equal(work.steps,120);assert.ok(Math.abs(w.nativeSimulation.seconds(state)-1)<1e-12);
  assert.ok(work.counters.tacticalDecisions<=31);assert.ok(work.counters.tacticalDecisionReuses>=89);
  assert.ok(Math.hypot(ship.x-1000,ship.y)>1,'the ship continues moving between decisions');
  const before=work.counters.tacticalDecisions;ship.hull=20;
  w.nativeCivilianCombatAI.steer(ship,target,{b:target.id},scene());
  assert.equal(w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisions,before+1);
  assert.equal(ship.combatAI.disengaging,true);
  const weapon=w.VexedMirrorWeapons.find(item=>item.damage>0&&w.nativeCombatShots.weaponVisual(item).kind==='torpedo');
  w.nativeWeaponLoadout.refit(state,[weapon.id],{holder:ship});
  w.nativeCivilianCombatAI.steer(ship,target,{b:target.id},scene());
  assert.equal(w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisions,before+2);
  assert.equal(ship.combatAI.weaponRange,1500);
  w.nativeSimulationFrame.end(state);
});

test('active slow frames retain elapsed time while pause and hidden gates still stop integration',async()=>{
  const {window:w,state,document}=await tacticalFixture();
  const elapsed=w.nativeSimulation.frameSeconds(735),start=w.nativeSimulation.seconds(state);
  const steps=Math.ceil(elapsed*60);
  for(let i=0;i<steps;i++)w.nativeSimulation.advance(state,elapsed/steps);
  assert.equal(steps,45);assert.ok(Math.abs(w.nativeSimulation.seconds(state)-start-.735)<1e-12);
  w.nativePause.active=true;assert.equal(w.nativeSimulation.advance(state,elapsed),0);
  w.nativePause.active=false;document.hidden=true;assert.equal(w.nativeSimulation.advance(state,elapsed),0);
  assert.equal(w.nativeSimulation.frameSeconds(Infinity),0);assert.equal(w.nativeSimulation.frameSeconds(-10),0);
});

test('prepared tactical actors are reused for perception and avoidance while pose, fitting and state stay current',async()=>{
  const {window:w,state,ships}=await tacticalFixture(),[ship,target]=ships;
  Object.assign(ship,{x:1000,y:0,heading:0,vx:0,vy:0});Object.assign(target,{x:1400,y:0,heading:Math.PI,vx:0,vy:0});
  const beam=w.VexedMirrorWeapons.find(item=>item.damage>0&&w.nativeCombatShots.weaponVisual(item).kind==='beam');
  const torpedo=w.VexedMirrorWeapons.find(item=>item.damage>0&&w.nativeCombatShots.weaponVisual(item).kind==='torpedo');
  w.nativeWeaponLoadout.refit(state,[beam.id],{holder:ship});
  const definitions=w.nativeShipDefinitions,initial=definitions.describe(state,ship,{category:'civilian'});
  ship.hull=initial.definition.hull;ship.shields=initial.definition.shields;
  w.nativeCivilianCombatAI.begin(ship,'defender',0);
  let descriptions=0,effectiveReads=0;
  w.nativeShipDefinitions={...definitions,
    describe(...args){if(args[1]===ship)descriptions++;return definitions.describe(...args);},
    forEntity(...args){if(args[1]===ship)effectiveReads++;return definitions.forEntity(...args);}};
  const threats=w.nativeCombatShots.threats,seenThreats=[],avoid=w.nativeShipMotion.avoidShips,seenAvoidance=[];
  w.nativeCombatShots.threats=(...args)=>{seenThreats.push(args[1]);return threats(...args);};
  w.nativeShipMotion={...w.nativeShipMotion,avoidShips(actor,neighbors,command,movement){seenAvoidance.push({actor,movement});return avoid(actor,neighbors,command,movement);}};
  w.nativeSimulationFrame.begin(state);
  const prepare=owner=>w.nativeShipDefinitions.describe(owner,ship,{category:'civilian'});
  const steer=(actor,owner=state)=>w.nativeCivilianCombatAI.steer(ship,target,{b:target.id},{state:owner,actor,clock:w.nativeSimulation.seconds(owner),dt:1/240,
    hull:actor.definition.hull,shields:actor.definition.shields,rocks:[],bystanders:[],bodies:[]});
  const first=prepare(state),beforeDescriptions=descriptions;
  steer(first);
  assert.equal(descriptions,beforeDescriptions,'steer and its perception pass must use the prepared actor');
  assert.equal(effectiveReads,0,'the actor already owns the effective movement/statistics');
  assert.equal(seenThreats.at(-1),first);assert.equal(seenAvoidance.at(-1).actor,first);
  const firstDecisions=w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisions;
  w.nativeSimulation.advance(state,1/240);
  const fresh=prepare(state),beforeReuse=descriptions;steer(fresh);
  assert.equal(descriptions,beforeReuse);assert.equal(seenAvoidance.at(-1).actor,fresh);
  assert.notEqual(fresh.x,first.x,'avoidance receives the new physical pose during intent reuse');
  assert.equal(w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisions,firstDecisions);
  assert.equal(w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisionReuses,1);

  w.nativeWeaponLoadout.refit(state,[torpedo.id],{holder:ship});
  const fitted=prepare(state),beforeFit=descriptions;steer(fitted);
  assert.equal(descriptions,beforeFit);assert.equal(ship.combatAI.weaponRange,1500);
  assert.equal(w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisions,firstDecisions+1,'fitting changes bypass the cadence deadline');
  const equipment=ship.shipEquipment,engine=equipment.slots.engineering[0];equipment.slots.engineering[0]=null;
  const unpowered=prepare(state);steer(unpowered);
  assert.equal(unpowered.definition.engineOnline,false);assert.equal(seenAvoidance.at(-1).movement.maxSpeed,90);
  assert.equal(w.nativeSimulationFrame.snapshot(state).counters.tacticalDecisions,firstDecisions+2,'effective movement changes react immediately');

  equipment.slots.engineering[0]=engine;
  const otherState={...state,shipSimulation:{...state.shipSimulation}},wrongOwner=prepare(otherState);
  ship.combatAI.nextThreatAt=w.nativeSimulation.seconds(state);
  const beforeFallback=descriptions;steer(wrongOwner);
  assert.equal(descriptions,beforeFallback+1,'an actor from another state requires exactly one authoritative description');
  assert.notEqual(seenAvoidance.at(-1).actor,wrongOwner);assert.equal(seenAvoidance.at(-1).actor.state,state);
  assert.equal(seenThreats.at(-1),seenAvoidance.at(-1).actor,'perception reuses the same corrected actor');
  assert.ok(seenAvoidance.at(-1).movement.maxSpeed>0);assert.equal(effectiveReads,0);
  ship.combatAI.nextThreatAt=w.nativeSimulation.seconds(otherState);
  const authoritativeOther=prepare(otherState),beforeStateChange=seenThreats.length;
  steer(authoritativeOther,otherState);
  assert.equal(seenThreats.length,beforeStateChange+1,'changing the authoritative state cannot reuse another state\'s cached intent');
  assert.equal(seenThreats.at(-1),authoritativeOther);assert.equal(seenAvoidance.at(-1).actor,authoritativeOther);
  ship.combatAI.version=1;
  const legacy=prepare(state),beforeMigration=descriptions;steer(legacy);
  assert.equal(ship.combatAI.version,2);assert.equal(descriptions,beforeMigration,'legacy AI migration retains the prepared actor');
  assert.equal(seenThreats.at(-1),legacy);
  w.nativeSimulationFrame.end(state);
});
