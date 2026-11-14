const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
async function setup(){
 const f=await fixture({full:false,economic:false,repairs:true}),w=f.window,s=f.state,e=f.ship;
 for(const file of ['player-combat-controls.js','player-targeting.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),f.context);
 Object.assign(s,{system:1,x:90000,y:90000,hull:100,shields:100,phase:'flight',landed:false,angle:0});
 f.lives.interrupt(s,e,'disabled');Object.assign(e,{system:1,x:s.x+200,y:s.y,hull:10,shields:0,repairDeuranium:30});
 s.civilianTraffic.ships=[e];f.lives.invalidateMembership(s);w.nativeShipRepairs.invalidateMembership(s);w.nativeShipSystems.invalidate(s);
 const ref=w.nativeShipRepairs.ref('civilian',e),mission=w.nativeShipRepairs.launch(s,ref,ref);assert.ok(mission);
 const step=dt=>{w.nativeSimulation.advance(s,dt);w.nativeShipRepairs.advance(s,dt);w.nativeCombatShots.advance(s,dt);};
 for(let i=0;i<400&&!mission.drones.every(id=>e.shipEquipment.instances[id].phase==='repairing');i++)step(.02);
 assert.ok(mission.drones.every(id=>e.shipEquipment.instances[id].phase==='repairing'));
 return {...f,mission,step,model:w.nativePlayerTargeting.create(w.nativePlayerCombatControls.smartTargeting())};
}
test('launched foreign DOTs participate in smart targeting and mouse selection with their registered IDs',async()=>{
 const {window:w,state:s,model}=await setup(),dots=w.nativeShipRepairs.drones(s,1);assert.ok(dots.length);
 model.update(s,{force:true});assert.ok(model.snapshot().candidates.some(t=>t.key==='repair-drone:'+dots[0].id));
 const d=dots[0],picked=model.droneHitTest(s,{ship:{x:d.x-100,y:d.y},cx:300,cy:200,x:400,y:200});assert.equal(picked.id,d.id);
 d.entity.carrier={category:'player'};w.nativeShipSystems.refreshShip(s,d.entity,'repair-drone');
 model.update(s,{force:true});assert.ok(!model.snapshot().candidates.some(t=>t.key==='repair-drone:'+d.id));
});
test('shared weapon hits destroy owned DOTs, stop their repairs, and cannot resurrect them after reload',async()=>{
 const f=await setup(),{window:w,state:s,ship:e,mission,step}=f;
 const dots=mission.drones.map(id=>e.shipEquipment.instances[id]);assert.ok(dots.length>0);
 let shots=0;
 for(const dot of dots){
  const d=w.nativeShipRepairs.resolveDrone(s,dot.id,1);if(!d)continue;
  const dx=d.x-e.x,dy=d.y-e.y,length=Math.hypot(dx,dy)||1;
  s.x=d.x+dx/length*150;s.y=d.y+dy/length*150;s.angle=Math.atan2(d.y-s.y,d.x-s.x);w.nativeShipSystems.refreshShip(s,s,'player');
  for(let i=0;i<1000&&dot.hull>0;i++){
   const shot=w.nativeCombatShots.fireFor({state:s,shooter:w.nativeShipDefinitions.describe(s,s,{category:'player'}),getTarget:()=>w.nativeShipRepairs.resolveDrone(s,dot.id,1)});if(shot.ok)shots++;
   step(.02);
  }
  assert.equal(dot.hull,0);assert.equal(dot.phase,'destroyed');assert.equal(w.nativeShipRepairs.resolveDrone(s,dot.id,1),null);
  if(dots.some(other=>other.hull>0)){
   const before=e.hull;for(let i=0;i<50;i++)step(.02);assert.ok(e.hull>before,'Surviving DOTs must keep repairing');assert.equal(dot.hull,0);
  }
 }
 assert.ok(shots>0);const hull=e.hull,spent=s.shipRepairs.ledger.consumed;
 for(let i=0;i<100;i++)step(.02);
 assert.equal(e.hull,hull);assert.equal(s.shipRepairs.ledger.consumed,spent);
 const g=await fixture({saved:JSON.parse(JSON.stringify(s)),full:false,economic:false,repairs:true}),saved=g.state.civilianTraffic.ships.find(x=>x.id===e.id);
 for(const d of dots){assert.equal(saved.shipEquipment.instances[d.id].hull,0);assert.equal(saved.shipEquipment.instances[d.id].phase,'destroyed');}
});
