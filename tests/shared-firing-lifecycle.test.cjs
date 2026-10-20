const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const directory=path.join(__dirname,'../html-games/broken-mirror-port');
const plain=value=>JSON.parse(JSON.stringify(value));
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-7,`${message}: ${actual} vs ${expected}`);
async function fixture({armTugs=true}={}){
  const draws=[],hits=[],document={hidden:false};
  const window={
    VexedMirrorWorld:{ships:[7,10,18,23,47,52].map(id=>({id,name:'Ship '+id,hull:100,shields:80,defaultWeapons:[1]}))},
    VexedMirrorWeapons:[{id:1,name:'Phaser',damage:12,recharge:13},{id:2,name:'Disruptor',damage:12,recharge:13},{id:3,name:'Photon Torpedo',damage:12,recharge:13}],
    starterShips:new Map(),vexedFlightAssets:{size:()=>60,flightDimensions:()=>({width:40,height:60})},
    vexedSolFlight:{shipPosition:state=>({x:state.x,y:state.y})},
    showcaseWeaponAppearance:{units:1},showcaseShieldRadii:(width,height)=>({rx:width*.6,ry:height*.6}),
    createShowcaseWeaponVisual:input=>({...input}),paintShowcaseWeaponShot:(_,shot,geometry,time)=>draws.push({kind:shot.kind,geometry:{...geometry},time}),
    nativeSolAsteroids:{placements:[]},nativePause:{active:false},nativeShipInventory:{active:false},
  };
  const context=vm.createContext({window,document,console,performance:{now:()=>1000},fetch:async()=>({ok:true,json:async()=>({weapons:{}})})});
  for(const file of ['simulation-clock.js','ship-motion.js','ship-definitions.js','ship-damage.js','weapon-loadout.js','weapon-rules.js','combat-shots.js','ship-systems.js'])vm.runInContext(fs.readFileSync(path.join(directory,file),'utf8'),context,{filename:file});
  await window.nativeCombatShots.ready;
  window.nativeCombatShots.setVisualCatalog({weapons:{beam:[{id:1}],disruptor:[{id:2}],torpedo:[{id:3}]}},{units:1});
  const state={system:1,shipType:7,x:9000,y:9000,angle:0,hull:100,shields:80,weapons:[1],weaponInventory:[],latinum:23,ore:6,
    civilianTraffic:{version:2,clock:0,ships:[],disputes:[],retaliations:[],strayShots:[]},solEconomy:{freighters:[]},escorts:[]};
  const damage=(entity,category,amount,impact)=>{
    const descriptor=window.nativeShipDefinitions.describe(state,entity,{category}),result=window.nativeShipDamage.apply(descriptor,amount,impact);
    hits.push({entity,impact,result});return result;
  };
  window.nativeSolEconomy={hit:(_,id,amount,impact)=>damage(state.solEconomy.freighters.find(ship=>ship.id===id),'tug',amount,impact)};
  window.nativeCivilianTraffic={hit:(_,id,amount,impact)=>damage(state.civilianTraffic.ships.find(ship=>ship.id===id),'civilian',amount,impact)};
  window.nativeCombatShots.onPlayerHit=(_,amount,impact)=>damage(state,'player',amount,impact);
  window.nativeAsteroidCombat={weaponHit:(_,id,amount,impact)=>{
    const rock=window.nativeSolAsteroids.placements.find(item=>item.slotId===id);rock.hull=0;
    state.destroyedAsteroids=[...(state.destroyedAsteroids||[]),id];hits.push({entity:rock,impact});return {ok:true,destroyed:true,hull:0};
  }};
  // A new registered role participates in the same reusable scenarios automatically.
  window.nativeShipDefinitions.register(99,{name:'New escort',hull:100,shields:80,dimensions:{width:45,height:68},equipment:[1],emitters:{beam:{x:.12,y:-.31},projectile:{x:.12,y:-.31}}});
  window.nativeShipDefinitions.register(10,{profiles:{tug:{capabilities:{armed:armTugs}}}});
  window.nativeShipSystems.register('escort',{collect:(_,system)=>state.escorts.filter(ship=>ship.system===system&&ship.hull>0).map(ship=>({...window.nativeShipDefinitions.describe(state,ship,{category:'escort'}),id:'escort:'+ship.id})),hit:(_,target,amount,impact)=>damage(target.entity,'escort',amount,impact)});
  const roles=window.nativeShipSystems.registered().filter(role=>role!=='asteroid');
  function put(role,x,y=0,model=1){
    if(role==='player'){Object.assign(state,{x,y,weapons:[model],hull:100,shields:80,angle:0});delete state.shipEquipment;delete state.weaponLoadout;return 'player';}
    const list=role==='tug'?state.solEconomy.freighters:role==='escort'?state.escorts:state.civilianTraffic.ships;
    const id=list.length+1,ship={id,system:1,shipType:role==='tug'?10:role==='escort'?99:18,x,y,heading:0,speed:0,hull:100,shields:80,phase:'cruise',weapons:[model],weaponInventory:[]};list.push(ship);
    return role==='tug'?'tug:'+id:role==='escort'?'escort:'+id:id;
  }
  const descriptor=id=>window.nativeShipSystems.resolve(state,id);
  const step=dt=>{window.nativeSimulation.advance(state,dt);window.nativeCombatShots.advance(state,dt);};
  return {window,document,state,draws,hits,roles,put,descriptor,step,shots:window.nativeCombatShots,loadouts:window.nativeWeaponLoadout};
}

