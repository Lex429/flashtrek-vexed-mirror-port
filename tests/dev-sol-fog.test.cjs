const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const window={vexedSolFlight:{shipPosition:s=>({x:s.x+(s.originX||0),y:s.y+(s.originY||0)})}};
  const math=Object.create(Math);math.random=()=>{throw Error('Fog used gameplay randomness');};
  const scope=vm.createContext({window,Math:math});
  for(const file of ['nebula-gas.js','nebula-flow.js','dev-sol-fog.js'])vm.runInContext(fs.readFileSync('html-games/broken-mirror-port/'+file,'utf8'),scope);
  return {api:window.nativeDevFog,gas:window.nativeNebulaGas,flow:window.nativeNebulaFlow,window};
}
const state=()=>({devMode:true,system:1,x:0,y:0,angle:0,speed:0,hull:100,shields:100,cargo:{ore:3}});
const view={w:1000,h:700,cameraX:0,cameraY:0,zoom:1,dimensions:{width:12,height:20}};

test('the Sol preview requires physical Sol membership, including a save using Sol as its coordinate frame',()=>{
  const {api,window:w}=fixture(),s=state(),model=api.createModel({enabled:true});
  w.nativeManualFlight={currentRegion:()=>({kind:'interstellar',system:null})};model.update(s,.1,view);assert.equal(model.snapshot().active,false);
  w.nativeManualFlight.currentRegion=()=>({kind:'system',system:1});model.update(s,.1,view);assert.equal(model.snapshot().active,true);
});

test('Sol color previews preserve the cloud, wake, clock and game state',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();model.setPreset('vex',s);model.setColour('four');model.update(s,.1,view);
  for(let i=1;i<12;i++)move(model,s,i*20,0);
  const before=model.snapshot(),saved=JSON.stringify(s);assert.equal(before.colour,'four');
  for(const colour of ['purple','red','blue','yellow','original','four']){
    assert.equal(model.setColour(colour),true);const after=model.snapshot();assert.equal(after.colour,colour);
    assert.deepEqual(after.patch,before.patch);assert.deepEqual(after.wakes,before.wakes);assert.equal(after.clock,before.clock);
    assert.equal(model.inputs(view).options.colourPreview,colour);assert.equal(JSON.stringify(s),saved);
  }
  assert.equal(model.setColour('invalid'),false);assert.equal(model.snapshot().colour,'four');
});

test('the four preview regions have distinct colors with continuous boundaries',()=>{
  const {gas}=fixture(),points=[[-.42,-.42],[.42,-.42],[-.42,.42],[.42,.42]],names=['purple','red','blue','yellow'];
  points.forEach(([x,y],i)=>{const a=gas.paletteAt(x,y,'four').light,b=gas.paletteAt(x,y,names[i]).light;for(let c=0;c<3;c++)assert.ok(Math.abs(a[c]-b[c])<.001);});
  const left=gas.paletteAt(-.00001,-.42,'four').light,right=gas.paletteAt(.00001,-.42,'four').light;
  for(let c=0;c<3;c++)assert.ok(Math.abs(left[c]-right[c])<.001,'The color boundary made a hard seam');
  assert.equal(gas.paletteAt(0,0,'original',2),gas.palettes[2]);assert.equal(gas.paletteAt(0,0,undefined,0),gas.palettes[0]);
});
test('frame monitoring retains misses and stalls, excludes inactive time and resets only on request',()=>{
  const {api}=fixture(),monitor=api.createFrameMonitor();for(let i=0;i<600;i++)monitor.record(1/120);
  let m=monitor.snapshot();assert.ok(Math.abs(m.fps-120)<1e-8);assert.equal(m.budgetMisses,0);assert.equal(m.allObservedWithinBudgetTolerance,true);
  monitor.record(.025);monitor.record(.080);m=monitor.snapshot();assert.equal(m.budgetMisses,2);assert.equal(m.missedRefreshIntervals,2);assert.equal(m.over50ms,1);assert.equal(m.worstFrameMs,80);assert.equal(m.allObservedWithinBudgetTolerance,false);
  monitor.record(10,false);assert.deepEqual(monitor.snapshot(),m);monitor.reset();assert.equal(monitor.snapshot().frames,0);assert.equal(monitor.snapshot().budgetMisses,0);
});
function move(model,s,x,y,dt=.1){s.x=x;s.y=y;const before=JSON.stringify(s);model.update(s,dt,view);assert.equal(JSON.stringify(s),before,'Visual fog rewrote game state');}

