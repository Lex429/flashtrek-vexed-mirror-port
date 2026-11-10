const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {fixture}=require('./npc-economy-fixture.cjs'),reference=require('./fixtures/navigation-reference.cjs');
function motion(){const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/ship-motion.js'),'utf8'),context);return context.window.nativeShipMotion;}
const plain=value=>JSON.parse(JSON.stringify(value));
test('indexed route search retains the exact historical paths across seeded obstacle fields and moved geometry',()=>{
 const m=motion(),old=reference(m.clearSegment);let seed=71291;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let trial=0;trial<20;trial++){
  const start={x:-800,y:0},goal={x:800,y:0},circles=[{x:0,y:0,radius:80},...Array.from({length:100},()=>({x:random()*2500-1250,y:random()*2200-1100,radius:10+random()*45}))];
  assert.deepEqual(plain(m.obstaclePoints(start,goal,circles,24)),plain(old(start,goal,circles,24)));
  circles[0].x=300;circles[0].y=120;assert.deepEqual(plain(m.obstaclePoints(start,goal,circles,24)),plain(old(start,goal,circles,24)));
 }
});
test('route edges do not repeatedly test thousands of distant circles',()=>{
 const m=motion(),start={x:-600,y:0},goal={x:600,y:0};let reads=0;
 const circles=[{x:0,y:0,radius:80},...Array.from({length:2000},(_,i)=>({x:i*40,y:12000,get radius(){reads++;return 20;}}))];
 const points=m.obstaclePoints(start,goal,circles,24);assert.ok(points?.length);assert.ok(reads<2000*8,'Distant obstacles were rechecked for every candidate edge: '+reads);
 for(const next of [...points,goal]){assert.ok(m.clearSegment(start,next,[circles[0]],24));Object.assign(start,next);}
});
test('long corridor sweeps retain exactly the rectangle-query rocks without materializing off-route sectors',async()=>{
 const options={full:false,economic:false,regional:true,access:true,population:true,corridors:true},a=await fixture(options),b=await fixture(options),from={x:0,y:0},to={x:40000,y:40000},radius=100;
 const actual=a.window.nativeSolAsteroids.sweptNearby(1,from,to,radius),dx=to.x,dy=to.y,length=dx*dx+dy*dy;
 const expected=b.window.nativeSolAsteroids.queryBounds(1,{minX:-160,minY:-160,maxX:40160,maxY:40160}).filter(r=>{const t=Math.max(0,Math.min(1,(r.x*dx+r.y*dy)/length));return Math.hypot(r.x-t*dx,r.y-t*dy)<=radius+r.size;});
 assert.deepEqual(plain(actual.map(r=>r.slotId).sort((x,y)=>x-y)),plain(expected.map(r=>r.slotId).sort((x,y)=>x-y)));
 assert.ok(a.window.nativeSolAsteroids.metrics().corridorRocks<b.window.nativeSolAsteroids.metrics().corridorRocks/2);
});
