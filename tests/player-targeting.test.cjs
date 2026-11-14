const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
async function setup(){
 const f=await fixture({full:false,economic:false}),w=f.window,s=f.state,template=JSON.parse(JSON.stringify(f.ship));
 for(const name of ['player-combat-controls.js','player-targeting.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',name),'utf8'),f.context,{filename:name});
 Object.assign(s,{x:100000,y:100000,angle:0,heading:undefined,hull:1000,shields:1000,landed:false,phase:'cruise',miningTool:false});s.solEconomy.freighters=[];s.civilianTraffic.ships=[];
 const add=(id,x,y,attacker=false)=>{const ship={...JSON.parse(JSON.stringify(template)),id,name:'Target '+id,system:1,shipType:7,x:s.x+x,y:s.y+y,phase:'cruise',hull:1000,shields:1000,heading:0};
  for(const key of ['localLeg','journey','lifeLeg','combatAI'])delete ship[key];
  if(attacker){ship.retaliationTargetId='player';ship.retaliationUntil=100;}
  s.civilianTraffic.ships.push(ship);return ship;};
 const memory=w.nativePlayerCombatControls.smartTargeting(),model=w.nativePlayerTargeting.create(memory);
 w.nativeSimulationFrame.begin(s);
 return {...f,add,memory,model};
}

test('the real shared spatial registry chooses the nose-facing ship and changes intent on a turn without moving anything',async()=>{
 const {state:s,window:w,model,add}=await setup();add(8101,600,0);add(8102,0,200);w.nativeShipSystems.invalidate(s);
 const at=w.nativeSimulation.seconds(s);assert.equal(model.choose(s,null).key,'civilian:8101');
 assert.equal(w.nativeSimulation.seconds(s),at);assert.equal(s.x,100000);assert.equal(s.y,100000);
 s.angle=Math.PI/2;w.nativeShipSystems.refreshShip(s,s,'player');assert.equal(model.choose(s,'civilian:8101').key,'civilian:8102');
});

test('shared physical contacts favour a clear attacker over a similar attacker behind a neutral hull',async()=>{
 const {state:s,window:w,model,add}=await setup();add(8201,420,0,true);add(8202,440,130,true);add(8203,200,0,false);w.nativeShipSystems.invalidate(s);
 const next=model.choose(s,null),rows=model.snapshot().candidates;
 assert.equal(rows.find(row=>row.key==='civilian:8201').weapon.clear,false);
 assert.equal(rows.find(row=>row.key==='civilian:8202').weapon.clear,true);
 assert.equal(next.key,'civilian:8202');
});

test('an active attacker behind the ship outranks a previously remembered attacker directly ahead',async()=>{
 const {state:s,window:w,model,memory,add}=await setup();add(8251,300,0,false);add(8252,-250,0,true);memory.incoming('civilian:8251',0);memory.attention('civilian:8251',0,'combat');w.nativeShipSystems.invalidate(s);
 assert.equal(model.choose(s,null).key,'civilian:8252');
});

test('preview refresh work is bounded and read-only, while an input press always refreshes immediately',async()=>{
 const {state:s,window:w,model,add}=await setup();for(let n=0;n<30;n++)add(8300+n,300+n*25,100+(n%3)*100);w.nativeShipSystems.invalidate(s);
 let calls=0;const status=w.nativeCombatShots.firingStatus;w.nativeCombatShots.firingStatus=(...args)=>{calls++;return status(...args);};
 model.update(s);assert.ok(calls<=13,calls);const before=JSON.stringify(s),count=calls;
 for(let n=0;n<100;n++)model.update(s);
 assert.equal(calls,count);assert.equal(JSON.stringify(s),before);assert.equal(model.snapshot().refreshes,1);
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 model.paint(ctx,s,{ship:{x:s.x,y:s.y},cx:640,cy:400,zoom:1,w:1280,h:800,current:null,visible:true});
 assert.equal(JSON.stringify(s),before);assert.equal(w.nativeSimulation.seconds(s),0);
 model.choose(s,null);assert.ok(calls>count);assert.equal(model.snapshot().refreshes,2);
});

const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
function publish(f,current=null){f.model.paint(ctx,f.state,{ship:{x:f.state.x,y:f.state.y,heading:f.state.angle},cx:640,cy:400,zoom:1,w:1280,h:800,current,visible:true});}