test('registered controllers share weapon eligibility, charge-only pace and exact model mechanics',async()=>{
  const discovery=await fixture();
  for(const role of discovery.roles)for(const modelId of [1,2,3]){
    const f=await fixture(),sourceId=f.put(role,0,0,modelId),targetId=f.put(role==='player'?'civilian':'player',200);
    const result=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});
    assert.equal(result.ok,true,`${role} ${modelId}`);
    assert.deepEqual(plain(result.event.spec),plain(f.window.nativeWeaponRules.weaponSpec(f.window.VexedMirrorWeapons[modelId-1],result.kind)));
    const source=f.descriptor(sourceId).entity,instance=f.loadouts.equipped(f.state,source)[0].instance;
    close(instance.readyAt,1,'same recharge /13');
    assert.equal(f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)}).ok,false);
    for(let index=0;index<45;index++)f.step(.02);
    assert.equal(f.hits.length,1,`${role} ${result.kind} damages exactly once`);
    assert.equal(f.descriptor(targetId).entity.shields,68);
    assert.equal(f.state.latinum,23);assert.equal(f.state.ore,6);
    assert.equal(f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)}).ok,false,'no reactor bypass while charging');
    f.step(.11);
    assert.equal(f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)}).ok,true,'intended charge-only firing pace resumes');
  }
});

