const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./npc-economy-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));

async function incident(){
 const f=await fixture({full:false,economic:false,regional:true,access:true,corridors:true,factions:true}),w=f.window,s=f.state,template=copy(f.ship);
 Object.assign(s,{system:14,x:1800,y:1200,landed:false,hull:1000,shields:1000,localPrestige:{14:0}});
 const ships=[];
 for(const [id,type,role,government,x,y]of [[101,17,'patrol',7,2000,1200],[102,17,'patrol',7,2100,1400],[103,17,'patrol',7,2200,1600],[104,19,'freight',7,2000,1450],[105,18,'mining',7,1850,1500],[106,23,'freight',4,2200,1500]]){
  const e={...copy(template),id,shipType:type,name:'Ferengi incident '+id,role,npcRole:role==='patrol'?'faction':'civilian',ownerGovernmentId:government,factionDutyVersion:1,system:14,stationSystem:14,operatingBase:14,x,y,hull:1000,shields:1000,cargo:null,oreHold:0,phase:'holding',nextActionAt:100000};
  for(const key of ['localLeg','journey','dockingMove','disputeId','retaliationId','combatAI','shipEquipment','weaponLoadout','federationDutyVersion','factionResponse','combatInterruption'])delete e[key];
  e.task={id:'ferengi-fixture:'+id,kind:'reposition',status:'active',phase:'idle',origin:{system:14,port:0},destination:{system:14,port:0},requirements:{},createdAt:0,progress:0};
  w.nativeShipMotion.stop(e);ships.push(e);
 }
 s.civilianTraffic.ships=ships;w.nativeShipSystems.invalidate(s);f.lives.initialize(s);w.nativeManualFlight.initializeRegion(s);
 for(const e of ships){w.nativeShipEquipment.ensure(s,e);w.nativeWeaponLoadout.refit(s,[...w.nativeShipDefinitions.get(e.shipType).defaultWeapons],{holder:e});}
 return {...f,ships,w,s};
}

test('attacking a civilian Ferengi trader in Ferenginar raises a bounded military response while retaining civilian roles',async()=>{
 const f=await incident(),[a,b,c,trader]=f.ships;
 assert.equal(f.w.nativeFactionDefence.isFaction(trader),false);
 const result=f.w.nativeCivilianTraffic.hit(f.s,trader.id,1,{source:'player',sourceId:'player',weaponEventId:700});
 assert.equal(result.reputation?.amount,5);assert.equal(f.s.localPrestige[14],-5);
 f.step();assert.equal(f.s.factionDefence.orders.length,3);
 for(const e of [a,b,c])assert.equal(e.retaliationTargetId,'player');
 assert.equal(trader.role,'freight');assert.equal(trader.npcRole,'civilian');
 assert.equal(f.w.nativeCivilianCombatAI.profile(trader).pursuit,undefined);
 f.w.nativeCivilianTraffic.hit(f.s,trader.id,1,{source:'player',sourceId:'player',weaponEventId:700});assert.equal(f.s.localPrestige[14],-5,'One physical shot cannot charge the crime twice');
});

test('an unarmed Ferengi mining shuttle can call its territorial patrol without becoming a combat ship',async()=>{
 const f=await incident(),shuttle=f.ships[4];assert.equal(f.w.nativeCivilianCombatAI.combatRange(f.s,shuttle).range,0);
 f.w.nativeCivilianTraffic.hit(f.s,shuttle.id,1,{source:'player',sourceId:'player',weaponEventId:701});
 for(let i=0;i<20;i++)f.step();
 assert.equal(f.s.localPrestige[14],-5);assert.equal(shuttle.role,'mining');assert.equal(shuttle.npcRole,'civilian');
 assert.ok(f.s.factionDefence.orders.length>0&&f.s.factionDefence.orders.length<=3);
 assert.ok(f.ships.slice(0,3).every(e=>e.retaliationTargetId==='player'));
});

test('incidental foreign shots cannot redirect the patrol away from the player who attacked a local citizen',async()=>{
 const f=await incident(),guard=f.ships[0],trader=f.ships[3],foreign=f.ships[5];f.s.localPrestige[14]=50;
 f.w.nativeCivilianTraffic.hit(f.s,trader.id,1,{source:'player',sourceId:'player',weaponEventId:702});f.step();
 f.w.nativeCivilianTraffic.hit(f.s,trader.id,1,{source:'ai',sourceId:foreign.id,sourceGovernmentId:4});
 assert.equal(f.s.localPrestige[14],45);assert.equal(f.w.nativeFactionDefence.target(f.s,guard)?.id,'player');
 for(let i=0;i<30;i++)f.step();assert.ok(f.s.factionDefence.orders.every(order=>order.targetId==='player'));
});

