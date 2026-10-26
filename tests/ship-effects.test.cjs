const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const port=path.join(__dirname,'../html-games/broken-mirror-port');

function fixture(){
  let time=1000,blocked=false;
  const drawn=[],emitted=[],explosions=[],contacts=[];
  const window={
    nativeSimulation:{now:()=>time,blocked:()=>blocked},
    showcaseWeaponAppearance:{units:.91976},
    nativeWeaponRules:{},
    starterShips:{get:()=>({displayRatio:.5})},
    vexedSolFlight:{shipPosition:ship=>({x:ship.x+1000,y:ship.y+2000})},
    vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:30,height:60}),
      loadShip:async(type,hull)=>({art:{},type,hull,profile:{breakAnchors:[],destruction:{}},width:164,height:512}),
      drawShip:(...args)=>drawn.push({kind:'ship',args})},
    showcaseHullBurst:{burst:(list,point,born)=>list.push({...point,born,ttl:500}),update:(p,dt)=>{p.x+=dt*20;},draw:(...args)=>drawn.push({kind:'spark',args})},
    showcaseStageFragments:{prepare:()=>[[],[],[],[]],emit:event=>emitted.push({kind:'stage',event}),update:()=>{},draw:()=>{}},
    createShipDestruction:()=>({prepare:()=>{},emit:(wreck)=>{emitted.push({kind:'wreck',wreck});wreck.debris.push({x:wreck.x,y:wreck.y,vx:2,vy:3,spin:1,angle:0,born:0,ttl:2000,w:4,h:4});},
      updateTrails:()=>{},drawParticle:()=>{},drawStructuralWreck:()=>{},drawWreckSurface:()=>{},drawWreckGlow:()=>{}}),
    nativeEnvironmentalImpacts:{explode:(...args)=>explosions.push(args),debris:(...args)=>contacts.push(args)},
  };
  const sandbox=vm.createContext({window,console,performance:{now:()=>900000},fetch:async()=>({json:async()=>({})})});
  for(const file of ['world-data.js','ship-motion.js','ship-definitions.js','ship-damage.js','combat-shots.js','ship-effects.js'])vm.runInContext(fs.readFileSync(path.join(port,file),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(port,'../flashtrek-broken-mirror/shield-flash.js'),'utf8'),sandbox);
  window.drawShowcaseShieldFlash=(...args)=>drawn.push({kind:'flash',args});
  window.drawShowcaseShieldSurface=(...args)=>drawn.push({kind:'surface',args});
  const definitions=window.nativeShipDefinitions;
  const roles=Object.keys(definitions.profiles);
  const entities=(type=7)=>roles.map((category,index)=>{
    const entity={id:index,shipType:type,system:2,x:40,y:80,angle:.7,heading:.7,speed:12,hull:100,shields:20};
    const state=category==='player'?entity:{system:2};
    return {state,entity,category,describe:()=>definitions.describe(state,entity,{category})};
  });
  const transforms=[];
  const ctx={save:()=>{},restore:()=>{},translate:(x,y)=>transforms.push({x,y}),rotate:angle=>transforms.push({angle}),drawImage:()=>{}};
  return {window,definitions,entities,ctx,transforms,drawn,emitted,explosions,contacts,setTime:value=>{time=value;},setBlocked:value=>{blocked=value;}};
}

test('isolated effects retain their own contacts, clock and GPU without touching the live presentation',()=>{
 const f=fixture(),w=f.window,role=f.entities().find(r=>r.category==='civilian');let movieTime=400,movieResets=0,liveResets=0;
 w.vexedShieldGPU={reset:()=>liveResets++};
 const film=w.nativeShipEffects.fork({isolated:true,blocked:()=>false,now:()=>movieTime,gpu:()=>({reset:()=>movieResets++})});
 const d=role.describe();film.visualImpact(role.state,d,{physicalContact:true,from:{x:d.x-30,y:d.y},kind:'debris'});
 assert.equal(film.snapshot(d).contact.born,400);assert.equal(w.nativeShipEffects.snapshot(d).contact,null);
 f.setBlocked(true);movieTime=700;film.advance(role.state,.3);assert.equal(film.snapshot(d).contact,null);
 film.reset();assert.equal(movieResets,1);assert.equal(liveResets,0);
});