test('the test bank is enabled only for Dev Sol and is placed ahead of the actual world pose',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();s.originX=400;s.originY=-250;
  model.setPreset('vex',s);
  model.update(s,.1,view);const first=model.snapshot();assert.equal(first.active,true);assert.equal(first.patch.x,1400);assert.equal(first.patch.y,-250);
  move(model,s,200,0);assert.equal(model.snapshot().patch.x,1400,'The cloud followed the ship');
  model.update({...s,devMode:false},1,view);assert.equal(model.snapshot().active,false);assert.equal(model.inputs(view),null);
  model.update({...s,system:34},1,view);assert.equal(model.snapshot().active,false);
});

test('turns leave a bounded trail along the actual path which fills after the ship stops',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();s.speed=200;model.update(s,.1,view);
  for(let i=1;i<=15;i++)move(model,s,i*20,0);
  s.angle=Math.PI/2;for(let i=1;i<=15;i++)move(model,s,300,i*20);
  const moving=model.snapshot();assert.ok(moving.wakeCount>5&&moving.wakeCount<=23);
  assert.ok(moving.wakes.some(w=>w.ay===0&&w.by===0&&w.ax!==w.bx));assert.ok(moving.wakes.some(w=>Math.abs(w.ax-w.bx)<.01&&w.ay!==w.by));
  const old=moving.wakes[0];move(model,s,300,330);assert.equal(model.snapshot().wakes[0].ax,old.ax);assert.equal(model.snapshot().wakes[0].ay,old.ay);
  s.speed=0;for(let i=0;i<65;i++)move(model,s,300,330);
  assert.equal(model.snapshot().wakeCount,0);assert.ok(model.snapshot().speed<1);
});

test('speed strengthens displaced gas while clearance stays tight to each actual hull size',()=>{
  const {api}=fixture();
  function sample(speed,dimensions){const model=api.createModel({enabled:true}),s=state();s.speed=speed;model.update(s,.1,{...view,dimensions});for(let i=1;i<=8;i++){s.x=i*speed*.1;model.update(s,.1,{...view,dimensions});}return model.inputs(view).options.records;}
  const slow=sample(50,{width:12,height:20}),fast=sample(350,{width:12,height:20}),large=sample(350,{width:100,height:130});
  const hull=list=>list.find(r=>r.kind==='hull'),wake=list=>list.find(r=>r.kind==='wake');
  assert.ok(wake(fast).radius>wake(slow).radius);assert.ok(wake(fast).strength>wake(slow).strength);
  assert.ok(wake(fast).radius<7,'Small hull left an oversized tunnel');
  assert.ok(hull(large).width>hull(fast).width*2);assert.equal(hull(fast).width,6);
});

test('pause and hidden tools freeze the visual clock; reduced motion calms curl without changing physics',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();s.speed=100;model.update(s,.1,view);for(let i=1;i<8;i++)move(model,s,i*10,0);
  const first=model.snapshot(),saved=JSON.stringify(s);model.update(s,1,{...view,suspended:true});assert.equal(model.snapshot().clock,first.clock);
  model.update(s,1,{...view,hidden:true});assert.equal(model.snapshot().clock,first.clock);
  model.update(s,0,view);const reduced=model.inputs({...view,reducedMotion:true});assert.equal(reduced.time,0);assert.ok(reduced.options.records.every(w=>w.phase===0&&(!w.age||w.age===0)));
  assert.equal(JSON.stringify(s),saved);
});

test('body coordinate rebases keep the wake continuous while teleports reset it',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();model.setPreset('vex',s);s.speed=100;model.update(s,.1,view);for(let i=1;i<8;i++)move(model,s,i*10,0);
  const before=model.snapshot();s.originX=1000;s.x-=1000;model.update(s,.1,view);
  assert.deepEqual(model.snapshot().patch,before.patch);assert.ok(model.snapshot().wakeCount>=before.wakeCount);
  move(model,s,9000,0);assert.equal(model.snapshot().wakeCount,0);assert.equal(model.snapshot().patch.x,11000);
});

test('presets, disabling and explicit resets affect only transient fog state',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state(),saved=JSON.stringify(s);model.update(s,.5,view);
  model.setPreset('harman',s);assert.equal(model.snapshot().preset,'harman');assert.equal(model.snapshot().clock,0);assert.equal(model.inputs(view).style,0);
  model.setEnabled(false,s);assert.equal(model.inputs(view),null);
  model.setEnabled(true,s);model.update(s,.1,view);assert.equal(model.inputs(view).style,0);
  model.setPreset('vex',s);assert.equal(model.inputs(view).style,2);assert.equal(JSON.stringify(s),saved);
});

