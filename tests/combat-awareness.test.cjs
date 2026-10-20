const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');

async function combat(){
  const f=await fixture({full:false,economic:false});
  const w=f.window,s=f.state,ship=f.ship;
  Object.assign(s,{x:1000000,y:1000000,angle:0,hull:100,shields:100,weapons:[],weaponInventory:[]});
  Object.assign(ship,{x:s.x+220,y:s.y,heading:Math.PI,speed:0,vx:0,vy:0,system:s.system,phase:'cruise',hull:100,shields:100});
  delete ship.localLeg;delete ship.journey;
  const model=kind=>w.VexedMirrorWeapons.find(model=>model.damage>0&&w.nativeCombatShots.weaponVisual(model).kind===kind);
  const fit=(...models)=>{delete s.shipEquipment;delete s.weaponLoadout;s.weapons=models.map(model=>model.id);s.weaponInventory=[];};
  const source=()=>w.nativeShipDefinitions.describe(s,s,{category:'player'});
  const target=()=>w.nativeShipDefinitions.describe(s,ship,{category:'civilian'});
  const fire=()=>w.nativeCombatShots.fireFor({state:s,shooter:source(),target:target()});
  const tick=dt=>{w.nativeSimulation.advance(s,dt);w.nativeCombatShots.advance(s,dt);};
  return {...f,w,s,ship,model,fit,source,target,fire,tick};
}

test('live stray projectiles are perceived through shared shots, after reaction delay, without mutating the attack',async()=>{
  const f=await combat();f.fit(f.model('disruptor'));
  const fired=f.fire();assert.equal(fired.ok,true);fired.event.targetId='departed-original-lock';
  assert.equal(f.w.nativeCombatShots.threats(f.s,f.target()).length,0,'no immediate psychic response');
  f.tick(.16);const before=JSON.stringify(f.s);
  const threats=f.w.nativeCombatShots.threats(f.s,f.target());
  assert.equal(threats.length,1);assert.equal(threats[0].id,fired.event.id);
  assert.ok(threats[0].timeToImpact>0&&threats[0].timeToImpact<.9);
  assert.equal(JSON.stringify(f.s),before,'awareness cannot simulate or damage shots');
  assert.equal(f.s.civilianTraffic.disputes.length,0,'no obsolete pending queue needed');
});

test('threat forecast uses shared shield/hull geometry and rejects receding, distant and departed shots',async()=>{
  const f=await combat();f.fit(f.model('disruptor'));const fired=f.fire();f.tick(.16);
  const event=fired.event;
  const check=()=>f.w.nativeCombatShots.threats(f.s,f.target());
  assert.equal(check().length,1);
  event.vx=-Math.abs(event.vx);assert.equal(check().length,0,'receding shot');event.vx=Math.abs(event.vx);
  event.system=999;assert.equal(check().length,0);event.system=f.s.system;
  event.cancelled=true;assert.equal(check().length,0);event.cancelled=false;
  event.resolved=true;assert.equal(check().length,0);event.resolved=false;
  event.sourceId=f.ship.id;assert.equal(check().length,0,'own projectile');event.sourceId='player';
  event.y=f.ship.y+30;
  const d=f.target(),r=d.radii;
  const shielded=check().length;
  f.ship.shields=0;
  const hull=check().length;
  assert.ok(shielded>=hull,'charge-dependent shared surfaces remain authoritative');
  event.y=f.ship.y+Math.max(r.rx,r.ry)+100;assert.equal(check().length,0,'clear miss');
});

test('a nearer physical ship or asteroid removes the downstream predicted threat',async()=>{
  for(const category of ['ship','asteroid']){
    const f=await combat();f.fit(f.model('disruptor'));f.fire();f.tick(.16);
    const descriptor=f.target();
    f.w.nativeCombatShots.configureScene(()=>category==='ship'?{bystanders:[{...descriptor,id:'blocker',x:f.s.x+140}],rocks:[]}:
      {bystanders:[],rocks:[{slotId:999,x:f.s.x+140,y:f.s.y,size:50}]});
    assert.equal(f.w.nativeCombatShots.threats(f.s,descriptor).length,0,category+' intercepts before subject');
  }
});

