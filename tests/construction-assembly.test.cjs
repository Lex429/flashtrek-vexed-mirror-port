const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('html-games/flashtrek-broken-mirror/ship-construction.js','utf8'),{window});
const core=window.shipConstruction;
function shape(kind){
 const width=100,height=140,rgba=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const occupied=kind==='cube'?x>8&&x<92&&y>10&&y<130:
   (y<65&&((x-50)/45)**2+((y-40)/25)**2<1)||(x>42&&x<58&&y>45&&y<132)||((x>12&&x<23||x>77&&x<88)&&y>65&&y<130)||(y>75&&y<85&&x>18&&x<82);
  if(occupied)rgba[(y*width+x)*4+3]=255;
 }
 return {width,height,rgba};
}
test('construction allocates every occupied hull pixel to one delivered plate, with structural and systems work first',()=>{
 for(const kind of ['cube','nacelles']){
  const image=shape(kind),before=Buffer.from(image.rgba),plan=core.profile({id:35,name:kind==='cube'?'Borg Cube':'Galaxy Class',massClass:6}),b=core.blueprint(plan,image);
  assert.ok(b.counts.beams>10);assert.ok(b.counts.modules>5);assert.ok(b.counts.plates>20);assert.equal(b.workers,6);
  assert.ok(b.jobs.filter(j=>j.kind==='beam').every(j=>j.finish<=.30));
  assert.ok(b.jobs.filter(j=>j.kind==='module').every(j=>j.start>=.30&&j.finish<=.52));
  assert.ok(b.jobs.filter(j=>j.kind==='panel').every(j=>j.start>=.52&&j.finish<=.86));
  const coverage=new Uint8Array(image.width*image.height);
  for(const j of b.jobs.filter(j=>j.kind==='panel'))for(let y=j.top;y<j.top+j.height;y++)for(let x=j.left;x<j.left+j.width;x++)if(image.rgba[(y*image.width+x)*4+3]>16)coverage[y*image.width+x]++;
  assert.equal(coverage.filter(n=>n===1).length,b.alphaPixels);assert.ok(coverage.every(n=>n<=1));assert.deepEqual(Buffer.from(image.rgba),before);
 }
});
test('each DOT has non-overlapping jobs with collection, solid transport, arrival and welding before installation',()=>{
 const b=core.blueprint(core.profile({id:1,name:'Galaxy Class'}),shape('nacelles'));
 for(const lane of b.lanes)for(let i=0;i<lane.length;i++){
  const j=lane[i];if(i)assert.ok(j.start>=lane[i-1].finish);
  assert.equal(core.taskState(j,j.start-.001).phase,'stored');
  assert.equal(core.taskState(j,(j.start+j.pickup)/2).phase,'pickup');
  const transit=core.taskState(j,(j.pickup+j.arrival)/2);assert.equal(transit.phase,'delivery');assert.equal(transit.carried,true);assert.equal(transit.installed,false);assert.ok(transit.delivery>0&&transit.delivery<1);
  const weld=core.taskState(j,(j.arrival+j.finish)/2);assert.equal(weld.phase,'welding');assert.equal(weld.delivery,1);assert.equal(weld.installed,false);
  assert.equal(core.taskState(j,j.finish).installed,true);
 }
});
test('welding paths stay on actual metal, while both berth types sit under the yard and release beyond its end',()=>{
 const image=shape('nacelles'),plan=core.profile({id:35,name:'Galaxy Class'}),b=core.blueprint(plan,image);
 for(const job of b.jobs)for(const p of job.weldPath)assert.ok(image.rgba[(Math.floor(p.y)*image.width+Math.floor(p.x))*4+3]>16,job.kind+' weld left the hull');
 for(const name of ['Galaxy Class','Danube Runabout']){
  const p=core.profile({id:1,name}),berth=core.berth(p),released=core.release(p,100,340,1);
  assert.ok(berth.u>.3&&berth.u<.7);assert.ok(berth.v>.25&&berth.v<.85);
  const start=core.release(p,100,340,0);assert.equal(start.x,0);assert.equal(start.y,0);assert.equal(start.rotation,0);
  const center=(berth.v-.5)*340*1421/1107;assert.ok(center+released.y-50>340*1421/1107/2);
 }
});