test('weapon hull flares follow the authoritative local hit through movement, rotation and zoom, then expire',()=>{
 const f=fixture(),w=f.window,role=f.entities().find(r=>r.category==='civilian'),events=[];role.entity.shields=0;
 w.nativeEffectProfiles={queueImpact:(ctx,event)=>{events.push(event);return true;}};
 const d=role.describe(),from={x:d.x-100,y:d.y+15},result=w.nativeShipDamage.apply(d,10,{from});
 w.nativeShipEffects.hit(role.state,d,result,{kind:'torpedo',weaponColor:0xaaff22});
 const local=result.contacts.hull.local;
 for(const zoom of [.7,2]){
  role.entity.x+=20;role.entity.y-=13;role.entity.heading+=.4;const next=role.describe();
  const view={ship:{x:-20,y:10},cx:300,cy:180,zoom,dimensions:next.dimensions};
  w.nativeShipEffects.paintSurface(f.ctx,next,view,{front:false});assert.equal(events.length,zoom===.7?0:1);
  w.nativeShipEffects.paintSurface(f.ctx,next,view,{front:true});const event=events.at(-1),a=next.heading+Math.PI/2;
  const x=300+(next.x+20)*zoom+(Math.cos(a)*local.x-Math.sin(a)*local.y)*zoom;
  const y=180+(next.y-10)*zoom+(Math.sin(a)*local.x+Math.cos(a)*local.y)*zoom;
  assert.ok(Math.hypot(event.x-x,event.y-y)<1e-8);assert.equal(event.color,0xaaff22);assert.equal(event.kind,'torpedo');
 }
 f.setTime(1300);w.nativeShipEffects.advance(role.state,.3);w.nativeShipEffects.paintSurface(f.ctx,role.describe(),{ship:{x:0,y:0},cx:0,cy:0,zoom:1},{front:true});
 assert.equal(events.length,2,'Expired impacts must not keep emitting lens flares');
});

test('all registered ship types and role profiles share damage and authoritative surfaces',()=>{
  const {window,definitions,entities}=fixture();
  for(const definition of definitions.registered())for(const role of entities(definition.id)){
    const descriptor=role.describe(),from={x:descriptor.x-140,y:descriptor.y+33};
    const contact=window.nativeCombatShots.contact(descriptor,from,descriptor.dimensions,true);
    contact.shielded=true;contact.from=from;
    const result=window.nativeShipDamage.apply(descriptor,35,{from,contact});
    assert.equal(result.shields,0,`${definition.id}/${role.category} shields`);
    assert.equal(result.hull,85,`${definition.id}/${role.category} hull`);
    assert.equal(result.contacts.shield,contact,'supplied collision object stays authoritative');
    const hull=result.contacts.hull,radii=definitions.surfaceRadii(descriptor.dimensions,false,descriptor.definition);
    assert.ok(Math.abs(Math.hypot(hull.local.x/radii.rx,hull.local.y/radii.ry)-.96)<1e-8);
  }
});

test('GPU shield submission skips unused Canvas state while physical glints retain their painter',()=>{
  const {window,entities,ctx,transforms}=fixture(),role=entities()[0],descriptor=role.describe();
  const contact=window.nativeCombatShots.contact(descriptor,{x:descriptor.x-100,y:descriptor.y},descriptor.dimensions,true);
  window.nativeShipEffects.visualImpact(role.state,descriptor,{contact,kind:'beam'});
  let submissions=0;
  window.vexedShieldGPU={available:true,duration:900,submit(){submissions++;return true;}};
  const untouched=new Proxy({}, {get(){throw Error('GPU-only shield touched Canvas state');}});
  for(const front of [false,true])window.nativeShipEffects.paintSurface(untouched,descriptor,{ship:{x:0,y:0},cx:0,cy:0},{front});
  assert.equal(submissions,2);
  window.nativeShipEffects.visualImpact(role.state,descriptor,{physicalContact:true,point:contact.world,from:contact.world,energy:.5});
  Object.assign(ctx,{getTransform:()=>({a:1,b:0}),beginPath(){},arc(){},fill(){}});
  window.nativeShipEffects.paintSurface(ctx,descriptor,{ship:{x:0,y:0},cx:0,cy:0},{front:true});
  assert.ok(transforms.length,'physical glint still uses the local Canvas transform');
});

