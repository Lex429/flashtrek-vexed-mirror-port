const test=require('node:test'),assert=require('node:assert/strict');
const {tacticalFixture}=require('./helpers/tactical-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
async function military(saved){
 const f=await tacticalFixture({state:saved}),w=f.window,s=f.state,[ship,target]=f.ships;
 if(!saved){
  Object.assign(s,{x:1000,y:0});Object.assign(ship,{role:'patrol',ownerGovernmentId:1,x:1000,y:0,heading:0,hull:100,shields:100});
  Object.assign(target,{x:1600,y:0,heading:Math.PI,hull:10000,shields:100});
  w.nativeWeaponLoadout.refit(s,[1],{holder:ship});w.nativeWeaponLoadout.refit(s,[6],{holder:target});
  w.nativeCivilianCombatAI.begin(ship,'defender',0);
 }
 const decide=at=>w.nativeCivilianCombatAI.decide(ship,target,{a:ship.id,b:target.id},{state:s,clock:at,hull:100,shields:100,rocks:[],bodies:[],bystanders:[]});
 return {...f,w,s,ship,target,decide};
}
test('military pursuit closes at full throttle, leads a moving target and keeps pressure at close range',async()=>{
 const f=await military();Object.assign(f.target,{vx:100,vy:80});
 const command=f.decide(0);assert.equal(f.ship.combatAI.mode,'pursuit');assert.equal(command.throttle,1);assert.ok(command.heading>0,'Intercept the course ahead of a moving target');
 Object.assign(f.target,{x:1100,vx:0,vy:0});const close=f.decide(.1);
 assert.equal(f.ship.combatAI.mode,'attack-pass');assert.ok(Math.cos(close.heading)>0,'A close attack pass must not become an escape command');
 assert.ok(f.ship.combatAI.desiredRange<=450);assert.equal(f.ship.combatAI.disengaging,undefined);
});
test('an armed warship cancels a saved civilian retreat and continues at low hull or with cargo',async()=>{
 let f=await military();Object.assign(f.ship,{hull:28,shields:0,cargo:{good:1,tons:4},crewTraits:{version:1,caution:.98,aggression:.02}});
 Object.assign(f.ship.combatAI,{disengaging:true,disengagedAt:0,escaped:true,escapeGoal:{x:-10000,y:0},reason:'Damage makes continued combat unsafe'});
 f=await military(copy(f.s));const command=f.decide(1);
 assert.equal(f.ship.combatAI.disengaging,undefined);assert.equal(f.ship.combatAI.escaped,false);assert.equal(f.ship.combatAI.escapeGoal,undefined);
 assert.equal(f.ship.combatAI.mode,'pursuit');assert.equal(command.throttle,1);assert.ok(Math.cos(command.heading)>0);assert.equal(f.ship.cargo.tons,4);
 f.ship.combatAI.escaped=true;f.decide(1.1);assert.equal(f.ship.combatAI.escaped,false,'An orphaned saved escape flag cannot repeatedly break military contact');
 f.w.nativeWeaponLoadout.refit(f.s,[],{holder:f.ship});f.decide(2);
 assert.equal(f.ship.combatAI.mode,'disengage','A ship with no usable weapon can still escape rather than make a futile attack');
});
test('a genuine projectile triggers a short military dodge followed by renewed pursuit',async()=>{
 const f=await military(),w=f.w,shot=w.nativeCombatShots.fireFor({state:f.s,shooter:w.nativeShipDefinitions.describe(f.s,f.target,{category:'civilian'}),target:w.nativeShipDefinitions.describe(f.s,f.ship,{category:'civilian'})});
 assert.ok(shot.ok,shot.error);Object.assign(shot.event,{x:1200,y:0,vx:-340,vy:0,launchedAt:-.2});
 f.decide(0);f.decide(.25);assert.equal(f.ship.combatAI.mode,'dodge');
 const command=f.decide(.6);assert.ok(w.nativeCombatShots.activeProjectile(f.s,shot.event.id));
 assert.equal(f.ship.combatAI.mode,'pursuit');assert.ok(Math.cos(command.heading)>0,'The evasive pass must return toward the enemy while the encounter remains live');
});
test('shared physical motion and live weapons sustain an attack against a fleeing ship',async()=>{
 const f=await military(),w=f.w,profile=w.nativeShipDefinitions.forEntity(f.s,f.ship,{category:'civilian'}).movement;
 let hits=0,shots=0;const hit=w.nativeCivilianTraffic.hit;
 w.nativeCivilianTraffic.hit=(state,id,damage,impact)=>{if(id===f.target.id&&impact.sourceId===f.ship.id)hits++;return hit(state,id,damage,impact);};
 const start=Math.hypot(f.target.x-f.ship.x,f.target.y-f.ship.y),speed=profile.maxSpeed*.35;
 for(let i=0;i<600;i++){
  w.nativeSimulation.advance(f.s,1/60);w.nativeShipMotion.step(f.target,{heading:0,speed,throttle:1},profile,1/60);
  w.nativeShipSystems.refreshShip(f.s,f.target,'civilian');
  const actor=w.nativeShipDefinitions.describe(f.s,f.ship,{category:'civilian'}),target=w.nativeShipSystems.resolve(f.s,f.target.id);
  w.nativeCivilianCombatAI.steer(f.ship,target,{b:f.target.id},{state:f.s,actor,clock:w.nativeSimulation.seconds(f.s),dt:1/60,hull:100,shields:100,rocks:[],bodies:[],bystanders:[target]});
  w.nativeShipSystems.refreshShip(f.s,f.ship,'civilian');
  if(i%6===0&&w.nativeCombatShots.fireFor({state:f.s,shooter:actor,target}).ok)shots++;
  w.nativeCombatShots.advance(f.s,1/60);
 }
 const distance=Math.hypot(f.target.x-f.ship.x,f.target.y-f.ship.y);
 assert.ok(distance<start,JSON.stringify({start,distance}));assert.ok(f.ship.x>1000+speed*5,'The attacker must physically follow the escaping target');
 assert.ok(shots>=5&&hits>=5,JSON.stringify({shots,hits}));assert.equal(f.ship.combatAI.disengaging,undefined);
});