test('nose ray uses an off-center large physical hull before a small object behind it',async()=>{
 const f=await setup(),{state:s,window:w,model,add}=f;
 w.nativeShipDefinitions.register(9910,{dimensions:{width:200,height:600}});
 const large=add(8401,450,180),behind=add(8402,900,0);large.shipType=9910;large.heading=Math.PI/2;w.nativeShipSystems.invalidate(s);
 const next=model.choose(s,null),rows=model.snapshot().candidates;
 assert.equal(rows.find(t=>t.key==='civilian:8401').noseHit,true);assert.equal(rows.find(t=>t.key==='civilian:8402').noseHit,false);
 assert.equal(next.entry,large);assert.notEqual(next.entry,behind);
});

test('a settled aim gains evidence from elapsed steering history, never from repeated zero-time reads',async()=>{
 const f=await setup(),{state:s,window:w,model,add}=f;add(8501,500,0);w.nativeShipSystems.invalidate(s);model.update(s);
 for(let i=0;i<4;i++){w.nativeSimulation.advance(s,.12);model.update(s,{force:true});}
 const settled=model.snapshot().candidates.find(t=>t.key==='civilian:8501').settled;assert.ok(settled>.7,settled);
 for(let i=0;i<50;i++)model.update(s,{force:true});assert.equal(model.snapshot().candidates[0].settled,settled);
 const crossing=add(8502,450,40);crossing.vy=500;w.nativeShipSystems.invalidate(s);model.update(s,{force:true});
 assert.equal(model.snapshot().candidates.find(t=>t.key==='civilian:8502').settled,0);
 const turned=add(8503,0,400);s.angle=Math.PI/2;w.nativeShipSystems.invalidate(s);
 assert.equal(model.choose(s,null).entry,turned,'a deliberate turn still selects immediately');
});

test('near ties keep the visible preview and a press honours it despite a small fresh ranking change',async()=>{
 const f=await setup(),{state:s,window:w,model,add}=f;add(8601,500,-50);const second=add(8602,500,50);w.nativeShipSystems.invalidate(s);
 model.update(s);assert.equal(model.snapshot().preview.key,'civilian:8601');publish(f);assert.equal(model.snapshot().published,'civilian:8601');
 second.x-=10;second.y-=1;w.nativeShipSystems.refreshShip(s,second,'civilian');model.update(s,{force:true});
 assert.equal(model.snapshot().candidates[0].key,'civilian:8602');assert.equal(model.snapshot().preview.key,'civilian:8601');
 assert.equal(model.choose(s,null).key,'civilian:8601');assert.equal(model.choose(s,'civilian:8601').key,'civilian:8602');
});

test('a lost target or newly active attacker overrides a published preview immediately',async()=>{
 for(const change of ['destroyed','attacker']){
  const f=await setup(),{state:s,window:w,model,add}=f,first=add(8701,450,0),other=add(8702,0,400);w.nativeShipSystems.invalidate(s);
  model.update(s);publish(f);assert.equal(model.snapshot().published,'civilian:8701');
  if(change==='destroyed')first.hull=0;else{other.retaliationTargetId='player';other.retaliationUntil=100;}
  w.nativeShipSystems.invalidate(s);assert.equal(model.choose(s,null).key,'civilian:8702',change);
 }
});

test('an installed tool is weak evidence until a close approach or braking supports mining',async()=>{
 const {state:s,window:w,model}=await setup(),rock=w.nativeSolAsteroids.forSystem(1)[0];w.nativeSolAsteroids.relocate(rock,{x:s.x+600,y:s.y+100,angle:rock.angle,vx:0,vy:0});
 s.miningTool=true;model.update(s);const initial=model.snapshot().candidates.find(t=>t.key==='asteroid:'+rock.slotId).miningWeight;assert.ok(initial<=.2,initial);
 s.vx=200;s.speed=200;w.nativeSimulation.advance(s,.12);model.update(s,{force:true});s.vx=60;s.speed=60;w.nativeSimulation.advance(s,.12);model.update(s,{force:true});
 const braking=model.snapshot().candidates.find(t=>t.key==='asteroid:'+rock.slotId).miningWeight;assert.ok(braking>.8,braking);
 s.miningTool=false;model.update(s,{force:true});assert.equal(model.snapshot().candidates.find(t=>t.key==='asteroid:'+rock.slotId).miningWeight,0);
});
