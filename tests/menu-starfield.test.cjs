const test=require('node:test');
const assert=require('node:assert/strict');
const field=require('../html-games/broken-mirror-port/menu-starfield.js');
const stars=field.create(720);

test('Forward travel brings points closer, expands their projection and increases apparent size',()=>{
  for(const star of stars.filter(s=>s.z>1&&s.z<4)){
    const a=field.project(star,0,1200,900),b=field.project(star,.3,1200,900);
    assert.equal(a.generation,b.generation);assert.ok(b.z<a.z&&b.radius>a.radius);
    assert.ok(Math.hypot(b.x-600,b.y-450)>Math.hypot(a.x-600,a.y-450));
  }
});
test('Mouse parallax preserves world positions and has a stronger effect on nearby points',()=>{
  for(const star of stars){
    const a=field.project(star,0,1200,900,-.5,-.5),b=field.project(star,0,1200,900,.5,.5);
    assert.equal(a.worldX,b.worldX);assert.equal(a.worldY,b.worldY);assert.equal(a.z,b.z);assert.equal(a.generation,b.generation);
    assert.ok(a.x>b.x&&a.y>b.y);
  }
});
test('Recycling happens behind the camera with no visible discontinuity',()=>{
  for(const star of stars){
    const crossing=star.z-field.behind,a=field.project(star,crossing-.0001,1200,900),b=field.project(star,crossing+.0001,1200,900);
    assert.equal(a.generation,0);assert.equal(b.generation,1);
    assert.ok(!a.visible&&a.opacity===0&&b.opacity<.00001);
    assert.ok(b.z>star.far-.001);
  }
});
test('The moving field maintains coverage through repeated depth cycles and camera sweeps',()=>{
  let minimum=Infinity;
  for(let second=0;second<180;second+=.5){
    const points=stars.map(star=>field.project(star,second*field.speed,1200,900,Math.sin(second)*.5,Math.cos(second)*.5));
    const visible=points.filter(p=>p.visible&&p.opacity>.05);minimum=Math.min(minimum,visible.length);
    assert.ok(visible.length>90,`Sparse sky after ${second}s: ${visible.length}`);
    for(const p of points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.opacity>=0&&p.opacity<=1);
  }
  assert.ok(minimum>90);
});