test('registered shooters retain their emitter while rotating targets meet the current near shield surface',async()=>{
  const discovery=await fixture();
  for(const role of discovery.roles){
    const f=await fixture(),sourceId=f.put(role,0),targetId=f.put(role==='player'?'civilian':'player',200),source=f.descriptor(sourceId).entity,target=f.descriptor(targetId).entity;
    const firing=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});
    source.x+=10;source.y+=3;if(role==='player')source.angle=.03;else source.heading=.03;
    target.y+=4;if(target===f.state)target.angle=.5;else target.heading=.5;
    f.step(.08);assert.equal(firing.event.resolved,true);assert.equal(firing.event.contact.shielded,true);
    assert.equal(f.hits[0].impact.contact,firing.event.contact,'damage receives the exact collision object');
    source.x+=15;source.y+=8;if(role==='player')source.angle=.8;else source.heading=.8;
    target.x+=16;target.y+=13;if(target===f.state)target.angle+=.7;else target.heading+=.7;
    const sourcePose=f.descriptor(sourceId),targetPose=f.descriptor(targetId),local=firing.event.emitter;
    const angle=sourcePose.heading+Math.PI/2,expectedFrom={x:sourcePose.x+local.x*Math.cos(angle)-local.y*Math.sin(angle),y:sourcePose.y+local.x*Math.sin(angle)+local.y*Math.cos(angle)};
    const direction={x:targetPose.x-expectedFrom.x,y:targetPose.y-expectedFrom.y},angleToTarget=Math.atan2(direction.y,direction.x),r=targetPose.radii;
    const localAngle=angleToTarget-targetPose.heading-Math.PI/2;
    const surfaceDistance=.96/Math.hypot(Math.cos(localAngle)/r.rx,Math.sin(localAngle)/r.ry);
    const expectedTo={x:targetPose.x-Math.cos(angleToTarget)*surfaceDistance,y:targetPose.y-Math.sin(angleToTarget)*surfaceDistance},camera={x:31,y:54};
    f.shots.paint({},firing.shot,{state:f.state,ship:camera,cx:400,cy:250,zoom:1.7});
    const draw=f.draws.at(-1).geometry;
    close(draw.x1,400+(expectedFrom.x-camera.x)*1.7,'beam emitter world->camera');close(draw.y1,250+(expectedFrom.y-camera.y)*1.7,'beam emitter world->camera');
    close(draw.x2,400+(expectedTo.x-camera.x)*1.7,'beam meets current near shield x');close(draw.y2,250+(expectedTo.y-camera.y)*1.7,'beam meets current near shield y');
  }
});

test('beam and projectile collisions share shield-active, collapsing and absent surfaces for all registered targets',async()=>{
  const discovery=await fixture();
  for(const role of discovery.roles)for(const shields of [80,5,0])for(const modelId of [1,2,3]){
    const f=await fixture(),targetId=f.put(role,200),sourceId=f.put(role==='player'?'civilian':'player',0,0,modelId),target=f.descriptor(targetId).entity;
    target.shields=shields;const result=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});
    assert.equal(result.ok,true);
    for(let index=0;index<45;index++)f.step(.02);
    assert.equal(target.shields,Math.max(0,shields-12));assert.equal(target.hull,100-Math.max(0,12-shields));
    const hit=f.hits[0];assert.equal(hit.impact.contact.shielded,shields>0);
    if(shields>0)assert.equal(hit.result.contacts.shield,hit.impact.contact);
    if(shields===0)assert.equal(hit.result.contacts.hull,hit.impact.contact);
    if(shields===5){assert.equal(hit.result.contacts.hull.shielded,false);assert.notDeepEqual(plain(hit.result.contacts.hull.local),plain(hit.result.contacts.shield.local));}
  }
});

test('owned recharge survives identical-model swaps, locker moves, refits and JSON save/load',async()=>{
  const f=await fixture(),sourceId=f.put('player',0),targetId=f.put('civilian',200);
  f.state.weapons=[1,1,null];f.loadouts.ensure(f.state);
  const result=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId),selection:{slot:0}}),first=f.loadouts.equipped(f.state)[0].instance;
  assert.equal(first.id,result.event.weaponInstanceId);
  f.loadouts.move(f.state,{fromType:'slot',fromIndex:0,toType:'slot',toIndex:1});
  assert.equal(f.loadouts.equipped(f.state)[1].instance,first);
  assert.equal(f.shots.arm(f.state,undefined,()=>true,{selection:{slot:1}}).ok,false);
  assert.equal(f.shots.arm(f.state,undefined,()=>true,{selection:{slot:0}}).ok,true,'a second owned copy has independent charge');
  f.loadouts.move(f.state,{fromType:'slot',fromIndex:1,toType:'locker',toIndex:0});
  f.loadouts.move(f.state,{fromType:'locker',fromIndex:0,toType:'slot',toIndex:2});
  assert.equal(f.loadouts.equipped(f.state).find(item=>item.slot===2).instance,first);
  const saved=plain(f.state),restored=f.loadouts.equipped(saved).find(item=>item.slot===2).instance;
  assert.equal(restored.id,first.id);assert.equal(restored.readyAt,first.readyAt);
  assert.equal(f.shots.arm(saved,undefined,()=>true,{selection:{slot:2}}).ok,false);
  f.loadouts.refit(saved,[2,null,null]);assert.equal(saved.weaponLoadout.instances[first.id].readyAt,1);assert.ok(saved.weaponLoadout.locker.includes(first.id));
  assert.deepEqual(plain(saved.weapons),[2,null,null]);
});