test('registered definitions inherit systems while preserving role scale and explicit capabilities',()=>{
  const {definitions,entities}=fixture();
  for(const [type,height] of [[18,60],[23,22.5],[47,72],[52,90]])assert.equal(definitions.dimensions({shipType:type},'civilian').height,height);
  assert.equal(definitions.dimensions({shipType:10},'tug').width,60*164/512);
  assert.equal(definitions.get(10,'tug').capabilities.armed,true);
  assert.equal(definitions.get(10,'player').capabilities.armed,true);
  definitions.register(987,{hull:240,shields:130,dimensions:{width:42,height:91},capabilities:{canMine:false},geometry:{hull:{rx:19,ry:37}}});
  assert.ok(definitions.registered().some(row=>row.id===987));
  for(const role of entities(987)){
    const descriptor=role.describe();assert.equal(descriptor.definition.hull,240);
    assert.equal(descriptor.dimensions.height,91);assert.equal(descriptor.definition.capabilities.canMine,false);
    assert.equal(definitions.surfaceRadii(descriptor.dimensions,false,descriptor.definition).rx,19);
  }
});

test('effective definitions retain engine upgrades, custom movement and world-space previous poses',()=>{
  const {definitions,entities}=fixture();
  for(const level of [0,1,2,3]){
    const role=entities(10)[0];role.entity.tugEngineLevel=level;role.entity.system=1;
    role.entity.previousX=900;role.entity.previousY=1900;
    const descriptor=role.describe(),speed=definitions.get(10).speedOrOtherStationValue+15*Math.min(2,level);
    assert.equal(descriptor.definition.speedOrOtherStationValue,speed);
    assert.equal(descriptor.definition.movement.maxSpeed,speed*4.5);
    assert.equal(descriptor.previousX,900);assert.equal(descriptor.previousY,1900);
    assert.equal(descriptor.x,1040);assert.equal(descriptor.y,2080);
  }
  definitions.register(987,{movement:{maxSpeed:12,acceleration:4,braking:6,turnRate:.4}});
  for(const role of entities(987))assert.equal(role.describe().definition.movement.maxSpeed,12);
});

test('shield overflow follows the authoritative local collision ray after a target sweep',()=>{
  const {window,entities}=fixture();
  for(const role of entities()){
    const descriptor=role.describe(),from={x:descriptor.x-100,y:descriptor.y+30};
    const contact=window.nativeCombatShots.contact(descriptor,from,descriptor.dimensions,true);
    contact.from={x:descriptor.x+1000,y:descriptor.y-400};
    const result=window.nativeShipDamage.apply(descriptor,30,{contact,from:contact.from});
    const shieldAngle=Math.atan2(contact.local.y,contact.local.x),hullAngle=Math.atan2(result.contacts.hull.local.y,result.contacts.hull.local.x);
    assert.ok(Math.abs(shieldAngle-hullAngle)<1e-10,`${role.category} overflow uses collision ray instead of stale projectile approach`);
  }
});

test('visual-only impacts preserve health and attach to the same current surface for every role',async()=>{
  const {window,entities,ctx,drawn,transforms}=fixture();
  for(const role of entities()){
    if(role.category==='tug')role.state.system=1;
    const descriptor=role.describe(),contact=window.nativeCombatShots.contact(descriptor,{x:descriptor.x-200,y:descriptor.y+10},descriptor.dimensions,true);
    contact.shielded=true;
    window.nativeShipEffects.visualImpact(role.state,descriptor,{contact,kind:'explosion'});
    assert.equal(role.entity.shields,20);assert.equal(role.entity.hull,100);
    role.entity.x+=45;role.entity.y-=21;role.entity.heading+=.5;role.entity.angle+=.5;
    const moved=role.describe(),view={ship:{x:-300,y:700},cx:320,cy:220,asset:{art:{}}};
    window.nativeShipEffects.paintShip(ctx,moved,view);
    const flash=drawn.filter(row=>row.kind==='flash').at(-1).args[4];
    assert.equal(flash.x,contact.local.x);assert.equal(flash.y,contact.local.y);
    assert.ok(transforms.some(p=>p.x===320+moved.x+300&&p.y===220+moved.y-700));
    assert.ok(transforms.some(p=>p.angle===moved.heading+Math.PI/2));
    role.entity.shields=0;
    window.nativeShipEffects.visualImpact(role.state,role.describe(),{kind:'debris'});
    assert.equal(role.entity.hull,100);assert.equal(window.nativeShipEffects.snapshot(role.describe()).particles,1);
  }
});

