const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const window={},math=Object.create(Math);math.random=()=>{throw Error('Storm consumed gameplay randomness');};
 vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/dev-nebula-storm.js','utf8'),{window,Math:math});return window.nativeDevNebulaStorm;
}
const state=()=>({devMode:true,system:1,hull:100,shields:100,cargo:{ore:3}});
const patch={x:500,y:-300,width:900,height:700,angle:.3};
const fog={eligible:true,enabled:true,preset:'badlands',patch};

test('Dev Sol is the only eligible storm location; other fog presets and disabled banks cannot emit',()=>{
 const api=fixture();for(const s of [state(),{...state(),devMode:false},{...state(),system:34}])for(const current of [fog,{...fog,preset:'vex'},{...fog,enabled:false},{...fog,eligible:false}]){
  const m=api.createModel(),allowed=s.devMode&&s.system===1&&current.preset==='badlands'&&current.enabled&&current.eligible;
  m.frame(s,.1,{},current);assert.equal(m.trigger(s,current),allowed);m.frame(s,10,{},current);
  assert.equal(m.snapshot().available,allowed);if(!allowed)assert.equal(m.snapshot().flashes.length,0);
 }
});

test('queued manual lightning waits for flight and pause/reduced motion freeze its transient clock',()=>{
 const api=fixture(),m=api.createModel(),s=state(),saved=JSON.stringify(s);
 m.frame(s,.1,{hidden:true},fog);assert.equal(m.trigger(s,fog),true);
 for(const view of [{hidden:true},{suspended:true},{reducedMotion:true}]){m.frame(s,3,view,fog);assert.equal(m.snapshot().clock,0);assert.equal(m.snapshot().pending,1);}
 m.frame(s,.1,{},fog);let before=m.snapshot();assert.equal(before.flashes.length,1);assert.equal(before.pending,0);
 m.frame(s,.2,{},fog);before=m.snapshot();assert.ok(before.flashes[0].glow>.5);
 m.frame(s,1,{suspended:true},fog);assert.deepEqual(m.snapshot().flashes,before.flashes);
 assert.equal(JSON.stringify(s),saved);m.frame(s,1,{},fog);assert.equal(m.snapshot().flashes.length,0);
});

test('lightning stays in world space and its pending and active populations remain bounded under repeated triggers',()=>{
 const api=fixture(),m=api.createModel(),s=state();m.frame(s,.1,{},fog);
 for(let i=0;i<100;i++)m.trigger(s,fog);assert.equal(m.snapshot().pending,3);m.frame(s,.1,{},fog);
 const before=m.snapshot();assert.equal(before.flashes.length,3);assert.equal(m.trigger(s,fog),false);
 for(const e of before.flashes){assert.ok(Math.abs(e.x-patch.x)<patch.width*.5);assert.ok(Math.abs(e.y-patch.y)<patch.height*.5);assert.ok(e.radius<=160);}
 m.frame(s,.1,{cameraX:10000,cameraY:-3000,zoom:2},fog);
 assert.deepEqual(m.snapshot().flashes.map(e=>[e.x,e.y]),before.flashes.map(e=>[e.x,e.y]));
 m.setEnabled(false);assert.equal(m.snapshot().flashes.length,0);assert.equal(m.snapshot().pending,0);assert.equal(m.trigger(s,fog),false);
});

test('automatic storms are deterministic with irregular intervals, multiple pulses and no backlog burst',()=>{
 const api=fixture(),a=api.createModel(),b=api.createModel(),sa=state(),sb=state(),seen=[];let emitted=0;
 for(let i=0;i<600;i++){
  a.frame(sa,.05,{},fog);b.frame(sb,.05,{},fog);assert.deepEqual(a.snapshot(),b.snapshot());
  const snap=a.snapshot();if(snap.emitted!==emitted){seen.push(snap.clock);emitted=snap.emitted;}assert.ok(snap.flashes.length<=api.limits.flashes);
 }
 assert.ok(seen.length>=4);const gaps=seen.slice(1).map((n,i)=>+(n-seen[i]).toFixed(1));assert.ok(new Set(gaps).size>1);
 assert.ok(api.envelope(.075).bolt>api.envelope(.135).bolt);assert.ok(api.envelope(.205).bolt>api.envelope(.135).bolt);
 assert.equal(api.envelope(2).glow,0);a.frame(sa,1000,{},fog);assert.equal(a.snapshot().flashes.length,1);
});

