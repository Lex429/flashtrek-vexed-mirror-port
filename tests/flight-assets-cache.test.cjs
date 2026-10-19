const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

function fixture(){
  const images=[],world={ships:Array.from({length:40},(_,i)=>({id:i+1,hull:100}))};
  class Image{
    constructor(){this.width=512;this.height=512;images.push(this);}
    set src(value){this.url=value;queueMicrotask(()=>this.onload());}
    decode(){return Promise.resolve();}
  }
  const aligned=[],unlit=[];
  const standard={alignAsync:async(image,stage)=>{aligned.push(stage);return image;},effects:{unlitFrameAsync:async image=>{unlit.push(image);return {width:512,height:512};}}};
  const window={VexedFlightReference:{shipSizes:[]},VexedMirrorWorld:world,starterShips:{get:()=>standard}};
  const context=vm.createContext({window,Image,console,setTimeout,clearTimeout,
    fetch:async()=>({ok:true,json:async()=>({ships:world.ships.map(s=>({id:s.id,name:`Ship ${s.id}`,frames:[0,1,2,3].map(stage=>`${s.id}-${stage}.png`)}))})})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/flight-assets.js'),'utf8'),context);
  return {api:window.vexedFlightAssets,images,aligned,unlit};
}

test('ship decoding and optional async profile preparation deduplicate concurrent requests',async()=>{
  const {api,images,aligned,unlit}=fixture();
  const initial=images.length;
  const [a,b]=await Promise.all([api.loadShip(7),api.loadShip(7)]);
  assert.equal(a,b);assert.equal(images.length,initial+1);
  assert.deepEqual(aligned,[0]);assert.equal(unlit.length,1);
  assert.equal(await api.loadShip(7),a);
  assert.equal(api.cacheSnapshot().counters.shipHits,1);
  assert.equal(await api.loadShip(7,100,{showcase:true}),a,'NPC and player share the identical processed art and lamp cache');
});

test('decoded source and processed ship-art loader retention stays bounded under full-fleet churn',async()=>{
  const {api}=fixture();
  const active=await api.loadShip(1);
  for(let type=1;type<=40;type++)for(const hull of [100,70,40,10])await api.loadShip(type,hull);
  const snapshot=api.cacheSnapshot();
  assert.ok(snapshot.source.bytes<=snapshot.limits.sourceBytes);
  assert.ok(snapshot.ships.bytes<=snapshot.limits.shipBytes);
  assert.ok(snapshot.source.entries<=snapshot.limits.sourceEntries);
  assert.ok(snapshot.ships.entries<=snapshot.limits.shipEntries);
  assert.ok(snapshot.counters.imageEvictions>0);assert.ok(snapshot.counters.shipEvictions>0);
  assert.equal(snapshot.source.pending,0);assert.equal(snapshot.ships.pending,0);
  assert.equal(await api.loadShip(1),active,'an active owner keeps the same asset after loader LRU eviction');
  api.resetCaches();assert.equal(api.cacheSnapshot().bytes,0);
});
