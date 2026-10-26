const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const small=(x=40,speed=300)=>({x,y:30,previousX:x,previousY:-90,heading:Math.PI/2,vx:0,vy:speed,dimensions:{width:10,height:20},radii:{rx:5,ry:10},definition:{mass:1}});
const tug=()=>({x:0,y:0,previousX:0,previousY:0,heading:0,vx:0,vy:0,dimensions:{width:24,height:120},radii:{rx:12,ry:60},definition:{mass:12}});

test('a fast small ship pushes a heavier tug and an off-center hit twists its struck end',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  const slow=m.shipPairContact(small(40,50),tug(),2.4),fast=m.shipPairContact(small(),tug(),.4),center=m.shipPairContact(small(0),tug(),.4),opposite=m.shipPairContact(small(-40),tug(),.4);
  assert.ok(slow&&fast&&center&&opposite);assert.ok(fast.b.vy>slow.b.vy*5.9);assert.ok(Math.abs(fast.b.angularVelocity)>Math.abs(slow.b.angularVelocity)*5.9);
  assert.ok(Math.abs(fast.b.angularVelocity)>.1);assert.ok(fast.b.angularVelocity*opposite.b.angularVelocity<0);near(fast.b.angularVelocity,-opposite.b.angularVelocity);
  near(center.b.angularVelocity,0);assert.ok(Math.abs(fast.b.heading)>.001);
  const rotate=s=>({...s,x:-s.y,y:s.x,previousX:-s.previousY,previousY:s.previousX,vx:-s.vy,vy:s.vx,heading:s.heading+Math.PI/2});
  const rotated=m.shipPairContact(rotate(small()),rotate(tug()),.4);near(rotated.b.angularVelocity,fast.b.angularVelocity);
});

test('off-center impulses conserve linear/angular momentum without adding kinetic energy',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion;
  for(const offset of [-45,-20,0,20,45])for(const spin of [0,1.5]){
    const a={...small(offset),angularVelocity:spin},b={...tug(),angularVelocity:-spin*.25},r=m.shipPairContact(a,b,.4);assert.ok(r);
    near(r.massA*r.a.vx+r.massB*r.b.vx,0);near(r.massA*r.a.vy+r.massB*r.b.vy,300);
    const angular=(c,v,mass,inertia)=>mass*(c.x*v.vy-c.y*v.vx)+inertia*(v.angularVelocity||0);
    near(angular(r.centerA,r.a,r.massA,r.inertiaA)+angular(r.centerB,r.b,r.massB,r.inertiaB),angular(r.centerA,a,r.massA,r.inertiaA)+angular(r.centerB,b,r.massB,r.inertiaB));
    const energy=(v,mass,inertia)=>.5*mass*(v.vx*v.vx+v.vy*v.vy)+.5*inertia*(v.angularVelocity||0)**2;
    assert.ok(energy(r.a,r.massA,r.inertiaA)+energy(r.b,r.massB,r.inertiaB)<=energy(a,r.massA,r.inertiaA)+energy(b,r.massB,r.inertiaB)+1e-6);
  }
});

test('impact stabilization settles released controls while preserving intended coasting, turning and thrust',async()=>{
  const {window:w}=await fixture({full:false,economic:false}),m=w.nativeShipMotion,profile={maxSpeed:140,acceleration:80,braking:100,turnRate:1.2};
  const initial={x:0,y:0,heading:0,vx:60,vy:0,speed:60,motionKick:{version:1,mode:'free',vx:-40,vy:0}},coast=copy(initial),turn=copy(initial),thrust=copy(initial);
  for(let i=0;i<60;i++){m.step(coast,{},profile,1/60);m.step(turn,{turn:1},profile,1/60);m.step(thrust,{throttle:1},profile,1/60);}
  assert.ok(Math.abs(coast.motionKick.vx)<3);near(turn.heading,1.2);assert.ok(Math.abs(turn.motionKick.vx)<3);assert.ok(Math.abs(thrust.motionKick.vx)<3);
  for(let i=0;i<180;i++)m.step(coast,{},profile,1/60);
  assert.equal(coast.motionKick,undefined);near(coast.vx,100);near(coast.vy,0);
  for(let i=0;i<180;i++)m.step(turn,{brake:true},profile,1/60);assert.equal(turn.speed,0);assert.equal(turn.motionKick,undefined);
});

