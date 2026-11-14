const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
async function setup(saved){
 const f=await fixture({saved,repairs:true,full:false,economic:false,traffic:true});
 for(const name of ['ship-scale-settings','prometheus-artwork','prometheus-definitions','prometheus-effects','prometheus-mvam','player-combat'])vm.runInContext(fs.readFileSync(`${__dirname}/../html-games/broken-mirror-port/${name}.js`,'utf8'),f.context,{filename:name+'.js'});
 f.window.nativePrometheus.initialize(f.state);
 f.tick=()=>{f.window.nativeSimulation.advance(f.state,.25);f.window.nativeShipRepairs.advance(f.state,.25);f.window.nativePrometheus.advance(f.state,.25);};return f;
}
function survivor(f,type){
 const {window:w,state:s}=f;w.nativeShipEquipment.changeHull(s,37);Object.assign(s,{system:1,x:3000,y:-3000,phase:'flight',landed:false,vx:0,vy:0,speed:0,deuranium:100,shields:0});
 w.nativePrometheus.activate(s);for(const e of s.prometheus.sections)if(e.shipType!==type){e.hull=0;e.phase='destroyed';}
 if(type!==3702)assert.ok(w.nativePlayerCombat.hit(s,1000,{kind:'beam'}).transferred);
 w.nativePrometheus.recall(s);assert.ok(s.prometheus.assembly);
}
for(const type of [3701,3702,3703])test(`one existing DOT reconstructs all three sections from surviving ${type}, preserving supplies and equipment across reload`,async()=>{
 let f=await setup();survivor(f,type);let {window:w,state:s}=f;
 const ids=Object.keys(s.shipEquipment.instances).sort(),dots=Array.from(s.repairBay.slots,d=>d.id),initial=s.hull,ore=s.deuranium,max=w.nativeShipDefinitions.get(37).hull;
 assert.equal(w.nativeShipRepairs.deployPlayer(s).drones,1);
 for(let i=0;i<300&&s.hull<initial+30;i++)f.tick();assert.ok(s.hull>initial&&s.prometheus.assembly);
 const frozen=JSON.stringify(s);w.nativePause.active=true;f.tick();assert.equal(JSON.stringify(s),frozen);w.nativePause.active=false;
 f=await setup(JSON.parse(JSON.stringify(s)));w=f.window;s=f.state;
 for(let i=0;i<2200&&(s.prometheus.assembly||w.nativeShipRepairs.playerDronesDeployed(s));i++)f.tick();
 assert.equal(s.hull,max);assert.equal(s.prometheus.assembly,undefined);assert.equal(s.prometheus.lost,0);
 assert.ok(Math.abs((ore-s.deuranium)-(max-initial)/w.nativeShipRepairs.rules.hullPerTon)<1e-7);
 assert.deepEqual(Object.keys(s.shipEquipment.instances).sort(),ids);assert.deepEqual(Array.from(s.repairBay.slots,d=>d.id),dots);assert.ok(s.repairBay.slots.every(d=>d.hull>0&&d.phase==='stowed'));
 assert.equal(w.nativePrometheus.allowed(s).ok,true);
});
test('exhausted reconstruction saves its paid progress and resumes with the same DOT',async()=>{
 let f=await setup();survivor(f,3701);let {window:w,state:s}=f;s.deuranium=2;const initial=s.hull,id=s.repairBay.slots[0].id;
 w.nativeShipRepairs.deployPlayer(s);for(let i=0;i<500&&w.nativeShipRepairs.playerDronesDeployed(s);i++)f.tick();
 assert.ok(Math.abs(s.hull-initial-10)<1e-7);assert.ok(s.deuranium<1e-7);assert.ok(s.prometheus.assembly);
 f=await setup(JSON.parse(JSON.stringify(s)));w=f.window;s=f.state;s.deuranium=3;w.nativeShipRepairs.deployPlayer(s);
 for(let i=0;i<500&&w.nativeShipRepairs.playerDronesDeployed(s);i++)f.tick();assert.ok(Math.abs(s.hull-initial-25)<1e-7);assert.ok(s.prometheus.assembly);assert.equal(s.repairBay.slots[0].id,id);
});
