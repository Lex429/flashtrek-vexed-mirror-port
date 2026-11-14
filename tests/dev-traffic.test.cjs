const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const code=fs.readFileSync('html-games/broken-mirror-port/dev-traffic.js','utf8');
function policy(port='7790',search=''){const window={location:{hostname:'127.0.0.1',port,search}};vm.runInNewContext(code,{window,URLSearchParams});return window.nativeDevTraffic;}
test('Dev traffic is restored by default; isolation requires an explicit local opt-out',()=>{
 assert.equal(policy().active({devMode:true}),false);assert.equal(policy().active({devMode:false}),false);
 assert.equal(policy().allowsCategory({devMode:true},'civilian'),true);assert.equal(policy().allowsCategory({devMode:true},'tug'),true);
 assert.equal(policy().excludes({devMode:true},{shipType:47},'civilian'),false);
 assert.equal(policy('7791','?devTraffic=off').active({devMode:true}),false);assert.equal(policy('7790','?devTraffic=on').active({devMode:true}),false);
 const api=policy('7790','?devTraffic=off'),s={devMode:true,shipType:7};assert.equal(api.active(s),true);assert.equal(api.excludes(s,s,'player'),false);
 assert.equal(api.excludes(s,{shipType:47},'civilian'),true);assert.equal(api.excludes(s,{shipType:10},'tug'),true);
 assert.equal(api.excludes(s,{slotId:42,size:20},'asteroid'),false);
 assert.equal(api.excludes(s,{id:'dot:player:1',carrier:{category:'player'}},'repair-drone'),false);
 assert.equal(api.excludes(s,{id:'dot:civilian:1',carrier:{category:'civilian'}},'repair-drone'),true);
});
test('Dev isolation removes NPCs from shared physical queries, targets and detail without changing fleet saves',async()=>{
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state;
 assert.ok(w.nativeShipSystems.collectShips(s).some(d=>d.category==='civilian'));
 w.location={hostname:'127.0.0.1',port:'7790',search:'?devTraffic=off'};f.context.URLSearchParams=URLSearchParams;vm.runInContext(code,f.context);s.devMode=true;
 const before=JSON.stringify({ships:s.civilianTraffic.ships,tugs:s.solEconomy.freighters});
 assert.ok(w.nativeShipSystems.collectShips(s).every(d=>d.category==='player'));
 assert.equal(w.nativeCivilianTraffic.localShips(s).length,0);assert.equal(w.nativeShipSystems.resolve(s,f.ship.id),null);
 assert.equal(w.nativeShipDetail.isDetailed(s,f.ship,{category:'civilian'}),false);assert.equal(w.nativeShipDetail.contains(s,f.ship,1),false);
 assert.ok(w.nativeShipSystems.inspectAll(s).every(d=>d.category==='player'));
 assert.equal(JSON.stringify({ships:s.civilianTraffic.ships,tugs:s.solEconomy.freighters}),before);
 const restored=JSON.parse(JSON.stringify(s));assert.ok(w.nativeShipSystems.collectShips(restored).every(d=>d.category==='player'));
 s.devMode=false;assert.ok(w.nativeShipSystems.collectShips(s).some(d=>d.category==='civilian'));
});
test('NPC weapons and resumed NPC projectiles cannot interfere with the local Dev test',async()=>{
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state;
 w.location={hostname:'127.0.0.1',port:'7790',search:'?devTraffic=off'};f.context.URLSearchParams=URLSearchParams;vm.runInContext(code,f.context);s.devMode=true;
 const shooter=w.nativeShipDefinitions.describe(s,f.ship,{category:'civilian'});
 const fired=w.nativeCombatShots.fireFor({state:s,shooter,target:w.nativeShipDefinitions.describe(s)});assert.equal(fired.reason,'quiet-dev');
 const combat=w.nativeCombatShots.migrate(s);combat.events.push({id:'old-npc-shot',sourceId:f.ship.id,system:1,kind:'beam',alive:true,projectile:true});
 const before={hull:s.hull,shields:s.shields};w.nativeSimulation.advance(s,1/60);w.nativeCombatShots.advance(s,1/60);
 assert.equal(combat.events.length,0);assert.deepEqual({hull:s.hull,shields:s.shields},before);
});