test('pause freezes impact clocks and particle integration across all role profiles',()=>{
  const {window,entities,ctx,drawn,setTime,setBlocked}=fixture();
  for(const role of entities()){
    if(role.category==='tug')role.state.system=1;
    const descriptor=role.describe();window.nativeShipEffects.visualImpact(role.state,descriptor,{kind:'beam'});
    role.entity.shields=0;window.nativeShipEffects.visualImpact(role.state,role.describe(),{kind:'debris'});
    const view={ship:{x:0,y:0},cx:300,cy:200,asset:{art:{}}};
    setBlocked(true);window.nativeShipEffects.advance(role.state,10);
    window.nativeShipEffects.paintSurface(ctx,role.describe(),view,{front:true});
    assert.equal(window.nativeShipEffects.snapshot(role.describe()).particles,1);
    assert.equal(drawn.filter(row=>row.kind==='flash').at(-1).args[5],1000,'shader time uses simulation milliseconds');
    setBlocked(false);setTime(1621);window.nativeShipEffects.advance(role.state,.621);
    assert.equal(window.nativeShipEffects.snapshot(role.describe()).particles,0);
    assert.equal(window.nativeShipEffects.snapshot(role.describe()).flash,null);setTime(1000);
  }
});

test('nonlethal damage and disabled capabilities share one calculation without redefining health',()=>{
  const {window,entities}=fixture();
  for(const role of entities()){
    const descriptor=role.describe(),result=window.nativeShipDamage.apply(descriptor,99999,{nonlethal:true});
    const floor=descriptor.definition.capabilities.disableRatio?Math.max(1,descriptor.definition.hull*.25):0;
    assert.equal(result.hull,Math.min(100,floor));assert.equal(result.disabled,floor>0);assert.equal(result.destroyed,floor===0);
  }
});

test('all roles emit identical damage-stage transitions from authoritative hull overflow',async()=>{
  const {window,entities,emitted}=fixture();
  for(const role of entities()){
    if(role.category==='tug')role.state.system=1;
    const maximum=role.describe().definition.hull;role.entity.hull=maximum;role.entity.shields=5;
    const descriptor=role.describe();await window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category);
    const result=window.nativeShipDamage.apply(descriptor,5+maximum*.8,{kind:'beam'});
    assert.equal(result.beforeStage,0);assert.equal(result.afterStage,3);assert.equal(result.destroyed,false);
    window.nativeShipEffects.hit(role.state,descriptor,result,{kind:'beam'});
    const stage=emitted.filter(row=>row.kind==='stage').at(-1).event;
    assert.equal(stage.before,0);assert.equal(stage.after,3);assert.equal(stage.angle,descriptor.heading+Math.PI/2);
    assert.equal(stage.layout.w,descriptor.dimensions.width);assert.equal(stage.layout.h,descriptor.dimensions.height);
  }
});

test('rendering never emits destruction, damages targets or advances particles',async()=>{
  const {window,entities,ctx,emitted,explosions}=fixture();
  for(const role of entities()){
    if(role.category==='tug')role.state.system=1;
    const descriptor=role.describe();await window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category);
    const result=window.nativeShipDamage.apply(descriptor,99999,{kind:'torpedo'});
    window.nativeShipEffects.hit(role.state,descriptor,result,{kind:'torpedo'});
    const before=emitted.length,blastCount=explosions.length,view={ship:{x:0,y:0},cx:300,cy:200};
    for(let i=0;i<4;i++)window.nativeShipEffects.paint(role.state,ctx,view);
    assert.equal(emitted.length,before);assert.equal(explosions.length,blastCount);assert.equal(role.entity.hull,0);
  }
});