test('awareness work and returned threats stay bounded in dense saved projectile queues',async()=>{
  const f=await combat();f.fit(f.model('disruptor'));const fired=f.fire();f.tick(.16);
  const template=JSON.parse(JSON.stringify(fired.event));
  for(let i=0;i<1000;i++)f.s.weaponCombat.events.push({...template,id:i+100});
  const threats=f.w.nativeCombatShots.threats(f.s,f.target(),{limit:100,horizon:99});
  const work=f.w.nativeCombatShots.awarenessMetrics(f.s);
  assert.ok(threats.length<=8);assert.ok(work.scanned<=256);assert.ok(work.narrow<=16);
});

test('restored active projectile retains shared awareness and is not copied into private queues',async()=>{
  const f=await combat();f.fit(f.model('disruptor'));f.fire();f.tick(.16);
  const saved=JSON.parse(JSON.stringify(f.s)),next=await fixture({saved,full:false,economic:false});
  const target=next.window.nativeShipDefinitions.describe(saved,saved.civilianTraffic.ships[0],{category:'civilian'});
  assert.equal(next.window.nativeCombatShots.threats(saved,target).length,1);
  assert.equal(saved.weaponCombat.events.length,1);assert.deepEqual(saved.civilianTraffic.disputes,[]);
});

test('awareness includes surface entry within its horizon and rejects cancelled cached projectile lookups',async()=>{
  const f=await combat();f.fit(f.model('disruptor'));const fired=f.fire();f.tick(.16);
  const event=fired.event,target=f.target();
  event.x=target.x-event.vx*.97;event.y=target.y;
  const threats=f.w.nativeCombatShots.threats(f.s,target,{horizon:.9});
  assert.equal(threats.length,1,'shield entry precedes center closest approach');
  assert.ok(threats[0].timeToImpact<.9);
  assert.equal(f.w.nativeCombatShots.hasActiveProjectiles(f.s),true);
  const snapshot=f.w.nativeCombatShots.activeProjectile(f.s,event.id);snapshot.x=-1;
  assert.notEqual(event.x,-1,'shared read model cannot move a projectile');
  event.cancelled=true;assert.equal(f.w.nativeCombatShots.activeProjectile(f.s,event.id),null);
  assert.equal(f.w.nativeCombatShots.hasActiveProjectiles(f.s),false);
});

test('firing feedback distinguishes reachable recharge from range and preserves owned charges',async()=>{
  const f=await combat(),beam=f.model('beam');f.fit(beam);f.ship.x=f.s.x+550;
  const inspect=()=>f.w.nativeCombatShots.firingStatus(f.s,f.source(),f.target());
  const instance=f.w.nativeWeaponLoadout.equipped(f.s)[0].instance;
  assert.equal(inspect().reason,'range');assert.equal(inspect().maxRange,520);assert.equal(instance.readyAt,0);
  f.ship.x=f.s.x+200;assert.equal(inspect().reason,'ready');assert.equal(instance.readyAt,0);
  const fired=f.fire();assert.equal(fired.ok,true);const readyAt=instance.readyAt;
  assert.equal(inspect().reason,'recharge');assert.equal(instance.readyAt,readyAt);
  f.ship.x=f.s.x+600;assert.equal(inspect().reason,'range','cooling short weapon cannot masquerade as reachable');
  const missing=f.w.nativeCombatShots.firingStatus(f.s,f.source(),null);assert.equal(missing.maxRange,520);assert.equal(missing.reason,'unavailable');
});

test('mixed fitted weapons retain long-range reach and projectile arc/obstruction feedback',async()=>{
  const f=await combat();f.fit(f.model('beam'),f.model('torpedo'));f.ship.x=f.s.x+600;
  const inspect=()=>f.w.nativeCombatShots.firingStatus(f.s,f.source(),f.target());
  assert.equal(inspect().reason,'ready');assert.equal(inspect().maxRange,650);
  assert.equal(inspect().weapons.filter(item=>item.canReach).length,1);
  f.s.angle=Math.PI;assert.equal(inspect().reason,'arc');
  f.s.angle=0;
  f.w.nativeCombatShots.configureScene(()=>({bystanders:[],rocks:[{slotId:999,x:f.s.x+100,y:f.s.y,size:45}]}));
  assert.equal(inspect().reason,'blocked');
  f.ship.x=f.s.x+200;assert.equal(inspect().reason,'ready','beam physically intercepts instead of being rejected');
});
