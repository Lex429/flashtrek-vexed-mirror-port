const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs'),plain=v=>JSON.parse(JSON.stringify(v));
async function setup(saved){
 const f=await fixture({saved,full:false,economic:false,traffic:true,repairs:true}),w=f.window,s=f.state;
 for(const name of ['ship-scale-settings','prometheus-artwork','prometheus-definitions','prometheus-loadouts','prometheus-tactics','prometheus-effects','prometheus-mvam','player-combat'])vm.runInContext(fs.readFileSync(`${__dirname}/../html-games/broken-mirror-port/${name}.js`,'utf8'),f.context,{filename:name+'.js'});
 if(!saved){w.nativeShipEquipment.changeHull(s,37);w.nativeWeaponLoadout.refit(s,[1,10,10]);Object.assign(s,{system:2,x:3000,y:-3000,hull:320,shields:150,phase:'flight',landed:false});}
 w.nativePrometheus.initialize(s);return f;
}
const fields=['x','y','vx','vy','speed','hull','shields','phase','motionAngularVelocity'];
const pose=e=>Object.fromEntries([...fields.map(k=>[k,e[k]]),['heading',e.heading??e.angle]]);
test('section fittings move one owned reference, preserve charge and reject invalid mounts without changing plans',async()=>{
 const {window:w,state:s}=await setup(),api=w.nativePrometheusLoadouts,eq=s.shipEquipment,ids=Object.keys(eq.instances).sort();
 const id=s.prometheusLoadouts.plans.middle.weapon[0],item=eq.instances[id];item.readyAt=71;
 assert.equal(api.assign(s,'top',1,id).ok,true);assert.ok(!s.prometheusLoadouts.plans.middle.weapon.includes(id));
 assert.ok(s.prometheusLoadouts.plans.combined.weapon.includes(id),'Combined and section configurations may reuse an item');
 const before=plain(s.prometheusLoadouts.plans);
 assert.equal(api.assign(s,'bottom',999,id).ok,false);assert.equal(api.assign(s,'bottom',0,eq.slots.engineering[0]).ok,false);
 assert.deepEqual(plain(s.prometheusLoadouts.plans),before);assert.equal(item.readyAt,71);assert.deepEqual(Object.keys(eq.instances).sort(),ids);
 w.nativePrometheus.activate(s);const fitted=[s,...s.prometheus.sections].flatMap(e=>w.nativeWeaponLoadout.equipped(s,e));
 assert.equal(new Set(fitted.map(v=>v.instance.id)).size,fitted.length);assert.ok(fitted.every(v=>eq.instances[v.instance.id]===v.instance));
});
test('every pilot switch preserves physical hulls, inventories and per-section charge through save and reload',async()=>{
 let {window:w,state:s}=await setup();w.nativePrometheus.activate(s);const eq=s.shipEquipment,ids=Object.keys(eq.instances).sort();
 for(const [i,e] of [s,...s.prometheus.sections].entries())Object.assign(e,{x:3000+i*200,y:-3000+i*80,vx:10+i,vy:-3-i,speed:20+i,hull:40+i,shields:15+i,motionAngularVelocity:.1+i/10});
 const all=new Map([s,...s.prometheus.sections].map(e=>[e===s?3702:e.shipType,pose(e)]));
 const expectedFits=plain(s.prometheusLoadouts.plans);
 for(const id of Object.keys(eq.instances))if(eq.instances[id].category==='weapon')eq.instances[id].readyAt=72;
 for(const type of [3701,3703,3702]){
  assert.equal(w.nativePrometheus.pilotSection(s,type).ok,true);assert.deepEqual(pose(s),all.get(type));assert.equal(s.shipEquipment,eq);
  assert.equal(s.prometheus.sections.length,2);for(const e of s.prometheus.sections)assert.deepEqual(pose(e),all.get(e.shipType));
  const key=w.nativePrometheusLoadouts.currentKey(s);assert.deepEqual(Array.from(w.nativeWeaponLoadout.equipped(s),v=>v.instance.id),expectedFits[key].weapon.filter(Boolean));
 }
 const saved=plain(s),restored=await setup(saved);w=restored.window;s=restored.state;
 assert.deepEqual(plain(s.prometheusLoadouts.plans),expectedFits);assert.equal(w.nativePrometheus.typeFor(s),3702);
 assert.deepEqual(Object.keys(s.shipEquipment.instances).sort(),ids);assert.ok(Object.values(s.shipEquipment.instances).filter(i=>i.category==='weapon').every(i=>i.readyAt===72));
 s.prometheus.sections.find(e=>e.shipType===3701).hull=0;assert.equal(w.nativePrometheus.pilotSection(s,3701).ok,false);
 assert.equal(w.nativePrometheus.pilotSection(s,3703).ok,true);s.shields=0;assert.equal(w.nativePlayerCombat.hit(s,1000,{kind:'beam'}).transferred,true);assert.equal(w.nativePrometheus.typeFor(s),3702);
});
test('weapons on separate sections fire independently through the shared recharge owner and combined fitting resumes on join',async()=>{
 const {window:w,state:s}=await setup(),api=w.nativePrometheusLoadouts;const combined=s.shipEquipment.slots.weapon.slice();s.shipEquipment.nextSlot=2;api.initialize(s);w.nativePrometheus.activate(s);
 for(const e of [s,...s.prometheus.sections]){
  const item=w.nativeWeaponLoadout.equipped(s,e)[0].instance;item.readyAt=0;
  const fired=w.nativeCombatShots.arm(s,undefined,()=>true,{holder:e});assert.equal(fired.ok,true);assert.equal(fired.instance,item);assert.ok(item.readyAt>0);
  assert.equal(w.nativeCombatShots.arm(s,undefined,()=>true,{holder:e}).ok,false);
 }
 const alpha=s.prometheus.sections.find(e=>e.shipType===3701),activeID=w.nativeWeaponLoadout.equipped(s,alpha)[0].instance.id;
 assert.equal(api.assign(s,'combined',0,activeID).ok,true);assert.equal(w.nativeWeaponLoadout.equipped(s,alpha)[0].instance.id,activeID);
 const stored=s.shipEquipment.slots.weapon.slice(),charge=Object.fromEntries(Object.values(s.shipEquipment.instances).map(i=>[i.id,i.readyAt]));
 // A single surviving section joins immediately, exercising the same finalizer.
 for(const e of s.prometheus.sections){e.hull=0;e.phase='destroyed';}w.nativePrometheus.recall(s);
 assert.equal(s.prometheus.mode,'joined');assert.deepEqual(s.shipEquipment.slots.weapon,stored);assert.equal(s.shipEquipment.nextSlot,2);
 assert.deepEqual(Object.fromEntries(Object.values(s.shipEquipment.instances).map(i=>[i.id,i.readyAt])),charge);assert.notDeepEqual(stored,combined);
});
test('each inventory stores tile positions and routes fitting through its selected weapon configuration',async()=>{
 const {window:w,state:s}=await setup(),api=w.nativePrometheusLoadouts;w.nativePrometheus.activate(s);
 const id=s.prometheusLoadouts.plans.middle.weapon[0],key='equipment:'+id,layout=api.layoutFor(s,'top'),from=layout.cells.indexOf(key);
 assert.ok(from>=0);assert.equal(api.moveInventory(s,'top',{from:{type:'cell',index:from,key},to:{type:'slot',category:'weapon',index:1}}).ok,true);
 assert.equal(s.prometheusLoadouts.plans.top.weapon[1],id);assert.ok(!s.prometheusLoadouts.plans.middle.weapon.includes(id));
 const first=s.prometheusLoadouts.plans.top.weapon[0];
 assert.equal(api.moveInventory(s,'top',{from:{type:'slot',category:'weapon',index:0},to:{type:'slot',category:'weapon',index:1}}).ok,true);
 assert.equal(s.prometheusLoadouts.plans.top.weapon[0],id);assert.equal(s.prometheusLoadouts.plans.top.weapon[1],first);
 assert.equal(api.moveInventory(s,'top',{from:{type:'slot',category:'weapon',index:0},to:{type:'slot',category:'weapon',index:1}}).ok,true);
 assert.equal(api.moveInventory(s,'top',{from:{type:'slot',category:'weapon',index:1},to:{type:'cell',index:42}}).ok,true);
 assert.equal(api.layoutFor(s,'top').cells[42],key);assert.equal(s.prometheusLoadouts.plans.top.weapon[1],null);
 assert.equal(api.moveInventory(s,'top',{from:{type:'slot',category:'engineering',index:0},to:{type:'cell',index:43}}).ok,false);
 const saved=plain(s);api.initialize(saved);assert.equal(api.layoutFor(saved,'top').cells[42],key);
});
test('changing pilot during a moving recall retains its course and docks all three real bodies',async()=>{
 const {window:w,state:s}=await setup();w.nativePrometheus.activate(s);
 const tick=()=>{w.nativeSimulation.advance(s,1/60);w.nativePrometheus.advance(s,1/60);w.nativeShipSystems.move(s,s,'player',w.nativePrometheus.playerCommand(s,{speed:0,brake:true}),undefined,1/60);};
 for(let i=0;i<540;i++)tick();w.nativePrometheus.recall(s);
 const alpha=s.prometheus.sections.find(e=>e.shipType===3701),before=pose(alpha),hp=s.hull+s.prometheus.sections.reduce((n,e)=>n+e.hull,0);
 assert.equal(w.nativePrometheus.pilotSection(s,3701).ok,true);assert.deepEqual(pose(s),before);assert.equal(s.prometheus.mode,'recalling');
 for(let i=0;i<3600&&s.prometheus.mode!=='joined';i++)tick();
 assert.equal(s.prometheus.mode,'joined');assert.ok(Math.abs(s.hull-hp)<1e-8);assert.equal(s.prometheus.lost,0);
});