test('Dev Sol starts without a test cloud; the Badlands preview requires explicit enable',()=>{
  const {api}=fixture(),model=api.createModel(),s=state(),saved=JSON.stringify(s);model.update(s,.1,view);
  assert.equal(model.snapshot().enabled,false);assert.equal(model.snapshot().active,false);assert.equal(model.inputs(view),null);assert.equal(api.snapshot().enabled,false);
  model.setEnabled(true,s);model.update(s,.1,view);const snap=model.snapshot();assert.equal(snap.preset,'badlands');assert.equal(snap.enabled,true);
  assert.equal(snap.patch.width,2100);assert.equal(snap.patch.height,1600);assert.equal(snap.patch.x,110);assert.equal(snap.patch.y,0);
  assert.equal(snap.colour,'original');assert.equal(model.inputs(view).style,3);assert.equal(JSON.stringify(s),saved);
});

test('bow and wake deformation clears the center, pushes gas to the sides and remains bounded under overlap',()=>{
  const {gas}=fixture(),wake={ax:0,ay:0,bx:100,by:0,radius:20,strength:.9,age:1};
  assert.ok(gas.disturbanceAt(50,0,[wake]).clearing>.85);
  const shoulder=gas.disturbanceAt(50,26,[wake]);assert.ok(shoulder.pushY>0&&shoulder.rim>.5);
  const far=gas.disturbanceAt(50,300,[wake]);assert.equal(far.clearing,0);assert.equal(far.pushX,0);assert.equal(far.pushY,0);
  const dense=gas.disturbanceAt(50,26,Array.from({length:24},()=>wake));assert.ok(Math.hypot(dense.pushX,dense.pushY)<20);
});

test('the nose pushes forward and the two hull shoulders receive the displaced gas without a wide halo',()=>{
  const {api,flow}=fixture(),model=api.createModel({enabled:true}),s=state();s.speed=300;
  for(let i=0;i<10;i++)model.update(s,.1,view);
  const hull=model.inputs(view).options.records.find(r=>r.kind==='hull'),x=hull.x,y=hull.y;
  const center=flow.sampleAt(x,y,[hull]);assert.ok(center.clearing>.9);
  const upper=flow.sampleAt(x,y-7.5,[hull]),lower=flow.sampleAt(x,y+7.5,[hull]);
  assert.ok(upper.pushY<0&&lower.pushY>0);assert.ok(upper.mass>.2&&lower.mass>.2);
  const nearSide=flow.sampleAt(x,y+7,[hull]);assert.ok(nearSide.clearing<.02,'Fog cleared too far beyond the 6-unit hull edge');
  const bow=flow.sampleAt(x+hull.length+.6,y,[hull]);assert.ok(bow.pushX>0);
  const far=flow.sampleAt(x,y+24,[hull]);assert.ok(far.mass<.001&&far.clearing===0);
});

test('every visible ship gets its own outline and bow; NPC trails stay in world space and visual work is bounded',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();
  const fleet=Array.from({length:80},(_,i)=>({id:'civilian:'+i,x:100+i*2,y:50,heading:Math.PI/2,speed:80,dimensions:{width:8+i%3,height:15},shape:{front:.45,rear:-.4,profile:Array(16).fill(.8)}}));
  const before=JSON.stringify(fleet);model.update(s,.1,{...view,ships:fleet});
  const records=model.inputs(view).options.records,hulls=records.filter(r=>r.kind==='hull');assert.equal(hulls.length,81);
  const npc=hulls.find(r=>r.id==='civilian:0');assert.ok(Math.abs(npc.cos)<.001&&npc.sin>.99);assert.equal(npc.profile[0],3.2);
  for(let i=0;i<70;i++)model.update(s,.1,{...view,ships:fleet.map(ship=>({...ship,y:ship.y+i*8}))});
  const snap=model.snapshot();assert.ok(snap.wakes.some(w=>w.id!=='player'));assert.ok(snap.totalWakes<=192);assert.equal(snap.shipCount,81);assert.equal(JSON.stringify(fleet),before);
});

