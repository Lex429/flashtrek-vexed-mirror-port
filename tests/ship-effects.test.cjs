const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const port=path.join(__dirname,'../html-games/broken-mirror-port');

function fixture({backgroundTimers=null}={}){
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
  const sandbox=vm.createContext({window,console,performance:{now:()=>900000},fetch:async()=>({json:async()=>({})}),
    ...(backgroundTimers?{setTimeout:callback=>backgroundTimers.push(callback)}:{})});
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
  return {window,definitions,entities,ctx,transforms,drawn,emitted,explosions,contacts,context:sandbox,setTime:value=>{time=value;},setBlocked:value=>{blocked=value;}};
}

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
    const descriptor=role.describe(),speed=level?35+15*Math.min(2,level):definitions.get(10).speedOrOtherStationValue;
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
  for(let i=0;i<32&&!finishFragments;i++)await Promise.resolve();
  assert.equal(typeof finishFragments,'function','optional fragments admitted after the visible plate');
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
  for(let i=0;i<32&&!complete;i++)await Promise.resolve();
  assert.equal(typeof complete,'function','optional wreck preparation admitted after the visible plate');
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
  // A class's needed plate precedes its other three stages. Drain requests
  // admitted after those first plates resolve, rather than freezing the list.
  for(let i=0;i<16;i++){for(const finish of release.splice(0))await finish();await Promise.resolve();}
  await Promise.all(blockers);
  window.vexedFlightAssets.loadShip=load;
  window.nativeShipEffects.advance(role.state,.1);
  await window.nativeShipEffects.prepare(1008);
  window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,1);
  assert.equal(explosions.length,1);assert.equal(role.entity.hull,0);
});

test('cold damaged ships request their actual plate first and share it with full optional preparation',async()=>{
  const {window,entities}=fixture(),role=entities()[0],maximum=role.describe().definition.hull;
  role.entity.hull=maximum*.1;
  const descriptor=role.describe(),load=window.vexedFlightAssets.loadShip,requests=[],release=[];
  window.vexedFlightAssets.loadShip=(...args)=>{requests.push(args[1]/maximum);return new Promise(resolve=>release.push(async()=>resolve(await load(...args))));};
  assert.equal(window.nativeShipEffects.asset(descriptor),null);
  assert.deepEqual(requests,[.1],'unused healthy/damage plates cannot delay the visible severe plate');
  const visible=window.nativeShipEffects.request(descriptor.shipType,descriptor.category,{stage:3});
  const full=window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category,{stage:3});
  assert.equal(requests.length,1,'visibility/full requests share the same stage work');
  await release.shift()();await visible;
  assert.equal(window.nativeShipEffects.asset(descriptor).hull,maximum*.1);
  assert.equal(window.nativeShipEffects.ready(descriptor.shipType,descriptor.category),true);
  assert.equal(window.nativeShipEffects.optionalReady(descriptor.shipType,descriptor.category),false);
  for(let i=0;i<16;i++){for(const finish of release.splice(0))await finish();await Promise.resolve();}
  await full;
  assert.deepEqual(requests.sort((a,b)=>a-b),[.1,.4,.7,1]);
  assert.equal(window.nativeShipEffects.optionalReady(descriptor.shipType,descriptor.category),true);
});

test('deferred stages admit one background plate at a time and damage immediately promotes its plate',async()=>{
  const timers=[],{window,entities}=fixture({backgroundTimers:timers}),role=entities()[0],maximum=role.describe().definition.hull;
  role.entity.hull=maximum;
  const load=window.vexedFlightAssets.loadShip,requests=[],release=[];
  window.vexedFlightAssets.loadShip=(...args)=>{requests.push(args[1]/maximum);return new Promise(resolve=>release.push(async()=>resolve(await load(...args))));};
  const visible=window.nativeShipEffects.request(role.entity.shipType,role.category);
  const same=window.nativeShipEffects.request(role.entity.shipType,role.category);
  assert.equal(visible,same);assert.equal(requests.length,1);
  await release.shift()();await visible;await Promise.resolve();
  assert.equal(requests.length,1);assert.equal(timers.length,1);
  role.entity.hull=maximum*.1;
  assert.ok(window.nativeShipEffects.asset(role.describe()),'existing plate remains visible during a damage change');
  assert.deepEqual(requests,[1,.1],'new damage stage is admitted before the deferred intermediate plates');
  timers.shift()();assert.equal(requests.length,2,'background waits for a foreground appearance');
  await release.shift()();for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(window.nativeShipEffects.asset(role.describe()).hull,maximum*.1);
  timers.shift()();assert.deepEqual(requests,[1,.1,.7]);
  assert.equal(release.length,1,'only one unused plate is in flight');
  await release.shift()();for(let i=0;i<6;i++)await Promise.resolve();
  timers.shift()();assert.deepEqual(requests,[1,.1,.7,.4]);
  await release.shift()();for(let i=0;i<6;i++)await Promise.resolve();
  assert.equal(window.nativeShipEffects.metrics().backgroundPending,0);
  assert.equal(window.nativeShipEffects.metrics().stageLoads,4,'each plate prepared exactly once');
});