test('legacy cooldown migrations preserve remaining recharge across distinct player and civilian clocks',async()=>{
  const f=await fixture();
  f.state.weaponCombat={version:1,clock:10,weaponReadyAt:{'0:1':12}};
  f.state.civilianTraffic.clock=100;
  f.state.weapons=[1];
  const player=f.loadouts.equipped(f.state)[0].instance;
  assert.equal(player.readyAt,102,'two seconds remain after clock unification');
  const npc={weapons:[1],weaponReadyAt:{'0:1':103}};
  const civilian=f.loadouts.equipped(f.state,npc)[0].instance;
  assert.equal(civilian.readyAt,103,'three seconds remain on civilian clock');
  assert.doesNotThrow(()=>JSON.stringify(f.state));
});

test('pause, inventory and hidden documents freeze simulation and animation without spending charge',async()=>{
  for(const mode of ['pause','inventory','hidden']){
    const f=await fixture(),sourceId=f.put('player',0,0,2),targetId=f.put('civilian',300);
    const result=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});f.step(.1);
    const saved=JSON.stringify(f.state.weaponCombat.events),clock=f.window.nativeSimulation.seconds(f.state);
    if(mode==='pause')f.window.nativePause.active=true;if(mode==='inventory')f.window.nativeShipInventory.active=true;if(mode==='hidden')f.document.hidden=true;
    f.step(2);assert.equal(JSON.stringify(f.state.weaponCombat.events),saved);assert.equal(f.window.nativeSimulation.seconds(f.state),clock);
    f.shots.paintAll({},{state:f.state,ship:{x:0,y:0},cx:400,cy:250});const first=f.draws.at(-1);f.step(1);f.shots.paintAll({},{state:f.state,ship:{x:0,y:0},cx:400,cy:250});assert.deepEqual(f.draws.at(-1),first);
    assert.equal(f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)}).ok,false);
    f.window.nativePause.active=false;f.window.nativeShipInventory.active=false;f.document.hidden=false;f.step(.1);assert.notEqual(JSON.stringify(f.state.weaponCombat.events),saved);
  }
});

test('projectile saved world positions are independent of camera movement and restore without callback closures',async()=>{
  const f=await fixture(),sourceId=f.put('player',0,0,2),targetId=f.put('civilian',300);
  const result=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});f.step(.1);
  const x=result.event.x,y=result.event.y;
  for(const camera of [{x:10,y:20},{x:-60,y:90}]){f.shots.paintAll({},{state:f.state,ship:camera,cx:400,cy:250,zoom:2});close(f.draws.at(-1).geometry.x,400+(x-camera.x)*2,'camera transforms only rendering');close(f.draws.at(-1).geometry.y,250+(y-camera.y)*2,'camera transforms only rendering');}
  assert.equal(result.event.x,x);assert.equal(result.event.y,y);
  const restored=plain(f.state);f.shots.advance(restored,0);f.shots.paintAll({},{state:restored,ship:{x:0,y:0},cx:400,cy:250});
  close(f.draws.at(-1).geometry.x,400+x,'restored saved projectile');
  f.window.nativeSimulation.advance(restored,.05);f.shots.advance(restored,.05);
  close(restored.weaponCombat.events[0].x,x+result.event.vx*.05,'restored shot continues its simulation');
});

test('misses hit shared asteroid targets and continue after target/shooter destruction or system changes',async()=>{
  const f=await fixture(),sourceId=f.put('civilian',0,0,2),targetId=f.put('player',200);
  const result=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});
  f.state.hull=0;const shooter=f.descriptor(sourceId).entity;shooter.hull=0;shooter.phase='destroyed';f.state.system=2;
  f.window.nativeSolAsteroids.placements.push({slotId:6,x:120,y:0,size:24,hull:10});f.step(.5);
  assert.equal(result.event.resolved,true);assert.equal(result.event.hitTargetId,'rock:6');assert.deepEqual(f.state.destroyedAsteroids,[6]);
  assert.equal(f.hits.length,1,'stray shot resolves exactly once after source/target disappear');
});