test('the tile index retains overlapping hulls and wakes, including a segment midpoint far from its endpoints',()=>{
  const {flow}=fixture(),r={kind:'wake',x:320,y:160,ax:10,ay:160,bx:630,by:160,radius:4,strength:.8,age:.1,phase:0,boundX:325,boundY:16};
  const grid=flow.bins({w:640,h:320},[r]);assert.ok(grid.cells[2*grid.columns+5].includes(0));assert.ok(flow.sampleAt(320,160,[r]).clearing>.5);
  assert.ok(!grid.cells[0].length);
});

test('fast flight keeps a live channel connected to the stern between retained wake samples',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();s.speed=400;model.update(s,.1,view);
  move(model,s,200,0,.5);move(model,s,220,0,.02);
  const records=model.inputs(view).options.records,hull=records.find(r=>r.kind==='hull'),sternX=hull.x-hull.length;
  const latest=records.filter(r=>r.kind==='wake'&&r.age===0).find(r=>Math.abs(r.bx-sternX)<.01);
  assert.ok(latest,'The wake ended behind the current stern');assert.ok(latest.bx>latest.ax);assert.ok(latest.radius<7);
});

test('tight clearance follows the same interpolated heading and position as the displayed hull',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state(),display={...view,ship:{x:24,y:30,heading:Math.PI/2}};
  model.update(s,.1,display);const hull=model.inputs(display).options.records.find(r=>r.kind==='hull');
  assert.ok(Math.abs(hull.cos)<.001&&hull.sin>.99);assert.equal(hull.x,view.w/2+24);assert.equal(hull.y,view.h/2+30);
});

test('the blade throws two banks diagonally outward; faster motion widens the bow wave without widening hull clearance',()=>{
  const {flow}=fixture(),profile=Array.from({length:16},(_,i)=>6*Math.sqrt(Math.max(0,1-Math.pow(i/7.5-1,2))));
  const hull={kind:'hull',x:0,y:0,cos:1,sin:0,length:10,width:6,profile,speed:1,phase:2,boundX:70,boundY:70};
  const near=flow.sampleAt(4,7,[hull]),left=flow.sampleAt(-6,-13,[hull]),right=flow.sampleAt(-6,13,[hull]);
  assert.ok(near.pushY>0&&right.pushY>0&&left.pushY<0);assert.ok(right.mass>.25&&left.mass>.25);
  assert.ok(right.pushY>6,'The aft bank did not carry the gas out beyond the beam');
  assert.equal(right.clearing,0,'The wider wave enlarged the hull hole');
  const slow=flow.sampleAt(-6,13,[{...hull,speed:.15}]);assert.ok(Math.abs(right.pushY)>Math.abs(slow.pushY)*3);
  const centerBow=flow.sampleAt(10.5,0,[hull]);assert.ok(centerBow.pushX>0);assert.equal(centerBow.pushY,0,'The centerline must split evenly');
});

test('displaced wake banks keep moving out after braking while their narrow channel heals in place',()=>{
  const {api}=fixture(),model=api.createModel({enabled:true}),s=state();model.setPreset('vex',s);s.speed=350;model.update(s,.1,view);
  for(let i=1;i<=25;i++)move(model,s,i*35,0,.1);
  const before=model.inputs({...view,cameraX:s.x}).options.records.filter(r=>r.kind==='wake'),wake=before.at(-2);
  s.speed=0;model.update(s,.9,view);
  const after=model.inputs({...view,cameraX:s.x}).options.records.find(r=>r.kind==='wake'&&r.ax===wake.ax&&r.bx===wake.bx);
  assert.ok(after);assert.ok(after.spread>wake.spread+3);assert.ok(after.strength<wake.strength);
  assert.ok(after.radius<wake.radius*1.04,'Outward momentum must not become a wider clear hole');
  assert.ok(after.boundY>after.spread+after.radius*3,'The expanding bank left its spatial tile coverage');
});

test('adjacent wake endpoints interpolate their outward travel rather than jumping between segment ages',()=>{
  const {flow}=fixture(),a={kind:'wake',x:0,y:0,ax:-50,ay:0,bx:50,by:0,radius:5,strength:.8,strengthA:.5,spread:8,spreadA:20,age:1,phase:0,boundX:90,boundY:50};
  const left=flow.sampleAt(-40,24,[a]),right=flow.sampleAt(40,14,[a]);
  assert.ok(left.mass>.2&&right.mass>.2);assert.ok(left.pushY>0&&right.pushY>0);
  assert.ok(left.clearing<.001&&right.clearing<.001);
});
