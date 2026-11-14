const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const root=path.join(__dirname,'../html-games'),copy=value=>JSON.parse(JSON.stringify(value));
const options={factions:true,population:true,regional:true,access:true,repairs:true,corridors:true};
const wallet=f=>Object.values(f.lives.initialize(f.state).markets).reduce((sum,m)=>sum+m.credits,0)+f.state.civilianTraffic.ships.reduce((sum,e)=>sum+e.credits,0);
const rosterShips=(f,fleet)=>f.state.civilianTraffic.ships.filter(e=>f.window.nativeFactionFleets.forShip(f.state,e)?.governmentId===fleet.governmentId);
function install(f){vm.runInContext(fs.readFileSync(path.join(root,'broken-mirror-port/faction-fleets.js'),'utf8'),f.context);f.lives.initialize(f.state);}
function analytical(f){f.state.landed=true;f.lives.interactive(f.state,false);}

test('the 35 additional faction hulls use finished original four-stage artwork and installed animation profiles',async()=>{
 const f=await fixture(options),w=f.window;
 w.createShowcaseEffects=()=>({draw(){},snapshot(){}});
 for(const name of ['starter-effects','earth-profiles','klingon-profiles','romulan-profiles','vulcan-profiles','cardassian-profiles','ferengi-dominion-profiles','independent-profiles','earth-effects'])
  vm.runInContext(fs.readFileSync(path.join(root,'flashtrek-broken-mirror',name+'.js'),'utf8'),f.context);
 w.cthiaEffects={draw(){},snapshot(){}};
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'flashtrek-broken-mirror/showcase-assets/catalog.json'),'utf8'));
 const fleets=w.nativeFactionFleets.rosters.filter(fleet=>fleet.governmentId!==1),types=fleets.flatMap(fleet=>Array.from(fleet.types));
 assert.equal(fleets.length,12);assert.equal(types.length,35);assert.equal(new Set(types).size,35);
 for(const type of types){
  const row=catalog.ships.find(ship=>ship.id===type),profile=w.nativeShipDefinitions.artworkProfile(type);
  assert.equal(new Set(row.frames).size,4,'Unfinished damage artwork '+type);
  for(const frame of row.frames)assert.ok(fs.existsSync(path.join(root,'flashtrek-broken-mirror/showcase-assets',frame)));
  assert.equal(typeof profile.effects.draw,'function','Missing installed animation '+type);
  assert.notEqual(profile.animationReady,false);assert.ok(!w.VexedMirrorWorld.ships.find(ship=>ship.id===type).devOnly);
 }
 for(const type of [50,55,67,78,200,414,415,426,427])assert.ok(!types.includes(type),'Unrelated wildlife, unfinished or Dev-only hull entered a faction fleet');
 assert.equal(w.nativeFactionFleets.get(8),undefined,'Missing Andorian artwork cannot be replaced by unrelated hulls');
});

