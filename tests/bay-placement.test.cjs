const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
async function setup(){
 const f=await fixture({full:false,regional:true,economic:false});
 for(const file of ['shipyard-refits.js','outfitting-view.js'])vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),f.context);
 const {window:w,state:s}=f;Object.assign(s,{system:1,latinum:100000,dilithium:1000,minerals:{trellium:1000,tritanium:1000,deuranium:1000,gallicite:1000,benamite:1000},shipyardDock:{station:'mars-earth-shipyard-01',phase:'docked'}});w.nativeShipEquipment.ensure(s);
 return {...f,r:w.nativeShipyardRefits,save:()=>({ok:true})};
}
test('old saves get stable typed bay locations without a read mutating equipment or resources',async()=>{
 const {window:w,state:s}=await setup(),before=plain(s),a=w.nativeShipEquipment.bayLayout(s),b=w.nativeShipEquipment.bayLayout(s);
 assert.deepEqual(plain(a),plain(b));assert.deepEqual(plain(s),before);
 for(const zone of ['weapons','systems','drones']){const cells=a.bays.filter(b=>b.zone===zone).map(b=>b.cell);assert.equal(new Set(cells).size,cells.length);}
});
test('upgrade and schematic previews create no owned bays, consume no money and show the new bay separately',async()=>{
 const {window:w,state:s,r}=await setup(),before=plain(s),p=r.preview(s,'dot');
 assert.equal(p.newBay.category,'repairDrone');assert.equal(p.after.slots.repairDrone,p.before.slots.repairDrone+1);
 const html=w.nativeOutfittingView.rig(s,p.before,s.shipEquipment,{draft:{...p.newBay,cell:5,chosen:true}});
 assert.ok(html.includes('data-place-bay="5"'));assert.ok(html.includes('outfit-ghost'));assert.deepEqual(plain(s),before);
});
test('all three added bay types retain their chosen display positions through JSON reload and later upgrades',async()=>{
 const {window:w,state:s,r,save}=await setup(),before=plain(s.shipEquipment.instances),expected=[];
 for(const [kind,cell] of [['dot',5],['weapon',4],['utility',5]]){
  const p=r.preview(s,kind),key=p.newBay.category+':'+p.newBay.index;expected.push([key,cell]);
  assert.equal(r.upgrade(s,kind,save,{cell}).ok,true,kind);
  assert.equal(w.nativeShipEquipment.bayLayout(s).bays.find(b=>b.key===key).cell,cell);
 }
 const restored=plain(s);w.nativeShipEquipment.ensure(restored);
 for(const [key,cell] of expected)assert.equal(w.nativeShipEquipment.bayLayout(restored).bays.find(b=>b.key===key).cell,cell);
 assert.deepEqual(plain(restored.shipEquipment.instances),before);
 const html=w.nativeOutfittingView.rig(restored,w.nativeShipDefinitions.forEntity(restored),restored.shipEquipment);
 assert.ok(html.includes('data-bay-cell="5" data-bay-key="repairDrone:1"'));assert.ok(html.includes('data-bay-cell="4" data-bay-key="weapon:3"'));
});
test('occupied, wrong-area and out-of-bounds placements reject the whole purchase before any persisted charge',async()=>{
 const {window:w,state:s,r}=await setup();let writes=0;
 for(const placement of [{cell:0},{cell:-1},{cell:1000},{cell:2,zone:'weapons'}]){
  const before=plain(s);assert.equal(r.upgrade(s,'dot',()=>{writes++;return {ok:true};},placement).ok,false);assert.deepEqual(plain(s),before);
 }
 assert.equal(writes,0);assert.equal(w.nativeShipEquipment.capacities(s).repairDrone,1);
});
test('failed verified saves roll back bay location, slot capacity, owned gear and material deductions together',async()=>{
 const {state:s,r}=await setup(),before=plain(s);
 const result=r.upgrade(s,'dot',()=>({ok:false,error:'Storage quota exceeded'}),{cell:5});assert.equal(result.ok,false);assert.match(result.error,/quota/);assert.deepEqual(plain(s),before);
});
test('fitting or removing an item preserves the bay position and weapon cooldown',async()=>{
 const {window:w,state:s,r,save}=await setup();assert.equal(r.upgrade(s,'weapon',save,{cell:4}).ok,true);
 const weapon=w.nativeShipEquipment.grant(s,1).instance;weapon.readyAt=123;
 assert.equal(r.fit(s,weapon.id,3,save).ok,true);assert.equal(w.nativeShipEquipment.bayLayout(s).bays.find(b=>b.key==='weapon:3').cell,4);
 assert.equal(r.unfit(s,'weapon',3,save).ok,true);assert.equal(w.nativeShipEquipment.bayLayout(s).bays.find(b=>b.key==='weapon:3').cell,4);assert.equal(s.shipEquipment.instances[weapon.id].readyAt,123);
});
test('corrupt historical positions reconcile without moving valid bays or changing identities',async()=>{
 const {window:w,state:s}=await setup(),before=plain(s.shipEquipment.instances);
 s.shipEquipment.bayLayout={version:1,hullType:s.shipType,positions:{'weapon:0':4,'weapon:1':4,'weapon:2':-1,'repairDrone:0':999,'ability:0':2}};
 const layout=w.nativeShipEquipment.bayLayout(s);assert.equal(layout.bays.find(b=>b.key==='weapon:0').cell,4);
 assert.equal(new Set(layout.bays.filter(b=>b.zone==='weapons').map(b=>b.cell)).size,3);assert.deepEqual(plain(s.shipEquipment.instances),before);
});
test('a hull trade resets the schematic positions and preserves every owned item',async()=>{
 const {window:w,state:s,r,save}=await setup();assert.equal(r.upgrade(s,'dot',save,{cell:5}).ok,true);
 const ids=Object.keys(s.shipEquipment.instances).sort();s.minerals={};s.deuranium=0;s.solFreightHold={};s.localContracts=[];
 assert.equal(w.nativeShipEquipment.changeHull(s,58).ok,true);assert.equal(s.shipEquipment.bayLayout,undefined);
 assert.equal(w.nativeShipEquipment.bayLayout(s).bays.find(b=>b.key==='repairDrone:0').cell,0);assert.deepEqual(Object.keys(s.shipEquipment.instances).sort(),ids);
});
test('the visual upgrade comparison reports zero shields accurately when no deflector is fitted',async()=>{
 const f=await setup(),{state:s,r,save}=f;assert.equal(r.unfit(s,'shield',0,save).ok,true);
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/shipyard-outfitting.js','utf8'),f.context);
 const c=f.window.nativeShipyardOutfitting.change(r.preview(s,'shield'),'shield');assert.equal(c.before,0);assert.equal(c.after,0);
});
