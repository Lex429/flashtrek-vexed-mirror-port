const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const port=path.join(__dirname,'../html-games/broken-mirror-port');
const read=file=>fs.readFileSync(path.join(port,file),'utf8');

test('controllers cannot restore private movement, firing, damage or shield rendering implementations',()=>{
  for(const file of ['sol-economy.js','civilian-traffic.js','civilian-combat-ai.js','player-combat.js']){
    const source=read(file);
    for(const forbidden of ['function weaponSpec(','.createProjectile(','.stepProjectile(','.resolveBeam(','.shields-=','.hull-=','drawShowcaseShieldSurface(','drawShowcaseShieldFlash(','showcaseHullBurst.burst(']){
      assert.ok(!source.includes(forbidden),`${file} must call the shared owner instead of ${forbidden}`);
    }
  }
  const effects=read('ship-effects.js'),paint=effects.slice(effects.indexOf('  function paint(state,'),effects.indexOf('  function snapshot('));
  for(const forbidden of ['.emit(','.burst(','.update(','.debris(','explode(','splice('])assert.ok(!paint.includes(forbidden),`rendering must not execute ${forbidden}`);
  for(const file of ['asteroid-combat.js','civilian-traffic.js']){
    const source=read(file),start=source.indexOf('  function paint('),render=source.slice(start);
    assert.ok(!render.includes('finishMining('),`${file} must complete mining in simulation`);
    assert.ok(!render.includes('collectMinedOre('),`${file} must grant ore in simulation`);
  }
});

test('one saved simulation clock migrates legacy clocks and pauses for inventory, menu and hidden tabs',()=>{
  const document={hidden:false},window={nativePause:{active:false},nativeShipInventory:{active:false}};
  const sandbox=vm.createContext({window,document});vm.runInContext(read('simulation-clock.js'),sandbox);
  const clock=window.nativeSimulation,state={weaponCombat:{clock:17},civilianTraffic:{clock:23}};
  assert.equal(clock.seconds(state),23);
  clock.advance(state,.5);assert.equal(clock.now(state),23500);
  for(const blocked of [window.nativePause,window.nativeShipInventory,document]){
    const key=blocked===document?'hidden':'active';blocked[key]=true;
    assert.equal(clock.advance(state,9),0);assert.equal(clock.seconds(state),23.5);blocked[key]=false;
  }
  const saved=JSON.parse(JSON.stringify(state));clock.advance(saved,.25);
  assert.equal(clock.now(saved),23750);assert.equal(clock.seconds(state),23.5);
  for(const invalid of [0,-1,NaN,Infinity])assert.equal(clock.advance(saved,invalid),0);
});

test('a new target category joins collision and shared damage without changing any controller',()=>{
  const document={hidden:false},window={
    VexedMirrorWorld:{ships:[{id:987,hull:100,shields:50}]},
    vexedFlightAssets:{size:()=>({}),flightDimensions:()=>({width:25,height:50})},
    nativeCombatShots:{contact:(target,from)=>({local:{x:0,y:-10},world:{x:target.x,y:target.y-10},from,shielded:target.shields>0})},
  };
  const sandbox=vm.createContext({window,document});
  for(const file of ['ship-definitions.js','ship-damage.js','ship-systems.js'])vm.runInContext(read(file),sandbox);
  const state={system:2,hull:0},npc={id:'escort:1',shipType:987,system:2,x:80,y:20,heading:.2,hull:100,shields:50};
  const targets=window.nativeShipSystems,definitions=window.nativeShipDefinitions;
  targets.register('escort',{
    collect:(_,system)=>npc.hull>0&&system===npc.system?[definitions.describe(state,npc,{category:'escort'})]:[],
    hit:(_,target,amount,impact)=>window.nativeShipDamage.apply(target,amount,impact)
  });
  assert.ok(targets.registered().includes('escort'));
  const target=targets.scene(state).targets.find(entry=>entry.id==='escort:1');assert.ok(target);
  const from={x:0,y:20},contact=window.nativeCombatShots.contact(target,from);
  const damage=targets.applyHit(state,{target,from,point:contact.world,contact},{damage:65,kind:'beam'},{id:'player',system:2});
  assert.equal(damage.shields,0);assert.equal(damage.hull,85);assert.equal(damage.contacts.shield,contact);
  targets.applyHit(state,{target,from,point:contact.world},{damage:999,kind:'torpedo'},{id:'player',system:2});
  assert.equal(npc.hull,0);assert.equal(targets.resolve(state,npc.id),null);
  assert.equal(targets.applyHit(state,{target,from,point:contact.world},{damage:999,kind:'beam'},{id:'player',system:2}).ok,false);
});