test('base ship stays visible while optional artwork prepares; queued stage effects run only in simulation',async()=>{
  const f=fixture(),{window,entities,ctx,emitted}=f,role=entities()[0],descriptor=role.describe();
  let finishFragments;
  window.showcaseStageFragments.prepareAsync=()=>new Promise(resolve=>{finishFragments=resolve;});
  const preparation=window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category);
  assert.equal(preparation,window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category),'concurrent work deduplicates');
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.ok(window.nativeShipEffects.asset(descriptor),'base frame available before optional pixel processing finishes');
  assert.equal(window.nativeShipEffects.metrics().pending,1);
  const maximum=descriptor.definition.hull;role.entity.hull=maximum;role.entity.shields=0;
  const result=window.nativeShipDamage.apply(descriptor,maximum*.8,{kind:'beam'});
  window.nativeShipEffects.hit(role.state,descriptor,result,{kind:'beam'});
  assert.equal(window.nativeShipEffects.metrics().deferredStages,1);
  assert.equal(emitted.filter(event=>event.kind==='stage').length,0);
  finishFragments([[],[],[],[]]);await preparation;
  window.nativeShipEffects.paintShip(ctx,descriptor,{ship:{x:0,y:0},cx:300,cy:200});
  assert.equal(emitted.filter(event=>event.kind==='stage').length,0,'painting cannot emit pending fragments');
  f.setBlocked(true);window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='stage').length,0,'paused preparation cannot advance effects');
  f.setBlocked(false);window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='stage').length,1);
  assert.equal(window.nativeShipEffects.metrics().deferredStages,0);
});

test('destruction while optional artwork is pending applies health and explosion once and emits wreck in advance',async()=>{
  const f=fixture(),{window,entities,ctx,emitted,explosions}=f,role=entities()[0],descriptor=role.describe();
  let complete;
  const factory=window.createShipDestruction;
  window.createShipDestruction=()=>({...factory(),prepareAsync:()=>new Promise(resolve=>{complete=resolve;})});
  const preparation=window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category);
  for(let i=0;i<8;i++)await Promise.resolve();
  const result=window.nativeShipDamage.apply(descriptor,99999,{kind:'torpedo'});
  window.nativeShipEffects.hit(role.state,descriptor,result,{kind:'torpedo'});
  assert.equal(role.entity.hull,0);assert.equal(explosions.length,1);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,0);
  complete();await preparation;
  window.nativeShipEffects.paint(role.state,ctx,{ship:{x:0,y:0},cx:300,cy:200});
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,0);
  f.setTime(1400);window.nativeShipEffects.advance(role.state,.4);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,1);
  assert.ok(Math.abs(emitted.find(event=>event.kind==='wreck').wreck.debris[0].x-(descriptor.x+.8))<1e-8,'late preparation catches up visual motion exactly once');
  assert.equal(f.contacts[0][2],descriptor.x,'late debris submits its complete swept path to the shared collision owner');
  assert.equal(explosions.length,1,'optional texture completion never reapplies destruction');
  assert.equal(role.entity.hull,0);
});

test('shared optional artwork cache bounds registered class churn and reports owned RGBA estimates',async()=>{
  const {window,definitions}=fixture();
  for(let type=1000;type<1030;type++){
    definitions.register(type,{hull:100});await window.nativeShipEffects.prepare(type,'player');
  }
  const metrics=window.nativeShipEffects.metrics();
  assert.ok(metrics.entries<=metrics.limits.entries);assert.ok(metrics.cacheBytes<=metrics.limits.bytes);
  assert.ok(metrics.evictions>0);assert.equal(metrics.pending,0);
});

test('cold destruction retries saturated artwork admission without repeating the damage or explosion',async()=>{
  const f=fixture(),{window,definitions,entities,emitted,explosions}=f,load=window.vexedFlightAssets.loadShip,release=[];
  window.vexedFlightAssets.loadShip=(...args)=>new Promise(resolve=>release.push(async()=>resolve(await load(...args))));
  const blockers=[];
  for(let type=1000;type<1008;type++){definitions.register(type,{hull:100});blockers.push(window.nativeShipEffects.prepare(type));}
  const role=entities(1008)[0];definitions.register(1008,{hull:100});
  const descriptor=role.describe(),result=window.nativeShipDamage.apply(descriptor,99999,{kind:'torpedo'});
  window.nativeShipEffects.hit(role.state,descriptor,result,{kind:'torpedo'});
  await Promise.resolve();await Promise.resolve();
  assert.equal(window.nativeShipEffects.metrics().pending,8);
  assert.equal(explosions.length,1);assert.equal(role.entity.hull,0);
  window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,0);
  for(const finish of release)await finish();await Promise.all(blockers);
  window.vexedFlightAssets.loadShip=load;
  window.nativeShipEffects.advance(role.state,.1);
  await window.nativeShipEffects.prepare(1008);
  window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,1);
  assert.equal(explosions.length,1);assert.equal(role.entity.hull,0);
});