test('saved spin is sampled without replay, paused with movement, and player input damps it without replacing its turn command',async()=>{
  const f=await fixture({full:false,economic:false}),w=f.window,m=w.nativeShipMotion,profile={maxSpeed:140,acceleration:80,braking:100,turnRate:1.2};
  const e={x:0,y:0,heading:0,speed:0,vx:0,vy:0};e.localLeg=m.planLeg(e,{x:1000,y:0},profile,0);
  m.sampleLeg(e,e.localLeg,2);m.applySpinImpulse(e,1,2,.1);
  const sampled=copy(e);m.sampleLeg(sampled,sampled.localLeg,2.5);const again=copy(sampled);m.sampleLeg(sampled,sampled.localLeg,2.5);near(sampled.heading,again.heading);
  const restored=copy(e);m.sampleLeg(restored,restored.localLeg,2.5);near(restored.heading,again.heading);assert.ok(Math.abs(restored.heading)>.05);
  const control={x:0,y:0,heading:0,speed:0,motionSpin:{version:1,mode:'free',velocity:1}};
  for(let i=0;i<60;i++)m.step(control,{turn:1},profile,1/60);assert.ok(control.heading>1.2&&control.heading<1.5);assert.ok(control.motionSpin.velocity<.02);
  Object.assign(f.state,{motionSpin:{version:1,mode:'free',velocity:1}});const before=copy(f.state);w.nativePause.active=true;w.nativeShipSystems.move(f.state,f.state,'player',{turn:1},profile,1);assert.deepEqual(copy(f.state),before);
  m.stop(control);assert.equal(control.motionSpin,undefined);
  const departing={x:0,y:0,heading:0,speed:0,motionSpin:{version:1,mode:'free',velocity:1}};departing.localLeg=m.planLeg(departing,{x:1000,y:0},profile,0);
  const preview=copy(departing);m.sampleLeg(preview,preview.localLeg,.2);const expected=m.spinSample(preview.motionSpin,.2);
  m.applySpinImpulse(departing,.5,.2);near(departing.motionSpin.velocity,expected.velocity+.5);near(departing.motionSpin.angle,expected.angle);
});

test('the real contact dispatcher turns and saves a struck tug while preserving its cargo and health',async()=>{
  const f=await fixture({full:false,economic:false,traffic:true}),w=f.window,s=f.state,t=s.solEconomy.freighters[0];
  w.nativePlayerCombat={visualImpact(){}};s.civilianTraffic.ships=[];s.solEconomy.freighters=[t];
  w.nativeShipDefinitions.register(s.shipType,{mass:1,geometry:{hull:{rx:5,ry:10}}});w.nativeShipDefinitions.register(10,{mass:12,geometry:{hull:{rx:12,ry:60}}});
  Object.assign(s,{system:1,x:40,y:30,previousX:40,previousY:-90,angle:Math.PI/2,vx:0,vy:300,speed:300,dimensions:{width:10,height:20},shields:100,hull:100});
  Object.assign(t,{x:0,y:0,previousX:0,previousY:0,heading:0,speed:0,vx:0,vy:0,phase:'waiting',lifeLeg:null,dimensions:{width:24,height:120},shields:100,hull:100,tons:4});
  delete t.motionKick;delete t.motionSpin;w.nativeShipTraffic.collide(s,.4);assert.ok(Math.abs(t.motionSpin?.velocity)>.1);assert.ok(Math.abs(t.heading)>.001);assert.ok(t.vy>0);
  const heading=t.heading,save=copy(s);s.x=10000;s.y=10000;w.nativeSimulation.advance(s,.1);w.nativeShipTraffic.collide(s,.1);assert.ok(Math.abs(t.heading-heading)>.001);
  assert.equal(t.tons,4);assert.equal(t.hull,100);assert.equal(t.shields,100);assert.ok(save.solEconomy.freighters[0].motionSpin);
});
