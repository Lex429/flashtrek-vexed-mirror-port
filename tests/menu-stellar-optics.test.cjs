const test=require('node:test');
const assert=require('node:assert/strict');
const optics=require('../html-games/broken-mirror-port/menu-stellar-optics.js');

test('A partial eclipse concentrates its glint; complete cover and full exposure do not',()=>{
  const camera=optics.create();
  assert.equal(camera.update(0,0,true).edgeGlint,0);
  const sliver=camera.update(.2,0,true);
  assert.ok(sliver.edgeGlint>.8&&sliver.effectiveVisibility===.2);
  assert.equal(camera.update(1,0,true).edgeGlint,0);
});

test('Camera exposure settles over several frames and retains image detail',()=>{
  const camera=optics.create();camera.update(0,0);
  const first=camera.update(1,1/60);
  assert.ok(first.cameraGain>.98&&first.cameraGain<1);
  assert.ok(first.effectiveVisibility>0&&first.effectiveVisibility<1);
  let settled;
  for(let i=0;i<40;i++)settled=camera.update(1,1/60);
  assert.ok(settled.cameraGain>=.87&&settled.cameraGain<.88);
  assert.ok(settled.effectiveVisibility>.999);
});

test('Full obstruction cuts flare energy immediately while exposure recovers smoothly',()=>{
  const camera=optics.create();camera.update(1,0,true);
  const blocked=camera.update(0,1/60);
  assert.equal(blocked.effectiveVisibility,0);assert.equal(blocked.edgeGlint,0);
  assert.ok(blocked.exposure>0&&blocked.cameraGain>.87&&blocked.cameraGain<.9);
  let recovered;
  for(let i=0;i<60;i++)recovered=camera.update(0,1/60);
  assert.ok(recovered.cameraGain>.99&&recovered.effectiveVisibility===0);
});

test('Static redraws do not advance exposure and reduced motion resolves immediately',()=>{
  const camera=optics.create();camera.update(0,0);
  const frame=camera.update(.3,1/60),redraw=camera.update(.3,0);
  assert.equal(redraw.cameraGain,frame.cameraGain);assert.equal(redraw.exposure,frame.exposure);
  const reduced=camera.update(1,0,true);
  assert.equal(reduced.cameraGain,.87);assert.equal(reduced.effectiveVisibility,1);
});