test('local civilian protection does not blame a neutral player for an NPC attack or open extraterritorial alarms',async()=>{
 const f=await incident(),guard=f.ships[0],trader=f.ships[3],foreign=f.ships[5];
 f.w.nativeCivilianTraffic.hit(f.s,trader.id,1,{source:'ai',sourceId:foreign.id,sourceGovernmentId:4});f.step();
 assert.equal(f.s.localPrestige[14],0);assert.equal(f.w.nativeFactionDefence.target(f.s,guard)?.id,foreign.id);
 const other=await incident(),visitor=other.ships[3];Object.assign(visitor,{system:1,x:4000,y:2000});other.s.system=1;other.s.x=4200;other.s.y=2000;
 other.w.nativeShipSystems.invalidate(other.s);other.w.nativeManualFlight.initializeRegion(other.s);
 const result=other.w.nativeCivilianTraffic.hit(other.s,visitor.id,1,{source:'player',sourceId:'player',weaponEventId:703});
 assert.equal(result.reputation,null);assert.equal(other.s.factionDefence,undefined);
});

test('Ferenginar retains local armed patrols while spare Marauders still travel and the saved fleet size stays fixed',async()=>{
 const f=await fixture({factions:true,population:true,regional:true,access:true,repairs:true,corridors:true});f.state.landed=true;f.lives.interactive(f.state,false);
 const ids=f.state.civilianTraffic.ships.map(e=>e.id);
 for(let i=0;i<240;i++)f.step(.25);
 const marauders=f.state.civilianTraffic.ships.filter(e=>e.shipType===17&&e.ownerGovernmentId===7),home=marauders.filter(e=>e.system===14&&!e.journey&&!['warp','arriving','disabled','destroyed'].includes(e.phase));
 assert.ok(home.length>=f.window.nativeFactionFleets.defenderTarget(f.state,14),'Every Ferenginar defender left on a long-distance patrol');
 assert.ok(marauders.some(e=>!!e.journey),'Local coverage eliminated all interstellar patrols');
 assert.ok(home.some(e=>e.task?.phase==='fleet-patrol'&&e.localLeg||e.patrolLegs>0),'Station watches must physically patrol rather than freeze');
 assert.equal(f.state.civilianTraffic.ships.length,1200);assert.equal(f.state.civilianTraffic.ships.filter(e=>e.shipType===58).length,100);assert.deepEqual(f.state.civilianTraffic.ships.map(e=>e.id),ids);
});

test('resident defender targets interpret saved population counts as people rather than billions',async()=>{
 const f=await fixture({full:false,economic:false,factions:true});
 const state={planetPopulationCounts:{14:8e9,90:1e6}},target=f.window.nativeFactionFleets.defenderTarget;
 assert.equal(target(state,14),3);assert.equal(target(state,90),1);
 assert.equal(target({planetPopulations:{14:3}},14),2);
});

test('an older faction save queues enough real-crew refits for local coverage without rewriting busy ships',async()=>{
 const f=await fixture({factions:true,population:true,regional:true,access:true,corridors:true}),w=f.window,s=f.state;
 const fleet=w.nativeFactionFleets.get(7),ledger=f.lives.initialize(s).factionFleets.governments[7],patrols=s.civilianTraffic.ships.filter(e=>e.ownerGovernmentId===7&&e.shipType===17);
 const trader=s.civilianTraffic.ships.find(e=>e.shipType===19&&e.system===14&&!e.cargo),funded=f.lives.startDelivery(s,trader.id,{fromSystem:14,toSystem:90,good:5,tons:1});assert.equal(funded.ok,true,funded.error);
 // Represent the old collection-only quota: two commissioned Marauders, while
 // the other real crews still have their existing civilian work and equipment.
 for(const e of patrols.slice(2)){delete e.factionDutyVersion;e.role='freight';e.npcRole='civilian';}
 ledger.pending=[];delete ledger.securityVersion;
 const before=s.civilianTraffic.ships.map(e=>copy({id:e.id,type:e.shipType,system:e.system,x:e.x,y:e.y,cargo:e.cargo,task:e.task,journey:e.journey,credits:e.credits}));
 w.nativeShipSystems.invalidate(s);const upgraded=f.lives.initialize(s).factionFleets.governments[7];
 const expected=fleet.bases(s).reduce((sum,id)=>sum+w.nativeFactionFleets.defenderTarget(s,id),0)+1;
 assert.ok(upgraded.pending.filter(type=>type===17).length+2>=expected,'The saved fleet still cannot cover its own inhabited systems');
 assert.deepEqual(s.civilianTraffic.ships.map(e=>copy({id:e.id,type:e.shipType,system:e.system,x:e.x,y:e.y,cargo:e.cargo,task:e.task,journey:e.journey,credits:e.credits})),before);
 const queued=copy(upgraded.pending);f.lives.initialize(s);assert.deepEqual(copy(upgraded.pending),queued,'Initialization duplicated queued security hulls');
});
