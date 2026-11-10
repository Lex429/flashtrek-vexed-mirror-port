const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function warp(){const window={};vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/rebirth-warp.js','utf8'),{window});return window.vexedRebirthWarp;}
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
test('native travel transport unwraps observed fleet and docking data without dropping any saved fields',async()=>{
 const {fixture}=require('./npc-economy-fixture.cjs'),f=await fixture({full:true,population:true,regional:true,access:true,corridors:true,repairs:true}),{window:w,state:s}=f;
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/world-bootstrap.js','utf8'),f.context);
 s.transportCheck={text:'Engine Δ 🚀',fractions:[.125,null,3.5],debt:s.shipSimulation.schedule};
 const before=JSON.stringify(s),transfer=w.nativeWorldBootstrap.transportState(s),clone=structuredClone(transfer);
 assert.deepEqual(JSON.parse(JSON.stringify(clone)),JSON.parse(before));assert.equal(JSON.stringify(s),before,'Transport mutated the live graph');
 clone.civilianTraffic.ships[0].credits++;assert.equal(JSON.stringify(s),before,'Transport retained live mutable crew references');
 const workers=[];f.context.Worker=class {constructor(){workers.push(this);}postMessage(message){this.message=structuredClone(message);}terminate(){this.terminated=true;}};
 f.context.setTimeout=setTimeout;f.context.clearTimeout=clearTimeout;
 const planned=w.nativeWorldBootstrap.planTravel(s,{id:9,fuel:1,travelDays:2});
 assert.ok(workers[0].message.seed);assert.equal(workers[0].message.text,undefined,'The full fleet was serialized on the animation thread');
 workers[0].onmessage({data:{ok:true,planned:{next:clone,report:{id:'native-transfer'}}}});assert.equal((await planned).report.id,'native-transfer');assert.ok(workers[0].terminated);
});
test('travel transport retains JSON compatibility for unknown extension proxies and cancels its worker',async()=>{
 const workers=[],window={nativeSystemHub:{sol:[]},starterShips:new Map(),nativeShipDefinitions:{registered:()=>[]}};
 class Worker{constructor(){workers.push(this);}postMessage(message){this.message=structuredClone(message);}terminate(){this.terminated=true;}}
 vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/world-bootstrap.js','utf8'),{window,Worker,setTimeout,clearTimeout});
 const state={system:1,antimatter:90,extension:new Proxy({value:'Δ'}, {})},job=window.nativeWorldBootstrap.planTravel(state,{id:9});
 assert.equal(JSON.parse(workers[0].message.text).extension.value,'Δ');assert.equal(workers[0].message.seed,undefined);
 workers[0].onmessage({data:{ok:true,plannedText:JSON.stringify({next:{system:9},report:{id:'legacy-transfer'}})}});
 assert.equal((await job).report.id,'legacy-transfer');assert.ok(workers[0].terminated);
 const controller=new AbortController(),cancelled=window.nativeWorldBootstrap.planTravel(state,{id:9},{signal:controller.signal});controller.abort();
 await assert.rejects(cancelled,/cancelled/);assert.ok(workers[1].terminated);assert.equal(state.antimatter,90);
});
test('travel streams the existing snapshot graph in bounded messages and restores a complete isolated result',async()=>{
 const workers=[],window={nativeSystemHub:{sol:[]},starterShips:new Map(),nativeShipDefinitions:{registered:()=>[]}};
 class Worker{constructor(){this.messages=[];workers.push(this);}postMessage(message){this.messages.push(structuredClone(message));}terminate(){this.terminated=true;}}
 const scope=vm.createContext({window,Worker,setTimeout,clearTimeout,performance,requestAnimationFrame:fn=>setImmediate(fn)});
 for(const file of ['save-snapshot.js','world-bootstrap.js'])vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),scope);
 const state={system:1,antimatter:90,ships:Array.from({length:1500},(_,id)=>({id,credits:100.125,job:{funded:true,escrow:.875}})),debt:.0275};
 const promised=window.nativeWorldBootstrap.planTravel(state,{id:9});
 let preparationError;promised.catch(error=>{preparationError=error;});const deadline=Date.now()+5000;
 while(!workers[0].messages.some(message=>message.streamed)){if(preparationError)throw preparationError;assert.ok(Date.now()<deadline,'Travel snapshot did not finish streaming');await new Promise(resolve=>setTimeout(resolve,2));}
 const parts=workers[0].messages.filter(message=>message.action==='travel-part'),final=workers[0].messages.at(-1),rows=[];
 assert.ok(parts.length>1);assert.equal(final.seed,undefined);assert.equal(final.text,undefined);
 for(const part of parts)for(const row of part.rows)rows[row.id]=row;
 const captured=window.nativeSaveSnapshot.restore(rows,final.root);assert.deepEqual(JSON.parse(JSON.stringify(captured)),state);
 const next=structuredClone(state);next.system=9;
 await new Promise((resolve,reject)=>window.nativeSaveSnapshot.capture(next,{
  schedule:fn=>setImmediate(fn),part:part=>workers[0].onmessage({data:{ok:true,part:structuredClone(part)}}),
  complete:root=>{workers[0].onmessage({data:{ok:true,streamed:true,root,report:{id:'streamed-travel'},calendar:{passes:1}}});resolve();},failed:reject
 }));
 const result=await promised;assert.equal(result.report.id,'streamed-travel');assert.deepEqual(JSON.parse(JSON.stringify(result.next)),next);assert.equal(state.system,1);assert.ok(workers[0].terminated);
 const controller=new AbortController(),cancelled=window.nativeWorldBootstrap.planTravel(state,{id:9},{signal:controller.signal});controller.abort();await assert.rejects(cancelled,/cancelled/);assert.ok(workers[1].terminated);
});
test('transit freight preparation preserves the clock, physical debt, civilian jobs and material ledger',async()=>{
 const {fixture}=require('./npc-economy-fixture.cjs'),f=await fixture({full:false,economic:false}),{window:w,state:s}=f;
 vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/world-time.js','utf8'),f.context);
 const total=()=>{const goods=Array(9).fill(0);for(const stock of Object.values(s.solEconomy.ports))stock.forEach((n,g)=>goods[g]+=n);for(const ship of s.solEconomy.freighters)if(Number.isInteger(ship.good))goods[ship.good]+=ship.tons||0;return goods;};
 const initial=total(),flows=JSON.parse(JSON.stringify(s.solEconomy.flows)),crews=JSON.stringify(s.civilianTraffic),ids=s.solEconomy.freighters.map(ship=>ship.id);
 s.day=101;s.system=2;w.nativeSimulationFrame.schedule(s).pendingSeconds=.0125;w.nativeSimulation.advance(s,2400);w.nativeSolEconomy.advance(s,2400);
 const at=w.nativeSimulation.seconds(s),result=w.nativeWorldTime.settleTransit(s);
 assert.ok(result.passes>0);assert.equal(w.nativeSimulation.seconds(s),at);assert.equal(s.day,101);assert.equal(s.shipSimulation.schedule.pendingSeconds,.0125);
 assert.equal(JSON.stringify(s.civilianTraffic),crews);assert.deepEqual(s.solEconomy.freighters.map(ship=>ship.id),ids);
 const final=total(),end=s.solEconomy.flows;
 for(let g=0;g<9;g++)assert.ok(Math.abs(final[g]-(initial[g]+end.produced[g]-flows.produced[g]-end.consumed[g]+flows.consumed[g]-end.lost[g]+flows.lost[g]))<1e-7,'Accounted material '+g);
 assert.equal(w.nativeSolEconomy.calendarPending(s),false);const stable=JSON.stringify(s);
 assert.equal(w.nativeWorldTime.settleTransit(s).passes,0);assert.equal(JSON.stringify(s),stable);
 w.nativePause.active=true;assert.throws(()=>w.nativeWorldTime.settleTransit(s),/paused/);
});
test('warp alignment follows the shortest turn, keeps the ship centered and settles exactly on course',()=>{
 const api=warp(),from=Math.PI-.1,to=-Math.PI+.1;
 for(const t of [0,100,450,900]){const e=api.alignment(t,from,to,900);assert.equal(e.shipX,300);assert.equal(e.shipY,225);assert.ok(Math.abs(delta(e.angle,from))<=.2+1e-12);}
 assert.equal(api.alignment(0,from,to,900).angle,from);assert.ok(Math.abs(delta(api.alignment(900,from,to,900).angle,to))<1e-12);
});
test('nacelle charging continues the turn smoothly and holds on course until departure is ready',()=>{
 const api=warp(),angle=1.2,end=api.alignment(2500,-.8,angle,2500),start=api.charging(0,angle,1200);
 assert.equal(end.nacelleCharge,start.nacelleCharge);let charge=0;
 for(const t of [0,200,600,1200,6000,60000]){
  const effect=api.charging(t,angle,1200);assert.equal(effect.angle,angle);assert.equal(effect.shipX,300);assert.equal(effect.shipY,225);assert.equal(effect.speed,0);
  assert.ok(effect.nacelleCharge>=charge&&effect.nacelleCharge<=1);charge=effect.nacelleCharge;
 }
 assert.equal(charge,1);assert.equal(api.departure(0,angle,{cinematic:true,duration:1100}).nacelleCharge,charge);
});
test('cinematic departures accelerate along the real course and arrival ends without a camera or scale jump',()=>{
 const api=warp();
 for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,2.7]){
  let distance=-1;
  for(const t of [0,100,250,550,900,1100]){
   const e=api.departure(t,angle,{duration:1100,cinematic:true}),x=e.shipX-300,y=e.shipY-225,d=x*Math.sin(angle)-y*Math.cos(angle);
   assert.ok(Math.abs(x*Math.cos(angle)+y*Math.sin(angle))<1e-8);assert.ok(d>=distance);distance=d;
  }
  const start=api.departure(0,angle,{duration:1100,cinematic:true});assert.equal(start.speed,0);assert.equal(start.alpha,1);
  const end=api.arrival(1100,angle,{duration:1100});assert.ok(end.cameraX===0&&end.cameraY===0);assert.equal(end.alpha,1);assert.equal(end.squeezeX,1);assert.equal(end.angle,angle);
 }
 assert.equal(api.departureMs,1100);assert.equal(api.arrivalMs,700);
});

