const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
require('../html-games/flashtrek-broken-mirror/effect-lab-metrics.js');
const {FrameMeter,comparable}=globalThis.EffectLabMetrics;
test('shielded combat exercises every weapon arrival without forcing hull damage through charged shields',()=>{
  let seconds=0,impacts=0;const kinds=[];
  const state={},fleet=Array.from({length:10},(_,id)=>({entity:{id,x:id*60,y:0,shields:100,dimensions:{width:24,height:44}},descriptor:{heading:0,dimensions:{width:24,height:44}},phase:0}));
  const window={nativeWeaponRules:{weaponSpec:s=>({damage:s.damage,recharge:0})}},nativeSimulation={seconds:()=>seconds,now:()=>seconds*1000};
  const nativeCombatShots={create:({kind,now})=>({kind,born:now,from:{x:0,y:0}}),hitDelay:()=>70,isVisible:()=>true,
    contact:()=>({local:{x:10,y:0},radii:{rx:20,ry:28}})};
  const nativeShipEffects={visualImpact:(_,__,event)=>{impacts++;kinds.push(event.kind);assert.equal(event.absorbed,17);},hit:()=>assert.fail('Shielded fixture forced a hull burst')};
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/effect-lab-fixture.js','utf8'),
    {window,nativeSimulation,nativeCombatShots,nativeShipEffects,nativeShipDamage:{apply:()=>assert.fail('Shielded fixture applied hull damage')},Math});
  const fixture=window.createVexedEffectFixture({state,fleet,config:{scenario:'shielded-battle',pattern:'volley',rate:2,seed:429,weapon:'beam:0',mixedWeapons:true},combat:{weapons:{beam:[{damage:17}],torpedo:[{damage:17}],disruptor:[{damage:17}]}}});
  fixture.step();assert.equal(fixture.snapshot().shots,10);assert.equal(impacts,0);
  seconds=.1;fixture.step();assert.equal(impacts,10);assert.equal(fixture.snapshot().hits,10);
  seconds=.2;fixture.step();assert.equal(impacts,10,'An arrival must produce exactly one visual contact');
  assert.equal(fixture.snapshot().explosions,0);
  assert.deepEqual(new Set(kinds),new Set(['beam','torpedo','disruptor']),'Arrivals retain the actual weapon type');
});
test('combined weapons fixture has moving poses, correct shield/hull arrivals and no destruction',()=>{
  let seconds=0,bursts=0;
  const state={},fleet=Array.from({length:10},(_,id)=>({entity:{id,x:id*60,y:0,hull:100,shields:100,heading:0,dimensions:{width:24,height:44}},descriptor:{heading:0,dimensions:{width:24,height:44}},phase:0}));
  const window={nativeWeaponRules:{weaponSpec:s=>({damage:s.damage,recharge:0})}},nativeSimulation={seconds:()=>seconds,now:()=>seconds*1000};
  const nativeCombatShots={create:({kind,now})=>({kind,born:now,from:{x:0,y:0}}),hitDelay:()=>70,isVisible:()=>true,
    contact:()=>({local:{x:10,y:0},radii:{rx:20,ry:28}})};
  const nativeShipEffects={visualImpact(_,descriptor,event){assert.equal(event.damage,17);if(!event.absorbed){bursts++;assert.equal(descriptor.entity.shields,0);}},hit(){assert.fail('Weapons/hits fixture must never request destructive damage');}};
  for(const ship of fleet)ship.descriptor.entity=ship.entity;
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/effect-lab-fixture.js','utf8'),
    {window,nativeSimulation,nativeCombatShots,nativeShipEffects,nativeShipDamage:{apply:(d,amount)=>({amount})},Math});
  const fixture=window.createVexedEffectFixture({state,fleet,config:{scenario:'full-battle',pattern:'volley',rate:2,seed:429,weapon:'beam:0',mixedWeapons:true},combat:{weapons:{beam:[{damage:17}],torpedo:[{damage:17}],disruptor:[{damage:17}]}}});
  for(let i=0;i<5;i++){seconds=i*.5;fixture.step();}
  assert.ok(bursts>0);assert.equal(fixture.snapshot().explosions,0);assert.equal(fixture.snapshot().destructionEnabled,false);
  assert.ok(fixture.snapshot().shieldHits>0&&fixture.snapshot().hullHits>0);
  assert.ok(fleet.some(s=>s.entity.x!==s.entity.id*60));
  assert.ok(fleet.every((s,i)=>s.entity.hull===100&&s.entity.shields===(i%4===0?0:100)),'Visual tests preserve health and explicit shield state');
});
test('normal and realistic stress respect shared recharge; only explicit overload bypasses it',()=>{
 const run=level=>{let seconds=0;const window={nativeWeaponRules:{weaponSpec:s=>({damage:s.damage,recharge:1})}};
  const ship={entity:{x:0,y:0,shields:100,dimensions:{width:24,height:44}},descriptor:{},phase:0};
  const nativeSimulation={seconds:()=>seconds,now:()=>seconds*1000},nativeCombatShots={create:({kind,now})=>({kind,born:now}),hitDelay:()=>99999,isVisible:()=>true};
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/effect-lab-fixture.js','utf8'),{window,nativeSimulation,nativeCombatShots,Math});
  const fixture=window.createVexedEffectFixture({state:{},fleet:[ship],config:{scenario:'weapons',loadLevel:level,pattern:'volley',rate:4,weapon:'beam:0'},combat:{weapons:{beam:[{baseDamage:23}]}}});
  for(let i=0;i<4;i++){seconds=i*.25;fixture.step();}return fixture.snapshot().shots;
 };
 assert.equal(run('normal'),1);assert.equal(run('stress'),1);assert.equal(run('overload'),4);
});
test('normal-game shield installation waits for released modules and shares concurrent startup requests',async()=>{
  let release,space=null,loaded=false,calls=0;
  const ready=new Promise(resolve=>{release=()=>{loaded=true;resolve();};});
  const window={nativeShipEffects:{},nativeEffectProfiles:{ready}};
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/shield-gpu-live.js','utf8'),
    {window,document:{getElementById:()=>space},console});
  space={id:'space'};
  const renderer={appearance:'cinematic-impact-v4'};
  window.createVexedShieldPresentation=async()=>{calls++;assert.ok(loaded,'Release must finish loading before renderer selection');return renderer;};
  const first=window.installVexedShieldGPU(),second=window.installVexedShieldGPU();
  assert.equal(first,second);await Promise.resolve();assert.equal(calls,0);
  release();assert.equal(await first,renderer);assert.equal(window.vexedShieldGPU,renderer);
  assert.equal(await window.installVexedShieldGPU(),renderer);assert.equal(calls,1);
});
test('GPU timing bounds outstanding queries and reads only available asynchronous results',()=>{
  let next=0,ready=false,disjoint=false,lost=false,driverReads=0;const deleted=[],samples=[],reads=[];
  const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,
    getExtension:()=>({TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}),
    createQuery:()=>++next,beginQuery(){},endQuery(){},deleteQuery:q=>deleted.push(q),
    isContextLost:()=>lost,getParameter:()=>{driverReads++;return disjoint;},
    getQueryParameter(q,key){reads.push(key);return key===1?ready:250000;}};
  const timer=EffectLabMetrics.createGPUTimer(gl,ms=>samples.push(ms));
  timer.poll();assert.equal(driverReads,0,'idle timers must not query the driver');
  for(let i=0;i<50;i++){timer.begin(i);timer.end();}
  assert.equal(next,4);timer.poll();assert.deepEqual(samples,[]);assert.ok(!reads.includes(2));
  ready=true;timer.poll();assert.deepEqual(samples,[.25,.25,.25,.25]);assert.equal(deleted.length,4);
  const afterReads=driverReads;timer.poll();assert.equal(driverReads,afterReads,'completed timers must not query the driver');
  timer.begin(50);timer.end();disjoint=true;timer.poll();assert.equal(deleted.length,5);assert.equal(samples.length,4);
  disjoint=false;timer.begin(60);timer.clear();assert.equal(deleted.length,6);
  lost=true;timer.begin(70);assert.equal(next,6);
  const unsupported=EffectLabMetrics.createGPUTimer({getExtension:()=>null},()=>assert.fail('unsupported timer sampled'));
  assert.equal(unsupported.supported,false);unsupported.begin();unsupported.end();unsupported.poll();unsupported.clear();
});
test('frame delivery uses wall time, retains stalls and distinguishes CPU work',()=>{
  const m=new FrameMeter();for(let i=0;i<99;i++)m.add(8,2,i*8);m.add(80,3,872);
  const s=m.snapshot();assert.equal(s.samples,100);assert.equal(s.fps,100000/872);
  assert.equal(s.p95Ms,8);assert.equal(s.maxMs,80);assert.equal(s.low1FPS,12.5);
  assert.equal(s.over33,1);assert.equal(s.targetObserved,false);assert.equal(s.cpuMs,2.01);
});
test('a stable 120 Hz trace passes; 60 Hz and interrupted traces do not',()=>{
  for(const [spacing,pass] of [[1000/120,true],[1000/60,false]]){
    const m=new FrameMeter();for(let i=0;i<120;i++)m.add(spacing,1);
    assert.equal(m.snapshot().targetObserved,pass);m.invalidate('hidden');assert.equal(m.snapshot().valid,false);
  }
});
test('bounded meters cannot silently truncate a recorded run',()=>{
  const m=new FrameMeter(2);m.add(8);m.add(8);assert.equal(m.add(8),false);
  assert.equal(m.frames.length,2);assert.equal(m.snapshot().valid,false);
  m.reset();assert.equal(m.add(NaN),false);assert.equal(m.snapshot().valid,false);
});
test('comparisons require identical load, viewport, hardware and code',()=>{
  const a={fixture:{count:100,width:1280},environment:{gpu:'a'},code:{shader:'v1'},variant:'baseline'};
  const b=structuredClone(a);b.variant='candidate';assert.ok(comparable(a,b));
  b.fixture.count=200;assert.ok(!comparable(a,b));b.fixture.count=100;b.environment.gpu='b';assert.ok(!comparable(a,b));
  b.environment.gpu='a';b.code.shader='v2';assert.ok(!comparable(a,b));
});
test('candidate settings are document-local and release defaults remain intact',async()=>{
  const baseline={schema:1,id:'production-v1',name:'Current game effects',implementation:'shared-v1',modules:[],shield:{duration:900,energy:1},weapon:{scale:1}};
  const context={window:{},structuredClone,URL,console,fetch:async()=>({ok:true,json:async()=>baseline}),document:{currentScript:{src:'http://localhost/effect-profiles.js'},scripts:[]}};
  vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/effect-profiles.js','utf8'),context);
  const p=context.window.nativeEffectProfiles;await p.ready;
  const candidate=structuredClone(baseline);candidate.shield.duration=1200;candidate.weapon.scale=1.2;
  await p.preview(candidate);assert.equal(p.shield().duration,1200);assert.equal(p.production().shield.duration,900);
  p.clearPreview();assert.equal(p.shield().duration,900);
  await assert.rejects(()=>p.preview({...candidate,modules:['../escape.js']}));
});
test('explicit legacy versus GPU comparisons retain the same load and code requirements',()=>{
  const a={fixture:{count:100,shieldRenderer:'legacy'},environment:{gpu:'a'},code:{shader:'v1'}};
  const b=structuredClone(a);b.fixture.shieldRenderer='gpu';assert.ok(comparable(a,b));
  b.fixture.count=200;assert.ok(!comparable(a,b));
});