test('fresh games retain 1200 real crews and 100 medics with every additional hull owned and based in its own territory',async()=>{
 const f=await fixture(options),w=f.window,s=f.state;
 assert.equal(s.civilianTraffic.ships.length,1200);assert.equal(s.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 assert.equal(new Set(s.civilianTraffic.ships.map(e=>e.id)).size,1200);
 for(const fleet of w.nativeFactionFleets.rosters.filter(fleet=>fleet.governmentId!==1)){
  const ships=rosterShips(f,fleet),seen=new Set(ships.map(e=>e.shipType));
  for(const type of fleet.types)assert.ok(seen.has(type),'Missing native NPC '+fleet.governmentId+'/'+type);
  for(const e of ships){
   assert.equal(w.nativeFactionFleets.government(s,e.operatingBase??e.stationSystem),fleet.governmentId);
   assert.equal(e.ownerGovernmentId,fleet.governmentId);assert.equal(e.role,fleet.duty(e.shipType));
   assert.equal(w.nativeFactionDefence.isFaction(e),e.role==='patrol');
  }
 }
 analytical(f);for(let i=0;i<300;i++)f.step(.25);
 for(const fleet of w.nativeFactionFleets.rosters){
  const patrols=rosterShips(f,fleet).filter(e=>e.role==='patrol');
  assert.ok(patrols.some(e=>e.task?.requirements.fleetPatrol),'No real patrol task for '+fleet.governmentId);
  for(const e of patrols.filter(e=>e.journey))assert.equal(w.nativeFactionFleets.government(s,e.journey.destination),fleet.governmentId,'A patrol was dispatched into another faction territory');
 }
 assert.ok(s.civilianTraffic.ships.some(e=>e.ownerGovernmentId===7&&e.role==='mining'));
 assert.ok(s.civilianTraffic.ships.some(e=>e.ownerGovernmentId===9&&e.role==='freight'));
});

test('old saves queue refits without changing any existing crew, paid delivery, equipment, pose or wallet',async()=>{
 const f=await fixture({...options,factions:false,federation:true}),s=f.state;
 const fields=['id','name','shipType','system','ownerGovernmentId','x','y','hull','shields','credits','cargo','shipEquipment','task','journey','nextActionAt','role'];
 const before=s.civilianTraffic.ships.map(e=>Object.fromEntries(fields.map(key=>[key,copy(e[key]??null)]))),reservations=copy(f.lives.initialize(s).reservations),cash=wallet(f);
 install(f);const life=f.lives.initialize(s);assert.ok(life.factionFleets.governments[2].pending.length>0);
 assert.ok(Object.keys(life.factionFleets.governments[14].recruits).length>0,'Old saves need a real existing Borg recruit');
 for(const old of before){const e=f.lives.find(s,old.id);for(const field of fields)assert.deepEqual(copy(e[field]??null),old[field],old.id+'/'+field);}
 assert.deepEqual(copy(life.reservations),reservations);assert.equal(wallet(f),cash);
 const pending=copy(life.factionFleets);for(let i=0;i<5;i++)f.lives.initialize(s);assert.deepEqual(copy(life.factionFleets),pending);
});

test('existing crews complete real refits, conserve money and equipment and physically transfer the Borg recruit to Vex',async()=>{
 let f=await fixture({...options,factions:false,federation:true});const s=f.state;analytical(f);
 const ids=s.civilianTraffic.ships.map(e=>e.id),owned=new Map(s.civilianTraffic.ships.map(e=>[e.id,Object.keys(f.window.nativeShipEquipment.ensure(s,e).instances)]));
 const cash=wallet(f),start=copy(f.lives.initialize(s).economicLedger);install(f);
 const borgId=Number(Object.keys(s.civilianTraffic.life.factionFleets.governments[14].recruits)[0]),initialBorgSystem=f.lives.find(s,borgId).system;
 assert.notEqual(initialBorgSystem,34);let transfer=false;
 const missing=()=>f.window.nativeFactionFleets.rosters.filter(fleet=>fleet.governmentId!==1).flatMap(fleet=>fleet.types.filter(type=>!rosterShips(f,fleet).some(e=>e.shipType===type)));
 for(let i=0;i<10000&&(missing().length||f.lives.find(s,borgId).system!==34);i++){
  f.step(.25);const borg=f.lives.find(s,borgId);if(borg.shipType===44&&borg.journey?.destination===34)transfer=true;
 }
 assert.deepEqual(copy(missing()),[],'Some old-save faction hulls never commissioned');assert.ok(transfer,'Borg commissioning must travel rather than teleport');
 assert.equal(f.lives.find(s,borgId).system,34);assert.equal(s.civilianTraffic.ships.length,1200);assert.deepEqual(s.civilianTraffic.ships.map(e=>e.id),ids);
 for(const e of s.civilianTraffic.ships)for(const id of owned.get(e.id))assert.ok(e.shipEquipment.instances[id],'Lost owned equipment '+e.id+'/'+id);
 const end=f.lives.initialize(s).economicLedger;
 assert.ok(Math.abs(wallet(f)-cash-(end.initialMarketCredits-start.initialMarketCredits)-(end.householdSpending-start.householdSpending))<1e-4);
 const saved=copy(s),ledger=copy(s.civilianTraffic.life.factionFleets);f=await fixture({...options,saved});
 assert.deepEqual(copy(f.state.civilianTraffic.life.factionFleets),ledger,'Continue reissued a hull or reset commissioning');
 assert.equal(f.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 f.window.nativePause.active=true;const frozen=JSON.stringify(f.state);for(let i=0;i<10;i++)f.step(.25);assert.equal(JSON.stringify(f.state),frozen);
});

test('Borg military residency leaves every civilian exclusion and prohibited market intact',async()=>{
 const f=await fixture(options),w=f.window,s=f.state;analytical(f);
 for(let i=0;i<600;i++)f.step(.25);
 const borg=s.civilianTraffic.ships.filter(e=>e.shipType===44);assert.equal(borg.length,2);
 for(const e of borg){assert.equal(e.system,34);assert.equal(e.ownerGovernmentId,14);assert.equal(e.role,'patrol');assert.ok(e.localLeg||e.patrolLegs>0);}
 assert.ok(w.nativeCivilianAccess.blocked(34));assert.ok(!w.nativeCivilianAccess.inhabited(s,34));
 assert.ok(!Object.values(f.lives.initialize(s).markets).some(m=>[32,33,34,51,52].includes(m.system)));
 assert.ok(!s.civilianTraffic.ships.some(e=>[32,33,34,51,52].includes(e.system)&&!w.nativeFactionFleets.militaryResidence(s,e)));
 const civilian=s.civilianTraffic.ships.find(e=>e.role==='freight'&&e.system!==34&&!e.cargo),before=JSON.stringify(s);
 assert.equal(f.lives.startDelivery(s,civilian.id,{toSystem:34,good:5,tons:1}).ok,false);assert.equal(JSON.stringify(s),before);
});

test('territorial picks and future patrol destinations follow current system governments',async()=>{
 const f=await fixture(options),w=f.window,s=f.state,orion=w.VexedMirrorWorld.systems.find(e=>e.id===2);
 s.planetGovts={2:2,12:16};
 assert.ok(w.nativeFactionFleets.get(2).bases(s).includes(2));assert.ok(!w.nativeFactionFleets.get(1).bases(s).includes(2));
 assert.ok(!w.nativeFactionFleets.get(5).bases(s).includes(12));
 const type=w.nativeFactionFleets.pick(orion,1,s);assert.ok(w.nativeFactionFleets.get(2).has(type));
 assert.equal(w.nativeFactionFleets.forSystem(s,12),undefined);
});
