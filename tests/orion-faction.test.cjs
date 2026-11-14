const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {fixture}=require('./npc-economy-fixture.cjs');
const options={orion:true,factions:true,population:true,regional:true,access:true,repairs:true,corridors:true};
const plain=value=>JSON.parse(JSON.stringify(value)),types=[446,447,448,449];
test('Orion artwork records four transparent aligned stages and exact previous-image generation lineage',()=>{
 const root=path.join(__dirname,'../html-games/flashtrek-broken-mirror'),art=path.join(root,'showcase-assets/orion');
 const generation=JSON.parse(fs.readFileSync(path.join(art,'generation.json'),'utf8'));
 const sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
 const context=vm.createContext({window:{earthAnimationProfiles:{}}});vm.runInContext(fs.readFileSync(path.join(root,'orion-profiles.js'),'utf8'),context);
 assert.equal(generation.stages.length,16);assert.equal(generation.generator,'built-in image_gen');
 for(const type of types){
  const rows=generation.stages.filter(row=>row.id===type).sort((a,b)=>a.stage-b.stage),profile=context.window.orionAnimationProfiles[type];
  assert.equal(rows.length,4);assert.equal(profile.width,512);assert.equal(profile.height,512);assert.ok(profile.lights.length>0);
  for(const row of rows){
   assert.equal(sha(fs.readFileSync(path.join(art,row.master))),row.sha256);
   if(row.stage){assert.equal(row.input,rows[row.stage-1].master);assert.equal(row.inputSha256,rows[row.stage-1].sha256);}
   const bytes=fs.readFileSync(path.join(art,row.file));assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);assert.equal(bytes[25],6,'RGBA PNG required');
   assert.deepEqual(Array.from(profile.shifts[row.stage]),[0,0,512,512]);
  }
  for(const lamp of profile.lights){assert.equal(lamp.offSevere,true);assert.ok(lamp.runs.length>0);assert.ok(lamp.left>=0&&lamp.top>=0&&lamp.left+lamp.w<=512&&lamp.top+lamp.h<=512);}
  for(const stage of profile.damage.slice(1))assert.ok(stage.length>0&&stage.every(p=>p.x>=0&&p.x<512&&p.y>=0&&p.y<512&&p.r>0));
 }
});
function install(f){
 for(const name of ['orion-world','orion-ships','faction-fleets'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',name+'.js'),'utf8'),f.context);
 f.window.nativeCivilianTraffic.initialize(f.state);f.lives.initialize(f.state);
}
test('Orion has a separate government, native ships, ordinary equipment and its own shop stock',async()=>{
 const f=await fixture(options),w=f.window,s=f.state,world=w.VexedMirrorWorld,orion=world.systems.find(e=>e.id===2);
 assert.equal(orion.governmentId,45);assert.equal(world.governments.find(e=>e.id===45).name,'Orion Syndicate');
 assert.deepEqual(plain(orion.planetShopItemIds),types);assert.equal(w.nativeFactionFleets.forSystem(s,2).governmentId,45);
 assert.ok(!w.nativeFactionFleets.get(1).bases(s).includes(2));
 for(const type of types){
  const d=w.nativeShipDefinitions.get(type);assert.equal(d.slots.engineering,1);assert.equal(d.slots.shield,1);
  assert.ok(d.thrusters.maxSpeed>0);assert.equal(d.artwork.frames.length,4);assert.equal(d.dimensions.width,d.dimensions.height);
  assert.equal(d.capabilities.canMine,type===446||type===449);assert.ok(!d.devOnly);
 }
});
test('fresh Orion crews mine, trade and physically patrol without changing the saved population',async()=>{
 const f=await fixture(options),w=f.window,s=f.state;assert.equal(s.civilianTraffic.ships.length,1200);
 assert.equal(s.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
 const native=s.civilianTraffic.ships.filter(e=>e.ownerGovernmentId===45);assert.ok(native.length>=8);
 assert.deepEqual([...new Set(native.map(e=>e.shipType))].sort(),types);
 for(const e of native){assert.equal(e.operatingBase??e.stationSystem,2);assert.equal(w.nativeFactionDefence.isFaction(e),[447,448].includes(e.shipType));}
 s.landed=true;f.lives.interactive(s,false);for(let i=0;i<600;i++)f.step(.25);
 assert.ok(native.some(e=>e.role==='patrol'&&(e.localLeg||e.patrolLegs>0)),'Orion guards never left their berths');
 assert.ok(native.some(e=>e.shipType===446&&(e.task?.kind==='mining'||e.mined>0)),'Orion scouts never took real mining work');
 assert.ok(native.some(e=>e.shipType===449&&(e.task?.kind==='freight'||e.deliveries>0)),'Orion freighters never took funded deliveries');
 for(const e of native.filter(e=>e.role==='patrol'))assert.equal(e.system,2);
});
test('attacking an Orion citizen raises Orion defence without penalizing the Earth Empire or starting allied feuds',async()=>{
 const f=await fixture(options),w=f.window,s=f.state;
 const victim=s.civilianTraffic.ships.find(e=>e.ownerGovernmentId===45&&e.shipType===449);
 Object.assign(s,{system:2,x:victim.x+150,y:victim.y+80});s.localPrestige={1:50,2:0};w.nativeManualFlight.initializeRegion(s);
 const result=w.nativeCivilianTraffic.hit(s,victim.id,1,{source:'player',sourceId:'player',weaponEventId:88001});
 assert.equal(result.reputation.amount,5);assert.equal(s.localPrestige[2],-5);assert.equal(s.localPrestige[1],50);
 const orders=w.nativeFactionDefence.plan(s);assert.ok(orders.size>0&&orders.size<=3);
 for(const order of orders.values()){assert.equal(order.ship.ownerGovernmentId,45);assert.equal(order.target.id,'player');}
 assert.equal(w.nativeFactionDefence.isFaction(victim),false);
 const guard=[...orders.values()][0].ship;
 assert.equal(w.nativeFactionDefence.friendly(s,guard,{sourceId:victim.id,sourceGovernmentId:45}),true);
 const before=JSON.stringify(s.factionDefence);w.nativeFactionDefence.hit(s,guard,{sourceId:victim.id,sourceGovernmentId:45});assert.equal(JSON.stringify(s.factionDefence),before);
});
test('Orion independence migrates once and preserves player conquests and standing',async()=>{
 const f=await fixture(options),w=f.window;
 for(const owner of [1,16,2]){
  const s={planetGovts:{2:owner},localPrestige:{2:42},planetPopulationCounts:{2:12345}};
  w.nativeOrionWorld.initialize(s);assert.equal(s.planetGovts[2],owner===1?45:owner);
  assert.equal(s.localPrestige[2],42);assert.equal(s.planetPopulationCounts[2],12345);
  s.planetGovts[2]=1;assert.equal(w.nativeOrionWorld.initialize(s),false);assert.equal(s.planetGovts[2],1);
 }
});
test('old Earth-based Orion crews retain paid work and equipment before real refits, then survive Continue',async()=>{
 let f=await fixture({...options,orion:false}),s=f.state;const ids=s.civilianTraffic.ships.map(e=>e.id);
 s.planetGovts={...(s.planetGovts||{}),2:1};s.localPrestige[2]=35;
 const fields=['id','shipType','ownerGovernmentId','x','y','system','cargo','credits','shipEquipment','task','journey','nextActionAt'];
 const before=s.civilianTraffic.ships.map(e=>Object.fromEntries(fields.map(key=>[key,plain(e[key]??null)]))),reservations=plain(f.lives.initialize(s).reservations);
 install(f);assert.equal(s.planetGovts[2],45);assert.equal(s.localPrestige[2],35);
 for(let i=0;i<before.length;i++)for(const field of fields)assert.deepEqual(plain(s.civilianTraffic.ships[i][field]??null),before[i][field]);
 assert.deepEqual(plain(f.lives.initialize(s).reservations),reservations);
 const queue=plain(s.civilianTraffic.life.factionFleets.governments[45]);assert.ok(queue.pending.length>=8&&Object.keys(queue.recruits).length>0);
 f.lives.initialize(s);assert.deepEqual(plain(s.civilianTraffic.life.factionFleets.governments[45]),queue);
 const owned=new Map(s.civilianTraffic.ships.map(e=>[e.id,Object.keys(e.shipEquipment.instances)]));
 s.landed=true;f.lives.interactive(s,false);
 const missing=()=>types.filter(type=>!s.civilianTraffic.ships.some(e=>e.ownerGovernmentId===45&&e.shipType===type));
 for(let i=0;i<10000&&missing().length;i++)f.step(.25);
 assert.deepEqual(missing(),[],'Old Earth commissions prevented Orion refits');assert.deepEqual(s.civilianTraffic.ships.map(e=>e.id),ids);
 for(const e of s.civilianTraffic.ships)for(const id of owned.get(e.id))assert.ok(e.shipEquipment.instances[id],'Refit lost owned equipment');
 const ledger=plain(s.civilianTraffic.life.factionFleets.governments[45]);f=await fixture({...options,saved:plain(s)});
 assert.deepEqual(plain(f.state.civilianTraffic.life.factionFleets.governments[45]),ledger);assert.equal(f.state.civilianTraffic.ships.length,1200);
 assert.equal(f.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);
});