test('partial visible art still upgrades to fragments and wreck data after a real hit',async()=>{
  const {window,entities,explosions,emitted}=fixture(),role=entities()[0],descriptor=role.describe();
  await window.nativeShipEffects.request(descriptor.shipType,descriptor.category);
  assert.equal(window.nativeShipEffects.optionalReady(descriptor.shipType,descriptor.category),false);
  const result=window.nativeShipDamage.apply(descriptor,99999,{kind:'torpedo'});
  window.nativeShipEffects.hit(role.state,descriptor,result,{kind:'torpedo'});
  assert.equal(explosions.length,1);
  await window.nativeShipEffects.prepare(descriptor.shipType,descriptor.category);
  window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,1);
  window.nativeShipEffects.advance(role.state,.1);
  assert.equal(emitted.filter(event=>event.kind==='wreck').length,1);
  assert.equal(explosions.length,1);assert.equal(role.entity.hull,0);
});

test('a failed new damage plate retains visible art and can retry without a stale pending request',async()=>{
  const {window,entities}=fixture(),role=entities()[0],descriptor=role.describe(),load=window.vexedFlightAssets.loadShip;
  const initial=await window.nativeShipEffects.request(descriptor.shipType,descriptor.category);
  role.entity.hull=descriptor.definition.hull*.4;
  window.vexedFlightAssets.loadShip=async()=>{throw Error('controlled decode failure');};
  assert.equal(window.nativeShipEffects.asset(role.describe()),initial);
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(window.nativeShipEffects.ready(descriptor.shipType,descriptor.category),true);
  assert.equal(window.nativeShipEffects.metrics().foregroundPending,0);
  assert.equal(window.nativeShipEffects.metrics().failures,1);
  window.vexedFlightAssets.loadShip=load;
  const replacement=await window.nativeShipEffects.request(descriptor.shipType,descriptor.category,{stage:2});
  assert.equal(window.nativeShipEffects.asset(role.describe()),replacement);
  assert.equal(replacement.hull,descriptor.definition.hull*.4);
});

test('base art paints synchronously after optional class eviction without restarting preparation',async()=>{
  const {window,definitions,entities,ctx,drawn}=fixture(),loader=window.vexedFlightAssets,retained=new Map();
  let loads=0;
  const original=loader.loadShip;
  loader.loadShip=async(type,hull)=>{loads++;const asset=await original(type,hull),maximum=definitions.get(type).hull;
    asset.damageStage=hull/maximum<.25?3:hull/maximum<.5?2:hull/maximum<.75?1:0;retained.set(type+':'+asset.damageStage,asset);return asset;};
  loader.peekShip=(type,stage,{fallback=false}={})=>retained.get(type+':'+stage)||(fallback?retained.get(type+':0'):null);
  for(let type=1000;type<1030;type++){definitions.register(type,{hull:100});await window.nativeShipEffects.request(type,'civilian',{stage:type%4});}
  assert.equal(window.nativeShipEffects.metrics().entries,12);
  const before=loads;
  for(let type=1000;type<1030;type++){
    const role=entities(type)[1],stage=type%4;role.entity.hull=100*[1,.7,.4,.1][stage];
    const art=window.nativeShipEffects.paintShip(ctx,role.describe(),{ship:{x:0,y:0},cx:300,cy:200});
    assert.equal(art?.type,type);assert.equal(art?.damageStage,stage);
  }
  assert.equal(loads,before,'optional-data eviction cannot cause per-frame Promise requests');
  assert.equal(drawn.filter(row=>row.kind==='ship').length,30);
  const role=entities(1000)[1];role.entity.hull=40;
  assert.equal(window.nativeShipEffects.asset(role.describe()).type,1000,'missing-stage loading keeps the same hull');
  assert.equal(window.nativeShipEffects.asset(entities(9999)[1].describe()),null,'another hull never receives that fallback');
});

