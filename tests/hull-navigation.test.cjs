const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=v=>JSON.parse(JSON.stringify(v)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function setup(){
  const f=await fixture({full:false,economic:false,traffic:true}),w=f.window,s=f.state;
  Object.assign(s,{system:2,x:0,y:0,previousX:0,previousY:0,angle:0,vx:0,vy:0,speed:0,dimensions:{width:30,height:60},hull:100,shields:100});
  w.nativeShipDefinitions.register(s.shipType,{mass:4,geometry:{shield:{rx:30,ry:50},hull:{rx:8,ry:20}}});
  f.describe=()=>w.nativeShipDefinitions.describe(s);return f;
}

test('physical hull dimensions stay fixed as shields recharge while weapons retain the larger shield boundary',async()=>{
  const f=await setup(),w=f.window,d=f.describe();
  assert.deepEqual(copy(d.hullRadii),{rx:8,ry:20});assert.deepEqual(copy(d.radii),{rx:30,ry:50});
  const shield=w.nativeCombatShots.contact(d,{x:-100,y:0},d.dimensions,true),hull=w.nativeCombatShots.contact(d,{x:-100,y:0},d.dimensions,false);
  near(Math.abs(shield.world.x),50*.96);near(Math.abs(hull.world.x),20*.96);
  f.state.shields=0;assert.deepEqual(copy(f.describe().hullRadii),copy(d.hullRadii));assert.deepEqual(copy(f.describe().radii),copy(d.hullRadii));
});

test('overlapping shields allow a clear hull passage, but real hull contact retains swept momentum and spin',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion,a=f.describe(),b={...a,id:'other',x:50,previousX:50};
  assert.equal(m.shipPairContact(a,b,.1),null);
  assert.equal(m.shipPairContact({...a,radii:{rx:100,ry:100}},b,.1),null);
  const incoming={...a,x:60,previousX:-100,vx:160,y:8,previousY:8},r=m.shipPairContact(incoming,b,1);
  assert.ok(r&&r.b.vx>0&&Math.abs(r.b.angularVelocity)>0);
  near(r.massA*r.a.vx+r.massB*r.b.vx,r.massA*160);
  const unshielded=m.shipPairContact({...incoming,shields:0,radii:a.hullRadii},{...b,shields:0,radii:b.hullRadii},1);
  near(r.b.vx,unshielded.b.vx);near(r.b.angularVelocity,unshielded.b.angularVelocity);
});

test('rocks and fragments can pass through shield space and collide at the same physical hull',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion,d=f.describe(),rock={x:40,y:0,previousX:40,previousY:0,size:20,vx:-10,vy:0};
  assert.equal(m.asteroidContact(d,rock,.1),null);
  assert.equal(m.debrisContact({...rock,dt:.1},{x:41,y:0},d,'ship'),null);
  const touching={...rock,x:26,previousX:40};assert.ok(m.asteroidContact(d,touching,1));
  assert.ok(m.debrisContact({...touching,dt:1},{x:40,y:0},d,'ship'));
});

test('NPC clearance follows hull size, with a modest slow gap and more room at speed',async()=>{
  const f=await setup(),m=f.window.nativeShipMotion,d={...f.describe(),id:'civilian',category:'civilian'},other={...d,id:'other',x:40,vx:0};
  const advice=speed=>m.trafficAdvice({...d,vx:speed,vy:0},[other],{maxSpeed:speed,turnRate:3});
  const slow=advice(3),fast=advice(150);assert.ok(slow&&fast);assert.ok(slow.clearance<55);assert.ok(fast.clearance>slow.clearance+10);
  const biggerShield=m.trafficAdvice({...d,vx:3,vy:0,radii:{rx:100,ry:100}},[{...other,radii:{rx:100,ry:100}}],{maxSpeed:3,turnRate:3});
  near(slow.clearance,biggerShield.clearance);
});

test('a brief hull contact glint is independent of weapon shield flashes and never changes health',async()=>{
  const f=await setup(),w=f.window,s=f.state,d=f.describe(),event={kind:'ship',from:{x:-100,y:0},energy:.5,visualOnly:true,physicalContact:true};
  const result=w.nativeShipDamage.apply(d,10,{from:{x:-100,y:0},kind:'beam'});w.nativeShipEffects.hit(s,d,result,{kind:'beam'});
  const weapon=copy(w.nativeShipEffects.snapshot(d).flash);assert.ok(weapon);
  const health={hull:s.hull,shields:s.shields};w.nativeShipEffects.visualImpact(s,d,event);
  const visual=w.nativeShipEffects.snapshot(d);assert.deepEqual(copy(visual.flash),weapon);assert.ok(visual.contact);
  near((visual.contact.x/d.hullRadii.rx)**2+(visual.contact.y/d.hullRadii.ry)**2,.96**2);
  assert.equal(visual.particles,0);assert.deepEqual({hull:s.hull,shields:s.shields},health);
  const birth=visual.contact.born;w.nativeSimulation.advance(s,.05);w.nativeShipEffects.visualImpact(s,d,event);
  assert.equal(w.nativeShipEffects.snapshot(d).contact.born,birth,'overlaps must not restart the glint every frame');
  w.nativeSimulation.advance(s,.15);w.nativeShipEffects.advance(s,.2);
  assert.equal(w.nativeShipEffects.snapshot(d).contact,null);assert.ok(w.nativeShipEffects.snapshot(d).flash,'weapon flash keeps its own lifetime');
});

test('the registered player/civilian contact dispatcher permits shield overlap and resolves actual hull touch',async()=>{
  const f=await setup(),w=f.window,s=f.state;
  w.nativePlayerCombat={visualImpact:(state,event)=>w.nativeShipEffects.visualImpact(state,w.nativeShipDefinitions.describe(state),event)};
  w.nativeShipDefinitions.register(47,{mass:4,geometry:{shield:{rx:30,ry:50},hull:{rx:8,ry:20}}});
  const ship={id:999,shipType:47,system:2,x:50,y:0,heading:0,previousX:50,previousY:0,vx:0,vy:0,speed:0,hull:100,shields:100,phase:'docked',dimensions:{width:30,height:60}};
  s.civilianTraffic.ships=[ship];s.solEconomy.freighters=[];
  w.nativeShipTraffic.collide(s,.1);assert.equal(w.nativeShipTraffic.snapshot(s).contacts.length,0);assert.equal(ship.x,50);assert.equal(s.x,0);
  Object.assign(s,{x:15,vx:20,speed:20});w.nativeSimulation.advance(s,.1);w.nativeShipTraffic.collide(s,.1);
  assert.ok(ship.vx>0);assert.equal(ship.hull,100);assert.equal(ship.shields,100);
  const effects=w.nativeShipEffects.snapshot(w.nativeShipDefinitions.describe(s,ship,{category:'civilian'}));
  assert.ok(effects.contact);assert.equal(effects.flash,null);
});
