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