test('thirteen disabled classes retain the correct mission-start blend independently of optional class data',async()=>{
  const f=fixture(),{window,context,definitions,entities,ctx}=f,loader=window.vexedFlightAssets,retained=new Map(),surfaces=[];
  context.document={createElement:()=>{const calls=[],g={clearRect:()=>{},drawImage:art=>calls.push(art.key),save:()=>{},beginPath:()=>{},rect:()=>{},clip:()=>{},restore:()=>{}};
    const canvas={getContext:()=>g,calls};surfaces.push(canvas);return canvas;}};
  window.nativeShipRepairs={ref:(category,entity)=>({category,id:entity.id}),missionFor:s=>s.shipRepairs.missions[0]};
  vm.runInContext(fs.readFileSync(path.join(port,'repair-visuals.js'),'utf8'),context);
  let loads=0;
  loader.loadShip=async(type,hull)=>{loads++;const stage=hull<25?3:hull<50?2:hull<75?1:0,
    asset={type,damageStage:stage,width:64,height:128,art:{key:type+':'+stage},profile:{}};
    retained.set(type+':'+stage,asset);return asset;};
  loader.peekShip=(type,stage)=>retained.get(type+':'+stage)||null;
  const idle=entities()[0].describe();
  idle.entity.phase='disabled';
  assert.equal(window.nativeRepairVisuals.requiredStages(idle).length,0,'an unassigned disabled hull needs only its current appearance');
  idle.state.shipRepairs={missions:[{status:'active',startHull:idle.definition.hull*.25,restoredHull:0}]};
  assert.ok(window.nativeRepairVisuals.requiredStages(idle).includes(2),'an assigned crew prepares the initial plate before first healing');
  const roles=[];
  for(let type=1000;type<1013;type++){
    definitions.register(type,{hull:100});const role=entities(type).find(role=>role.category==='civilian');
    Object.assign(role.entity,{phase:'disabled',hull:55});
    role.state.shipRepairs={missions:[{status:'active',startHull:type%2?10:25,restoredHull:30}]};roles.push(role);
    for(const stage of [0,1,2,3])await window.nativeShipEffects.request(type,'civilian',{stage});
  }
  assert.equal(window.nativeShipEffects.metrics().entries,12);
  const beforeLoads=loads,before=JSON.stringify(roles),first=[];
  for(const role of roles){
    const d=role.describe(),start=role.state.shipRepairs.missions[0].startHull===25?2:3,
      required=window.nativeRepairVisuals.requiredStages(d);
    assert.ok(required.includes(start));assert.ok(Object.isFrozen(required));
    const art=window.nativeShipEffects.paintShip(ctx,d,{ship:{x:0,y:0},cx:300,cy:200});
    assert.equal(art.type,role.entity.shipType);assert.equal(art.repairSurface,true);
    assert.deepEqual(art.art.calls,[role.entity.shipType+':'+start,role.entity.shipType+':0']);first.push(art);
  }
  for(const [index,role]of roles.entries())assert.equal(window.nativeShipEffects.paintShip(ctx,role.describe(),{ship:{x:0,y:0},cx:300,cy:200}),first[index],'paused unchanged repair keeps the same composition wrapper');
  assert.equal(loads,beforeLoads,'loader-ready plates cannot restart class requests');
  assert.equal(JSON.stringify(roles),before,'painting cannot alter repair state or owned equipment');
  assert.equal(surfaces.length,13);assert.equal(window.nativeRepairVisuals.snapshot(roles[0].state).surfaces,13);
  // A genuinely absent initial plate keeps the same hull visible while loading;
  // it must not blend from severe simply because stage2 is unavailable.
  const role=roles[0];retained.delete('1000:2');role.entity.hull=57;
  const fallback=window.nativeShipEffects.paintShip(ctx,role.describe(),{ship:{x:0,y:0},cx:300,cy:200});
  assert.equal(fallback.type,1000);assert.equal(fallback.repairSurface,undefined);assert.equal(surfaces.length,13);
  await window.nativeShipEffects.request(1000,'civilian',{stage:2});
  const resumed=window.nativeShipEffects.paintShip(ctx,role.describe(),{ship:{x:0,y:0},cx:300,cy:200});
  assert.equal(resumed.repairSurface,true);assert.deepEqual(resumed.art.calls.slice(-2),['1000:2','1000:0']);
});
