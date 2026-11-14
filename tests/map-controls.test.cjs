const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('html-games/broken-mirror-port/map-controls.js','utf8'),{window});
const controls=window.nativeMapControls;
test('directional map navigation chooses nearby destinations in screen direction rather than document order',()=>{
  const current={key:'here',x:0,y:0},items=[{key:'far',x:100,y:0},{key:'behind',x:-1,y:0},{key:'above',x:0,y:-4},{key:'near',x:5,y:1},current];
  assert.equal(controls.next(items,current,'right').key,'near');assert.equal(controls.next(items,current,'left').key,'behind');assert.equal(controls.next(items,current,'up').key,'above');
  assert.equal(controls.next([current],current,'down'),null);assert.equal(controls.next(items,current,'invalid'),null);
});
test('map selection accounts for the chart aspect ratio and remains deterministic on ties',()=>{
  const current={key:'origin',x:0,y:0},items=[current,{key:'a',x:3,y:10},{key:'b',x:5,y:0}];
  assert.equal(controls.next(items,current,'right').key,'b');assert.equal(controls.next(items,current,'right',{x:1,y:.05}).key,'a');
  assert.equal(controls.next([current,{key:'z',x:3,y:0},{key:'a',x:3,y:0}],current,'right').key,'a');
});
test('cinematic camera motion reaches both endpoints, zooms logarithmically and never overshoots',()=>{
  const from={x:-10,y:20,span:400},to={x:80,y:-90,span:4};
  assert.deepEqual(JSON.parse(JSON.stringify(controls.camera(from,to,-1))),from);
  const end=controls.camera(from,to,2);assert.equal(end.x,to.x);assert.equal(end.y,to.y);assert.ok(Math.abs(end.span-to.span)<1e-12);
  assert.ok(Math.abs(controls.camera(from,to,.5).span-40)<1e-10);
  let previous=from;
  for(let i=0;i<=100;i++){const point=controls.camera(from,to,i/100);assert.ok(point.x>=previous.x&&point.x<=to.x);assert.ok(point.y<=previous.y&&point.y>=to.y);assert.ok(point.span<=previous.span+1e-10&&point.span>=to.span-1e-10);previous=point;}
});
