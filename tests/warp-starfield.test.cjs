const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/warp-starfield.js'),'utf8');
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function load(){
  const next=seeded(4292026),math=Object.create(Math);let calls=0;
  math.random=()=>{calls++;return next();};const original=math.random;
  const context=vm.createContext({window:{},Math:math});vm.runInContext(source,context);
  return {api:context.window.vexedWarpStarfield,gameplay:math.random,calls:()=>calls,unchanged:()=>math.random===original};
}
function canvas(){
  const strokes=[];let points=[];
  return {strokes,save(){},restore(){},fillRect(){},beginPath(){points=[];},
    moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},
    createLinearGradient(){return {addColorStop(){}};},
    stroke(){assert.ok(points.flat().every(Number.isFinite));strokes.push({points,width:this.lineWidth,color:this.strokeStyle,alpha:this.globalAlpha});}};
}

test('default warp creation, large respawn steps and resizing leave the later gameplay sequence intact',()=>{
  const game=load(),expected=seeded(4292026),first=game.gameplay();assert.equal(first,expected());
  const field=game.api.create(),ctx=canvas();
  for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    field.draw(ctx,1000,heading);field.resize(1280,850);field.draw(ctx,1000,heading,true);field.resize(600,450);
  }
  assert.equal(ctx.strokes.length,332*8,'every original depth-layer star is still painted');
  assert.equal(game.calls(),1,'only the deliberate gameplay read consumed global randomness');
  assert.deepEqual(Array.from({length:12},game.gameplay),Array.from({length:12},expected));
  assert.ok(game.unchanged(),'the renderer never replaces global Math.random');
});

test('explicit random injection retains the original star distribution and respawn calls',()=>{
  const game=load();let calls=0;const field=game.api.create(600,450,()=>{calls++;return .25;});
  assert.equal(calls,332*8,'original initial random samples remain caller-owned');
  const ctx=canvas();field.draw(ctx,0);
  assert.equal(ctx.strokes.length,332);
  const first=ctx.strokes[0];assert.deepEqual(first.points,[[100,61.8875],[100,62.5]]);
  assert.equal(first.width,.45);assert.equal(first.color,'#c8dfef');assert.ok(Math.abs(first.alpha-.204)<1e-12);
  const widths=new Map();for(const stroke of ctx.strokes)widths.set(stroke.width,(widths.get(stroke.width)||0)+1);
  assert.deepEqual([...widths],[[.45,150],[.55,95],[.75,50],[1.05,25],[1.45,12]]);
  field.draw(ctx,1000);assert.equal(calls,332*9,'all stars actually crossed a respawn boundary');
  assert.equal(game.calls(),0,'an explicitly injected stream does not use the default gameplay stream');
});

test('different heading, viewport and hidden-paint histories do not alter gameplay randomness',()=>{
  const visible=load(),hidden=load(),a=visible.api.create(),b=hidden.api.create();
  const ctx=canvas();
  for(let frame=0;frame<20;frame++){
    a.resize(300+frame*50,200+frame*25);a.draw(ctx,25,frame*.37);
    if(frame%4===0)b.draw(ctx,.016,0,true);
  }
  visible.api.create(1200,900).draw(ctx,1000,Math.PI);
  assert.equal(visible.calls(),0);assert.equal(hidden.calls(),0);
  assert.deepEqual(Array.from({length:20},visible.gameplay),Array.from({length:20},hidden.gameplay));
});