test('the departing ship vanishes into one bright flash at its final visible position',()=>{
 const api=warp(),duration=1100,vanish=duration*.58;
 for(const view of [{w:600,h:450},{w:1200,h:450},{w:360,h:640}])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,.7,2.7]){
  const options={duration,cinematic:true,view},before=api.departure(vanish-.001,angle,options),peak=api.departure(vanish,angle,options);
  assert.ok(before.alpha>0);assert.equal(before.flash,null);assert.equal(peak.alpha,0);assert.equal(peak.flash.alpha,1);assert.equal(peak.ring,null);
  assert.ok(Math.hypot(before.shipX-peak.shipX,before.shipY-peak.shipY)<.01);
  assert.equal(peak.flash.x,peak.shipX);assert.equal(peak.flash.y,peak.shipY);
  let alpha=1;
  for(const elapsed of [700,800,950,1099]){
   const e=api.departure(elapsed,angle,options);assert.equal(e.alpha,0);assert.equal(e.flash.x,peak.flash.x);assert.equal(e.flash.y,peak.flash.y);assert.ok(e.flash.alpha<alpha);alpha=e.flash.alpha;
   const x=view.w/2+e.flash.x-300,y=view.h/2+e.flash.y-225,r=e.flash.radius;
   assert.ok(x-r>=0&&x+r<=view.w&&y-r>=0&&y+r<=view.h,'Vanish light was clipped by the viewport');
  }
  assert.equal(api.departure(duration,angle,options).flash,null);
 }
 const reduced=api.departure(150,1,{duration:240,cinematic:true,reducedMotion:true});assert.equal(reduced.shipX,300);assert.equal(reduced.shipY,225);assert.ok(reduced.flash.alpha<.45);
 assert.deepEqual(api.departure(300,Math.PI/2),api.departure(300,Math.PI/2,{cinematic:true}));
});
function saving(){
 const data=new Map(),workers=[];const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 class Worker{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}reply(){this.onmessage({data:{serialized:this.message.text,serializationMs:20}});}}
 const window={Worker,localStorage:storage,nativeSaveCodec:{stringify:JSON.stringify,parse:JSON.parse},performance};
 vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/save-storage.js','utf8'),{window,setTimeout,clearTimeout,performance});return {api:window.nativeSaveStorage,workers,data,storage};
}
test('a durable asynchronous travel save waits for verified storage and suspends stale checkpoints',async()=>{
 const f=saving(),state={system:9,antimatter:70};f.api.schedule(state);const pending=f.api.writeAsync(state);
 assert.equal(f.data.size,0);assert.equal(f.api.flushDue(state,{now:10}).pending,true);assert.equal(f.workers.length,1);
 f.workers[0].reply();assert.equal((await pending).ok,true);assert.equal(f.api.read('normal').system,9);assert.equal(f.api.pending(state),false);assert.ok(f.workers[0].terminated);
});
test('new explicit saves and cancellation prevent older durable encoders from overwriting a slot',async()=>{
 const f=saving(),old={system:2,antimatter:60};const pending=f.api.writeAsync(old);f.api.write({system:9,antimatter:50});f.workers[0].reply();
 assert.equal((await pending).ok,false);assert.equal(f.api.read('normal').system,9);
 const controller=new AbortController(),cancelled=f.api.writeAsync(old,{signal:controller.signal});controller.abort();f.workers[1].reply();
 assert.equal((await cancelled).ok,false);assert.equal(f.api.read('normal').system,9);
});
test('denied or silently lost asynchronous saves fail and retain dirty checkpoints; Dev and normal slots stay separate',async()=>{
 for(const silent of [true,false]){
  const f=saving(),state={devMode:true,system:4};f.api.schedule(state);f.storage.setItem=()=>{if(!silent)throw Error('Quota');};
  const pending=f.api.writeAsync(state);f.workers[0].reply();assert.equal((await pending).ok,false);assert.equal(f.api.pending(state),true);assert.equal(f.api.read('dev'),null);
 }
 const f=saving();f.api.write({system:1});const pending=f.api.writeAsync({devMode:true,system:8});f.workers[0].reply();assert.equal((await pending).ok,true);
 assert.equal(f.api.read('normal').system,1);assert.equal(f.api.read('dev').system,8);
});
