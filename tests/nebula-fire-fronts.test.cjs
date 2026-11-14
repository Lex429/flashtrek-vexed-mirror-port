const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root='html-games/broken-mirror-port/';
function setup(){const math=Object.create(Math);math.random=()=>{throw Error('Fire consumed gameplay randomness');};const window={},context=vm.createContext({window,Math:math});vm.runInContext(fs.readFileSync(root+'nebula-fire-fronts.js','utf8'),context);window.nativeNebulaFire.installVolume(fs.readFileSync(root+'assets/nebula-fire-v1.bin'));return window.nativeNebulaFire;}
const state=()=>({devMode:true,system:1,x:10,y:20,hull:100,shields:80,cargo:{ore:3}});
const patch={x:0,y:-110,width:2100,height:1600,angle:0},current={eligible:true,enabled:true,preset:'badlands',patch};

test('fire fronts belong only to the active Dev Sol Badlands cloud',()=>{
 const api=setup();for(const s of [state(),{...state(),system:73},{...state(),devMode:false}])for(const c of [current,{...current,preset:'vex'},{...current,enabled:false},{...current,eligible:false}]){
  const m=api.createModel(),allowed=s.devMode&&s.system===1&&c.preset==='badlands'&&c.enabled&&c.eligible;
  m.frame(s,.1,{},c);assert.equal(m.trigger(s,c),allowed);m.frame(s,.5,{},c);assert.equal(m.snapshot().available,allowed);if(!allowed)assert.equal(m.material().fronts.length,0);
 }
});
test('fire queues behind menus, freezes with pause or reduced motion and cannot mutate the game',()=>{
 const api=setup(),m=api.createModel(),s=state(),before=JSON.stringify(s);m.frame(s,.1,{hidden:true},current);m.trigger(s,current,{x:42,y:53});
 for(const view of [{hidden:true},{suspended:true},{reducedMotion:true}]){m.frame(s,3,view,current);assert.equal(m.snapshot().clock,0);assert.equal(m.snapshot().pending,1);}
 m.frame(s,.1,{},current);assert.equal(m.snapshot().fronts[0].x,42);m.frame(s,2,{},current);const active=m.snapshot().fronts;
 m.frame(s,3,{suspended:true},current);assert.deepEqual(m.snapshot().fronts,active);assert.equal(JSON.stringify(s),before);
 m.frame(s,0,{cameraX:5000,cameraY:-8000},current);assert.deepEqual(m.snapshot().fronts,active);
 m.setEnabled(false);assert.equal(m.material().fronts.length,0);assert.equal(m.trigger(s,current),false);
});
test('fire has bounded, deterministic births, world drift, a slow build and a finite fade',()=>{
 const api=setup(),a=api.createModel(),b=api.createModel(),sa=state(),sb=state();
 for(let i=0;i<2400;i++){a.frame(sa,.05,{},current);b.frame(sb,.05,{},current);assert.deepEqual(a.snapshot(),b.snapshot());assert.ok(a.snapshot().fronts.length<=3);}
 assert.ok(a.snapshot().emitted>10);a.frame(sa,1000,{},current);assert.equal(a.snapshot().fronts.length,1,'A delayed frame must not replay a backlog of fronts');
 assert.equal(api.envelope(0,14),0);assert.ok(api.envelope(3,14)>.8);assert.ok(api.envelope(13.9,14)<.01);assert.equal(api.envelope(14,14),0);
 const m=api.createModel();m.frame(sa,.01,{},current);for(let i=0;i<100;i++)m.trigger(sa,current);assert.equal(m.snapshot().pending,3);m.frame(sa,.1,{},current);assert.equal(m.snapshot().fronts.length,3);assert.equal(m.trigger(sa,current),false);
 m.frame(sa,.1,{}, {...current,patch:{...patch,x:9000}});assert.equal(m.snapshot().emitted,0);assert.equal(m.material().fronts.length,0);
});
test('cached plasma attributes create broad billows with dark folds and preserve the quiet exterior',()=>{
 const api=setup(),v={x:0,y:0,halfWidth:190,halfHeight:124,angle:0,born:0,phase:.7,duration:15},fronts=[v],far=api.sculpt(fronts,300,0,4);
 assert.deepEqual(JSON.parse(JSON.stringify(far)),{x:300,y:0,density:1,shade:1,blend:0,temperature:0});
 let peak=0,changed=0,minShade=1,maxShade=0,broad=0;for(let y=-110;y<=110;y+=5)for(let x=-170;x<=170;x+=5){const a=api.sculpt(fronts,x,y,4),b=api.sculpt(fronts,x,y,5);peak=Math.max(peak,a.density);minShade=Math.min(minShade,a.shade);maxShade=Math.max(maxShade,a.shade);if(Math.abs(a.blend-b.blend)>.05)changed++;if(Math.abs(y)>55&&a.blend>.15)broad++;assert.ok(Object.values(a).every(Number.isFinite));}
 assert.ok(peak>1.4&&peak<2.5&&changed>100&&broad>300,'Plasma should roll across a broad gas volume with modest optical compression');
 assert.ok(minShade<.8&&maxShade>1.15,'Dark folds must separate the illuminated billows');assert.equal(api.sculpt(fronts,0,0,15).blend,0);
 const p=api.appearance(fronts,4),bytes=api.volume.bytes;assert.equal(api.appearance(fronts,4),p);assert.equal(api.volume.bytes,bytes);assert.equal(bytes.byteLength,589824);
 assert.throws(()=>api.installVolume(new Uint8Array(4)),/Invalid fire/);
});
test('plasma heating retains the native gas colour and follows its density',()=>{
 const api=setup(),source=[.4,.18,.13],hot=api.heat(source,.8,1,.7,[]),thin=api.heat(source,.8,1,.03,[]);
 assert.deepEqual(api.heat(source,.8,1,0,[]),source);assert.deepEqual(api.heat(source,.8,0,.7,[]),source);
 assert.ok(hot[0]>source[0]+.1&&hot[2]>.8*hot[1],'The hot gas should retain depth and warm pink-orange colour');
 assert.ok(hot[0]-source[0]>(thin[0]-source[0])*10,'Sparse gas should react less strongly');
 const blue=api.heat([.08,.1,.4],.8,1,.7,[]);assert.ok(blue[2]>blue[0]*2,'Heating must reveal the original gas rather than replace it with a yellow colour mask');
});
