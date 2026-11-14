const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./npc-economy-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function setup(saved){
 const f=await fixture({saved,full:false,economic:false,regional:true,access:true,corridors:true,factions:true,orion:true,shipyards:true});
 for(const path of ['flashtrek-broken-mirror/ship-construction.js','broken-mirror-port/ship-construction.js'])vm.runInContext(fs.readFileSync('html-games/'+path,'utf8'),f.context);
 const {state:s,window:w}=f;f.owner=w.nativeShipConstruction;
 if(!saved){Object.assign(s,{latinum:1000000,devMode:false});Object.assign(s,f.owner.position(s));}
 return f;
}
test('every purchasable hull has a pure staged construction plan and distinct anatomy',async()=>{
 const f=await setup(),core=f.window.shipConstruction,ships=f.owner.catalog(f.state);
 assert.ok(ships.length>=40);
 for(const ship of ships){const plan=core.profile(ship),before=JSON.stringify(plan);
  assert.ok(plan.seconds>36);assert.equal(plan.parts.length,5);
  for(const progress of [0,.1,.4,.65,.9,.97,1]){const s=core.sample(plan,plan.seconds*progress);assert.ok(Math.abs(s.progress-progress)<1e-12);assert.ok(s.parts.every(p=>p>=0&&p<=1));}
  assert.equal(core.sample(plan,plan.seconds).phase,'complete');assert.equal(JSON.stringify(plan),before);
 }
 assert.notEqual(core.profile({id:1,name:'Galaxy Class'}).family,core.profile({id:2,name:'Borg Cube'}).family);
 const metadata=JSON.parse(fs.readFileSync('html-games/flashtrek-broken-mirror/ship-construction-profiles.json','utf8'));
 for(const ship of ships){const saved=metadata.ships.find(h=>h.id===ship.id);assert.ok(saved,ship.name);assert.equal(core.profile(saved).seconds,core.profile(ship).seconds);assert.ok(fs.existsSync('html-games/flashtrek-broken-mirror/showcase-assets/'+saved.frames[0]));}
});
test('orders charge existing hull prices once, permit multiple same-class vessels, and roll back failed saves',async()=>{
 const f=await setup(),{state:s,owner:o}=f;o.initialize(s);
 const before=plain(s),q=o.quote(s,7);
 assert.equal(o.order(s,{shipType:7},()=>({ok:false,error:'Quota exceeded'})).ok,false);assert.deepEqual(plain(s),before);
 const a=o.order(s,{shipType:7,name:'ISS First',requestId:'first'},()=>({ok:true}));assert.equal(a.ok,true);
 assert.equal(s.latinum,before.latinum-q.price);assert.equal(s.shipType,before.shipType);
 assert.equal(o.order(s,{shipType:7,requestId:'first'},()=>({ok:true})).repeated,true);assert.equal(s.latinum,before.latinum-q.price);
 const b=o.order(s,{shipType:7,name:'ISS Second'},()=>({ok:true}));assert.equal(b.ok,true);assert.equal(b.order.startAt,a.order.finishAt);
 assert.equal(s.shipConstruction.revenue,q.price*2);assert.equal(o.fleet(s).length,0);
});
test('remote, unaffordable and invalid requests create no paid orders; queued cancellations refund exactly once',async()=>{
 const f=await setup(),{state:s,owner:o}=f;const money=s.latinum;
 s.x+=10000;assert.equal(o.order(s,{shipType:7},()=>({ok:true})).ok,false);s.x-=10000;
 assert.equal(o.order(s,{shipType:9999},()=>({ok:true})).ok,false);
 s.latinum=0;assert.equal(o.order(s,{shipType:7},()=>({ok:true})).ok,false);s.latinum=money;
 const a=o.order(s,{shipType:7},()=>({ok:true})),b=o.order(s,{shipType:6},()=>({ok:true}));
 assert.equal(o.cancel(s,a.order.id,()=>({ok:true})).ok,false);
 assert.equal(o.cancel(s,b.order.id,()=>({ok:true})).ok,true);
 assert.equal(o.cancel(s,b.order.id,()=>({ok:true})).ok,false);assert.equal(s.latinum,money-a.order.price);
});
test('mid-build reload and leaving Sol retain progress and commission one equipped vessel without replacing the flagship',async()=>{
 let f=await setup(),{state:s,owner:o,window:w}=f;
 const initial=s.civilianTraffic.ships.map(h=>h.id),hull=s.shipType,order=o.order(s,{shipType:7,name:'ISS Persistent'},()=>({ok:true})).order;
 w.nativeSimulation.advance(s,order.duration*.5);assert.equal(o.advance(s,1,()=>({ok:true})).commissioned,0);
 f=await setup(plain(s));s=f.state;o=f.owner;w=f.window;s.system=2;
 w.nativeSimulation.advance(s,order.duration*.5+1);assert.equal(o.advance(s,1,()=>({ok:false,error:'Disk full'})).ok,false);assert.equal(o.fleet(s).length,0);
 assert.equal(o.advance(s,1,()=>({ok:true})).commissioned,1);assert.equal(o.advance(s,1,()=>({ok:true})).commissioned,0);
 const ship=o.fleet(s)[0];assert.equal(ship.name,'ISS Persistent');assert.equal(ship.system,1);assert.equal(ship.ownerGovernmentId,16);assert.equal(s.shipType,hull);
 assert.equal(w.nativeFactionDefence.friendly(s,ship,{sourceId:'player'}),true);assert.equal(w.nativeFactionDefence.hostileToPlayer(s,ship),false);
 assert.ok(Object.keys(ship.shipEquipment.instances).length>0);assert.deepEqual(s.civilianTraffic.ships.filter(h=>!h.playerOwned).map(h=>h.id),initial);
 assert.equal(w.nativeNpcLives.find(s,ship.id),ship);
 const reloaded=await setup(plain(s));assert.equal(reloaded.owner.advance(reloaded.state,1,()=>({ok:true})).commissioned,0);assert.equal(reloaded.owner.fleet(reloaded.state).length,1);
});
test('fleet follow and interstellar orders use existing routes and survive save/reload without civilian reassignment',async()=>{
 let f=await setup(),{state:s,window:w,owner:o}=f;
 const order=o.order(s,{shipType:7},()=>({ok:true})).order;w.nativeSimulation.advance(s,order.duration+1);o.advance(s,1,()=>({ok:true}));
 const ship=o.fleet(s)[0],start={x:ship.x,y:ship.y};s.x-=1000;
 assert.equal(o.command(s,ship.id,'follow',1,()=>({ok:true})).ok,true);
 for(let i=0;i<400;i++)f.step(.05);
 assert.ok(Math.hypot(ship.x-start.x,ship.y-start.y)>5,'ship physically followed through the shared motion owner');
 assert.equal(ship.role,'player-fleet');assert.equal(ship.cargo,null);
 assert.equal(o.command(s,ship.id,'travel',34,()=>({ok:true})).ok,true);
 for(let i=0;i<20&&!ship.journey;i++)f.step(.1);
 assert.equal(ship.journey.destination,34);const arrival=ship.journey.arrivalAt;
 f=await setup(plain(s));s=f.state;w=f.window;o=f.owner;
 const restored=o.fleet(s)[0];assert.equal(restored.journey.arrivalAt,arrival);
 w.nativeSimulation.advance(s,arrival-w.nativeSimulation.seconds(s)+.1);
 for(let i=0;i<20;i++)f.step(.1);
 assert.equal(restored.system,34);assert.equal(restored.fleetOrder.mode,'hold');assert.equal(restored.role,'player-fleet');assert.equal(restored.cargo,null);
});
test('pausing blocks production; inspection does not advance time, grant ships or charge the account',async()=>{
 const f=await setup(),{state:s,window:w,owner:o}=f;const order=o.order(s,{shipType:7},()=>({ok:true})).order;
 const before=JSON.stringify(s);for(let i=0;i<20;i++){o.orders(s);o.quote(s,7);o.fleet(s);}assert.equal(JSON.stringify(s),before);
 w.nativePause.active=true;assert.equal(w.nativeSimulation.advance(s,order.duration+1),0);assert.equal(o.advance(s,order.duration+1,()=>({ok:true})).commissioned,0);assert.equal(o.fleet(s).length,0);
});
test('command transfer preserves both vessels, owned fittings and identities, rejects excess cargo and rolls back failed saves',async()=>{
 const f=await setup(),{state:s,window:w,owner:o}=f;s.shipName='ISS Original';w.nativeShipEquipment.ensure(s);
 const original=plain(s.shipEquipment),order=o.order(s,{shipType:6,name:'ISS Purchased'},()=>({ok:true})).order;
 w.nativeSimulation.advance(s,order.duration+1);o.advance(s,1,()=>({ok:true}));const ship=o.fleet(s)[0],fitting=plain(ship.shipEquipment),before=plain(s);
 assert.equal(o.takeCommand(s,ship.id,()=>({ok:false,error:'Quota exceeded'})).ok,false);assert.deepEqual(plain(s),before);
 s.solFreightHold={0:500};assert.equal(o.takeCommand(s,ship.id,()=>({ok:true})).ok,false);delete s.solFreightHold;
 assert.equal(o.takeCommand(s,ship.id,()=>({ok:true})).ok,true);assert.equal(s.shipType,6);assert.equal(s.shipName,'ISS Purchased');
 assert.deepEqual(plain(s.shipEquipment),fitting);assert.equal(s.vesselId,'earth-heavy-shipyard:'+order.id);
 assert.equal(ship.shipType,7);assert.equal(ship.name,'ISS Original');assert.deepEqual(plain(ship.shipEquipment),original);
 assert.equal(o.takeCommand(s,ship.id,()=>({ok:true})).ok,true);assert.equal(s.shipType,7);assert.deepEqual(plain(s.shipEquipment),original);assert.equal(ship.constructionOrder,order.id);
});
test('the heavy yard and launch points are clear of authored planets and rocks for every offered hull',async()=>{
 const f=await setup(),{state:s,window:w,owner:o}=f,m=w.nativeShipMotion,p=o.position(s);
 assert.ok(m.clearSegment(p,p,m.navigationObstacles(s,1,p,p,260),260));
 for(const hull of o.catalog(s)){const b=o.berth(s,hull.id),point={x:b.launchX,y:b.launchY},d=w.nativeShipDefinitions.dimensions({shipType:hull.id},'civilian'),padding=Math.max(d.width,d.height)/2+24;
  assert.ok(m.clearSegment(point,point,m.navigationObstacles(s,1,point,point,padding),padding),hull.name+' launch obstructed');}
});
