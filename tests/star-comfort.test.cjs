const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function sky(){const window={};for(const name of ['flight-reference-data.js','vexed-space-model.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../html-games/broken-mirror-port',name),'utf8'),{window});return window.vexedSpaceModel.create();}
const input=(speed,extra={})=>({speed,locx:-speed/13,locy:0,maxSpeed:450,...extra});
function fly(model,seconds,command,hz=60){for(let i=0;i<Math.round(seconds*hz);i++)model.update(1/hz,command);}

test('ordinary flight retains subtle parallax without speed streaks, including a slow hull at full throttle',()=>{
  for(const command of [input(200),input(150,{maxSpeed:150})]){
    const model=sky();fly(model,5,command);
    assert.equal(model.state.speedEffect,0);
    assert.ok(model.state.stars.every(s=>!s.trailVisible));
    assert.ok(Math.abs(model.state.travelX)>1,'normal flight still moves the sky');
    assert.ok(Math.abs(model.state.travelX)<command.speed*5*.15,'parallax stays a small fraction of ship travel');
    assert.equal(command.speed,model.state.flightSpeed,'visual response never rewrites the supplied physical speed');
  }
});

test('strong speed cues require sustained high speed and fade smoothly when braking',()=>{
  const model=sky();fly(model,3,input(200));model.update(1/60,input(450));
  assert.ok(model.state.speedEffect<.02,'one fast frame cannot switch on a dramatic effect');
  fly(model,3,input(450));assert.ok(model.state.speedEffect>.9);
  assert.ok(model.state.stars.some(s=>s.trailVisible&&s.trailLength>15));
  const before=model.state.speedEffect;model.update(1/60,input(0));
  assert.ok(model.state.speedEffect>0&&model.state.speedEffect<before,'braking fades instead of popping');
  fly(model,2,input(0));assert.ok(model.state.speedEffect<.001);
  assert.ok(model.state.stars.every(s=>!s.trailVisible));
});

test('a sudden turn or reversal cannot immediately flip star travel; camera jumps are bounded',()=>{
  const model=sky();fly(model,4,input(450));const previous=model.state.motionX;
  model.update(1/60,input(450,{locx:0,locy:-450/13}));
  assert.ok(model.state.motionX<0&&Math.abs(model.state.motionX)>Math.abs(previous)*.9);
  assert.ok(Math.abs(model.state.motionY/model.state.motionX)<.05,'first turn frame changes sky direction only slightly');
  model.update(1/60,input(450,{locx:1e9,locy:0}));assert.ok(model.state.motionX<0,'even a teleport-sized camera delta cannot reverse stars in one frame');
  fly(model,3,input(450,{locx:450/13}));assert.ok(model.state.motionX>0,'the sky eventually follows the new course');
});

test('reduced motion suppresses streaks, pause freezes the field, and new systems start calm',()=>{
  const model=sky();fly(model,4,input(1400,{reducedMotion:true,warp:2}));
  assert.equal(model.state.speedEffect,0);assert.ok(model.state.stars.every(s=>!s.trailVisible));
  const saved=JSON.stringify(model.state);model.update(0,input(1400));assert.equal(JSON.stringify(model.state),saved);
  assert.equal(sky().state.speedEffect,0);
});

test('constant flight has the same visual travel at 30, 60 and 144 Hz',()=>{
  const distances=[30,60,144].map(hz=>{const model=sky();fly(model,6,input(200),hz);return model.state.travelX;});
  for(const distance of distances)assert.ok(Math.abs(distance-distances[0])<1e-8);
});

test('course-locked flight sky follows actual travel immediately instead of lagging behind a curved course',()=>{
  const model=sky();
  for(const angle of [0,.05,.1,.2,.4]){
    const command=input(200,{locx:-Math.cos(angle)*200/13,locy:-Math.sin(angle)*200/13,courseLocked:true});
    model.update(1/60,command);
    assert.ok(Math.abs(Math.atan2(-model.state.motionY,-model.state.motionX)-angle)<1e-9);
  }
  const before=model.state.travelX;model.update(1/60,input(0,{courseLocked:true}));
  assert.equal(model.state.motionX,0);assert.equal(model.state.motionY,0);assert.equal(model.state.travelX,before);
});
