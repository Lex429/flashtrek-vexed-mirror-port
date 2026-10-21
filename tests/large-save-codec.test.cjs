const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
  const values=new Map(),storage={setItem(key,value){let units=key.length+value.length;for(const [other,text] of values)if(other!==key)units+=other.length+text.length;if(units*2>5*1024*1024)throw Error('Quota exceeded');values.set(key,value);},getItem:key=>values.get(key)??null};
  const context={window:{localStorage:storage},performance:{now:()=>0},Date,Map,WeakMap,WeakSet,Set,Uint8Array,TextDecoder,Object,Number,Array,String,Math,JSON};
  vm.createContext(context);for(const file of ['save-codec.js','save-storage.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',file),'utf8'),context);
  return {codec:context.window.nativeSaveCodec,owner:context.window.nativeSaveStorage,storage,values};
}
function state(count=5000){
  const ships=[];
  for(let id=0;id<count;id++){
    const item={id:'weapon:'+id,modelId:1,category:'weapon',readyAt:123.75,upgrades:{damage:2}},dot={id:'dot:'+id,modelId:'basic-dot',category:'repairDrone',phase:'returning',hull:17,readyAt:98.25,targetId:44},instances={[item.id]:item,[dot.id]:dot};
    ships.push({id,name:'Medical transport '+id,shipType:58,system:4,x:id*200,y:1e7,heading:3.13,hull:202.75,shields:52.125,
      cargo:{good:7,tons:.125},credits:300.75,repairDeuranium:17.625,localLeg:{version:3,startedAt:10,duration:200,goal:{x:400,y:200}},
      task:{id:'job:'+id,kind:'delivery',phase:'unloading',agreement:{version:1,payment:12.375},transactionId:'txn:'+id},
      shipEquipment:{version:2,instances,slots:{weapon:[item.id],repairDrone:[dot.id]}},weaponLoadout:{version:1,instances,slots:[item.id]},repairBay:{version:2,slots:[dot]}});
  }
  return {devMode:true,captain:'Zoë\u2028艦長 🖖',civilianTraffic:{ships,life:{reservations:{job:{owner:44,payment:12.375}}}},solEconomy:{freighters:[]},
    shipSimulation:{version:1,seconds:73.25,schedule:{version:1,pendingSeconds:.735}},transactions:{delivered:['txn:1']}};
}
test('5000 complete records fit a verified browser-sized slot with exact jobs, fractional goods, equipment, cooldowns and debt',()=>{
  const f=fixture(),s=state(),plain=JSON.stringify(s);assert.ok(plain.length*2>5*1024*1024);
  const result=f.owner.write(s);assert.equal(result.ok,true);
  const encoded=f.values.get(f.owner.keys.dev);assert.ok(encoded.startsWith('VM3:'));assert.ok(encoded.length*2<5*1024*1024);
  const restored=f.owner.read('dev');assert.equal(JSON.stringify(restored),JSON.stringify({...s,saveSlotVersion:3}));
  const ship=restored.civilianTraffic.ships[44];assert.equal(ship.shipEquipment.instances['dot:44'].hull,17);
  ship.shipEquipment.instances['dot:44'].hull=11;assert.equal(restored.civilianTraffic.ships[43].repairBay.slots[0].hull,17,'different owners cannot share condition');
  const normal={...state(),devMode:false};assert.equal(f.owner.write(normal).ok,true,'Combined normal/Dev slots exceed origin quota');
  assert.equal(f.owner.read('normal').civilianTraffic.ships.length,5000);assert.equal(f.owner.read('dev').civilianTraffic.ships.length,5000);
});
test('small saves retain the ordinary version1 representation and legacy mode migration remains available',()=>{
  const f=fixture(),s=state(2);assert.equal(f.owner.write(s).ok,true);assert.ok(f.values.get(f.owner.keys.dev).startsWith('{'));
  assert.equal(JSON.parse(f.values.get(f.owner.keys.dev)).saveSlotVersion,1);assert.equal(f.owner.read('normal'),null);
  f.values.clear();f.values.set(f.owner.legacyKey,JSON.stringify({...s,devMode:false}));assert.equal(f.owner.read('normal').civilianTraffic.ships.length,2);
  assert.ok(f.values.has(f.owner.legacyKey));assert.ok(f.values.has(f.owner.keys.normal));
});
test('packing restores JSON strings, nulls, arrays and property names without prototype pollution',()=>{
  const f=fixture(),s=JSON.parse('{"__proto__":{"polluted":true},"nested":{"constructor":3},"text":"艦長🖖","empty":[],"nil":null}');
  const p=f.codec.pack(s),actual=f.codec.unpack(JSON.parse(JSON.stringify(p)));
  assert.equal(JSON.stringify(actual),JSON.stringify(s));assert.equal({}.polluted,undefined);
});
test('new text compression round-trips Unicode, long overlap, random literals and JSON surrogate escapes',()=>{
  const f=fixture();let seed=4292026;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(const text of ['', 'abc', 'a'.repeat(100000), 'overlap'.repeat(10000), JSON.stringify({text:'\ufeff\u0000舰长🚀\ud800\udfff',array:[null,1.25,-.125]}),...Array.from({length:50},()=>Array.from({length:random()%2000},()=>String.fromCharCode(random()&65535)).join(''))]){
    assert.equal(f.codec.decompress(f.codec.compress(text)),text);
  }
  const old=JSON.stringify(f.codec.pack({...state(2),saveSlotVersion:2})),ascii=old.replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),units=[];
  for(let i=0;i<ascii.length;i+=2)units.push(ascii.charCodeAt(i)*256+(ascii.charCodeAt(i+1)||0));
  const legacy='VM2:'+ascii.length+':'+String.fromCharCode(...units),decoded=f.codec.parse(legacy);
  assert.equal(decoded.civilianTraffic.ships[0].weaponLoadout.instances,decoded.civilianTraffic.ships[0].shipEquipment.instances,'Version2 remains readable');
});
test('compressed lengths, tokens, offsets and truncated payloads fail without allocating unbounded output',()=>{
  const f=fixture();
  for(const invalid of ['VM4:0:\u0000','VM3:33554433:x','VM3:-1:x','VM3:NaN:x','VM3:4:'+String.fromCharCode(300),'VM3:4:'+String.fromCharCode(0,0),'VM3:4:'+String.fromCharCode(0,1),'VM3:4:'+String.fromCharCode(240,255),'VM3:4:'+String.fromCharCode(64,97)])assert.throws(()=>f.codec.decompress(invalid));
  const text=f.codec.compress(JSON.stringify({saveSlotVersion:99}));assert.throws(()=>f.codec.parse(text),/Unsupported/);
});
test('malformed references, shape lengths, cycles, unreachable nodes and unsupported versions fail honestly',()=>{
  const f=fixture(),s=state(1),base=JSON.parse(JSON.stringify(f.codec.pack(s))),clone=()=>JSON.parse(JSON.stringify(base));
  for(const mutate of [p=>p.nodes[0][1]=[999999999],p=>p.nodes[0].push(1),p=>p.nodes[0][1]=[0],p=>p.nodes.push([-1]),p=>p.codecVersion=99,p=>p.root=[-999999]]){
    const p=clone();mutate(p);assert.throws(()=>f.codec.unpack(p));
  }
  const cycle=state(600);cycle.self=cycle;assert.equal(f.owner.write(cycle).ok,false);
  f.values.set(f.owner.keys.dev,'VM2:99:broken');assert.equal(f.owner.read('dev'),null);
});
test('large normal and Dev queues preserve immediate transaction boundaries, verified writes and bounded failure retries',()=>{
  const f=fixture(),dev=state(600),normal={...state(600),devMode:false};
  f.owner.schedule(dev,{now:0});f.owner.schedule(normal,{now:0});assert.equal(f.owner.write(normal).ok,true);
  assert.equal(f.owner.pending(normal),false);assert.equal(f.owner.pending(dev),true);assert.equal(f.owner.flushDue(dev,{now:1}).ok,true);
  assert.equal(f.owner.read('normal').devMode,false);assert.equal(f.owner.read('dev').devMode,true);
  const silent={setItem(){},getItem(){return null;}};assert.equal(f.owner.write(normal,silent).ok,false);
  f.owner.schedule(dev,{now:2});assert.equal(f.owner.flushDue(dev,{now:3,storage:silent}).ok,false);
  assert.equal(f.owner.flushDue(dev,{now:3.5,storage:silent}).pending,true);assert.equal(f.owner.pending(dev),true);
});