test('legacy pending shots migrate once into serializable shared events with remaining flight time',async()=>{
  const f=await fixture(),sourceId=f.put('civilian',0),targetId=f.put('player',300);
  f.state.weaponCombat={version:1,clock:100,weaponReadyAt:{}};f.state.civilianTraffic.clock=10;
  const legacy=f.window.nativeWeaponRules.startShot(f.window.VexedMirrorWeapons[1],'disruptor',f.descriptor(sourceId),f.descriptor(targetId),10,0);
  legacy.sourceSnapshot=f.shots.snapshot(f.descriptor(sourceId));legacy.targetSnapshot=f.shots.snapshot(f.descriptor(targetId));legacy.weaponId=2;
  f.state.civilianTraffic.disputes=[{system:1,pending:[legacy]}];f.shots.migrate(f.state);
  assert.equal(f.state.weaponCombat.events.length,1);assert.equal(f.state.weaponCombat.events[0].launchedAt,100);assert.equal(f.state.civilianTraffic.disputes[0].pending.length,0);
  f.shots.migrate(f.state);assert.equal(f.state.weaponCombat.events.length,1);assert.doesNotThrow(()=>JSON.stringify(f.state));
});

test('system changes and warp cancel player shots copied into another saved state',async()=>{
  for(const mode of ['system','warp']){
    const f=await fixture(),sourceId=f.put('player',0,0,2),targetId=f.put('civilian',300);
    const firing=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)}),next=plain(f.state);
    if(mode==='system')next.system=2;else f.window.vexedWarp={active:true};
    f.window.nativeSimulation.advance(next,.5);f.shots.advance(next,.5);
    assert.equal(next.weaponCombat.events.length,0);assert.equal(f.hits.length,0);assert.equal(firing.event.alive,true,'cancellation uses the new state instead of relying on an old visual reference');
  }
});

test('explicit unarmed ship capabilities reject fire without spending an owned weapon charge',async()=>{
  const f=await fixture({armTugs:false}),sourceId=f.put('tug',0),targetId=f.put('civilian',200);
  f.window.nativeShipDefinitions.register(10,{capabilities:{armed:false}});
  const shooter=f.descriptor(sourceId),instance=f.loadouts.equipped(f.state,shooter.entity)[0].instance;
  assert.equal(shooter.definition.capabilities.armed,false,'delivery tug policy is explicit');
  assert.equal(f.shots.fireFor({state:f.state,shooter,target:f.descriptor(targetId)}).ok,false);
  assert.equal(instance.readyAt,0);assert.equal(f.state.weaponCombat?.events.length||0,0);
  f.state.shipType=10;f.put('player',0);
  assert.equal(f.descriptor('player').definition.capabilities.armed,false,'an explicitly unarmed hull has the same limit for the player');
});

test('registry descriptors preserve previous world positions and use relative sweeps for crossing targets',async()=>{
  const f=await fixture(),sourceId=f.put('player',0,0,2),targetId=f.put('civilian',50,80),target=f.descriptor(targetId).entity;
  target.previousX=50;target.previousY=-80;
  const descriptor=f.descriptor(targetId);assert.equal(descriptor.previousX,50);assert.equal(descriptor.previousY,-80);
  const rules=f.window.nativeWeaponRules,event=rules.startShot(f.window.VexedMirrorWeapons[1],'disruptor',f.descriptor(sourceId),{...descriptor,x:100,y:0,heading:0,speed:0,vx:0,vy:0},0,0);
  const collision=rules.stepShot(event,f.descriptor(sourceId),descriptor,f.window.nativeShipSystems.scene(f.state),.3,.3,descriptor.radii,descriptor.dimensions);
  assert.equal(collision.kind,'hit');assert.equal(collision.target.id,targetId);
  const origin={x:50,y:-80+160*collision.t},angle=descriptor.heading+Math.PI/2;
  const relative={x:collision.sweepPoint.x-origin.x,y:collision.sweepPoint.y-origin.y};
  const local={x:relative.x*Math.cos(angle)+relative.y*Math.sin(angle),y:-relative.x*Math.sin(angle)+relative.y*Math.cos(angle)};
  const expectedAngle=Math.atan2(local.y,local.x),actualAngle=Math.atan2(collision.contact.local.y,collision.contact.local.x);
  close(actualAngle,expectedAngle,'impact local direction uses the target center at collision time');
  const world=f.shots.worldPoint(descriptor,collision.contact.local);close(collision.contact.world.x,world.x,'visual follows current target surface');close(collision.contact.world.y,world.y,'visual follows current target surface');
});