test('automatic lightning alternates rapid clusters with long quiet gaps independently of manual triggers',()=>{
 const api=fixture(),a=api.createModel(),b=api.createModel(),sa=state(),sb=state(),seen=[];let emitted=0;
 a.frame(sa,.05,{},fog);b.frame(sb,.05,{},fog);b.trigger(sb,fog);
 for(let i=0;i<4800;i++){
  a.frame(sa,.05,{},fog);b.frame(sb,.05,{},fog);
  const snap=a.snapshot(),manual=b.snapshot();assert.equal(snap.nextAt,manual.nextAt);assert.equal(snap.burstRemaining,manual.burstRemaining);
  if(snap.emitted!==emitted){seen.push(snap.clock);emitted=snap.emitted;}
  assert.ok(snap.flashes.length<=api.limits.flashes);
 }
 const gaps=seen.slice(1).map((at,i)=>at-seen[i]);
 assert.ok(gaps.filter(g=>g<.9).length>10,'Expected rapid clusters');assert.ok(gaps.some(g=>g>10),'Expected a long quiet stretch');
 assert.ok(gaps.some(g=>g>3&&g<8),'Quiet gaps should vary too');
});

test('resetting the cloud or leaving the test clears only transient storm history',()=>{
 const api=fixture(),m=api.createModel(),s=state();m.frame(s,.1,{},fog);m.trigger(s,fog);m.frame(s,.1,{},fog);
 m.frame(s,.1,{}, {...fog,patch:{...patch,x:1000}});assert.equal(m.snapshot().flashes.length,0);assert.equal(m.snapshot().emitted,0);
 m.trigger(s,{...fog,patch:{...patch,x:1000}});m.frame(s,.1,{}, {...fog,preset:'harman'});assert.equal(m.snapshot().pending,0);assert.equal(m.snapshot().flashes.length,0);
});

test('sheet lightning queues while paused and illuminates a broad world-fixed cloud region',()=>{
 const api=fixture(),m=api.createModel(),s=state(),anchor={x:42,y:53};m.frame(s,.1,{hidden:true},fog);assert.equal(m.trigger(s,fog,'sheet',anchor),true);
 m.frame(s,1,{suspended:true},fog);assert.equal(m.snapshot().clock,0);assert.equal(m.snapshot().pending,1);
 m.frame(s,.01,{},fog);m.frame(s,.17,{},fog);const flash=m.snapshot().flashes[0],sheet=m.material()[0];
 assert.equal(flash.kind,'sheet');assert.equal(flash.x,anchor.x);assert.equal(flash.y,anchor.y);assert.ok(sheet.halfWidth>flash.radius*2);
 assert.ok(api.sheetStrength([sheet],sheet.x,sheet.y)>.7);
 assert.ok(api.sheetStrength([sheet],sheet.x+sheet.c*sheet.halfWidth*.65,sheet.y+sheet.s*sheet.halfWidth*.65)>.2);
 assert.equal(api.sheetStrength([sheet],sheet.x+sheet.c*sheet.halfWidth*1.1,sheet.y+sheet.s*sheet.halfWidth*1.1),0);
 const before=JSON.stringify(m.material());m.frame(s,.5,{suspended:true},fog);assert.equal(JSON.stringify(m.material()),before);
 m.setEnabled(false);assert.equal(m.material().length,0);
});
test('automatic storms mix broad sheets and local branches within the existing population cap',()=>{
 const api=fixture(),m=api.createModel(),s=state(),kinds=new Set();for(let i=0;i<4800;i++){m.frame(s,.05,{},fog);for(const e of m.snapshot().flashes)kinds.add(e.kind);assert.ok(m.snapshot().flashes.length<=3);}
 assert.deepEqual([...kinds].sort(),['branch','sheet']);
});
