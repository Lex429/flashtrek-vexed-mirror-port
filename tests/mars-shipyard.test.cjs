const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
  const requests=[],window={vexedSolFlight:{bodies:[{id:5,x:4800,y:1800}],bodyPosition:b=>({x:b.x-220,y:b.y+75})}},context=vm.createContext({window,Image:class{set src(url){requests.push(url);}},console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port/mars-shipyard.js'),'utf8'),context);
  return {station:window.nativeMarsShipyard,window,requests};
}
test('one Mars-relative station retains the authoritative Sol coordinate system',()=>{
  const {station,window}=setup();assert.equal(station.definition.artworkId,280);assert.equal(station.definition.system,1);
  assert.deepEqual(JSON.parse(JSON.stringify(station.position({system:1}))),{x:5100,y:1755});assert.equal(station.position({system:2}),null);
  window.vexedSolFlight.bodies[0].x+=100;assert.equal(station.position({system:1}).x,5200);
});
test('offscreen stations and other systems never request station artwork',()=>{
  const {station,requests}=setup(),view={state:{system:1},ship:{x:0,y:0},cx:450,cy:300,w:900,h:600,zoom:1};
  assert.equal(station.paint({},view),false);assert.equal(requests.length,0);
  assert.equal(station.paint({},{...view,state:{system:2},ship:{x:5100,y:1755}}),false);assert.equal(requests.length,0);
});
test('visible placement loads two shared lighting surfaces once and cannot mutate gameplay',()=>{
  const {station,requests}=setup(),view={state:{system:1,latinum:123,cargo:[7]},ship:{x:4800,y:1800},cx:450,cy:337,w:900,h:675,zoom:1},before=JSON.stringify(view);
  const ctx={save(){},restore(){},fillText(){}};assert.equal(station.paint(ctx,view),true);assert.equal(station.paint(ctx,view),true);
  assert.equal(requests.length,2);assert(requests[0].endsWith('280-game-lit.png'));assert.equal(JSON.stringify(view),before);
  assert.deepEqual(JSON.parse(JSON.stringify(station.visible(view))),{x:750,y:292,size:220,point:{x:5100,y:1755}});
});