test('beam preview stops on the shared surface without resolving damage during rendering',async()=>{
  const f=await fixture(),sourceId=f.put('player',0),targetId=f.put('civilian',200);
  const firing=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)}),target=f.descriptor(targetId);
  f.shots.paintAll({},{state:f.state,ship:{x:0,y:0},cx:0,cy:0});
  assert.ok(f.draws.at(-1).geometry.x2<target.x,'initial visible beam ends on the near surface instead of continuing through the target');
  assert.equal(firing.event.resolved,false);assert.equal(f.hits.length,0);assert.equal(target.entity.shields,80);
});

test('resolved asteroid beams retain the authoritative circular surface point',async()=>{
  const f=await fixture(),sourceId=f.put('player',0);
  f.window.nativeSolAsteroids.placements.push({slotId:12,x:200,y:0,angle:.7,size:40,hull:100});
  const firing=f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor('rock:12')});f.step(.08);
  assert.equal(firing.event.contact.shielded,false);f.shots.paintAll({},{state:f.state,ship:{x:0,y:0},cx:0,cy:0});
  close(f.draws.at(-1).geometry.x2,firing.event.contact.world.x,'asteroid contact uses circular world offsets');close(f.draws.at(-1).geometry.y2,firing.event.contact.world.y,'asteroid contact does not rotate as ship artwork');
});

test('inventory move validation preserves baseline swaps and rendering never damages or awards resources',async()=>{
  const f=await fixture(),sourceId=f.put('player',0),targetId=f.put('civilian',200);
  delete f.state.shipEquipment;delete f.state.weaponLoadout;f.state.weaponInventory=[2,3];f.loadouts.ensure(f.state);
  f.loadouts.move(f.state,{fromType:'slot',fromIndex:0,toType:'locker',toIndex:0});assert.deepEqual(plain(f.state.weapons),[2,null,null]);assert.deepEqual(plain(f.state.weaponInventory),[1,3]);
  f.loadouts.move(f.state,{fromType:'locker',fromIndex:0,toType:'locker',toIndex:1});assert.deepEqual(plain(f.state.weaponInventory),[3,1]);
  const before=JSON.stringify(f.state.weaponLoadout);assert.equal(f.loadouts.move(f.state,{fromType:'slot',fromIndex:0,toType:'slot',toIndex:3}).ok,false);assert.equal(f.loadouts.move(f.state,{fromType:'invalid',fromIndex:0,toType:'slot',toIndex:0}).ok,false);assert.equal(JSON.stringify(f.state.weaponLoadout),before);
  f.shots.fireFor({state:f.state,shooter:f.descriptor(sourceId),target:f.descriptor(targetId)});
  const health={hull:f.descriptor(targetId).entity.hull,shields:f.descriptor(targetId).entity.shields,latinum:f.state.latinum,ore:f.state.ore};
  for(let i=0;i<20;i++)f.shots.paintAll({},{state:f.state,ship:{x:i,y:i*3},cx:400,cy:250});
  assert.deepEqual({hull:f.descriptor(targetId).entity.hull,shields:f.descriptor(targetId).entity.shields,latinum:f.state.latinum,ore:f.state.ore},health);assert.equal(f.hits.length,0);
});
